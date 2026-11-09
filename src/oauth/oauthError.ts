// 앱↔웹 OAuth 오류 계약: 네이티브 Alert 대신 웹뷰로 알려 웹이 바텀시트로 안내한다.
// type 'oauthError', data { provider: 'google' | 'apple', code: 'cancelled' | 'failed' }
export type OAuthProvider = 'google' | 'apple';
export type OAuthErrorCode = 'cancelled' | 'failed';

export const sendOAuthError = (
  webViewRef: any,
  provider: OAuthProvider,
  code: OAuthErrorCode,
) => {
  webViewRef?.current?.postMessage(
    JSON.stringify({ type: 'oauthError', data: { provider, code } }),
  );
};
