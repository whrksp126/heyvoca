/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';

// 백그라운드 메시지 핸들러 등록. 기본 FirebaseApp은 네이티브 MainApplication.onCreate에서
// 보장 초기화되지만, 만약의 초기화 지연/실패가 이 최상단 호출에서 예외로 던져져
// AppRegistry.registerComponent까지 막고 앱 전체가 크래시하는 것을 방지하기 위해 격리한다.
try {
  messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('Message handled in the background!', remoteMessage);
  });
} catch (e) {
  console.warn('[FCM] 백그라운드 핸들러 등록 실패:', e?.message);
}

AppRegistry.registerComponent(appName, () => App);
