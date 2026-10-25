import { attachListenPlayerEvents } from './listenPlayer';

// react-native-track-player 재생 서비스. 원격 명령(잠금화면·제어센터·알림·이어폰 버튼) 처리는 listenPlayer 에 모여 있다.
export default async function listenPlaybackService() {
  attachListenPlayerEvents();
}
