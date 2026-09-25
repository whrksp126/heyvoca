import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import UserNotifications
import FirebaseCore
import RNBootSplash

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    FirebaseApp.configure()
    UNUserNotificationCenter.current().delegate = self

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    self.launchOptions = launchOptions

    // window 생성과 React Native 부팅은 UIScene 생명주기로 이동했다(SceneDelegate.swift 참고).
    // iOS 27 SDK로 빌드한 앱은 UIScene을 채택하지 않으면 런치 즉시 종료된다(TN3187).

    return true
  }

  // 프로세스에 씬을 붙일 때 사용할 구성을 지정 — UIScene 생명주기 채택의 핵심 진입점.
  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }

  // 포그라운드 상태에서도 알림 배너와 소리가 뜨도록 설정
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([[.banner, .list, .sound, .badge]])
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  // 부트스플래시를 화면에 붙잡아 둠 — JS에서 RNBootSplash.hide()를 호출할 때까지 유지.
  // 이게 없으면 iOS 런치스크린이 순식간에 사라져 로고 없는 빈 화면 갭이 생긴다.
  override func customize(_ rootView: RCTRootView!) {
    super.customize(rootView)
    // 부트스플래시는 저장된 앱 테마(appTheme)나 시스템 다크모드와 무관하게 항상 라이트 스토리보드로 고정한다.
    // (BootSplashDark는 더 이상 부트스플래시 용도로 선택되지 않는다 — 앱 내부 다크모드는
    // JS 로드 이후 별도 메커니즘으로 계속 동작하며 이 변경의 영향을 받지 않는다.)
    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
