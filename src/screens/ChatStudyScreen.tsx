import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconChevronLeft, IconClose, IconCheck, IconWrong } from '../assets/SvgIcon';
import {
  IconEggCrack,
  IconLeaf,
  IconPlant,
  IconCarrot,
  IconSpeakerHigh,
  IconSpeakerHighFill,
  IconArrowUp,
  IconArrowDown,
} from '../assets/PhosphorIcons';
import { useNavigation } from '../contexts/NavigationContext';
import {
  ChatQuestion,
  fetchChatSession,
  finishChatSession,
  postStudyHistory,
  postStudyLog,
} from '../services/chatStudyService';
import { playWordAudio, stopWordAudio, playCorrectSfx, playWrongSfx } from '../services/ttsService';
import {
  clearChatStudySnapshot,
  loadChatStudySnapshot,
  saveChatStudySnapshot,
  todayDateKey,
} from '../utils/chatStudyStorage';

import mascotImage from '../assets/images/HeyCharacter02.png';

// ── 메시지 타입 정의 ──────────────────────────────────────────────
type ChatButton = { label: string; onPress: () => void };

type ChatMessage =
  | { id: string; role: 'mascot'; kind: 'text'; text: string }
  | {
      id: string;
      role: 'mascot';
      kind: 'buttons';
      text: string;
      buttons: ChatButton[];
      resolved?: boolean;
      choiceLabel?: string;
    }
  | { id: string; role: 'mascot'; kind: 'question'; question: ChatQuestion; selectedIndex: number | null }
  | { id: string; role: 'user'; kind: 'text'; text: string }
  | { id: string; role: 'mascot'; kind: 'feedback'; correct: boolean; text: string }
  | { id: string; role: 'mascot'; kind: 'summary'; questionCount: number; correctCount: number }
  | { id: string; role: 'mascot'; kind: 'reward'; text: string }
  | { id: string; role: 'mascot'; kind: 'growth'; text: string }
  | {
      id: string;
      role: 'mascot';
      kind: 'grade';
      prevKey: string;
      newKey: string;
      changed: boolean;
      reviewDays: number | null;
    }
  | { id: string; role: 'mascot'; kind: 'typing' };

interface ChatStudyScreenProps {
  params?: any;
  onClose: () => void;
}

const ANSWER_DELAY_MS = 700;
const TYPING_ID = '__typing__';
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
// 글자 수에 비례해 "입력 중" 시간을 늘려 사람이 타이핑하는 듯한 리듬을 준다(상·하한 클램프).
const typingDuration = (text?: string) =>
  Math.max(500, Math.min(1500, 400 + (text ? text.length : 0) * 45));

// 암기 상태(FSRS stability 기반 성장단계) — 웹 AI 테스트의 getMemoryStateKeyByStability와 동일.
const growthKey = (stability?: number, state?: string): string => {
  if (!state || state === 'new') return 'unlearned';
  const s = stability ?? 0;
  if (s < 10) return 'leaf';
  if (s < 60) return 'plant';
  return 'carrot';
};
const GROWTH_LABEL: Record<string, string> = {
  unlearned: '미학습',
  leaf: '새싹',
  plant: '잎새',
  carrot: '당근',
};
const GROWTH_RANK: Record<string, number> = { unlearned: 0, leaf: 1, plant: 2, carrot: 3 };
// 웹 MEMORY_STATE_COLOR_MAP와 동일 색상.
const GROWTH_COLOR: Record<string, string> = {
  unlearned: '#9D835A',
  leaf: '#77CE4F',
  plant: '#38CE38',
  carrot: '#F68300',
};

// next_review(ISO) → "N일 후" 일수. 하루 미만이면 null(표시 안 함) — 웹과 동일.
const reviewDaysFromNow = (nextReviewIso?: string | null): number | null => {
  if (!nextReviewIso) return null;
  const target = new Date(nextReviewIso).getTime();
  if (Number.isNaN(target)) return null;
  const days = Math.round((target - Date.now()) / (1000 * 60 * 60 * 24));
  return days >= 1 ? days : null;
};

// "입력 중…" 점 3개 애니메이션 (친구가 타이핑하는 느낌).
const TypingDots: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const dots = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;
  useEffect(() => {
    const anims = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ]),
      ),
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [dots]);
  const dotColor = isDark ? '#8A8192' : '#999999';
  return (
    <View className="flex-row items-center" style={{ gap: 4 }}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor, opacity: v }}
        />
      ))}
    </View>
  );
};

// 암기 성장단계 아이콘 (웹 Phosphor Leaf/Plant/Carrot/EggCrack + 동일 색상).
const GrowthIcon: React.FC<{ growthKey: string; size?: number }> = ({ growthKey, size = 16 }) => {
  const color = GROWTH_COLOR[growthKey] || GROWTH_COLOR.unlearned;
  if (growthKey === 'leaf') return <IconLeaf size={size} color={color} />;
  if (growthKey === 'plant') return <IconPlant size={size} color={color} />;
  if (growthKey === 'carrot') return <IconCarrot size={size} color={color} />;
  return <IconEggCrack size={size} color={color} />;
};

