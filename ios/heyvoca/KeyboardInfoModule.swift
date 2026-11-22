import Foundation
import UIKit

/// (브리징 헤더가 없어 RCTPromise 블록을 Swift 클로저 타입으로 직접 선언)
/// 일본어 키보드 활성 여부 감지 + 설정 앱 열기. (PrivacyInfo: ActiveKeyboards 54BD.1)
/// 결과는 기기 밖으로 보내지 않는다 — 웹에는 status 문자열만 전달.
@objc(KeyboardInfoModule)
class KeyboardInfoModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc func getStatus(_ lang: String,
                       resolver resolve: @escaping (Any?) -> Void,
                       rejecter reject: @escaping (String?, String?, Error?) -> Void) {
    DispatchQueue.main.async {
      let modes = UITextInputMode.activeInputModes
      if modes.isEmpty {
        resolve("unknown")
        return
      }
      let prefix = lang.lowercased()
      let found = modes.contains { ($0.primaryLanguage ?? "").lowercased().hasPrefix(prefix) }
      resolve(found ? "enabled" : "missing")
    }
  }

  /// 공개 API(openSettingsURLString)만 사용 → 앱 설정 화면.
  @objc func openSettings(_ resolve: @escaping (Any?) -> Void,
                          rejecter reject: @escaping (String?, String?, Error?) -> Void) {
    DispatchQueue.main.async {
      guard let url = URL(string: UIApplication.openSettingsURLString),
            UIApplication.shared.canOpenURL(url) else {
        resolve(["ok": false, "target": "app"])
        return
      }
      UIApplication.shared.open(url, options: [:]) { ok in
        resolve(["ok": ok, "target": "app"])
      }
    }
  }
}
