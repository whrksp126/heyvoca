package com.ghmate.heyvoca

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ViewManager

/**
 * 켜진 키보드(IME)에 특정 언어(ja)가 있는지 감지 + 키보드 설정 화면 열기.
 * 결과는 기기 밖으로 보내지 않는다(웹에는 status 문자열만 전달).
 */
@ReactModule(name = KeyboardInfoModule.NAME)
class KeyboardInfoModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  companion object {
    const val NAME = "KeyboardInfo"

    // 일본어 전용 IME 패키지(접두 일치). 켜져 있으면 subtype 과 무관하게 enabled.
    private val JA_IME_PREFIXES = listOf(
      "com.google.android.inputmethod.japanese",
      "jp.baidu.simeji",
      "com.adamrocker.android.input.simeji",
      "jp.co.omronsoft.openwnn",
      "jp.co.omronsoft.iwnnime",
      "com.justsystems.atokmobile",
      "com.simeji.",
      "jp.co.sharp.android.iwnn",
    )
  }

  override fun getName() = NAME

  /** @return "enabled" | "missing" | "unknown" */
  private fun detect(lang: String): String {
    val imm = ctx.getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        ?: return "unknown"
    val list = imm.enabledInputMethodList
    if (list.isNullOrEmpty()) return "unknown"
    val prefix = lang.lowercase()
    var anyUnknownLang = false
    for (imi in list) {
      if (prefix == "ja" && JA_IME_PREFIXES.any { imi.packageName.startsWith(it) }) return "enabled"
      val subtypes = try {
        imm.getEnabledInputMethodSubtypeList(imi, true)
      } catch (_: Exception) {
        null
      }
      if (subtypes.isNullOrEmpty()) {
        anyUnknownLang = true
        continue
      }
      var imeHasKnownLang = false
      for (st in subtypes) {
        val tag = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) st.languageTag else null)
            .orEmpty().ifEmpty { @Suppress("DEPRECATION") st.locale.orEmpty() }
        if (tag.isEmpty()) continue
        imeHasKnownLang = true
        val norm = tag.lowercase().replace('_', '-')
        if (norm == prefix || norm.startsWith(prefix + "-")) return "enabled"
      }
      if (!imeHasKnownLang) anyUnknownLang = true
    }
    return if (anyUnknownLang) "unknown" else "missing"
  }

  @ReactMethod
  fun getStatus(lang: String, promise: Promise) {
    try {
      promise.resolve(detect(lang))
    } catch (_: Exception) {
      promise.resolve("unknown")
    }
  }

  @ReactMethod
  fun openSettings(promise: Promise) {
    val map = Arguments.createMap()
    val activity = currentActivity
    val launch: (Intent) -> Unit = { intent ->
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      (activity ?: ctx).startActivity(intent)
    }
    try {
      launch(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
      map.putBoolean("ok", true)
      map.putString("target", "keyboard")
      promise.resolve(map)
      return
    } catch (_: Exception) {}
    try {
      launch(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.packageName)))
      map.putBoolean("ok", true)
    } catch (_: Exception) {
      map.putBoolean("ok", false)
    }
    map.putString("target", "app")
    promise.resolve(map)
  }
}

class KeyboardInfoPackage : ReactPackage {
  override fun createNativeModules(c: ReactApplicationContext): List<NativeModule> =
      listOf(KeyboardInfoModule(c))

  override fun createViewManagers(c: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
