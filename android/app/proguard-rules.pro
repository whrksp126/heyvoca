# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ─── React Native 기본 ────────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**

# ─── Hermes JS 엔진 ──────────────────────────────────────────────────────────
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.hermes.intl.** { *; }

# ─── Firebase Messaging / react-native-firebase ───────────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
-keep class io.invertase.firebase.** { *; }
-dontwarn io.invertase.firebase.**

# ─── react-native-iap ────────────────────────────────────────────────────────
-keep class com.dooboolab.rniap.** { *; }
-keep class io.github.hyochan.openiap.** { *; }
-dontwarn com.dooboolab.rniap.**
-dontwarn io.github.hyochan.openiap.**

# ─── @react-native-ml-kit/text-recognition ───────────────────────────────────
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.vision.** { *; }
-dontwarn com.google.mlkit.**

# ─── react-native-reanimated ─────────────────────────────────────────────────
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-dontwarn com.swmansion.reanimated.**

# ─── react-native-vision-camera ──────────────────────────────────────────────
-keep class com.mrousavy.camera.** { *; }
-dontwarn com.mrousavy.camera.**

# ─── @react-native-google-signin/google-signin ───────────────────────────────
-keep class com.google.android.gms.auth.** { *; }
-keep class com.google.android.gms.common.** { *; }
-keep class co.apptailor.googlesignin.** { *; }
-dontwarn co.apptailor.googlesignin.**

# ─── @invertase/react-native-apple-authentication ────────────────────────────
# Android에는 Apple Auth 네이티브 코드가 없으나 혹시 모를 참조 보호
-dontwarn com.RNAppleAuthentication.**

# ─── 기타 공통 ───────────────────────────────────────────────────────────────
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception
