package com.ghmate.heyvoca

import androidx.core.app.NotificationManagerCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "heyvoca"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * 앱 실행·포그라운드 진입 시 상태바에 남은 우리 알림을 지운다. 런처 아이콘 배지(점·숫자)는
   * 남아 있는 알림 수로 붙으므로 알림을 지워야 같이 사라진다.
   */
  override fun onResume() {
    super.onResume()
    try {
      NotificationManagerCompat.from(this).cancelAll()
    } catch (_: Exception) {
    }
  }
}
