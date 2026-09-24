// ocrHelper.ts
// ocr 분석 로직
import TextRecognition, { TextLine, TextRecognitionScript } from '@react-native-ml-kit/text-recognition';

export type OcrLang = 'en' | 'ja';

// 일본어 문자(히라가나/가타카나/한자) + 장음 기호(ー) 포함 여부 검사.
// 형태소 분리는 서버 몫이므로 여기선 줄 단위 텍스트를 그대로 넘긴다.
const JA_CHAR_RE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]/u;

/**
 * VisionCamera로 촬영한 이미지 경로를 MLKit OCR로 분석
 * lang='ja' 면 일본어 스크립트로 인식하고 줄 단위 텍스트를 그대로 반환한다(en은 기존 단어 단위 동작 유지).
 */
export const recognizeTextFromImage = async (imagePath: string, lang: OcrLang = 'en') => {
  try {
    // ✅ 경로 수정: file:// 접두사 추가 (없을 경우만)
    const validPath = imagePath.startsWith('file://')
      ? imagePath
      : `file://${imagePath}`;

    const script = lang === 'ja' ? TextRecognitionScript.JAPANESE : TextRecognitionScript.LATIN;
    const result = await TextRecognition.recognize(validPath, script);

    const words: {
      text: string;
      boundingBox: { left: number; top: number; width: number; height: number };
    }[] = [];

    if (lang === 'ja') {
      // 가나/한자가 포함된 줄만 그대로 넘긴다(형태소 분리는 서버 몫).
      result.blocks.forEach((block) => {
        block.lines.forEach((line: TextLine) => {
          const t = line.text;
          if (t && JA_CHAR_RE.test(t)) {
            words.push({
              text: t,
              boundingBox: line.frame ? {
                left: line.frame.left,
                top: line.frame.top,
                width: line.frame.width,
                height: line.frame.height,
              } : { left: 0, top: 0, width: 0, height: 0 },
            });
          }
        });
      });

      console.log('✅ 인식된 줄 개수(ja):', words.length);
      return words;
    }

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
