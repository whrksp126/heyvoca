import React from 'react';
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

const handlePickerResponse = async (
  response: ImagePickerResponse,
  webViewRef: React.RefObject<any>,
) => {
  if (response.didCancel) {
    sendOcrCancel(webViewRef);
    return;
  }
  if (response.errorCode) {
    console.error('❌ ImagePicker 오류:', response.errorCode, response.errorMessage);
    sendOcrError(webViewRef, response.errorMessage || response.errorCode);
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

  const cb = (response: ImagePickerResponse) => {
    handlePickerResponse(response, webViewRef);
  };

  if (source === 'camera') {
    const options: CameraOptions = { ...PICKER_OPTIONS, cameraType: 'back' };
    launchCamera(options, cb);
  } else if (source === 'library') {
    const options: ImageLibraryOptions = { ...PICKER_OPTIONS, selectionLimit: 1 };
    launchImageLibrary(options, cb);
  } else {
    sendOcrError(webViewRef, '알 수 없는 이미지 소스입니다.');
  }
};
