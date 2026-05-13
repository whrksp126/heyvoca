import React, { useRef, useEffect } from 'react';
import { StyleSheet, StatusBar, BackHandler, View, Keyboard, Platform, Text } from 'react-native';
import WebView from 'react-native-webview';
import handleWebViewMessage from '../handlers/webviewMessageHandler';
import Config from 'react-native-config';
import DeviceInfo from 'react-native-device-info';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '../contexts/NavigationContext';

const FRONT_URL = Config.APP_ENV === 'local' && Platform.OS === 'android' ? Config.ANDROID_FRONT_URL : Config.FRONT_URL;

const APP_VERSION = DeviceInfo.getVersion();
const APP_BUILD = DeviceInfo.getBuildNumber();
const APP_PLATFORM_LABEL = Platform.OS === 'ios' ? 'iOS' : 'Android';
const APP_USER_AGENT = `HeyVoca ${APP_PLATFORM_LABEL}/${APP_VERSION} (build ${APP_BUILD})`;



const HomeScreen = () => {
  const webViewRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top;
  const { setWebViewRef } = useNavigation();

  // webViewRef를 NavigationContext에 설정
  useEffect(() => {
    setWebViewRef(webViewRef);
  }, [setWebViewRef]);

  // 키보드 높이 상태 관리
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);

  useEffect(() => {
    // 키보드 이벤트 리스너 설정
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onKeyboardShow = (e: any) => {
      setKeyboardHeight(e.endCoordinates.height);
    };

    const onKeyboardHide = () => {
      setKeyboardHeight(0);
    };

    const showSubscription = Keyboard.addListener(showEvent, onKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, onKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // 키보드 상태를 WebView로 전달 (웹이 헤더/하단네비 숨김 판단에 사용)
  useEffect(() => {
    if (!webViewRef.current) return;
    const visible = keyboardHeight > 0 ? 'true' : 'false';
    webViewRef.current.injectJavaScript(`
      (function() {
        window.dispatchEvent(new CustomEvent('rn-keyboard', {
          detail: { height: ${keyboardHeight}, visible: ${visible} }
        }));
      })();
      true;
    `);
  }, [keyboardHeight]);

  useEffect(() => {
    const backAction = () => {
      if (webViewRef.current) {
        // 웹의 onBackPressed 함수를 직접 호출
        webViewRef.current.injectJavaScript(`
          (function() {
            if (window.onBackPressed) {
              window.onBackPressed();
            }
          })();
        `);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  const handleExitApp = () => {
    // 웹에서 closeApp 호출 시 앱 종료
    BackHandler.exitApp();
  };

  console.log('FRONT_URL', FRONT_URL);

  console.log('Platform', Platform);

  // FRONT_URL이 비어있으면 about:blank로 가지 않고 명시적 에러 표시.
  // (release 빌드에서 react-native-config의 BuildConfig 리플렉션이 실패하는 사고 재발 시 흰화면 대신 원인 노출)
  if (!FRONT_URL) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>환경 설정 오류</Text>
        <Text style={styles.errorMsg}>FRONT_URL이 비어있습니다. 빌드 환경변수(.env) 확인 필요.</Text>
        <Text style={styles.errorMsg}>APP_ENV={String(Config.APP_ENV)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={'dark-content'}
        backgroundColor={'transparent'}
        translucent={true}
        hidden={false}
      />
      {/* 웹뷰 레이아웃: 절대 좌표로 위치 고정 및 바닥(bottom) 조정 */}
      <View style={[styles.webviewWrapper, { bottom: Platform.OS === 'ios' ? keyboardHeight : 0 }]}>
        <WebView
          source={{ uri: FRONT_URL }}
          ref={webViewRef}
          bounces={false}
          overScrollMode="never"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          scalesPageToFit={false}
          scrollEnabled={false}
          userAgent={APP_USER_AGENT}
          onMessage={event => handleWebViewMessage(event, webViewRef, handleExitApp)}
          javaScriptEnabled={true}
          webviewDebuggingEnabled={true}
          hideKeyboardAccessoryView={true}
          injectedJavaScript={`
            (function() {
              document.documentElement.style.setProperty('--status-bar-height', '${statusBarHeight}px');
              document.documentElement.style.setProperty('--safe-area-bottom', '${insets.bottom}px');
              window.alert = function(message) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'alert', message: message }));
              };
            })();
          `}
          style={styles.webview}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' }, // 배경을 검은색으로 설정
  webviewWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'red', // 디버깅용: 빨간색 배경
  },
  webview: { flex: 1 },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
  },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#c00', marginBottom: 12 },
  errorMsg: { fontSize: 14, color: '#333', textAlign: 'center', marginBottom: 4 },
});

export default HomeScreen;