// 재생 중 파동(웹 TtsRipple 대응) — 스피커 뒤에서 커지며 사라지는 원.
const TtsRipple: React.FC<{ size: number }> = ({ size }) => {
  const scale = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.35, duration: 150, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 750, useNativeDriver: true }),
          ]),
        ]),
        Animated.timing(scale, { toValue: 0.3, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FF70D4',
        transform: [{ scale }],
        opacity,
      }}
    />
  );
};

// 암기상태 변화 배지 — 웹 MemoryStateChangeBadge와 동일. 변경 시 화살표가 통통 튀며 등장(상승/강등).
const MemoryBadge: React.FC<{ growthKey: string; dir: 'up' | 'down'; changed: boolean; size?: number }> = ({
  growthKey,
  dir,
  changed,
  size = 16,
}) => {
  const arrowColor = dir === 'up' ? GROWTH_COLOR[growthKey] || GROWTH_COLOR.unlearned : '#9CA3AF';
  const y = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(changed ? 0 : 1)).current;
  useEffect(() => {
    if (!changed) return;
    const off = 6;
    const mid = 3;
    y.setValue(dir === 'up' ? off : -off);
    op.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(y, { toValue: dir === 'up' ? -mid : mid, duration: 180, useNativeDriver: true }),
        Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),
      Animated.timing(op, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(y, { toValue: dir === 'up' ? off : -off, duration: 0, useNativeDriver: true }),
        Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),
      Animated.timing(y, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [changed, dir, y, op]);
  const Arrow = dir === 'up' ? IconArrowUp : IconArrowDown;
  return (
    <View
      style={{ borderColor: arrowColor, borderWidth: 1 }}
      className="flex-row items-center rounded-full px-[8px] py-[3px]"
    >
      {changed && (
        <Animated.View style={{ transform: [{ translateY: y }], opacity: op, marginRight: 3 }}>
          <Arrow size={11} color={arrowColor} />
        </Animated.View>
      )}
      <GrowthIcon growthKey={growthKey} size={size} />
    </View>
  );
};

// 단어 발음 스피커 버튼 (단어상세 SpeakerButton과 동일: 배경 원 없이 idle=회색/regular, 재생중=핑크/fill+ripple).
const SpeakerButton: React.FC<{ playing: boolean; onPress: () => void; isDark: boolean; size?: number }> = ({
  playing,
  onPress,
  isDark,
  size = 20,
}) => (
  <Pressable onPress={onPress} hitSlop={10} className="relative w-8 h-8 items-center justify-center">
    {playing && <TtsRipple size={size * 2.0} />}
    {playing ? (
      <IconSpeakerHighFill size={size} color="#FF70D4" />
    ) : (
      <IconSpeakerHigh size={size} color={isDark ? '#8A8192' : '#999999'} />
    )}
  </Pressable>
);

const encouragementText = (correct: number, total: number): string => {
  if (total <= 0) return '오늘도 함께해줘서 고마워요!';
  const rate = correct / total;
  if (rate === 1) return '완벽해요! 오늘 단어를 전부 기억해냈어요.';
  if (rate >= 0.7) return '아주 잘했어요! 이 페이스면 금방 익숙해질 거예요.';
  return '오늘도 한 걸음 나아갔어요. 내일 또 만나요!';
};

