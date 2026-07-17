import React, { useRef, useEffect, useCallback } from 'react';
import { StyleSheet, StatusBar, BackHandler, View, Keyboard, Platform, Text, PanResponder, AppState, AppStateStatus, useColorScheme } from 'react-native';
import WebView from 'react-native-webview';
import CookieManager from '@react-native-cookies/cookies';
import RNBootSplash from 'react-native-bootsplash';
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



// 웹 신호 없이 스플래시가 영구 유지되는 최대 대기 시간 (ms)
const BOOTSPLASH_TIMEOUT_MS = 8000;

// 부트스플래시~WebView 첫 신호(webSplashReady) 수신 전 구간의 배경은 시스템·앱 다크모드와
// 무관하게 항상 라이트(브랜드 컬러)로 고정한다 (③ 요구사항, 유지).
// WebView 로드 완료(webLoaded=true) 이후에는 아래 SPLASH_BG_DARK로 전환해 앱 다크모드를 따른다.
const SPLASH_BG_LIGHT = '#FFEEFA';
const SPLASH_BG_DARK = '#242424';

const HomeScreen = () => {
  const webViewRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top;
  const { setWebViewRef } = useNavigation();

  // scheme은 시스템 다크모드가 아니라 웹이 setNativeTheme으로 보낸 앱 테마를 반영한다.
  // (webviewMessageHandler의 'setNativeTheme' 케이스가 Appearance.setColorScheme(theme)을
  //  호출해 이 훅의 반환값을 즉시 덮어쓰기 때문 — 시스템 설정과 무관하게 앱 자체 테마를 따름)
  const scheme = useColorScheme();

  // WebView가 첫 페인트를 마치고 'webSplashReady'를 보내기 전까지는 항상 라이트 고정(③),
  // 그 이후부터는 현재 앱 테마(scheme)를 따르는 배경으로 전환한다.
  const [webLoaded, setWebLoaded] = React.useState(false);
  const splashBg = webLoaded
    ? (scheme === 'dark' ? SPLASH_BG_DARK : SPLASH_BG_LIGHT)
    : SPLASH_BG_LIGHT;

  // 중복 hide 방지 가드: 한 번만 실행되도록 보장
  const splashHiddenRef = useRef(false);

  const hideBootSplash = useCallback(() => {
    if (splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    // 부트스플래시가 걷히는 시점(webSplashReady 수신 또는 타임아웃 폴백)을 기준으로
    // "로딩 전 라이트 고정 / 로딩 후 테마 추종" 단계를 전환한다.
    setWebLoaded(true);
    RNBootSplash.hide({ fade: true });
  }, []);

  // 안전장치: 8초 타임아웃 — 웹 신호/onLoadEnd 없이도 스플래시가 남지 않도록 강제 hide
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!splashHiddenRef.current) {
        console.warn('[BootSplash] 타임아웃: 웹 신호 없이 강제 hide');
        hideBootSplash();
      }
    }, BOOTSPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hideBootSplash]);

  // webViewRef를 NavigationContext에 설정
  useEffect(() => {
    setWebViewRef(webViewRef);
  }, [setWebViewRef]);

  // Android: 앱이 백그라운드/비활성 전환 시 CookieManager.flush()로 쿠키를 디스크에 강제 기록.
  // (Android CookieManager는 영속 스토리지를 갖지만 flush 타이밍이 불확실해
  //  강제 종료 직전에 refresh_token 쿠키가 유실될 수 있음.)
  // iOS는 sharedCookiesEnabled prop으로 WKWebView 쿠키가 NSHTTPCookieStorage(디스크)에
  // 자동 동기화되므로 별도 flush 불필요.
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        try {
          await CookieManager.flush();
        } catch (e) {
          // flush 실패는 무시 — 쿠키 유실 가능성이 남지만 앱 동작에는 영향 없음
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

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

  // iOS: WKWebView 내부 <input>에 포커스했을 때 뜨는 소프트 키보드가 앱 다크모드를 따르도록
  // 문서의 CSS `color-scheme`을 앱 테마(scheme)에 맞춰 갱신한다.
  //
  // react-native-webview는 keyboardAppearance/overrideUserInterfaceStyle 류의 prop을 지원하지
  // 않는다(라이브러리 자체 조사 결과 없음). 또한 WKWebView 인스턴스에 직접
  // overrideUserInterfaceStyle을 걸면 트레이트가 하위로 전파되어 페이지의
  // `prefers-color-scheme` 미디어쿼리까지 앱 테마 값으로 강제돼버려, AppDelegate.swift에
  // 이미 남겨둔 경고("system 테마가 한 값에 고정되는 피드백 루프")가 그대로 재발한다.
  // 반면 CSS `color-scheme` 프로퍼티는 스크롤바/폼 컨트롤/키보드 등 OS가 직접 그리는 UI의
  // 배색만 바꿀 뿐 `prefers-color-scheme` 값 자체에는 영향을 주지 않으므로, 이 갱신만으로도
  // 웹의 "system" 테마 감지 로직을 건드리지 않고 키보드 배색만 좁게 고칠 수 있다.
  useEffect(() => {
    if (!webViewRef.current) return;
    const colorScheme = scheme === 'dark' ? 'dark' : 'light';
    webViewRef.current.injectJavaScript(`
      (function() {
        document.documentElement.style.setProperty('color-scheme', '${colorScheme}');
      })();
      true;
    `);
  }, [scheme]);

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

  // iOS 좌측 엣지 스와이프(우향) → 웹 onBackPressed(가로) 호출.
  // 안드로이드는 하드웨어 백 버튼을 쓰므로 불필요. 풀시트(우측 등장)/페이지 백만 처리하고
  // 바텀시트(하단 등장)는 웹 측에서 가로 스와이프를 무시하도록 분기됨.
  const edgeSwipeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        // 좌측 엣지에서 시작한 우향 가로 스와이프만 가로챔 (세로 스크롤/탭은 WebView로 통과)
        gesture.dx > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx > 60 && Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
          webViewRef.current?.injectJavaScript(
            `(function(){ if(window.onBackPressed){ window.onBackPressed({direction:'horizontal'}); } })(); true;`,
          );
        }
      },
    }),
  ).current;

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
    <View style={[styles.container, { backgroundColor: splashBg }]}>
      <StatusBar
        // 로딩 전(라이트 고정 구간)은 dark-content, 로딩 후 다크 배경 전환 시 light-content.
        // 웹이 'setStatusBarStyle' 메시지로 이후 다시 덮어쓸 수 있음(webviewMessageHandler 참고).
        barStyle={splashBg === SPLASH_BG_DARK ? 'light-content' : 'dark-content'}
        backgroundColor={'transparent'}
        translucent={true}
        hidden={false}
      />
      {/* 웹뷰 레이아웃: 절대 좌표로 위치 고정 및 바닥(bottom) 조정 */}
      <View style={[styles.webviewWrapper, { backgroundColor: splashBg, bottom: Platform.OS === 'ios' ? keyboardHeight : 0 }]}>
        <WebView
          source={{ uri: FRONT_URL }}
          ref={webViewRef}
          bounces={false}
          overScrollMode="never"
          // iOS: WKWebView 쿠키를 NSHTTPCookieStorage(디스크 영속)와 공유.
          // 콜드 스타트 후에도 HttpOnly refresh_token 쿠키가 복원되어 자동 갱신이 동작함.
          sharedCookiesEnabled={true}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          scalesPageToFit={false}
          scrollEnabled={false}
          userAgent={APP_USER_AGENT}
          onMessage={event => handleWebViewMessage(event, webViewRef, handleExitApp, hideBootSplash)}
          // onLoadEnd 폴백 제거: SPA에서 React 페인트 전에 발생해 흰 화면을 유발하는 주범.
          // 부트스플래시 hide는 webSplashReady 수신(1순위) 또는 타임아웃(유일한 안전장치)만 사용.
          javaScriptEnabled={true}
          webviewDebuggingEnabled={true}
          hideKeyboardAccessoryView={true}
          // TTS 자동재생(집중 반복 학습 등 사용자 탭 없이 재생되는 흐름)이 iOS WKWebView의
          // 기본 autoplay 정책(user action 필요)에 막혀 무음+즉시 스킵되던 문제 해결.
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback={true}
          // iOS WKWebView가 로드 중 그리는 불투명 흰 배경을 투명하게 만들어
          // 뒤의 컨테이너 테마색(splashBg)이 비치도록 한다.
          opaque={false}
          injectedJavaScript={`
            (function() {
              document.documentElement.style.setProperty('--status-bar-height', '${statusBarHeight}px');
              document.documentElement.style.setProperty('--safe-area-bottom', '${insets.bottom}px');
              // 최초 로드 시점의 앱 테마로 색상 스킴을 선반영 — iOS 키보드가 잠깐이라도
              // 라이트로 뜨는 첫 프레임 깜빡임 방지(이후 테마 변경은 아래 [scheme] useEffect가 갱신).
              document.documentElement.style.setProperty('color-scheme', '${scheme === 'dark' ? 'dark' : 'light'}');
              window.alert = function(message) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'alert', message: message }));
              };
            })();
          `}
          style={[styles.webview, { backgroundColor: splashBg }]}
        />
        {/* iOS 좌측 엣지 스와이프 백 감지 영역 (안드로이드는 하드웨어 백 사용) */}
        {Platform.OS === 'ios' && (
          <View style={styles.edgeSwipeZone} {...edgeSwipeResponder.panHandlers} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // 배경색은 splashBg 인라인 style로 적용 — 로딩 전(#FFEEFA 고정) / 로딩 후(테마 추종) 2단계
  container: { flex: 1 },
  webviewWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  webview: { flex: 1 },
  edgeSwipeZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 24,
    backgroundColor: 'transparent',
  },
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
