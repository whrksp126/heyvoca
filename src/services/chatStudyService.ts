import type { RefObject } from 'react';
import { authorizedFetch } from './apiClient';

export interface ChatFsrsState {
  state?: string;
  stability?: number;
  difficulty?: number;
  retrievability?: number;
  next_review?: string | null;
}

export interface ChatQuestion {
  user_voca_id: number;
  user_voca_book_id: string | null;
  word: string;
  meanings: string[];
  examples: any[];
  options: string[];
  answer_index: number;
  fsrs?: ChatFsrsState;
  priority_bucket?: string;
  suggested_question_type?: string;
}

export interface ChatSessionResponse {
  session_id: string | null;
  composition: Record<string, number>;
  questions: ChatQuestion[];
}

export interface ComboPayload {
  current: number;
  best: number;
  status?: string;
  at_risk_combo?: number | null;
  events?: {
    best_updated?: boolean;
    goal_completed?: { level: number; goal: number; reward: number } | null;
  };
}

export interface StudyLogResponse {
  rating: number;
  fsrs: ChatFsrsState;
  memory_state_change: { from: string; to: string };
  combo?: ComboPayload | null;
  farm?: any;
}

export interface FinishSessionResponse {
  session_id: string;
  question_count: number;
  correct_count: number;
  duration_sec: number;
}

// GET /study/chat-session — 채팅 학습용 완성형 사지선다 세션
export const fetchChatSession = async (
  webViewRef: RefObject<any> | null,
  count: number = 50,
): Promise<ChatSessionResponse> => {
  const res = await authorizedFetch(`/study/chat-session?count=${count}`, { webViewRef });
  return res.data as ChatSessionResponse;
};

// POST /study/log — 단어 1회 학습 결과 기록 (재출제분은 호출하지 않음)
export const postStudyLog = async (
  webViewRef: RefObject<any> | null,
  params: {
    session_id: string;
    user_voca_id: number;
    user_voca_book_id?: string | null;
    question_type: string;
    was_correct: boolean;
    time_taken_ms: number;
    client_now?: string;
  },
): Promise<StudyLogResponse> => {
  const res = await authorizedFetch('/study/log', {
    method: 'POST',
    body: params,
    webViewRef,
  });
  return res.data as StudyLogResponse;
};

// POST /study/sessions/{session_id}/finish — 세션 종료 + 요약
export const finishChatSession = async (
  webViewRef: RefObject<any> | null,
  sessionId: string,
): Promise<FinishSessionResponse> => {
  const res = await authorizedFetch(`/study/sessions/${sessionId}/finish`, {
    method: 'POST',
    webViewRef,
  });
  return res.data as FinishSessionResponse;
};

export interface StudyRewardGoal {
  name: string;
  type: string;
  level: number;
  badge_img?: string;
  completed_at?: string;
}

export interface StudyHistoryResponse {
  exp: { before: number; after: number };
  gem: { before: number; after: number };
  attend: boolean;
  today_study_complete: boolean;
  daily_mission_complete: boolean;
  daily_progress: {
    new_done: number;
    new_target: number;
    review_done: number;
    review_due: number;
  };
  goals: StudyRewardGoal[];
}

// POST /mainpage/user_study_history — 세션 집계(출석·보석·업적)를 처리하고 리워드를 반환.
// 웹 학습 결과와 동일한 엔드포인트 → 출석/보석 중복 지급은 서버가 하루 1회로 방어한다.
export const postStudyHistory = async (
  webViewRef: RefObject<any> | null,
  params: { correct_cnt: number; incorrect_cnt: number },
): Promise<StudyHistoryResponse> => {
  const res = await authorizedFetch('/mainpage/user_study_history', {
    method: 'POST',
    body: params,
    webViewRef,
  });
  return res.data as StudyHistoryResponse;
};
