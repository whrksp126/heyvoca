import type { RefObject } from 'react';
import { Platform } from 'react-native';
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  IOSCategory,
} from 'react-native-track-player';
import type { AddTrack } from 'react-native-track-player';
import { authorizedFetch } from './apiClient';

/**
 * 농장 산책하기(집중 반복 듣기) 네이티브 재생 (1.1.4~).
 *
 * 웹 StudyMain 은 화면이 꺼지거나 앱이 백그라운드로 가면 WebView JS·오디오가 멈춘다. 그래서 앱 1.1.4 부터는
 * 웹이 "슬라이드(단어)마다 읽을 줄 목록"을 넘기고, 네이티브(react-native-track-player)가 큐로 재생한다.
 * 잠금화면·제어센터·알림의 미디어 컨트롤에서 다음 곡 = 다음 단어, 이전 곡 = 이전 단어.
 *
 * 메시지 계약(웹 → 앱, props 로 온다)
 *   listen_session_start { sessionId, slides:[{title, subtitle, clips:[{itemId, itemIndex, text, lang, voice?, url?}]}],
 *                          startIndex, autoplay, repeat, rate?, albumTitle? }
 *     → 즉시 listen_session_ack {sessionId}, 첫 슬라이드 준비 후 listen_session_started {sessionId, slideCount}
 *       (실패 시 listen_session_error {sessionId, message})
 *   listen_control { sessionId, action: 'play'|'pause'|'seek_slide'|'set_repeat'|'sync'|'stop', slideIndex?, play?, repeat? }
 * 앱 → 웹
 *   listen_state { sessionId, slideIndex, itemId, itemIndex, playing, ended }
 *
 *   (listen_state 에 closed: true 가 붙으면 알림의 닫기(X)로 끝난 것 — lost 와 같이 웹 재생으로 돌아간다)
 *
 * 큐 구성(1.1.5~): 한 슬라이드 = 트랙 1개. 서버 /tts/combine 이 웹이 정한 순서대로의 클립(반복 포함) +
 * 줄 사이 무음(0.3초) + 끝 무음(0.6초)을 mp3 한 개로 합쳐 준다 — 잠금화면·알림 진행바가 단어 하나 전체 길이로
 * 한 번에 흐른다. 지금 읽는 줄은 응답의 클립 시각(clips[].start_ms)과 재생 위치로 정해 웹에 알린다.
 * 합치기를 못 하면(구버전 서버·실패) 그 슬라이드만 예전 방식(줄 mp3 + 무음 트랙 여러 개)으로 넣는다.
 * 슬라이드는 "지금 + 2장"까지만 미리 큐에 붙인다 — presigned URL 은 /tts/resolve 가 Redis 에 캐싱한 것을
 * 돌려주므로 남은 수명이 5분까지 짧을 수 있어, 한꺼번에 받아 두면 긴 세션 뒤쪽이 만료된다.
 * 재생 직전에 URL 의 X-Amz-Date/Expires 로 만료를 보고 다시 받는다(재생 오류 시에도 1회 재시도).
 */

type Lang = 'en' | 'ko' | 'ja';

interface Clip {
  itemId: string;
  itemIndex: number | null;
  text: string;
  lang: Lang;
  voice?: string;
  url?: string;
}

interface Slide {
  title?: string;
  subtitle?: string;
  clips?: Clip[];
}

interface Session {
  id: string;
  slides: Slide[];
  repeat: boolean;
  rate: number;
  albumTitle: string;
  loadedUpTo: number; // 큐에 붙인 마지막 슬라이드(0부터 연속)
  ended: boolean;
  combineOff: boolean; // 서버가 /tts/combine 을 모른다(구버전) — 이 세션은 줄 단위 큐로만
}

interface Span {
  start_ms: number;
  end_ms: number;
}

