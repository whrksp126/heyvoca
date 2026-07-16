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

    // 개발 모드 번들 다운로드 중 흰 화면 방지 — 루트 윈도우 배경을 항상 라이트(브랜드 컬러)로 고정.
    // 부트스플래시/초기 로딩 구간은 시스템·앱 다크모드와 무관하게 항상 라이트로 보여야 하므로
    // 저장된 appTheme(다크)을 더 이상 참조하지 않는다. 앱 내부 다크모드 기능 자체는
    // JS 로드 후 WebView/Appearance 쪽에서 그대로 동작하며 영향받지 않는다.
    // overrideUserInterfaceStyle은 쓰지 않는다(WebView의 prefers-color-scheme을 강제해
    // 'system' 테마가 한 값에 고정되는 피드백 루프를 유발하므로).
    window?.backgroundColor = UIColor(red: 1.0, green: 0.933, blue: 0.980, alpha: 1.0) // #FFEEFA

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
