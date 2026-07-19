import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatQuestion } from '../services/chatStudyService';

const STORAGE_KEY = 'chat_study_session';

export interface ChatStudySnapshot {
  sessionId: string;
  totalCount: number;
  queue: ChatQuestion[];          // 남은 문제 큐 (재출제분 포함, [0]이 현재 진행중)
  loggedVocaIds: number[];        // 이미 /study/log를 호출한 user_voca_id (재출제 시 중복 로그 방지)
  completedVocaIds: number[];     // 정답으로 완료 처리된 user_voca_id (진행률 표시용)
  dateKey: string;                // 세션이 저장된 논리 날짜(YYYY-MM-DD, 기기 로컬 기준 근사치)
  savedAt: string;
}

/** 기기 로컬 날짜 기준 YYYY-MM-DD. 서버의 APP_TZ+새벽컷오프 로직과 완전히 동일하진 않은 근사치. */
export const todayDateKey = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const saveChatStudySnapshot = async (snapshot: ChatStudySnapshot): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.warn('[ChatStudy] 세션 스냅샷 저장 실패:', e);
  }
};

export const loadChatStudySnapshot = async (): Promise<ChatStudySnapshot | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ChatStudySnapshot;
  } catch (e) {
    console.warn('[ChatStudy] 세션 스냅샷 로드 실패:', e);
    return null;
  }
};

export const clearChatStudySnapshot = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[ChatStudy] 세션 스냅샷 삭제 실패:', e);
  }
};
