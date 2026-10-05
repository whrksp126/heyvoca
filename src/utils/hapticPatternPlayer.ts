// 웹이 정의한 커스텀 햅틱 패턴을 그대로 재생하는 플레이어.
// 패턴 정의(튜닝)는 웹이 갖고, 앱은 검증·clamp 후 react-native-haptic-feedback(>=3.0.0)의
// triggerPattern 에 넘기기만 한다. 모든 예외는 삼켜 웹뷰가 죽지 않게 한다.
import { NativeModules, Platform } from 'react-native';

export interface HapticEvent {
  time: number; // ms, 패턴 시작 기준
  type?: 'transient' | 'continuous';
  duration?: number; // ms (continuous 용; Android 는 transient 에도 쓰임)
  intensity?: number; // 0~1
  sharpness?: number; // 0~1 (Android 는 무시됨)
  // Android(API 29+) 전용: 시스템 프리베이크 효과로 재생. iOS 는 무시하고 intensity/sharpness 로 재생.
  // 미지원(API<29 등)이면 이 이벤트는 transient waveform 으로 폴백.
  effect?: HapticEffectName;
}

export type HapticEffectName = 'tick' | 'click' | 'heavyClick' | 'doubleClick';
const EFFECT_NAMES: HapticEffectName[] = ['tick', 'click', 'heavyClick', 'doubleClick'];

type HeyHapticNative = {
  playEffects: (events: { at: number; effect: HapticEffectName }[], cancelPrevious: boolean) => void;
  cancel: () => void;
  getCaps: () => Promise<{ apiLevel: number; supportsPrebaked: boolean; hasAmplitudeControl: boolean }>;
};

const getNativeHaptic = (): HeyHapticNative | null =>
  Platform.OS === 'android' ? ((NativeModules as any).HeyHaptic ?? null) : null;

const androidApiLevel = (): number => (typeof Platform.Version === 'number' ? Platform.Version : 0);

/** 프리베이크 효과 사용 가능 여부(동기 판정: 네이티브 모듈 존재 + API 29+) */
const canUsePrebaked = (): boolean => !!getNativeHaptic() && androidApiLevel() >= 29;

export const getHapticCaps = async (): Promise<{
  platform: string;
  apiLevel: number;
  hasAmplitudeControl: boolean;
  supportsPrebaked: boolean;
}> => {
  const platform = Platform.OS;
  if (platform === 'android') {
    const n = getNativeHaptic();
    if (n) {
      try {
        const c = await n.getCaps();
        return { platform, apiLevel: c.apiLevel, hasAmplitudeControl: !!c.hasAmplitudeControl, supportsPrebaked: !!c.supportsPrebaked };
      } catch {}
    }
    return { platform, apiLevel: androidApiLevel(), hasAmplitudeControl: false, supportsPrebaked: false };
  }
  const major = parseInt(String(Platform.Version), 10);
  return { platform, apiLevel: Number.isFinite(major) ? major : 0, hasAmplitudeControl: platform === 'ios', supportsPrebaked: false };
};

export const HAPTIC_MAX_EVENTS = 32;
export const HAPTIC_MAX_TOTAL_MS = 3000;
export const HAPTIC_MAX_DELAY_MS = 500;
// Android 는 transient 도 waveform 구간(duration)으로 재생된다. 라이브러리 기본값 50ms 는 길어 짧게 지정.
const TRANSIENT_DEFAULT_MS = 20;

type HapticModule = {
  triggerPattern: (events: HapticEvent[], options?: object) => void;
  stop: () => void;
  isSupported: () => boolean;
};

let cached: HapticModule | null | undefined;
let supported: boolean | undefined;
let lastEndAt = 0; // 직전 패턴이 끝날 것으로 예상되는 시각(Date.now 기준)

const getModule = (): HapticModule | null => {
  if (cached !== undefined) return cached;
  try {
    cached = require('react-native-haptic-feedback').default as HapticModule;
  } catch {
    cached = null;
  }
  return cached;
};

