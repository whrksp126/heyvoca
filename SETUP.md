# HeyVoca App 로컬 개발 환경 가이드

React Native (TypeScript) 앱. iOS / Android 모두 지원.

## 사전 준비

- Node.js 설치
- [Android Studio](https://developer.android.com/studio) (Android 개발 시)
- [Xcode](https://developer.apple.com/xcode/) (iOS 개발 시, Mac 전용)
- Ruby + CocoaPods (`sudo gem install cocoapods`, iOS 개발 시)

---

## 1. 레포 클론

```bash
git clone https://github.com/whrksp126/heyvoca.git
cd heyvoca
```

> 웹 프론트/백엔드는 별도 모노레포: `github.com/whrksp126/heyvoca_service`

---

## 2. 패키지 설치

```bash
npm install

# iOS 추가 설치 (Mac 전용)
cd ios && pod install && cd ..
```

---

## 3. 환경 파일 준비

아래 파일들은 git에 포함되지 않으므로 **처음 셋업 시 직접 생성**해야 합니다.
파일 내용은 구글 공유 드라이브에서 공유받으세요.

### 환경변수 파일

| 파일 | 용도 |
|------|------|
| `.env.local` | 로컬 개발용 서버 URL, Google OAuth 클라이언트 ID 등 |
| `.env.dev` | dev 서버 환경 |
| `.env.stg` | stg 서버 환경 |

> 로컬 IP 확인: `ipconfig getifaddr en0`

### Firebase 설정 파일

| 파일 경로 | 용도 |
|-----------|------|
| `android/app/google-services.json` | Firebase Android 설정 |
| `ios/GoogleService-Info.plist` | Firebase iOS 설정 |
| `ios/heyvoca/GoogleService-Info.plist` | Firebase iOS 설정 (Xcode 프로젝트 내) |

### Android 서명 파일

| 파일 경로 | 용도 |
|-----------|------|
| `android/app/keystore.properties` | 릴리즈 키스토어 정보 |
| `android/app/release-key.keystore` | 릴리즈 서명 키 |

> `debug.keystore`는 git에 포함되어 있으므로 별도 준비 불필요.

---

## 4. 로컬 실행

Metro 번들러를 먼저 실행한 뒤, 별도 터미널에서 앱을 실행합니다.

```bash
# Metro 번들러 시작
npm run start
```

```bash
# Android 실행 (에뮬레이터 또는 실기기)
npm run android:local

# iOS 실행 (시뮬레이터)
npm run ios-simulator-iphone:local

# iOS 실기기 실행
npm run ios:local
```

---

## 일상 개발

### 환경별 실행

```bash
# Android
npm run android:dev
npm run android:stg

# iOS
npm run ios:dev
npm run ios:stg
```

### 네이티브 패키지 추가 후

```bash
cd ios && pod install && cd ..
```

### 테스트 / 린트

```bash
npm run test
npm run lint
```

---

## IP가 바뀌었을 때

`.env.local` 파일의 아래 항목을 업데이트하세요.

```
FRONT_URL=http://{새 내부IP}
ANDROID_FRONT_URL=http://{새 내부IP}
BACK_URL=http://{새 내부IP}:5003
```

Metro 번들러를 재시작하면 반영됩니다.

```bash
npm run start -- --reset-cache
```
