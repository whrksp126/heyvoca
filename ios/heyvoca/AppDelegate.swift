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

    window = UIWindow(frame: UIScreen.main.bounds)

    // 개발 모드 번들 다운로드 중 흰 화면 방지 — 루트 윈도우 배경을 저장된 앱 테마색으로 설정.
    // overrideUserInterfaceStyle은 쓰지 않는다(WebView의 prefers-color-scheme을 강제해
    // 'system' 테마가 한 값에 고정되는 피드백 루프를 유발하므로). 부트스플래시 색은 customize에서
    // 테마별 스토리보드(BootSplash / BootSplashDark)로 처리한다.
    let savedTheme = UserDefaults.standard.string(forKey: "appTheme")
    window?.backgroundColor = (savedTheme == "dark")
      ? UIColor(red: 0.141, green: 0.141, blue: 0.141, alpha: 1.0) // #242424
      : UIColor(red: 1.0, green: 0.933, blue: 0.980, alpha: 1.0)   // #FFEEFA

    factory.startReactNative(
      withModuleName: "heyvoca",
      in: window,
      launchOptions: launchOptions
    )

    return true
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
    // 저장된 앱 테마(마이페이지에서 변경 → UserDefaults)에 따라 테마별 부트스플래시 스토리보드를 로드한다.
    // RNBootSplash가 스토리보드에서 추출한 뷰는 런타임 배경색/override가 안 먹으므로,
    // 색을 스토리보드 자체에 박아두고(BootSplash=라이트, BootSplashDark=다크) 타깃만 바꾼다.
    let saved = UserDefaults.standard.string(forKey: "appTheme")
    let storyboardName = (saved == "dark") ? "BootSplashDark" : "BootSplash"
    RNBootSplash.initWithStoryboard(storyboardName, rootView: rootView)
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