// RNTP 큐와 1:1 로 맞춘 사본 — 슬라이드 경계·만료를 여기서 계산한다.
interface QItem {
  slide: number;
  kind: 'combined' | 'clip' | 'silence';
  clip: number | null; // kind 'clip' 일 때 줄 번호
  url: string | number;
  expiresAt: number; // ms, 무음은 Infinity
  spans?: Span[]; // kind 'combined' — 줄마다 합친 파일 안의 시각
  durationMs?: number;
  retried?: boolean;
}

const SILENCE_GAP = require('../assets/audio/silence_300ms.mp3');
const SILENCE_SLIDE_END = require('../assets/audio/silence_600ms.mp3');
const ARTWORK = require('../assets/images/AppLogo.png');

const LOOKAHEAD_SLIDES = 2;
const COMBINE_GAP_MS = 300;
const COMBINE_TAIL_MS = 600;
const PROGRESS_INTERVAL_SEC = 0.25;
const EXPIRY_MARGIN_MS = 2 * 60 * 1000;

let webViewRef: RefObject<any> | null = null;
let session: Session | null = null;
let queue: QItem[] = [];
let isSetup = false;
let listenersAttached = false;
// 우리가 직접 skip 한 직후의 트랙 변경 이벤트는 "자연 진행"이 아니다(반복 재생 판정에서 제외).
let programmaticSkip = false;
let lastSlideIndex = -1;
// 합친 트랙 재생 중 마지막으로 웹에 알린 줄 — 진행 이벤트마다 보내지 않고 줄이 바뀔 때만 보낸다
let lastEmittedClip: number | null = null;

// 큐 조작은 이벤트·웹 명령·잠금화면 명령이 동시에 올 수 있어 한 줄로 세운다.
let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
};

const post = (type: string, data: Record<string, any>) => {
  try {
    webViewRef?.current?.postMessage(JSON.stringify({ type, data }));
  } catch (e) {
    // 웹뷰가 없으면(백그라운드 등) 버린다 — 웹은 복귀 시 sync 로 다시 묻는다
  }
};

