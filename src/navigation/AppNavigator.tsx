import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '../contexts/NavigationContext';

import HomeScreen from '../screens/HomeScreen';
import ChatStudyScreen from '../screens/ChatStudyScreen';

const AppNavigator: React.FC = () => {
  const { currentScreen, navigationParams, chatStudyOpen, chatStudyParams, closeChatStudy } = useNavigation();

  const renderScreen = () => {
    const route = { params: navigationParams };
    switch (currentScreen) {
      case 'home':
        return <HomeScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <>
      <View className="flex-1">{renderScreen()}</View>
      {/* "채팅으로 학습" 오버레이 — HomeScreen(WebView)을 교체하지 않고 그 위에 절대배치로 띄운다 */}
      {chatStudyOpen && (
        <View className="absolute inset-0">
          <ChatStudyScreen params={chatStudyParams} onClose={closeChatStudy} />
        </View>
      )}
    </>
  );
};

export default AppNavigator;