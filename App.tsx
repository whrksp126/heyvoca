import * as Sentry from '@sentry/react-native';
import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { NavigationProvider } from './src/contexts/NavigationContext';
import AppNavigator from './src/navigation/AppNavigator';
import messaging from '@react-native-firebase/messaging';
import Config from 'react-native-config';

import "./global.css";

// DSN이 설정된 경우에만 활성화, local 환경에서는 비활성화
Sentry.init({
  dsn: Config.SENTRY_DSN || '',
  environment: Config.APP_ENV || 'local',
  enabled: !!Config.SENTRY_DSN && Config.APP_ENV !== 'local',
  tracesSampleRate: 0.1,
});

function Main() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />
      <AppNavigator />
    </View>
  );
}

export default function App() {
  React.useEffect(() => {
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      // 앱 사용 중인 사용자에게는 알림을 띄우지 않도록 요청되었으므로 콘솔 로그만 남김
      console.log('Foreground message received, but omitting visual alert:', remoteMessage);
    });

    return unsubscribe;
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
    backgroundColor: '#000000',
  },
});
