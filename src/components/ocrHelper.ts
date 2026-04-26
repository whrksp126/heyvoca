// ocrHelper.ts
// ocr 분석 로직
import TextRecognition, { TextLine } from '@react-native-ml-kit/text-recognition';

/**
 * VisionCamera로 촬영한 이미지 경로를 MLKit OCR로 분석
 */
export const recognizeTextFromImage = async (imagePath: string) => {
  try {
    // ✅ 경로 수정: file:// 접두사 추가 (없을 경우만)
    const validPath = imagePath.startsWith('file://')
      ? imagePath
      : `file://${imagePath}`;

    const result = await TextRecognition.recognize(validPath);

    const words: {
      text: string;
      boundingBox: { left: number; top: number; width: number; height: number };
    }[] = [];

    // 영단어 필터: 2자 이상의 알파벳 (단, 한 글자 허용 단어는 별도 화이트리스트)
    const SINGLE_LETTER_WHITELIST = new Set(['a', 'i', 'A', 'I']);
    const WORD_RE = /^[A-Za-z]{2,}$/;

    result.blocks.forEach((block) => {
      block.lines.forEach((line: TextLine) => {
        line.elements.forEach((element) => {
          const t = element.text;
          const isLongWord = WORD_RE.test(t);
          const isWhitelistedSingle = t.length === 1 && SINGLE_LETTER_WHITELIST.has(t);
          if (isLongWord || isWhitelistedSingle) {
            words.push({
              text: t,
              boundingBox: element.frame ? {
                left: element.frame.left,
                top: element.frame.top,
                width: element.frame.width,
                height: element.frame.height,
              } : { left: 0, top: 0, width: 0, height: 0 },
            });
          }
        });
      });
    });

    console.log('✅ 인식된 단어 개수:', words.length);
    return words;
  } catch (error) {
    console.error('❌ OCR 인식 실패:', error);
    return [];
  }
};
