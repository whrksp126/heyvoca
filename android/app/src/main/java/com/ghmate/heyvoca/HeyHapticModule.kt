package com.ghmate.heyvoca

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager

/**
 * 시스템 프리베이크 진동 효과(VibrationEffect.createPredefined, API 29+) 재생 + 기기 능력 조회.
 * 효과 이벤트의 시각은 네이티브 Handler(uptimeMillis 기준)로 예약해 JS 브릿지/타이머 지터를 제거한다.
 */
@ReactModule(name = HeyHapticModule.NAME)
class HeyHapticModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  companion object {
    const val NAME = "HeyHaptic"
  }

  private val handler = Handler(Looper.getMainLooper())

  override fun getName() = NAME

  private fun vibrator(): Vibrator? = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator

  private fun vibrationAllowed(v: Vibrator?): Boolean {
    if (v == null || !v.hasVibrator()) return false
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return true
    return am.ringerMode != AudioManager.RINGER_MODE_SILENT
  }

  private fun effectId(name: String): Int? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
    return when (name) {
      "tick" -> VibrationEffect.EFFECT_TICK
      "click" -> VibrationEffect.EFFECT_CLICK
      "heavyClick" -> VibrationEffect.EFFECT_HEAVY_CLICK
      "doubleClick" -> VibrationEffect.EFFECT_DOUBLE_CLICK
      else -> null
    }
  }

  /** events: [{at: ms(호출 시점 기준), effect: 'tick'|'click'|'heavyClick'|'doubleClick'}] */
  @ReactMethod
  fun playEffects(events: ReadableArray, cancelPrevious: Boolean) {
    try {
      val v = vibrator()
      if (!vibrationAllowed(v)) return
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
      if (cancelPrevious) handler.removeCallbacksAndMessages(null)
      val base = SystemClock.uptimeMillis()
      for (i in 0 until events.size()) {
        val m = events.getMap(i) ?: continue
        val id = effectId(m.getString("effect") ?: continue) ?: continue
        val at = if (m.hasKey("at")) m.getDouble("at").toLong().coerceAtLeast(0) else 0L
        handler.postAtTime({
          try {
            v?.vibrate(VibrationEffect.createPredefined(id))
          } catch (_: Exception) {}
        }, base + at)
      }
    } catch (_: Exception) {}
  }

  @ReactMethod
  fun cancel() {
    handler.removeCallbacksAndMessages(null)
  }

  @ReactMethod
  fun getCaps(promise: Promise) {
    try {
      val v = vibrator()
      val map = Arguments.createMap()
      map.putInt("apiLevel", Build.VERSION.SDK_INT)
      map.putBoolean("supportsPrebaked", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && v?.hasVibrator() == true)
      val amp = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && v?.hasAmplitudeControl() == true
      map.putBoolean("hasAmplitudeControl", amp)
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("haptic_caps", e.message)
    }
  }
}

class HeyHapticPackage : ReactPackage {
  override fun createNativeModules(c: ReactApplicationContext): List<NativeModule> =
      listOf(HeyHapticModule(c))

  override fun createViewManagers(c: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