const ChatStudyScreen: React.FC<ChatStudyScreenProps> = ({ onClose }) => {
  const { webViewRef } = useNavigation();
  // 웹이 setNativeTheme(Appearance.setColorScheme)으로 맞춘 앱 테마를 따른다.
  const isDark = useColorScheme() === 'dark';
  const iconColor = isDark ? '#F4EFF3' : '#111111';
  const subIconColor = isDark ? '#8A8192' : '#999999';
  // NativeWind의 dark:[arbitrary] 조합이 불안정해, 테마 색은 isDark로 명시 선택한다(결정론적).
  const T = isDark
    ? {
        screen: 'bg-[#17151C]', headerBorder: 'border-[#2A2731]',
        bubble: 'bg-[#26232E]', bubbleText: 'text-white',
        optBg: 'bg-[#201D28]', optBorder: 'border-[#332B3B]', optText: 'text-white', optDim: 'text-[#6B6675]',
        summaryBg: 'bg-[#2E1B2A]', summarySub: 'text-gray-300',
        rewardBg: 'bg-[#3A1F35]', rewardText: 'text-primary-500',
        pill: 'bg-[#26232E]', btnBg: 'bg-[#201D28]',
        correctBg: 'bg-[#173226]', correctText: 'text-success-500',
        wrongBg: 'bg-[#3A1E1C]', wrongText: 'text-error-500',
      }
    : {
        screen: 'bg-white', headerBorder: 'border-gray-50',
        bubble: 'bg-gray-50', bubbleText: 'text-black',
        optBg: 'bg-white', optBorder: 'border-gray-100', optText: 'text-black', optDim: 'text-gray-300',
        summaryBg: 'bg-primary-50', summarySub: 'text-gray-400',
        rewardBg: 'bg-primary-100', rewardText: 'text-primary-600',
        pill: 'bg-gray-50', btnBg: 'bg-white',
        correctBg: 'bg-success-100', correctText: 'text-success-600',
        wrongBg: 'bg-error-100', wrongText: 'text-error-600',
      };

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [initializing, setInitializing] = useState(true);
  const [comboCurrent, setComboCurrent] = useState(0); // 헤더 연속 표시용
  const [speakingId, setSpeakingId] = useState<string | null>(null); // 발음 재생 중인 질문 말풍선 id

  const scrollViewRef = useRef<ScrollView>(null);
  const isMountedRef = useRef(true);

  const sessionIdRef = useRef<string | null>(null);
  const totalCountRef = useRef(0);
  const queueRef = useRef<ChatQuestion[]>([]);
  const loggedVocaIdsRef = useRef<Set<number>>(new Set());
  const completedVocaIdsRef = useRef<Set<number>>(new Set());
  const comboBestRef = useRef(0);                        // 세션 최고 콤보(완료 요약용)
  const memKingGoalRef = useRef<{ level: number; goal: number; reward: number } | null>(null); // 세션 중 달성한 암기왕(완료 시 표시)
  const improvedVocaIdsRef = useRef<Set<number>>(new Set()); // 기억 단계가 오른 단어(완료 요약용)
  const newVocaIdsRef = useRef<Set<number>>(new Set());      // 오늘 새로 배운 단어(priority_bucket='new')
  const questionStartTimeRef = useRef<number>(0);
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 메시지 조작 헬퍼 ──────────────────────────────────────────
  const pushMessage = useCallback((msg: ChatMessage) => {
    if (!isMountedRef.current) return;
    setMessages(prev => [...prev, msg]);
  }, []);

  const removeMessage = useCallback((id: string) => {
    if (!isMountedRef.current) return;
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  const resolveButtonsMessage = useCallback((id: string, choiceLabel: string) => {
    if (!isMountedRef.current) return;
    setMessages(prev =>
      prev.map(m => (m.id === id && m.kind === 'buttons' ? { ...m, resolved: true, choiceLabel } : m)),
    );
  }, []);

  const setQuestionSelected = useCallback((id: string, index: number) => {
    if (!isMountedRef.current) return;
    setMessages(prev =>
      prev.map(m => (m.id === id && m.kind === 'question' ? { ...m, selectedIndex: index } : m)),
    );
  }, []);

  // 마스코트 메시지를 "입력 중…" 인디케이터 후 시차를 두고 등장시킨다(친구가 채팅하듯).
  const sendMascot = useCallback(
    async (msg: ChatMessage, opts?: { typingMs?: number }) => {
      if (!isMountedRef.current) return;
      pushMessage({ id: TYPING_ID, role: 'mascot', kind: 'typing' });
      const text = (msg as { text?: string }).text;
      await sleep(opts?.typingMs ?? typingDuration(text));
      if (!isMountedRef.current) return;
      removeMessage(TYPING_ID);
      pushMessage(msg);
    },
    [pushMessage, removeMessage],
  );

  // 단어 발음 재생 + 해당 스피커를 재생 상태(핑크/fill/ripple)로 표시.
  // WebView 재생은 완료 콜백이 없어, 단어 길이에 비례한 시간 후 idle로 되돌린다.
  const speakWord = useCallback(
    (msgId: string, word: string, language: 'en' | 'ja' = 'en') => {
      setSpeakingId(msgId);
      playWordAudio(webViewRef, word, language);
      if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
      const ms = Math.max(900, Math.min(2500, 600 + word.length * 90));
      speakingTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setSpeakingId(null);
      }, ms);
    },
    [webViewRef],
  );

  // ── 세션 스냅샷 저장 ──────────────────────────────────────────
  const persistSnapshot = useCallback(async () => {
    if (!sessionIdRef.current) return;
    await saveChatStudySnapshot({
      sessionId: sessionIdRef.current,
      totalCount: totalCountRef.current,
      queue: queueRef.current,
      loggedVocaIds: Array.from(loggedVocaIdsRef.current),
      completedVocaIds: Array.from(completedVocaIdsRef.current),
      dateKey: todayDateKey(),
      savedAt: new Date().toISOString(),
    });
  }, []);

  // ── 다음 문제 출제 ────────────────────────────────────────────
  const finishSession = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) {
      await clearChatStudySnapshot();
      pushMessage({
        id: `done-${Date.now()}`,
        role: 'mascot',
        kind: 'buttons',
        text: '학습을 종료할게요.',
        buttons: [{ label: '닫기', onPress: onClose }],
      });
      return;
    }
    try {
      const summary = await finishChatSession(webViewRef, sid);
      await sendMascot({
        id: `summary-${Date.now()}`,
        role: 'mascot',
        kind: 'summary',
        questionCount: summary.question_count,
        correctCount: summary.correct_count,
      }, { typingMs: 700 });
      await sendMascot({
        id: `summary-text-${Date.now()}`,
        role: 'mascot',
        kind: 'text',
        text: encouragementText(summary.correct_count, summary.question_count),
      });

      // ── 새 단어 학습 요약 ──
      const newCount = newVocaIdsRef.current.size;
      if (newCount > 0) {
        await sendMascot({
          id: `sum-new-${Date.now()}`,
          role: 'mascot',
          kind: 'growth',
          text: `오늘 새로운 단어 ${newCount}개를 배웠어요!`,
        });
      }
      // ── 암기 성장 요약: 기억 단계가 오른 단어 수 ──
      const improvedCount = improvedVocaIdsRef.current.size;
      if (improvedCount > 0) {
        await sendMascot({
          id: `sum-growth-${Date.now()}`,
          role: 'mascot',
          kind: 'growth',
          text: `${improvedCount}개 단어의 기억이 더 단단해졌어요!`,
        });
      }
      // ── 최고 콤보 요약 ──
      if (comboBestRef.current >= 2) {
        await sendMascot({
          id: `sum-combo-${Date.now()}`,
          role: 'mascot',
          kind: 'reward',
          text: `최고 ${comboBestRef.current}연속 정답을 이어갔어요!`,
        });
      }
      // ── 암기왕 업적 달성(세션 중 콤보로 달성분을 결과에서 표시) ──
      if (memKingGoalRef.current) {
        const mk = memKingGoalRef.current;
        await sendMascot({
          id: `sum-memking-${Date.now()}`,
          role: 'mascot',
          kind: 'reward',
          text: `암기왕 Lv.${mk.level} 달성! 보석 +${mk.reward}개`,
        });
      }

      // ── 리워드 집계(출석·보석·업적) — 웹 학습 결과와 동일 엔드포인트 ──
      // 실패해도 학습/요약에는 영향 없으므로 조용히 넘어간다.
      try {
        const rewards = await postStudyHistory(webViewRef, {
          correct_cnt: summary.correct_count,
          incorrect_cnt: Math.max(0, summary.question_count - summary.correct_count),
        });
        const gemDelta = (rewards.gem?.after ?? 0) - (rewards.gem?.before ?? 0);
        const now = Date.now();
        if (rewards.attend) {
          await sendMascot({ id: `rw-attend-${now}`, role: 'mascot', kind: 'reward', text: '오늘도 출석 완료! 꾸준함이 실력이 돼요.' });
        }
        if (gemDelta > 0) {
          await sendMascot({ id: `rw-gem-${now}`, role: 'mascot', kind: 'reward', text: `보석 ${gemDelta}개를 받았어요!` });
        }
        if (rewards.daily_mission_complete) {
          await sendMascot({ id: `rw-mission-${now}`, role: 'mascot', kind: 'reward', text: '오늘의 학습 미션까지 완료했어요!' });
        }
        const goals = rewards.goals || [];
        for (let idx = 0; idx < goals.length; idx++) {
          const goal = goals[idx];
          await sendMascot({ id: `rw-goal-${idx}-${now}`, role: 'mascot', kind: 'reward', text: `'${goal.name}' 업적 Lv.${goal.level} 달성!` });
        }
      } catch (rewardErr) {
        // 리워드 집계 실패는 비치명적 — 요약 말풍선만 유지한다.
      }
    } catch (e) {
      await sendMascot({
        id: `summary-error-${Date.now()}`,
        role: 'mascot',
        kind: 'text',
        text: '완료 처리 중 문제가 발생했어요. 그래도 학습 기록은 저장됐어요!',
      });
    } finally {
      await clearChatStudySnapshot();
      await sendMascot({
        id: `close-${Date.now()}`,
        role: 'mascot',
        kind: 'buttons',
        text: '',
        buttons: [{ label: '닫기', onPress: onClose }],
      }, { typingMs: 400 });
    }
  }, [onClose, sendMascot, webViewRef]);

  const askNext = useCallback(async () => {
    const queue = queueRef.current;
    if (queue.length === 0) {
      finishSession();
      return;
    }
    const q = queue[0];
    const qMsgId = `q-${q.user_voca_id}-${Date.now()}`;
    await sendMascot(
      { id: qMsgId, role: 'mascot', kind: 'question', question: q, selectedIndex: null },
      { typingMs: 650 },
    );
    // 질문이 실제로 등장한 시점부터 응답 시간 측정 + 발음 자동재생
    questionStartTimeRef.current = Date.now();
    speakWord(qMsgId, q.word, q.language ?? 'en');
  }, [finishSession, sendMascot, speakWord]);

  // ── 답변 선택 처리 ────────────────────────────────────────────
  const handleSelectOption = useCallback(
    async (qMsgId: string, question: ChatQuestion, selectedIndex: number) => {
      const timeTakenMs = Date.now() - questionStartTimeRef.current;
      setQuestionSelected(qMsgId, selectedIndex);

      const optionText = question.options[selectedIndex];
      pushMessage({ id: `${qMsgId}-a`, role: 'user', kind: 'text', text: optionText });

      const isCorrect = selectedIndex === question.answer_index;
      // 채점 효과음 (웹 학습과 동일). WebView를 통해 저지연 재생.
      if (isCorrect) {
        playCorrectSfx(webViewRef);
      } else {
        playWrongSfx(webViewRef);
      }
      if (isCorrect) {
        completedVocaIdsRef.current.add(question.user_voca_id);
        await sendMascot(
          { id: `${qMsgId}-f`, role: 'mascot', kind: 'feedback', correct: true, text: '정답이에요!' },
          { typingMs: 450 },
        );
      } else {
        const correctText = question.options[question.answer_index];
        await sendMascot({
          id: `${qMsgId}-f`,
          role: 'mascot',
          kind: 'feedback',
          correct: false,
          text: `아쉬워요! 정답은 "${correctText}" 예요. 조금 뒤 다시 물어볼게요.`,
        });
      }

      setProgress({ completed: completedVocaIdsRef.current.size, total: totalCountRef.current });

      // 첫 시도만 서버에 로그 전송 (재출제분은 스킵)
      const alreadyLogged = loggedVocaIdsRef.current.has(question.user_voca_id);
      if (!alreadyLogged && sessionIdRef.current) {
        loggedVocaIdsRef.current.add(question.user_voca_id);
        if (question.priority_bucket === 'new') {
          newVocaIdsRef.current.add(question.user_voca_id);
        }
        try {
          const logResult = await postStudyLog(webViewRef, {
            session_id: sessionIdRef.current,
            user_voca_id: question.user_voca_id,
            user_voca_book_id: question.user_voca_book_id || undefined,
            question_type: 'multipleChoice',
            was_correct: isCorrect,
            time_taken_ms: timeTakenMs,
            client_now: new Date().toISOString(),
          });
          // 채점 결과 — 암기상태(성장단계) 변화 + 복습 예정일 (웹 AI 테스트와 동일 표현).
          const beforeKey = growthKey(question.fsrs?.stability, question.fsrs?.state);
          const afterKey = growthKey(logResult?.fsrs?.stability, logResult?.fsrs?.state);
          const stateChanged = beforeKey !== afterKey;
          if ((GROWTH_RANK[afterKey] ?? 0) > (GROWTH_RANK[beforeKey] ?? 0)) {
            improvedVocaIdsRef.current.add(question.user_voca_id);
          }
          const reviewDays = reviewDaysFromNow(logResult?.fsrs?.next_review);
          if (stateChanged || reviewDays != null) {
            await sendMascot({
              id: `${qMsgId}-grade`,
              role: 'mascot',
              kind: 'grade',
              prevKey: beforeKey,
              newKey: afterKey,
              changed: stateChanged,
              reviewDays,
            });
          }
          // 콤보 — 현재/최고 갱신(헤더 표시), 암기왕 레벨업 시 축하 말풍선.
          const combo = logResult?.combo;
          if (combo) {
            setComboCurrent(isCorrect ? combo.current || 0 : 0);
            if ((combo.best || 0) > comboBestRef.current) {
              comboBestRef.current = combo.best || 0;
            }
            // 암기왕 레벨업은 세션 중 즉시 띄우지 않고, 완료 결과에서 보여준다(웹 결과 슬라이드처럼).
            const goalDone = combo.events?.goal_completed;
            if (goalDone) {
              memKingGoalRef.current = goalDone; // 세션 중 마지막(최고) 달성 레벨 보관
            }
          }
        } catch (e) {
          // 로그 실패는 학습 흐름을 막지 않음 (조용히 무시)
          console.warn('[ChatStudy] 학습 로그 전송 실패:', e);
        }
      }

      // 큐 갱신: 정답이면 제거, 오답이면 뒤로 재삽입
      const [, ...rest] = queueRef.current;
      const newQueue = isCorrect ? rest : [...rest, question];
      queueRef.current = newQueue;

      await persistSnapshot();

      setTimeout(() => {
        if (!isMountedRef.current) return;
        askNext();
      }, ANSWER_DELAY_MS);
    },
    [askNext, persistSnapshot, pushMessage, sendMascot, setQuestionSelected, webViewRef],
  );

  // ── 새 세션 시작 ──────────────────────────────────────────────
  const startNewSession = useCallback(async () => {
    pushMessage({ id: 'loading', role: 'mascot', kind: 'text', text: '오늘 학습할 단어를 준비하고 있어요...' });
    try {
      const data = await fetchChatSession(webViewRef, 50);
      removeMessage('loading');

      if (data.available === false) {
        await clearChatStudySnapshot();
        await sendMascot({
          id: 'lang-unsupported',
          role: 'mascot',
          kind: 'text',
          text: '이 언어는 앱 업데이트 후 지원돼요',
        });
        await sendMascot({
          id: 'lang-unsupported-btn',
          role: 'mascot',
          kind: 'buttons',
          text: '',
          buttons: [{ label: '닫기', onPress: onClose }],
        }, { typingMs: 400 });
        return;
      }

      if (!data.session_id || !data.questions || data.questions.length === 0) {
        await clearChatStudySnapshot();
        await sendMascot({
          id: 'empty',
          role: 'mascot',
          kind: 'text',
          text: '오늘 학습할 단어를 이미 모두 마쳤어요! 정말 대단해요.',
        });
        await sendMascot({
          id: 'empty-btn',
          role: 'mascot',
          kind: 'buttons',
          text: '',
          buttons: [{ label: '닫기', onPress: onClose }],
        }, { typingMs: 400 });
        return;
      }

      sessionIdRef.current = data.session_id;
      totalCountRef.current = data.questions.length;
      queueRef.current = [...data.questions];
      loggedVocaIdsRef.current = new Set();
      completedVocaIdsRef.current = new Set();
      setProgress({ completed: 0, total: data.questions.length });

      await sendMascot({
        id: 'start',
        role: 'mascot',
        kind: 'text',
        text: `오늘은 ${data.questions.length}개의 단어를 함께 익혀볼게요!`,
      });
      askNext();
    } catch (e) {
      removeMessage('loading');
      await sendMascot({
        id: 'error',
        role: 'mascot',
        kind: 'text',
        text: '학습 세션을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
      });
      await sendMascot({
        id: 'error-btn',
        role: 'mascot',
        kind: 'buttons',
        text: '',
        buttons: [{ label: '닫기', onPress: onClose }],
      }, { typingMs: 400 });
    }
  }, [askNext, onClose, pushMessage, removeMessage, sendMascot, webViewRef]);

  // ── 이어서 하기 / 새로 시작 ───────────────────────────────────
  const handleResume = useCallback(
    async (promptId: string) => {
      resolveButtonsMessage(promptId, '이어서 하기');
      const snapshot = await loadChatStudySnapshot();
      if (!snapshot || snapshot.queue.length === 0) {
        // 스냅샷이 그 사이 사라졌으면 새 세션으로 폴백
        await startNewSession();
        return;
      }
      sessionIdRef.current = snapshot.sessionId;
      totalCountRef.current = snapshot.totalCount;
      queueRef.current = snapshot.queue;
      loggedVocaIdsRef.current = new Set(snapshot.loggedVocaIds);
      completedVocaIdsRef.current = new Set(snapshot.completedVocaIds);
      setProgress({ completed: completedVocaIdsRef.current.size, total: totalCountRef.current });

      await sendMascot({ id: `resume-${Date.now()}`, role: 'mascot', kind: 'text', text: '좋아요! 이어서 시작할게요.' });
      askNext();
    },
    [askNext, resolveButtonsMessage, sendMascot, startNewSession],
  );

  const handleRestart = useCallback(
    async (promptId: string) => {
      resolveButtonsMessage(promptId, '새로 시작');
      await clearChatStudySnapshot();
      await startNewSession();
    },
    [resolveButtonsMessage, startNewSession],
  );

  // ── 초기화: 세션 복원 체크 ────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    (async () => {
      const snapshot = await loadChatStudySnapshot();
      if (!isMountedRef.current) return;

      if (snapshot && snapshot.dateKey === todayDateKey() && snapshot.queue.length > 0) {
        setInitializing(false);
        const promptId = `resume-prompt-${Date.now()}`;
        pushMessage({
          id: promptId,
          role: 'mascot',
          kind: 'buttons',
          text: '이어서 할까요? 지난번 학습이 남아있어요.',
          buttons: [
            { label: '이어서 하기', onPress: () => handleResume(promptId) },
            { label: '새로 시작', onPress: () => handleRestart(promptId) },
          ],
        });
      } else {
        if (snapshot) await clearChatStudySnapshot();
        setInitializing(false);
        await startNewSession();
      }
    })();

    return () => {
      isMountedRef.current = false;
      stopWordAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Android 하드웨어 백 → 오버레이 닫기 ───────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  // ── 자동 스크롤 ───────────────────────────────────────────────
  const handleContentSizeChange = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, []);

  // ── 렌더 ──────────────────────────────────────────────────────
  const renderMascotAvatar = () => (
    <View className="w-8 h-8 rounded-full overflow-hidden bg-primary-100 items-center justify-center mr-2">
      <Image source={mascotImage} className="w-9 h-11" resizeMode="cover" />
    </View>
  );

  const renderMessage = (msg: ChatMessage) => {
    switch (msg.kind) {
      case 'text':
        if (!msg.text) return null;
        return (
          <View key={msg.id} className="flex-row items-end mb-3 pr-12">
            {renderMascotAvatar()}
            <View className={`${T.bubble} rounded-2xl rounded-tl-sm px-4 py-3 flex-shrink`}>
              <Text className={`${T.bubbleText} text-[15px] leading-5`}>{msg.text}</Text>
            </View>
          </View>
        );

      case 'buttons':
        return (
          <View key={msg.id} className="mb-3">
            {!!msg.text && (
              <View className="flex-row items-end mb-2 pr-12">
                {renderMascotAvatar()}
                <View className={`${T.bubble} rounded-2xl rounded-tl-sm px-4 py-3 flex-shrink`}>
                  <Text className={`${T.bubbleText} text-[15px] leading-5`}>{msg.text}</Text>
                </View>
              </View>
            )}
            <View className="flex-row flex-wrap ml-10" style={{ gap: 8 }}>
              {msg.resolved ? (
                <View className="bg-primary-500 rounded-full px-4 py-2">
                  <Text className="text-white text-[14px] font-semibold">{msg.choiceLabel}</Text>
                </View>
              ) : (
                msg.buttons.map(btn => (
                  <Pressable
                    key={btn.label}
                    onPress={btn.onPress}
                    className={`${T.btnBg} border border-primary-300 rounded-full px-4 py-2 active:bg-primary-50`}
                  >
                    <Text className="text-primary-600 text-[14px] font-semibold">{btn.label}</Text>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        );

      case 'question': {
        const { question, selectedIndex } = msg;
        const answered = selectedIndex !== null;
        return (
          <View key={msg.id} className="mb-3">
            <View className="flex-row items-end mb-2 pr-8">
              {renderMascotAvatar()}
              <View className={`${T.bubble} rounded-2xl rounded-tl-sm px-4 py-3 flex-row items-center flex-shrink`}>
                <Text className={`${T.bubbleText} text-[22px] font-bold mr-2`}>{question.word}</Text>
                <SpeakerButton
                  playing={speakingId === msg.id}
                  onPress={() => speakWord(msg.id, question.word, question.language ?? 'en')}
                  isDark={isDark}
                />
              </View>
            </View>
            <View className="ml-10" style={{ gap: 8 }}>
              {question.options.map((opt, idx) => {
                const isCorrectOpt = idx === question.answer_index;
                const isPicked = idx === selectedIndex;
                let bg = T.optBg;
                let border = T.optBorder;
                let textColor = T.optText;
                if (answered) {
                  if (isCorrectOpt) {
                    bg = T.correctBg;
                    border = 'border-success-500';
                    textColor = T.correctText;
                  } else if (isPicked) {
                    bg = T.wrongBg;
                    border = 'border-error-500';
                    textColor = T.wrongText;
                  } else {
                    bg = T.optBg;
                    border = T.optBorder;
                    textColor = T.optDim;
                  }
                }
                return (
                  <Pressable
                    key={idx}
                    disabled={answered}
                    onPress={() => handleSelectOption(msg.id, question, idx)}
                    className={`flex-row items-center justify-between border rounded-2xl px-4 py-3 ${bg} ${border}`}
                  >
                    <Text className={`text-[15px] flex-shrink ${textColor}`}>{opt}</Text>
                    {answered && isCorrectOpt && (
                      <View className="w-5 h-5 rounded-full bg-success-500 items-center justify-center ml-2">
                        <IconCheck width={12} height={12} color="#ffffff" />
                      </View>
                    )}
                    {answered && isPicked && !isCorrectOpt && (
                      <View className="w-5 h-5 rounded-full bg-error-500 items-center justify-center ml-2">
                        <IconWrong width={12} height={12} color="#ffffff" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      }

      case 'feedback':
        return (
          <View key={msg.id} className="flex-row items-end mb-3 pr-12">
            {renderMascotAvatar()}
            <View
              className={`rounded-2xl rounded-tl-sm px-4 py-3 flex-shrink ${
                msg.correct ? T.correctBg : T.wrongBg
              }`}
            >
              <Text className={`text-[15px] leading-5 ${msg.correct ? T.correctText : T.wrongText}`}>
                {msg.text}
              </Text>
            </View>
          </View>
        );

      case 'summary':
        return (
          <View key={msg.id} className="flex-row items-end mb-3 pr-8">
            {renderMascotAvatar()}
            <View className={`${T.summaryBg} rounded-2xl rounded-tl-sm px-4 py-4 flex-shrink`}>
              <Text className={`${T.bubbleText} text-[16px] font-bold mb-1`}>오늘의 학습을 마쳤어요!</Text>
              <Text className={`${T.summarySub} text-[14px]`}>
                {msg.questionCount}개 완료 · 정답 {msg.correctCount}개
              </Text>
            </View>
          </View>
        );

      case 'reward':
        return (
          <View key={msg.id} className="flex-row items-end mb-3 pr-10">
            {renderMascotAvatar()}
            <View className={`${T.rewardBg} rounded-2xl rounded-tl-sm px-4 py-3 flex-shrink`}>
              <Text className={`${T.rewardText} text-[15px] font-bold leading-5`}>{msg.text}</Text>
            </View>
          </View>
        );

      case 'growth':
        return (
          <View key={msg.id} className="flex-row items-end mb-3 pr-10">
            {renderMascotAvatar()}
            <View className={`${T.correctBg} rounded-2xl rounded-tl-sm px-4 py-3 flex-shrink`}>
              <Text className={`${T.correctText} text-[14px] font-bold leading-5`}>{msg.text}</Text>
            </View>
          </View>
        );

      case 'grade': {
        const reviewText =
          msg.reviewDays != null ? `${msg.reviewDays}일 후 복습 예정` : '곧 다시 복습해요';
        const dir: 'up' | 'down' =
          (GROWTH_RANK[msg.newKey] ?? 0) >= (GROWTH_RANK[msg.prevKey] ?? 0) ? 'up' : 'down';
        return (
          <View key={msg.id} className="flex-row items-end mb-3 pr-8">
            {renderMascotAvatar()}
            <View className={`${T.bubble} rounded-2xl rounded-tl-sm px-4 py-3 flex-row items-center flex-shrink`}>
              <View className="mr-[8px]">
                <MemoryBadge growthKey={msg.newKey} dir={dir} changed={msg.changed} size={16} />
              </View>
              <Text className={`${T.bubbleText} text-[14px] font-semibold`}>{reviewText}</Text>
            </View>
          </View>
        );
      }

      case 'typing':
        return (
          <View key={msg.id} className="flex-row items-end mb-3 pr-12">
            {renderMascotAvatar()}
            <View className={`${T.bubble} rounded-2xl rounded-tl-sm px-4 py-3`}>
              <TypingDots isDark={isDark} />
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  const renderRow = (msg: ChatMessage) => {
    if (msg.role === 'user') {
      return (
        <View key={msg.id} className="flex-row justify-end mb-3 pl-12">
          <View className="bg-primary-500 rounded-2xl rounded-tr-sm px-4 py-3">
            <Text className="text-white text-[15px] leading-5">{msg.text}</Text>
          </View>
        </View>
      );
    }
    return renderMessage(msg);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className={`flex-1 ${T.screen}`}>
      {/* 헤더 */}
      <View className={`flex-row items-center px-4 py-3 border-b ${T.headerBorder}`}>
        <Pressable onPress={onClose} hitSlop={10} className="w-9 h-9 items-center justify-center -ml-2">
          <IconChevronLeft width={22} height={22} color={iconColor} />
        </Pressable>
        <View className="w-9 h-9 rounded-full overflow-hidden bg-primary-100 items-center justify-center mx-2">
          <Image source={mascotImage} className="w-10 h-12" resizeMode="cover" />
        </View>
        <View className="flex-1">
          <Text className={`${T.bubbleText} text-[16px] font-bold`}>헤이보카</Text>
          <Text className="text-gray-300 text-[12px]">학습 도우미</Text>
        </View>
        {comboCurrent >= 2 && (
          <View className={`${T.rewardBg} rounded-full px-3 py-1 mr-1`}>
            <Text className={`${T.rewardText} text-[13px] font-bold`}>{comboCurrent} 연속</Text>
          </View>
        )}
        {progress.total > 0 && (
          <View className={`${T.pill} rounded-full px-3 py-1 mr-1`}>
            <Text className="text-gray-400 text-[13px] font-semibold">
              {progress.completed}/{progress.total}
            </Text>
          </View>
        )}
        <Pressable onPress={onClose} hitSlop={10} className="w-9 h-9 items-center justify-center">
          <IconClose width={18} height={18} color={subIconColor} />
        </Pressable>
      </View>

      {/* 메시지 영역 */}
      {initializing ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color="#FF70D4" />
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-4 pt-4"
          onContentSizeChange={handleContentSizeChange}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map(renderRow)}
          <View className="h-6" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default ChatStudyScreen;
