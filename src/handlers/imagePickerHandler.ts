import React from 'react';
import { Platform, Alert, Linking } from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  CameraOptions,
  ImageLibraryOptions,
  ImagePickerResponse,
  Asset,
} from 'react-native-image-picker';
import { recognizeTextFromImage } from '../components/ocrHelper';

type Source = 'camera' | 'library';

const PICKER_OPTIONS = {
  mediaType: 'photo' as const,
  includeBase64: true,
  maxWidth: 2400,
  maxHeight: 2400,
  quality: 0.9 as const,
  saveToPhotos: false,
};

const sendOcrCancel = (webViewRef: React.RefObject<any>) => {
  webViewRef.current?.postMessage(
    JSON.stringify({ type: 'ocrCancel' }),
  );
};

const sendOcrError = (webViewRef: React.RefObject<any>, message: string) => {
  webViewRef.current?.postMessage(
    JSON.stringify({ type: 'ocrError', data: { message } }),
  );
};

// 카메라/사진 권한이 거부된 경우: 설정으로 직접 유도하는 네이티브 알림.
// (iOS는 한 번 거부되면 앱 내에서 재프롬프트 불가 → 설정 앱으로 안내)
const showPermissionAlert = (source: Source) => {
  const target = source === 'camera' ? '카메라' : '사진';
  Alert.alert(
    `${target} 접근 권한이 필요해요`,
    `설정에서 ${target} 접근을 허용해야 이 기능을 사용할 수 있어요.`,
    [
      { text: '취소', style: 'cancel' },
      {
        text: '설정 열기',
        onPress: () => Linking.openSettings().catch(() => {}),
      },
    ],
  );
};

const handlePickerResponse = async (
  response: ImagePickerResponse,
  webViewRef: React.RefObject<any>,
  source: Source,
) => {
  // [진단] iOS 카메라 무반응 원인 추적: 콜백이 실제로 도달했는지 + 응답 내용 확인
  console.log(
    `📷 [ImagePicker] 콜백 수신 (${Platform.OS}) didCancel=${response.didCancel} ` +
      `errorCode=${response.errorCode ?? '-'} errorMessage=${response.errorMessage ?? '-'} ` +
      `assets=${response.assets?.length ?? 0}`,
  );

  if (response.didCancel) {
    sendOcrCancel(webViewRef);
    return;
  }
  if (response.errorCode) {
    // 권한 거부: 네이티브 알림으로 설정 열기를 유도하고, 웹은 취소처럼 깔끔히 복귀시킨다
    // (웹에서 별도 알림을 또 띄우지 않도록 ocrError 대신 ocrCancel 전송).
    if (response.errorCode === 'permission') {
      console.log('[ImagePicker] 권한 거부 — 설정 유도');
      showPermissionAlert(source);
      sendOcrCancel(webViewRef);
      return;
    }
    // camera_unavailable 은 시뮬레이터에 카메라가 없을 때 정상적으로 발생하는 코드라
    // console.error(빨간 LogBox) 대신 조용히 로그만 남기고 사용자에겐 친화적 토스트로 안내한다.
    console.log(
      `[ImagePicker] errorCode=${response.errorCode} ${response.errorMessage ?? ''}`,
    );
    const friendlyMessage =
      response.errorCode === 'camera_unavailable'
        ? '이 기기에서는 카메라를 사용할 수 없습니다.'
        : response.errorMessage || `카메라 오류 (${response.errorCode})`;
    sendOcrError(webViewRef, friendlyMessage);
    return;
  }

  const asset: Asset | undefined = response.assets?.[0];
  if (!asset || !asset.uri) {
    sendOcrError(webViewRef, '이미지 정보를 가져오지 못했습니다.');
    return;
  }

  try {
    const words = await recognizeTextFromImage(asset.uri);

    const mime = asset.type || 'image/jpeg';
    const imageBase64 = asset.base64
      ? `data:${mime};base64,${asset.base64}`
      : null;

    if (!imageBase64) {
      sendOcrError(webViewRef, '이미지 인코딩에 실패했습니다.');
      return;
    }

    webViewRef.current?.postMessage(
      JSON.stringify({
        type: 'ocrResult',
        data: {
          words,
          imageBase64,
          photoSize: {
            width: asset.width || 0,
            height: asset.height || 0,
          },
        },
      }),
    );
  } catch (err) {
    console.error('❌ OCR 처리 실패:', err);
    sendOcrError(webViewRef, 'OCR 처리 중 오류가 발생했습니다.');
  }
};

export const launchImagePicker = (
  source: Source,
  webViewRef: React.RefObject<any>,
) => {
  if (!webViewRef?.current) {
    console.warn('⚠️ webViewRef가 없어 ImagePicker를 열 수 없습니다.');
    return;
  }

  // [진단] iOS 카메라 무반응 추적: 호출 자체가 실행되는지 확인
  console.log(`📷 [ImagePicker] launchImagePicker 호출 source=${source} (${Platform.OS})`);

  const cb = (response: ImagePickerResponse) => {
    handlePickerResponse(response, webViewRef, source);
  };

  if (source === 'camera') {
    const options: CameraOptions = { ...PICKER_OPTIONS, cameraType: 'back' };
    console.log('📷 [ImagePicker] launchCamera 실행 직전', JSON.stringify(options));
    launchCamera(options, cb);
  } else if (source === 'library') {
    const options: ImageLibraryOptions = { ...PICKER_OPTIONS, selectionLimit: 1 };
    launchImageLibrary(options, cb);
  } else {
    sendOcrError(webViewRef, '알 수 없는 이미지 소스입니다.');
  }
};
