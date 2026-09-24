import type { RefObject } from 'react';
import { authorizedFetch } from './apiClient';
import { SUCCESS_SFX_URI, ERROR_SFX_URI } from './chatSfxData';

// 채팅 오디오(단어 발음 + 채점 효과음)는 네이티브 오디오 라이브러리 대신
// HomeScreen의 WebView를 통해 재생한다. WebView는 mediaPlaybackRequiresUserAction=false로
// 오토플레이가 열려 있어 원격 presigned mp3/효과음 재생이 안정적이고, 오디오 세션도
// WKWebView 하나로 단일화되어 TTS/효과음 충돌이 없다.
// (react-native-sound는 iOS 최신 버전에서 원격 URL 재생이 불안정해 사용하지 않는다.)

let lastWebViewRef: RefObject<any> | null = null;

const inject = (webViewRef: RefObject<any> | null, script: string) => {
  try {
    webViewRef?.current?.injectJavaScript(script + '\ntrue;');
  } catch (e) {
    // 주입 실패는 무시
  }
};

// TTS(단어 발음): 이전 재생을 멈추고 새 URL을 재생.
const ttsPlayScript = (url: string) =>
  `(function(){try{if(window.__chatTts){try{window.__chatTts.pause();}catch(e){}}` +
  `var a=new Audio(${JSON.stringify(url)});window.__chatTts=a;a.play().catch(function(){});}catch(e){}})();`;

// 효과음: 짧으므로 매번 새 Audio로 즉시 재생(TTS와 별개 인스턴스).
const sfxPlayScript = (uri: string) =>
  `(function(){try{var a=new Audio(${JSON.stringify(uri)});a.play().catch(function(){});}catch(e){}})();`;

/**
 * GET /tts/resolve — 캐시 히트면 즉시, miss면 생성 후 presigned mp3 URL 반환.
 * 실패 시 undefined (호출부는 재생만 조용히 스킵).
 */
export const resolveTtsUrl = async (
  webViewRef: RefObject<any> | null,
  text: string,
  language: 'en' | 'ko' | 'ja' = 'en',
): Promise<string | undefined> => {
  const norm = (text || '').trim();
  if (!norm) return undefined;
  try {
    const res = await authorizedFetch(
      `/tts/resolve?text=${encodeURIComponent(norm)}&language=${language}`,
      { webViewRef },
    );
    return res?.url || undefined;
  } catch (e) {
    console.warn('[TTS] resolve 실패:', e);
    return undefined;
  }
};

/**
 * 단어 발음 재생. 로딩/생성/네트워크 실패는 조용히 무시(재생만 스킵)한다.
 */
export const playWordAudio = async (
  webViewRef: RefObject<any> | null,
  word: string,
  language: 'en' | 'ko' | 'ja' = 'en',
): Promise<void> => {
  lastWebViewRef = webViewRef;
  try {
    const url = await resolveTtsUrl(webViewRef, word, language);
    if (!url) return;
    inject(webViewRef, ttsPlayScript(url));
  } catch (e) {
    console.warn('[TTS] 재생 실패:', e);
  }
};

export const stopWordAudio = () => {
  inject(
    lastWebViewRef,
    `(function(){try{if(window.__chatTts){window.__chatTts.pause();window.__chatTts=null;}}catch(e){}})();`,
  );
};

// 채점 효과음 (웹 학습과 동일한 success.mp3 / error.mp3).
export const playCorrectSfx = (webViewRef: RefObject<any> | null) => {
  lastWebViewRef = webViewRef;
  inject(webViewRef, sfxPlayScript(SUCCESS_SFX_URI));
};

export const playWrongSfx = (webViewRef: RefObject<any> | null) => {
  lastWebViewRef = webViewRef;
  inject(webViewRef, sfxPlayScript(ERROR_SFX_URI));
};
