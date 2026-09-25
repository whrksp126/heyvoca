import UIKit
import React_RCTAppDelegate

// Xcode 27(iOS 27 SDK)부터 UIScene 생명주기 채택이 필수다 — 채택하지 않으면
// iOS 27 기기에서 런치 즉시 "Application failed to launch: UIScene life cycle is
// required for apps built with this SDK. See Technote TN3187" assert로 종료된다.
// 1.1.1(19) 빌드가 이 사유로 App Store 심사에서 거절되어(2.1.0 App Completeness),
// window 생성과 React Native 부팅 로직을 AppDelegate에서 이 SceneDelegate로 옮겼다.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }

    // 이미 rootViewController가 붙어 있다면(예: 씬 재연결) React Native를 다시 부팅하지 않는다.
    if let existingWindow = self.window, existingWindow.rootViewController != nil {
      existingWindow.windowScene = windowScene
      return
    }

    guard
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else {
      return
    }

    let window = UIWindow(windowScene: windowScene)

    // 개발 모드 번들 다운로드 중 흰 화면 방지 — 루트 윈도우 배경을 항상 라이트(브랜드 컬러)로 고정.
    // 부트스플래시/초기 로딩 구간은 시스템·앱 다크모드와 무관하게 항상 라이트로 보여야 하므로
    // 저장된 appTheme(다크)을 더 이상 참조하지 않는다. 앱 내부 다크모드 기능 자체는
    // JS 로드 후 WebView/Appearance 쪽에서 그대로 동작하며 영향받지 않는다.
    // overrideUserInterfaceStyle은 쓰지 않는다(WebView의 prefers-color-scheme을 강제해
    // 'system' 테마가 한 값에 고정되는 피드백 루프를 유발하므로).
    window.backgroundColor = UIColor(red: 1.0, green: 0.933, blue: 0.980, alpha: 1.0) // #FFEEFA

    factory.startReactNative(
      withModuleName: "heyvoca",
      in: window,
      launchOptions: appDelegate.launchOptions
    )

    self.window = window
    appDelegate.window = window
  }
}
