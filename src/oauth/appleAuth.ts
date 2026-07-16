import appleAuth from '@invertase/react-native-apple-authentication';
import { Alert } from 'react-native';

export const signInWithApple = async (webViewRef: any) => {
    try {
        // Apple 로그인 요청 수행
        const appleAuthRequestResponse = await appleAuth.performRequest({
            requestedOperation: appleAuth.Operation.LOGIN,
            requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
        });

        // authorizationCode 등 민감정보는 전체를 로그에 남기지 않는다 (존재 여부만 확인)
        console.log('Apple Auth Response received', {
            hasIdentityToken: !!appleAuthRequestResponse.identityToken,
            hasAuthorizationCode: !!appleAuthRequestResponse.authorizationCode,
            user: appleAuthRequestResponse.user,
        });

        // 사용자 인증 상태 확인
        const credentialState = await appleAuth.getCredentialStateForUser(appleAuthRequestResponse.user);

        // 인증 상태가 유효한 경우 웹뷰로 데이터 전송
        if (credentialState === appleAuth.State.AUTHORIZED) {
            if (webViewRef.current) {
                if (!appleAuthRequestResponse.authorizationCode) {
                    // 회원탈퇴 시 백엔드가 애플 refresh_token 교환에 사용하는 값.
                    // 일회성이라 재로그인 시 없을 수 있음 (정상 케이스) — 존재 여부만 로그.
                    console.log('Apple authorizationCode 없음 (재인증 등으로 미제공 가능)');
                }

                const data = {
                    type: 'apple_oauth_app_callback',
                    identityToken: appleAuthRequestResponse.identityToken,
                    authorizationCode: appleAuthRequestResponse.authorizationCode, // 회원탈퇴 시 애플 토큰 revoke용, 최초 로그인/재인증 시에만 제공됨
                    email: appleAuthRequestResponse.email, // 최초 로그인 시에만 제공됨
                    fullName: appleAuthRequestResponse.fullName, // 최초 로그인 시에만 제공됨
                    user: appleAuthRequestResponse.user, // Apple User ID
                    status: 200
                };
                console.log('Sending Apple Auth Data to WebView:', {
                    ...data,
                    identityToken: data.identityToken ? '[REDACTED]' : null,
                    authorizationCode: data.authorizationCode ? '[REDACTED]' : null,
                });
                webViewRef.current.postMessage(JSON.stringify(data));
            }
        }
    } catch (error: any) {
        if (error.code === appleAuth.Error.CANCELED) {
            // 사용자가 취소한 경우
            return;
        }
        console.error('Apple Login Error:', error);
        Alert.alert('Apple Login Failed', error.message);
    }
};
