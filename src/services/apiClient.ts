import type { RefObject } from 'react';
import Config from 'react-native-config';
import { getCookieFromAsyncStorage } from '../utils/asyncStorage';

const BACK_URL = Config.BACK_URL;

// 웹뷰의 전역 함수를 호출하여 토큰 갱신 (iapHandler.ts의 requestTokenRefresh와 동일 패턴).
// WebView는 항상 HomeScreen에 마운트되어 있으므로 NavigationContext의 webViewRef를 통해 접근한다.
const requestTokenRefresh = async (webViewRef: RefObject<any> | null | undefined): Promise<boolean> => {
  try {
    if (!webViewRef?.current) {
      console.error('WebView ref가 없습니다');
      return false;
    }

    const tokenBefore = await getCookieFromAsyncStorage('userAccessToken');

    const script = `
      (async function() {
        try {
          if (typeof window.refreshUserToken === 'function') {
            await window.refreshUserToken();
          }
        } catch (e) {}
      })();
    `;
    webViewRef.current.injectJavaScript(script);

    const MAX_RETRIES = 5;
    const RETRY_INTERVAL_MS = 500;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS));
      const tokenAfter = await getCookieFromAsyncStorage('userAccessToken');
      if (tokenAfter && tokenAfter !== tokenBefore) {
        return true;
      }
    }

    console.error('토큰 갱신 타임아웃: 2.5초 내 갱신 미확인');
    return false;
  } catch (error) {
    console.error('토큰 갱신 오류:', error);
    return false;
  }
};

interface AuthorizedFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  webViewRef?: RefObject<any> | null;
  retryCount?: number;
}

/**
 * BACK_URL 기준 상대 path를 호출하며 Authorization 헤더를 자동 첨부.
 * 401 응답 시 webViewRef를 통해 웹의 window.refreshUserToken()을 호출해 토큰을 갱신하고
 * 1회 재시도한다 (iapHandler.ts의 verifyPurchaseWithServer와 동일 정책).
 */
export const authorizedFetch = async (
  path: string,
  options: AuthorizedFetchOptions = {},
): Promise<any> => {
  const { method = 'GET', body, webViewRef, retryCount = 0 } = options;

  const accessToken = await getCookieFromAsyncStorage('userAccessToken');
  if (!accessToken) {
    throw new Error('액세스 토큰이 없습니다');
  }

  const response = await fetch(`${BACK_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    if (retryCount >= 1) {
      throw new Error('인증 실패: 로그인이 필요합니다');
    }
    const refreshSuccess = await requestTokenRefresh(webViewRef);
    if (!refreshSuccess) {
      throw new Error('토큰 갱신 실패');
    }
    return authorizedFetch(path, { ...options, retryCount: retryCount + 1 });
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((json && (json.message || json.error)) || `요청 실패 (${response.status})`);
  }
  return json;
};

export { BACK_URL };