const isSupportedDevice = (m: HapticModule): boolean => {
  if (supported === undefined) {
    try {
      supported = !!m.isSupported();
    } catch {
      supported = false;
    }
  }
  return supported;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 검증 + clamp. 규격 위반이면 null (조용히 무시). 패턴 전체 길이(ms)도 함께 반환. */
export const sanitizeHapticEvents = (
  raw: unknown,
  delayMs: number,
): { events: HapticEvent[]; totalMs: number } | null => {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > HAPTIC_MAX_EVENTS) return null;
  const events: HapticEvent[] = [];
  let totalMs = 0;
  for (const e of raw) {
    if (!e || typeof e !== 'object') return null;
    const time = Number((e as any).time);
    if (!Number.isFinite(time)) return null;
    const type: 'transient' | 'continuous' = (e as any).type === 'continuous' ? 'continuous' : 'transient';
    const intensity = clamp(Number.isFinite(Number((e as any).intensity)) && (e as any).intensity != null ? Number((e as any).intensity) : 0.5, 0, 1);
    const sharpness = clamp(Number.isFinite(Number((e as any).sharpness)) && (e as any).sharpness != null ? Number((e as any).sharpness) : 0.5, 0, 1);
    const rawDur = Number((e as any).duration);
    const duration = Number.isFinite(rawDur) && (e as any).duration != null
      ? clamp(rawDur, 1, HAPTIC_MAX_TOTAL_MS)
      : type === 'continuous' ? 100 : TRANSIENT_DEFAULT_MS;
    const t = clamp(time, 0, HAPTIC_MAX_TOTAL_MS);
    const end = t + duration;
    totalMs = Math.max(totalMs, end);
    if (totalMs > HAPTIC_MAX_TOTAL_MS) return null;
    // 강도 0 은 무음 이벤트(Android 는 최소 진폭 1 로 올려져 오히려 울림) — 버린다.
    if (intensity <= 0) continue;
    // 패턴 전체를 delayMs 만큼 뒤로 민다 → 네이티브가 시간축에서 정확히 지연 처리(JS 타이머 지터 없음).
    const effect = EFFECT_NAMES.includes((e as any).effect) ? ((e as any).effect as HapticEffectName) : undefined;
    events.push({ time: t + delayMs, type, duration, intensity, sharpness, ...(effect ? { effect } : {}) });
  }
  if (events.length === 0) return null;
  return { events, totalMs };
};

export const playHapticPattern = (
  rawEvents: unknown,
  opts: { delayMs?: unknown; cancelPrevious?: unknown } = {},
): void => {
  try {
    const m = getModule();
    if (!m || !isSupportedDevice(m)) return;
    const d = Number(opts.delayMs);
    const delayMs = Number.isFinite(d) ? clamp(d, 0, HAPTIC_MAX_DELAY_MS) : 0;
    const sanitized = sanitizeHapticEvents(rawEvents, delayMs);
    if (!sanitized) return;
    const now = Date.now();
    // 이미 끝난 패턴이면 stop() 하지 않는다 — iOS 는 stop() 이 CHHapticEngine 을 내려 다음 재생이 늦어진다.
    if (opts.cancelPrevious === true && now < lastEndAt) {
      try { m.stop(); } catch {}
      try { getNativeHaptic()?.cancel(); } catch {}
    }
    lastEndAt = now + delayMs + sanitized.totalMs;
    let waveEvents: HapticEvent[] = sanitized.events;
    if (canUsePrebaked()) {
      // effect 이벤트는 네이티브 Handler 로 시각에 맞춰 프리베이크 재생, 나머지는 기존 waveform.
      const fx = sanitized.events.filter(e => e.effect);
      if (fx.length > 0) {
        waveEvents = sanitized.events.filter(e => !e.effect);
        getNativeHaptic()!.playEffects(
          fx.map(e => ({ at: e.time, effect: e.effect as HapticEffectName })),
          false,
        );
      }
    }
    // iOS 는 effect 필드를 무시(그대로 전달), Android 폴백 시에도 effect 이벤트는 transient waveform 으로 재생된다.
    if (waveEvents.length === 0) return;
    m.triggerPattern(waveEvents.map(({ effect, ...rest }) => rest), {
      enableVibrateFallback: false,
      ignoreAndroidSystemSettings: false, // 시스템 진동 설정 존중
    });
  } catch {
    // 햅틱 실패는 학습 흐름에 영향 주지 않는다.
  }
};

/**
 * iOS: CHHapticEngine 은 유휴 시 자동 종료돼(라이브러리가 stoppedHandler 에서 해제) 다음 재생 때
 * 동기 재시작 지연이 생긴다. intensity 0 transient(무음) 1발로 엔진을 미리 올려 둔다.
 * Android 는 예열할 엔진이 없고(0 강도는 최소 진폭 1 로 울림) 하지 않는다.
 */
export const warmUpHapticEngine = (): void => {
  if (Platform.OS !== 'ios') return;
  try {
    const m = getModule();
    if (!m || !isSupportedDevice(m)) return;
    m.triggerPattern([{ time: 0, type: 'transient', intensity: 0, sharpness: 0 }], {
      enableVibrateFallback: false,
    });
  } catch {}
};
