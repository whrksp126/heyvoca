import Foundation

/// 웹에서 보낸 앱 테마('dark' | 'light')를 UserDefaults에 영속화한다.
/// AppDelegate가 다음 실행 시 이 값을 읽어 window.overrideUserInterfaceStyle을 설정한다.
/// 브리지 등록은 AppThemeModule.m의 RCT_EXTERN_MODULE이 처리하므로
/// Swift에서 RCTBridgeModule 프로토콜을 직접 conform하지 않는다(브리징 헤더 불필요).
@objc(AppThemeModule)
class AppThemeModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  /// theme: "dark" | "light"
  @objc func setTheme(_ theme: String) {
    UserDefaults.standard.set(theme, forKey: "appTheme")
  }
}
