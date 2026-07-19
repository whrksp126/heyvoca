import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { NavigationProvider, useNavigation } from './src/contexts/NavigationContext';
import AppNavigator from './src/navigation/AppNavigator';
import messaging from '@react-native-firebase/messaging';

import "./global.css";

function Main() {
  const { openChatStudy } = useNavigation();
  // openChatStudy는 매 렌더 새로 생성되므로 ref로 최신값을 참조해
  // 알림 리스너를 마운트 시 1회만 등록한다.
  const openChatStudyRef = React.useRef(openChatStudy);
  openChatStudyRef.current = openChatStudy;

  React.useEffect(() => {
    // 알림 탭 → 채팅 학습 진입. 백엔드가 data={screen:'chatStudy', ...}로 보낸다.
    const handleNotif = (remoteMessage: any) => {
      if (remoteMessage?.data?.screen === 'chatStudy') {
        openChatStudyRef.current?.(remoteMessage.data || {});
      }
    };
    let unsubscribe: (() => void) | undefined;
    try {
      // 백그라운드(앱 살아있음)에서 알림 탭
      unsubscribe = messaging().onNotificationOpenedApp(handleNotif);
      // 콜드 스타트(앱 완전 종료 상태)에서 알림 탭으로 실행된 경우
      messaging()
        .getInitialNotification()
        .then(remoteMessage => {
          if (remoteMessage) handleNotif(remoteMessage);
        })
        .catch(() => {});
    } catch (e) {
      console.warn('[FCM] 알림 클릭 핸들러 등록 실패:', (e as Error)?.message);
    }
    return () => unsubscribe?.();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />
      <AppNavigator />
    </View>
  );
}

export default function App() {
  React.useEffect(() => {
    // Firebase 기본 앱 초기화가 늦은 단말에서 messaging() 호출이 던져
    // 화면이 죽는 것을 방지 — 실패해도 앱 동작은 계속된다.
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = messaging().onMessage(async remoteMessage => {
        // 앱 사용 중인 사용자에게는 알림을 띄우지 않도록 요청되었으므로 콘솔 로그만 남김
        console.log('Foreground message received, but omitting visual alert:', remoteMessage);
      });
    } catch (e) {
      console.warn('[FCM] foreground 메시지 리스너 등록 실패:', (e as Error)?.message);
    }

    return () => unsubscribe?.();
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationProvider>
        <Main />
      </NavigationProvider>
      <Toast />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // 부트스플래시 이후 JS 렌더 전까지 잠깐 보이는 루트 배경.
    // 시스템/앱 다크모드와 무관하게 부트스플래시와 동일한 라이트(브랜드 컬러)로 고정해
    // 초기 검은 화면 깜빡임을 방지한다. (앱 내부 다크모드 기능 자체는 영향 없음)
    backgroundColor: '#FFEEFA',
  },
});