// presigned SigV4 URL 의 만료 시각. 못 읽으면 보수적으로 5분.
const expiryOf = (url: string): number => {
  try {
    const date = /[?&]X-Amz-Date=(\d{8}T\d{6}Z)/.exec(url)?.[1];
    const secs = /[?&]X-Amz-Expires=(\d+)/.exec(url)?.[1];
    if (date && secs) {
      const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`;
      return Date.parse(iso) + Number(secs) * 1000;
    }
  } catch (e) {
    // 아래 기본값
  }
  return Date.now() + 5 * 60 * 1000;
};

const isFresh = (url: string | undefined) => !!url && expiryOf(url) - Date.now() > EXPIRY_MARGIN_MS;

const resolveClipUrl = async (clip: Clip): Promise<string | null> => {
  const q = [`text=${encodeURIComponent(clip.text.trim())}`, `language=${clip.lang}`];
  if (clip.voice) q.push(`voice=${encodeURIComponent(clip.voice)}`);
  try {
    const res = await authorizedFetch(`/tts/resolve?${q.join('&')}`, { webViewRef });
    return res?.url || null;
  } catch (e) {
    console.warn('[Listen] resolve 실패:', clip.text, e);
    return null;
  }
};

// 슬라이드 하나를 mp3 한 개로 합친 것. 캐시에 없는 줄이 있으면(409) 그 줄을 /tts/resolve 로 만들고 1번 더 묻는다.
const fetchCombined = async (slideIndex: number): Promise<{ url: string; spans: Span[]; durationMs: number } | null> => {
  const s = session;
  const clips = s?.slides[slideIndex]?.clips || [];
  if (!s || s.combineOff || clips.length === 0) return null;
  const body = {
    clips: clips.map(c => ({ text: c.text, language: c.lang, voice: c.voice })),
    gap_ms: COMBINE_GAP_MS,
    tail_ms: COMBINE_TAIL_MS,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await authorizedFetch('/tts/combine', { method: 'POST', body, webViewRef });
      if (!res?.url || !Array.isArray(res?.clips)) return null;
      return { url: res.url, spans: res.clips, durationMs: Number(res.duration_ms) || 0 };
    } catch (e: any) {
      const missing: unknown = e?.body?.missing;
      if (e?.status === 409 && attempt === 0 && Array.isArray(missing)) {
        await Promise.all(
          missing.map(i => (clips[Number(i)] ? resolveClipUrl({ ...clips[Number(i)], url: undefined }) : null)),
        );
        continue;
      }
      if (e?.status === 404 || e?.status === 405) s.combineOff = true;
      console.warn('[Listen] combine 실패 → 줄 단위 재생:', slideIndex, e?.message || e);
      return null;
    }
  }
  return null;
};

const trackFor = (item: QItem): AddTrack => {
  const s = session!;
  const slide = s.slides[item.slide] || {};
  return {
    url: item.url as any,
    title: slide.title || '',
    artist: slide.subtitle || '',
    album: s.albumTitle,
    artwork: ARTWORK,
    ...(item.durationMs ? { duration: item.durationMs / 1000 } : {}),
  };
};

// 슬라이드 하나의 큐 항목(줄 + 무음). 받지 못한 줄은 건너뛰고, 다 실패해도 무음 1개로 슬라이드 자리는 지킨다.
const buildSlideItems = async (slideIndex: number): Promise<QItem[]> => {
  const combined = await fetchCombined(slideIndex);
  if (combined) {
    return [{
      slide: slideIndex,
      kind: 'combined',
      clip: null,
      url: combined.url,
      expiresAt: expiryOf(combined.url),
      spans: combined.spans,
      durationMs: combined.durationMs,
    }];
  }
  const clips = session?.slides[slideIndex]?.clips || [];
  const urls = await Promise.all(
    clips.map(c => (isFresh(c.url) ? Promise.resolve(c.url as string) : resolveClipUrl(c))),
  );
  const items: QItem[] = [];
  urls.forEach((url, ci) => {
    if (!url) return;
    items.push({ slide: slideIndex, kind: 'clip', clip: ci, url, expiresAt: expiryOf(url) });
    items.push({ slide: slideIndex, kind: 'silence', clip: null, url: SILENCE_GAP, expiresAt: Infinity });
  });
  if (items.length > 0) items.pop();
  items.push({ slide: slideIndex, kind: 'silence', clip: null, url: SILENCE_SLIDE_END, expiresAt: Infinity });
  return items;
};

const loadUpTo = async (target: number) => {
  const s = session;
  if (!s) return;
  const last = Math.min(target, s.slides.length - 1);
  while (session === s && s.loadedUpTo < last) {
    const idx = s.loadedUpTo + 1;
    const items = await buildSlideItems(idx);
    if (session !== s) return;
    await TrackPlayer.add(items.map(trackFor));
    queue.push(...items);
    s.loadedUpTo = idx;
  }
};

const slideStart = (slide: number) => queue.findIndex(q => q.slide === slide);

// i 번째 항목의 URL 을 새로 받아 큐에서 교체한다(재생 중인 항목이면 load 로 갈아끼운다).
const refreshItem = async (i: number, activeIndex: number | undefined) => {
  const item = queue[i];
  const s = session;
  if (!s || !item || item.kind === 'silence') return;
  let url: string | null = null;
  if (item.kind === 'combined') {
    url = (await fetchCombined(item.slide))?.url ?? null;
  } else {
    const clip = item.clip !== null ? s.slides[item.slide]?.clips?.[item.clip] : undefined;
    if (!clip) return;
    url = await resolveClipUrl({ ...clip, url: undefined });
  }
  if (!url || session !== s) return;
  const fresh: QItem = { ...item, url, expiresAt: expiryOf(url) };
  queue[i] = fresh;
  if (i === activeIndex) {
    await TrackPlayer.load(trackFor(fresh) as any);
  } else {
    await TrackPlayer.remove(i);
    await TrackPlayer.add(trackFor(fresh), i < queue.length - 1 ? i : undefined);
  }
};

// from 부터 그 슬라이드 끝까지, 곧 만료될 URL 을 다시 받는다.
const refreshSlideFrom = async (from: number) => {
  const first = queue[from];
  if (!first) return;
  const active = await TrackPlayer.getActiveTrackIndex();
  const limit = Date.now() + EXPIRY_MARGIN_MS;
  for (let i = from; i < queue.length && queue[i].slide === first.slide; i++) {
    if (queue[i].expiresAt < limit) {
      // eslint-disable-next-line no-await-in-loop
      await refreshItem(i, active);
    }
  }
};

const currentItem = async (): Promise<{ index: number; item: QItem } | null> => {
  const index = await TrackPlayer.getActiveTrackIndex();
  if (index === undefined || !queue[index]) return null;
  return { index, item: queue[index] };
};

// 합친 트랙에서 position(초) 에 읽고 있는 줄. 줄 사이 무음 동안은 직전 줄을 유지한다.
const clipAt = (spans: Span[] | undefined, position: number): number | null => {
  if (!spans || spans.length === 0) return null;
  const ms = position * 1000;
  let found = 0;
  for (let i = 0; i < spans.length; i++) {
    if (spans[i].start_ms <= ms) found = i;
    else break;
  }
  return found;
};

const emitState = async () => {
  const s = session;
  if (!s) return;
  const cur = await currentItem();
  let itemId: string | null = null;
  let itemIndex: number | null = null;
  lastEmittedClip = null;
  if (cur && cur.item.kind === 'combined') {
    const ci = clipAt(cur.item.spans, (await TrackPlayer.getProgress()).position);
    const clip = ci !== null ? s.slides[cur.item.slide]?.clips?.[ci] : undefined;
    itemId = clip?.itemId ?? null;
    itemIndex = clip?.itemIndex ?? null;
    lastEmittedClip = ci;
  } else if (cur) {
    // 줄 사이 무음 동안은 직전 줄의 강조를 유지한다
    for (let i = cur.index; i >= 0 && queue[i].slide === cur.item.slide; i--) {
      const c = queue[i].clip;
      if (c !== null) {
        const clip = s.slides[cur.item.slide]?.clips?.[c];
        itemId = clip?.itemId ?? null;
        itemIndex = clip?.itemIndex ?? null;
        break;
      }
    }
  }
  const playWhenReady = await TrackPlayer.getPlayWhenReady();
  post('listen_state', {
    sessionId: s.id,
    slideIndex: cur ? cur.item.slide : Math.max(0, lastSlideIndex),
    itemId,
    itemIndex,
    playing: playWhenReady && !s.ended,
    ended: s.ended,
  });
};

const seekSlide = async (slide: number, play: boolean) => {
  const s = session;
  if (!s) return;
  const target = Math.max(0, Math.min(slide, s.slides.length - 1));
  await loadUpTo(target + 1);
  const start = slideStart(target);
  if (start < 0 || session !== s) return;
  s.ended = false;
  programmaticSkip = true;
  await TrackPlayer.skip(start);
  await refreshSlideFrom(start);
  if (play) await TrackPlayer.play();
  else await TrackPlayer.pause();
  lastSlideIndex = target;
  await emitState();
  loadUpTo(target + LOOKAHEAD_SLIDES).catch(() => {});
};

// 알림의 닫기(X) — 재생을 끝내고 알림을 없앤 뒤 웹에 알린다(웹은 lost 처리로 웹 재생 상태로 돌아간다).
const closeSession = async () => {
  const s = session;
  if (!s) return;
  session = null;
  queue = [];
  lastSlideIndex = -1;
  lastEmittedClip = null;
  if (isSetup) await TrackPlayer.reset();
  post('listen_state', { sessionId: s.id, lost: true, closed: true, playing: false, ended: false });
};

const ensureSetup = async () => {
  if (!isSetup) {
    try {
      await TrackPlayer.setupPlayer({
        autoHandleInterruptions: true,
        // 무음 스위치·화면 꺼짐과 무관하게 재생(Info.plist UIBackgroundModes audio 와 짝)
        iosCategory: IOSCategory.Playback,
      });
    } catch (e: any) {
      // 이미 초기화됨 — 그대로 쓴다
      if (!String(e?.message || e).includes('already')) throw e;
    }
    isSetup = true;
  }
  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      // patches/react-native-track-player — 미디어 카드 대신 일반 알림 목록 + 상태바 아이콘(MusicService 주석 참조)
      classicNotification: true,
    } as any,
    capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.Stop],
    // Android 알림의 마지막 버튼 = 닫기(X). iOS Now Playing 에는 닫기 버튼이 없다(시스템 관례).
    notificationCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.Stop],
    compactCapabilities: [Capability.SkipToPrevious, Capability.Play, Capability.SkipToNext],
    // 앱 res/drawable 의 리소스 이름 — 상태바용 흰색 실루엣 아이콘, 닫기 X
    icon: { uri: 'ic_stat_heyvoca' } as any,
    stopIcon: { uri: 'ic_listen_close' } as any,
    progressUpdateEventInterval: PROGRESS_INTERVAL_SEC,
  });
  attachListenPlayerEvents();
};

/** 플레이어 이벤트 + 잠금화면/알림 원격 명령. 재생 서비스(index.js)와 세션 시작 양쪽에서 불러도 1번만 붙는다. */
export const attachListenPlayerEvents = () => {
  if (listenersAttached) return;
  listenersAttached = true;

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, e =>
    serial(async () => {
      const s = session;
      if (!s || e.index === undefined || !queue[e.index]) return;
      const item = queue[e.index];
      const prev = e.lastIndex !== undefined ? queue[e.lastIndex] : undefined;
      const natural = !programmaticSkip && e.lastIndex !== undefined && e.index === e.lastIndex + 1;
      programmaticSkip = false;
      // 반복 재생 — 한 슬라이드를 다 읽고 다음 슬라이드로 넘어가려는 순간 같은 슬라이드 처음으로 되돌린다
      if (s.repeat && natural && prev && prev.slide !== item.slide) {
        programmaticSkip = true;
        await TrackPlayer.skip(slideStart(prev.slide));
        await refreshSlideFrom(slideStart(prev.slide));
        await emitState();
        return;
      }
      lastSlideIndex = item.slide;
      await emitState();
      loadUpTo(item.slide + LOOKAHEAD_SLIDES).catch(() => {});
      const nextStart = slideStart(item.slide + 1);
      if (nextStart >= 0) refreshSlideFrom(nextStart).catch(() => {});
    }),
  );

  TrackPlayer.addEventListener(Event.PlaybackPlayWhenReadyChanged, () => serial(emitState));

  // 합친 트랙 안에서 줄이 바뀌면 웹 강조를 옮긴다
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, e => {
    const item = queue[e.track];
    if (!session || !item || item.kind !== 'combined') return;
    if (clipAt(item.spans, e.position) !== lastEmittedClip) serial(emitState);
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () =>
    serial(async () => {
      const s = session;
      if (!s) return;
      const cur = await currentItem();
      const slide = cur ? cur.item.slide : s.loadedUpTo;
      if (s.repeat) {
        await seekSlide(slide, true);
        return;
      }
      if (slide < s.slides.length - 1) {
        // 다음 슬라이드 URL 준비가 재생을 못 따라온 경우 — 마저 붙이고 이어간다
        await seekSlide(slide + 1, true);
        return;
      }
      s.ended = true;
      await emitState();
    }),
  );

  TrackPlayer.addEventListener(Event.PlaybackError, () =>
    serial(async () => {
      const cur = await currentItem();
      if (!session || !cur) return;
      if (!cur.item.retried && cur.item.kind !== 'silence') {
        // 대개 presigned URL 만료(403) — 새로 받아 같은 자리에서 다시 재생
        await refreshItem(cur.index, cur.index);
        if (queue[cur.index]) queue[cur.index].retried = true;
        await TrackPlayer.play();
        return;
      }
      if (cur.index < queue.length - 1) {
        await TrackPlayer.skipToNext();
        await TrackPlayer.play();
      }
    }),
  );

  TrackPlayer.addEventListener(Event.RemotePlay, () => handleListenControl({ action: 'play' }));
  TrackPlayer.addEventListener(Event.RemotePause, () => handleListenControl({ action: 'pause' }));
  // Android 알림의 닫기(X)가 Stop 으로 온다. iOS 에서는 (이어폰 등에서 드물게 오는) Stop 을 일시정지로 둔다.
  TrackPlayer.addEventListener(Event.RemoteStop, () =>
    Platform.OS === 'android' ? serial(closeSession) : handleListenControl({ action: 'pause' }),
  );
  TrackPlayer.addEventListener(Event.RemoteNext, () => remoteSkip(1));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => remoteSkip(-1));
};

const remoteSkip = (delta: number) =>
  serial(async () => {
    if (!session) return;
    const cur = await currentItem();
    const slide = cur ? cur.item.slide : Math.max(0, lastSlideIndex);
    const playing = (await TrackPlayer.getPlayWhenReady()) && !session.ended;
    await seekSlide(slide + delta, playing);
  });

export const handleListenSessionStart = (props: any, ref: RefObject<any>) => {
  webViewRef = ref;
  const sessionId = String(props?.sessionId || '');
  post('listen_session_ack', { sessionId });
  return serial(async () => {
    try {
      const slides: Slide[] = Array.isArray(props?.slides) ? props.slides : [];
      if (slides.length === 0) throw new Error('slides 가 비었습니다');
      await ensureSetup();
      await TrackPlayer.reset();
      queue = [];
      session = {
        id: sessionId,
        slides,
        repeat: !!props?.repeat,
        rate: Number(props?.rate) > 0 ? Number(props.rate) : 1,
        albumTitle: props?.albumTitle || '농장 산책하기',
        loadedUpTo: -1,
        ended: false,
        combineOff: false,
      };
      const start = Math.max(0, Math.min(Number(props?.startIndex) || 0, slides.length - 1));
      await seekSlide(start, props?.autoplay !== false);
      await TrackPlayer.setRate(session.rate);
      post('listen_session_started', { sessionId, slideCount: slides.length });
    } catch (e: any) {
      console.warn('[Listen] 세션 시작 실패:', e);
      post('listen_session_error', { sessionId, message: String(e?.message || e) });
    }
  });
};

export const handleListenControl = (props: any, ref?: RefObject<any>) => {
  if (ref) webViewRef = ref;
  return serial(async () => {
    const s = session;
    const action = props?.action;
    if (action === 'stop') {
      if (s && props?.sessionId && props.sessionId !== s.id) return;
      session = null;
      queue = [];
      lastSlideIndex = -1;
      lastEmittedClip = null;
      if (isSetup) await TrackPlayer.reset();
      return;
    }
    if (!s) {
      // 세션이 없다(앱 재시작 등) — 웹이 웹 재생으로 되돌아가도록 알린다
      if (action === 'sync' && props?.sessionId) {
        post('listen_state', { sessionId: props.sessionId, lost: true, playing: false, ended: false });
      }
      return;
    }
    if (props?.sessionId && props.sessionId !== s.id) return;
    switch (action) {
      case 'play': {
        if (s.ended) {
          await seekSlide(lastSlideIndex >= 0 ? lastSlideIndex : 0, true);
          return;
        }
        const cur = await currentItem();
        if (cur) await refreshSlideFrom(cur.index);
        await TrackPlayer.play();
        break;
      }
      case 'pause':
        await TrackPlayer.pause();
        break;
      case 'seek_slide':
        await seekSlide(Number(props?.slideIndex) || 0, !!props?.play);
        return;
      case 'set_repeat':
        s.repeat = !!props?.repeat;
        break;
      case 'sync':
        break;
      default:
        return;
    }
    await emitState();
  });
};
