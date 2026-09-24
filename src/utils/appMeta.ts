import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

// 네이티브가 백엔드로 보내는 모든 요청에서 공통으로 쓰는 앱 버전/UA 정보.
// WebView의 userAgent(HomeScreen.tsx)와 동일한 포맷을 유지해야 백엔드가
// X-App-Version 헤더 → User-Agent(`HeyVoca (iOS|Android)/x.y.z`) 순으로
// 앱 버전을 일관되게 읽을 수 있다.
export const APP_VERSION = DeviceInfo.getVersion();
export const APP_BUILD = DeviceInfo.getBuildNumber();
export const APP_PLATFORM_LABEL = Platform.OS === 'ios' ? 'iOS' : 'Android';
export const APP_USER_AGENT = `HeyVoca ${APP_PLATFORM_LABEL}/${APP_VERSION} (build ${APP_BUILD})`;

// 백엔드로 직접 fetch하는 모든 곳(apiClient.authorizedFetch, iapHandler 등)에서
// 스프레드해서 붙이는 공통 헤더.
export const getAppRequestHeaders = (): Record<string, string> => ({
  'X-App-Version': APP_VERSION,
  'User-Agent': APP_USER_AGENT,
});
