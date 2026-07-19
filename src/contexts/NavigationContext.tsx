import React, { createContext, useContext, useState, ReactNode } from 'react';

interface NavigationContextType {
  currentScreen: string;
  navigationParams: any;
  webViewRef: React.RefObject<any> | null;
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
  replace: (screen: string) => void;
  setWebViewRef: (ref: React.RefObject<any> | null) => void;
  // "채팅으로 학습" 오버레이 — HomeScreen(WebView)을 교체하지 않고 위에 절대배치로 띄운다.
  // (HomeScreen은 토큰 갱신 트릭 때문에 항상 마운트 상태여야 함)
  chatStudyOpen: boolean;
  chatStudyParams: any;
  openChatStudy: (params?: any) => void;
  closeChatStudy: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

interface NavigationProviderProps {
  children: ReactNode;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [navigationParams, setNavigationParams] = useState<any>({});
  const [navigationHistory, setNavigationHistory] = useState<string[]>(['home']);
  const [webViewRef, setWebViewRef] = useState<React.RefObject<any> | null>(null);
  const [chatStudyOpen, setChatStudyOpen] = useState(false);
  const [chatStudyParams, setChatStudyParams] = useState<any>({});

  const openChatStudy = (params?: any) => {
    setChatStudyParams(params || {});
    setChatStudyOpen(true);
  };

  const closeChatStudy = () => {
    setChatStudyOpen(false);
    setChatStudyParams({});
  };

  const navigate = (screen: string, params?: any) => {
    setNavigationHistory(prev => [...prev, screen]);
    setCurrentScreen(screen);
    setNavigationParams(params || {});
  };

  const goBack = () => {
    if (navigationHistory.length > 1) {
      const newHistory = navigationHistory.slice(0, -1);
      const previousScreen = newHistory[newHistory.length - 1];
      setNavigationHistory(newHistory);
      setCurrentScreen(previousScreen);
      setNavigationParams({});
    }
  };

  const replace = (screen: string) => {
    setCurrentScreen(screen);
    setNavigationParams({});
  };

  const value: NavigationContextType = {
    currentScreen,
    navigationParams,
    webViewRef,
    navigate,
    goBack,
    replace,
    setWebViewRef,
    chatStudyOpen,
    chatStudyParams,
    openChatStudy,
    closeChatStudy,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
