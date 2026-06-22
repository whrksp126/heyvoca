import React from 'react';
import { Alert, Vibration, Platform, StatusBar, Linking, Appearance, NativeModules } from 'react-native';
import Toast from 'react-native-toast-message';
// import Tts from 'react-native-tts';
import { signInWithGoogle, signOutWithGoogle, getGoogleSheetAccessToken } from '../oauth/googleAuth';
import { signInWithApple } from '../oauth/appleAuth';
import { executePurchase } from '../handlers/iapHandler';
import { saveCookieToAsyncStorage } from '../utils/asyncStorage';
import { launchImagePicker } from './imagePickerHandler';
import messaging from '@react-native-firebase/messaging';

const handleWebViewMessage = async (
  event: { nativeEvent: { data: string } },
  webViewRef: React.RefObject<any>,
  handleExitApp: () => void,
  hideBootSplash?: () => void,
) => {
  try {
    const messageData = JSON.parse(event.nativeEvent.data);

    switch (messageData.type) {
      case 'requestFcmToken':
        try {
          // iOS에서 getToken 호출 전 필수 단계
          if (Platform.OS === 'ios') {
            await messaging().registerDeviceForRemoteMessages();
          }

          const authStatus = await messaging().requestPermission();
          const enabled =
            authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL;

          if (enabled) {
            const token = await messaging().getToken();
            console.log('FCM Token:', token);
            webViewRef.current?.postMessage(
              JSON.stringify({ type: 'fcm_token_received', token })
            );
          } else {
            console.log('FCM permission denied');
          }
        } catch (error) {
          console.error('FCM Token error:', error);
        }
        break;

      // 웹 토글이 "켜기"를 시도할 때 호출: OS 알림 권한을 요청/확인하고 결과를 돌려준다.
      // (미허용 사용자는 웹에서 토글 ON을 막고 설정으로 유도하기 위함)
      case 'requestNotificationPermission':
        try {
          if (Platform.OS === 'ios') {
            await messaging().registerDeviceForRemoteMessages();
          }
          const status = await messaging().requestPermission();
          const granted =
            status === messaging.AuthorizationStatus.AUTHORIZED ||
            status === messaging.AuthorizationStatus.PROVISIONAL;
          let token: string | null = null;
          if (granted) {
            token = await messaging().getToken();
          }
          webViewRef.current?.postMessage(
            JSON.stringify({ type: 'notification_permission_result', granted, token }),
          );
        } catch (error) {
          console.log('requestNotificationPermission error:', error);
          webViewRef.current?.postMessage(
            JSON.stringify({ type: 'notification_permission_result', granted: false, token: null }),
          );
        }
        break;

      // 알림 설정 화면 진입 시 호출: 시스템 프롬프트 없이 현재 권한 상태만 확인.
      case 'checkNotificationPermission':
        try {
          const status = await messaging().hasPermission();
          const granted =
            status === messaging.AuthorizationStatus.AUTHORIZED ||
            status === messaging.AuthorizationStatus.PROVISIONAL;
          let token: string | null = null;
          if (granted) {
            try {
              token = await messaging().getToken();
            } catch (e) {
              token = null;
            }
          }
          webViewRef.current?.postMessage(
            JSON.stringify({ type: 'notification_permission_status', granted, token }),
          );
        } catch (error) {
          console.log('checkNotificationPermission error:', error);
          webViewRef.current?.postMessage(
            JSON.stringify({ type: 'notification_permission_status', granted: false, token: null }),
          );
        }
        break;

      // 권한이 거부된 경우 사용자를 앱 설정 화면으로 보낸다 (iOS는 한 번 거부 후 재프롬프트 불가).
      case 'openAppSettings':
        Linking.openSettings().catch(err =>
          console.log('설정 열기 실패:', err),
        );
        break;
      case 'launchGoogleAuth':
        signInWithGoogle(webViewRef);
        break;
      case 'launchGoogleLogout':
        signOutWithGoogle(webViewRef);
        break;
      case 'launchGoogleSheetAuth':
        getGoogleSheetAccessToken(webViewRef);
        break;
      case 'launchAppleAuth':
        signInWithApple(webViewRef);
        break;
      case 'iapPurchase':
        executePurchase(messageData.props.itemId, webViewRef);
        break;
      case 'setCookie':
        // 웹에서 쿠키 동기화 메시지 받음
        const { name, value, expires } = messageData.props;
        saveCookieToAsyncStorage(name, value, expires);
        console.log('쿠키 동기화됨:', name, value);
        break;

      case 'log':
        console.log('web log :', messageData.message);
        break;
      case 'alert':
        Alert.alert('', messageData.message);
        break;
      case 'confirm':
        Alert.alert('', messageData.message, [
          { text: messageData.btns[0].text, onPress: () => webViewRef.current.postMessage(JSON.stringify({ type: "confirm_return", success: true, result: false })), style: 'cancel' },
          { text: messageData.btns[1].text, onPress: () => webViewRef.current.postMessage(JSON.stringify({ type: "confirm_return", success: true, result: true })) },
        ], { cancelable: false });
        break;

      case 'showToast':
        Toast.show({
          type: 'info',
          text1: messageData.props.message,
          position: 'bottom',
          visibilityTime: 2000,
        });
        break;

      case 'setStatusBarStyle':
        StatusBar.setBarStyle(messageData.style, true);
        break;

      case 'setNativeTheme': {
        // 웹 localStorage 기준 앱 테마를 네이티브에 동기화한다.
        // (a) 즉시 적용: RN Appearance API로 현재 세션 컬러 스킴 전환
        // (b) 영속화: iOS UserDefaults에 저장 → 다음 실행 시 AppDelegate가 읽어 window 스타일 재정의
        const theme = messageData.props?.theme as 'dark' | 'light' | undefined;
        if (theme === 'dark' || theme === 'light') {
          Appearance.setColorScheme(theme);
          if (Platform.OS === 'ios') {
            NativeModules.AppThemeModule?.setTheme(theme);
          }
          console.log('[NativeTheme] 테마 설정:', theme);
        }
        break;
      }

      case 'webSplashReady':
        // 웹이 자체 스플래시를 그릴 준비가 됐음을 알림 → 네이티브 부트스플래시 숨김
        console.log('[BootSplash] webSplashReady 수신 → hide');
        hideBootSplash?.();
        break;

      case 'closeApp':
        handleExitApp();
        break;

      case 'openUrl': {
        const url = messageData.props?.url;
        if (url) {
          Linking.openURL(url).catch(err =>
            console.error('URL 열기 실패:', err)
          );
        }
        break;
      }

      case 'openImagePicker': {
        const source = messageData.props?.source;
        if (source !== 'camera' && source !== 'library') {
          webViewRef.current?.postMessage(
            JSON.stringify({
              type: 'ocrError',
              data: { message: '이미지 소스가 지정되지 않았습니다.' },
            }),
          );
          break;
        }
        launchImagePicker(source, webViewRef);
        break;
      }

      case 'vibrate': {
        const HAPTIC_ENABLED = false; // 햅틱 일시 비활성화 토글: true로 바꾸면 다시 켜짐
        if (!HAPTIC_ENABLED) break;
        const { duration, cancel, type: hapticType } = messageData.props || {};

        if (cancel === true) {
          Vibration.cancel();
          break;
        }

        // react-native-haptic-feedback 사용 (더 정교한 손맛을 위해)
        let HapticFeedback;
        // 네이티브 모듈이 실제로 존재하는지 먼저 확인 (런타임 에러 방지)
        const { NativeModules } = require('react-native');
        const hasNativeModule = NativeModules.RNHapticFeedback ||
          (global as any).nativeModuleProxy?.RNHapticFeedback ||
          (global as any).__turboModuleProxy; // TurboModule 가능성 체크

        if (hasNativeModule) {
          try {
            HapticFeedback = require('react-native-haptic-feedback').default;
          } catch (e) {
            console.warn('HapticFeedback 라이브러리를 불러올 수 없습니다.');
          }
        }

        if (HapticFeedback) {
          const options = {
            enableVibrateFallback: true,
            ignoreAndroidSystemSettings: false,
          };

          // 1. 명시적인 hapticType이 있는 경우
          if (hapticType) {
            try {
              HapticFeedback.trigger(hapticType, options);
              break;
            } catch (e) {
              console.warn('Haptic trigger failed', e);
            }
          }

          // 2. 기존 duration: 5와 같은 짧은 진동을 고품질 햅틱으로 자동 매핑 (iOS 위주)
          if (Platform.OS === 'ios' && duration > 0 && duration <= 10) {
            try {
              // 'selection'보다 조금 더 확실한 '손맛'을 위해 'impactLight'로 변경
              HapticFeedback.trigger('impactLight', options);
              break;
            } catch (e) {
              console.warn('Haptic trigger failed', e);
            }
          }
        }

        // 기본 진동 (하위 호환성 또는 라이브러리 부재 시)
        const vibrateDuration = duration && typeof duration === 'number' ? duration : 400;

        if (Platform.OS === 'ios') {
          Vibration.vibrate([vibrateDuration], false);
        } else {
          Vibration.vibrate([0, vibrateDuration], false);
        }
        break;
      }

      default:
        console.log('알 수 없는 메시지 타입:', messageData.type);
    }
  } catch (error) {
    console.error('Error parsing message:', error);
  }
};

export default handleWebViewMessage;
