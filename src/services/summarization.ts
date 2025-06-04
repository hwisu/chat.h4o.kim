import { ChatMessage, OpenRouterModel, OpenRouterModelsResponse } from '../types';

// 요약 설정
export interface SummarizationConfig {
  maxTokensBeforeSummary: number;  // 24000토큰 (128k 컨텍스트의 약 20%)
  summaryTargetTokens: number;     // 800토큰 (짧게)
  targetRetainTokens: number;      // 10000토큰 (최근 대화 유지 목표)
  minRetainTokens: number;         // 6000토큰 (최소 유지)
  maxRetainTokens: number;         // 15000토큰 (최대 유지)
}

export const DEFAULT_SUMMARY_CONFIG: SummarizationConfig = {
  maxTokensBeforeSummary: 24000,
  summaryTargetTokens: 800,
  targetRetainTokens: 10000,
  minRetainTokens: 6000,
  maxRetainTokens: 15000
};

// Summary prompt
const SUMMARY_PROMPT = `Please provide a concise summary of the following conversation, focusing only on the key points. Make sure to include all important information:

Conversation:
{conversation}

Summary (key points only):`;

// 요약용 모델 캐시 (5분)
let summaryModelsCache: { models: OpenRouterModel[], timestamp: number } | null = null;
const SUMMARY_CACHE_DURATION = 5 * 60 * 1000; // 5분

// 요약용 모델 우선순위 계산
function getSummaryModelPriority(modelId: string): number {
  const id = modelId.toLowerCase();

  // 1순위: google, flash, free가 모두 들어간 모델
  if (id.includes('google') && id.includes('flash') && id.includes('free')) {
    return 1;
  }

  // 2순위: gemma 3 free가 들어간 모델
  if (id.includes('gemma') && id.includes('3') && id.includes('free')) {
    return 2;
  }

  // 3순위: 기타 google free 모델
  if (id.includes('google') && id.includes('free')) {
    return 3;
  }

  // 4순위: 기타 free 모델
  if (id.includes('free')) {
    return 4;
  }

  return 5; // 낮은 우선순위
}

// 요약용 모델 필터링 및 정렬
function filterSummaryModels(models: OpenRouterModel[]): OpenRouterModel[] {
  // free 모델만 필터링
  let summaryModels = models.filter(m => m.id.endsWith(':free'));

  // 우선순위에 따라 정렬
  summaryModels = summaryModels.sort((a, b) => {
    const aPriority = getSummaryModelPriority(a.id);
    const bPriority = getSummaryModelPriority(b.id);

    // 우선순위가 다르면 우선순위로 정렬
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // 우선순위가 같으면 컨텍스트 크기로 정렬 (큰 것부터)
    const aContext = a.context_length || 4000;
    const bContext = b.context_length || 4000;
    if (aContext !== bContext) {
      return bContext - aContext;
    }

    // 마지막으로 알파벳 순
    return a.id.localeCompare(b.id);
  });

  return summaryModels;
}

// 요약용 모델 목록 가져오기
async function getSummaryModels(apiKey: string): Promise<OpenRouterModel[]> {
  // 캐시 확인
  if (summaryModelsCache && Date.now() - summaryModelsCache.timestamp < SUMMARY_CACHE_DURATION) {
    // console.log('📋 Using cached summary models');
    return summaryModelsCache.models;
  }

  try {
    // console.log('🔄 Fetching models for summary...');
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Models API failed: ${response.status}`);
    }

    const data: OpenRouterModelsResponse = await response.json();
    const summaryModels = filterSummaryModels(data.data);

    // 캐시 업데이트
    summaryModelsCache = {
      models: summaryModels,
      timestamp: Date.now()
    };

    // console.log(`✅ Loaded ${summaryModels.length} summary models`);
    return summaryModels;

  } catch (error) {
    console.error('❌ Failed to fetch summary models:', error);

    // 폴백: 하드코딩된 기본 모델들
    const fallbackModels = [
      { id: 'google/gemini-flash-1.5-8b:free', context_length: 8000 },
      { id: 'google/gemma-2-9b-it:free', context_length: 8000 }
    ] as OpenRouterModel[];

    console.log('⚠️ Using fallback summary models');
    return fallbackModels;
  }
}

// 토큰 캐싱을 위한 Map
const tokenCache = new Map<string, number>();

// 토큰 수 추정 (대략적)
export function estimateTokenCount(messages: ChatMessage[]): number {
  // 빈 메시지 처리
  if (!messages || messages.length === 0) return 0;

  // 캐시 키 생성 (메시지 ID들 해시)
  const cacheKey = messages.map(m =>
    `${m.role}-${m.content.length}-${m.timestamp || 0}`
  ).join('|');

  // 캐시에서 결과 찾기
  if (tokenCache.has(cacheKey)) {
    return tokenCache.get(cacheKey)!;
  }

  // 캐시 크기 제한 (메모리 누수 방지)
  if (tokenCache.size > 1000) {
    // 가장 오래된 항목 50개 제거
    const keys = Array.from(tokenCache.keys()).slice(0, 50);
    keys.forEach(key => tokenCache.delete(key));
  }

  // 메시지 텍스트 합치기
  const totalText = messages.map(m => m.content).join(' ');

  // 간단한 토큰 추정 (한국어/영어 혼합: 1토큰 ≈ 0.75단어)
  const wordCount = totalText.split(/\s+/).length;
  const estimatedTokens = Math.ceil(wordCount / 0.75);

  // 캐시에 결과 저장
  tokenCache.set(cacheKey, estimatedTokens);

  return estimatedTokens;
}

// 요약이 필요한지 확인 (토큰 기준)
export function shouldTriggerSummary(
  messages: ChatMessage[],
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): boolean {
  const totalTokens = estimateTokenCount(messages);
  // console.log(`📊 Current conversation tokens: ${totalTokens}, threshold: ${config.maxTokensBeforeSummary}`);
  return totalTokens > config.maxTokensBeforeSummary;
}

// 자연스러운 대화 단위를 유지하면서 유지할 메시지들 찾기
function findOptimalRetainMessages(
  messages: ChatMessage[],
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): { messagesToSummarize: ChatMessage[], messagesToRetain: ChatMessage[] } {

  if (messages.length === 0) {
    return { messagesToSummarize: [], messagesToRetain: [] };
  }

  let retainTokens = 0;
  let retainIndex = messages.length;

  // console.log(`🔍 Finding optimal split for ${messages.length} messages (target: ${config.targetRetainTokens}, max: ${config.maxRetainTokens} tokens)`);

  // 뒤에서부터 토큰을 세면서 적절한 지점 찾기
  for (let i = messages.length - 1; i >= 0; i--) {
    const messageTokens = estimateTokenCount([messages[i]]);

    // 목표 토큰을 넘지 않는 선에서 최대한 유지
    if (retainTokens + messageTokens <= config.maxRetainTokens) {
      retainTokens += messageTokens;
      retainIndex = i;
      // console.log(`📌 Including message ${i} (${messages[i].role}): +${messageTokens} tokens (total: ${retainTokens})`);
    } else {
      // console.log(`🚫 Skipping message ${i} (${messages[i].role}): would exceed max tokens (${retainTokens + messageTokens} > ${config.maxRetainTokens})`);
      break;
    }
  }

  // 최소 토큰 보장 및 대화 완전성 확보
  if (retainTokens < config.minRetainTokens && retainIndex > 0) {
    // console.log(`⬆️ Expanding retention: ${retainTokens} < ${config.minRetainTokens} (min required)`);
    // 최소 토큰에 도달할 때까지 더 포함
    for (let i = retainIndex - 1; i >= 0; i--) {
      const messageTokens = estimateTokenCount([messages[i]]);
      retainTokens += messageTokens;
      retainIndex = i;
      // console.log(`📌 Adding message ${i} (${messages[i].role}) for min tokens: +${messageTokens} tokens (total: ${retainTokens})`);

      if (retainTokens >= config.minRetainTokens) {
        break;
      }
    }
  }

  // console.log(`📊 Initial split at index ${retainIndex}: ${messages.length - retainIndex} messages to retain (~${retainTokens} tokens)`);

  // 대화 완전성 확보: user-assistant 페어가 완전히 유지되도록 조정
  const originalIndex = retainIndex;
  retainIndex = ensureConversationCompleteness(messages, retainIndex);

  if (retainIndex !== originalIndex) {
    const newRetainCount = messages.length - retainIndex;
    const newRetainTokens = estimateTokenCount(messages.slice(retainIndex));
    // console.log(`🔄 Split adjusted for message pairs: ${messages.length - originalIndex} -> ${newRetainCount} messages (~${newRetainTokens} tokens)`);
    retainTokens = newRetainTokens;
  }

  const messagesToSummarize = messages.slice(0, retainIndex);
  const messagesToRetain = messages.slice(retainIndex);

  // console.log(`💭 Final split: summarize ${messagesToSummarize.length} messages, retain ${messagesToRetain.length} messages`);
  // console.log(`🔢 Token distribution: ~${estimateTokenCount(messagesToSummarize)} to summarize, ~${estimateTokenCount(messagesToRetain)} to retain`);

  // 대화 쌍 무결성 검증
  if (messagesToSummarize.length > 0 && messagesToRetain.length > 0) {
    const lastSummary = messagesToSummarize[messagesToSummarize.length - 1];
    const firstRetain = messagesToRetain[0];
    // console.log(`🔍 Split boundary: ${lastSummary.role} (summary) | ${firstRetain.role} (retain)`);

    if (lastSummary.role === 'user' && firstRetain.role === 'assistant') {
      console.warn(`⚠️ WARNING: User question separated from assistant answer! This should not happen.`);
    }
  }

  return { messagesToSummarize, messagesToRetain };
}

// 대화 완전성 확보 (user-assistant 페어 유지)
function ensureConversationCompleteness(messages: ChatMessage[], splitIndex: number): number {
  if (splitIndex <= 0 || splitIndex >= messages.length) {
    return splitIndex;
  }

  // user-assistant 쌍이 분리되지 않도록 조정
  // 원칙: user 메시지는 반드시 그에 대응하는 assistant 응답과 함께 같은 그룹에 있어야 함

  let adjustedIndex = splitIndex;

  // 분할점에서 대화 쌍 확인
  for (let i = 0; i < messages.length - 1; i++) {
    const currentMsg = messages[i];
    const nextMsg = messages[i + 1];

    // user -> assistant 쌍을 찾음
    if (currentMsg.role === 'user' && nextMsg.role === 'assistant') {
      // user가 요약 부분에, assistant가 유지 부분에 있는 경우
      if (i < adjustedIndex && i + 1 >= adjustedIndex) {
        // assistant를 요약 부분으로 이동 (쌍을 유지)
        adjustedIndex = i + 2;
        // console.log(`🔄 Adjusting split: moved assistant response (${i + 1}) to summary to keep user-assistant pair together`);
      }
      // assistant가 요약 부분에, 다음 user가 유지 부분에 있는 경우
      else if (i + 1 < adjustedIndex && i + 2 < messages.length && i + 2 >= adjustedIndex) {
        // 다음 메시지가 user이면 그 쌍도 확인해야 함
        continue;
      }
    }
  }

  // 조정된 인덱스가 메시지 경계를 벗어나지 않도록 확인
  if (adjustedIndex > messages.length) {
    adjustedIndex = messages.length;
  }

  // 조정된 지점에서 대화가 자연스럽게 끊어지는지 최종 확인
  if (adjustedIndex > 0 && adjustedIndex < messages.length) {
    const lastSummaryMsg = messages[adjustedIndex - 1];
    const firstRetainMsg = messages[adjustedIndex];

    // assistant -> user로 자연스럽게 전환되는 것이 이상적
    if (lastSummaryMsg.role === 'assistant' && firstRetainMsg.role === 'user') {
      // console.log(`✅ Clean split: assistant (summary) -> user (retain) at index ${adjustedIndex}`);
    } else if (lastSummaryMsg.role === 'user' && firstRetainMsg.role === 'assistant') {
      // user -> assistant 쌍이 분리된 경우, assistant를 요약으로 이동
      adjustedIndex = adjustedIndex + 1;
      // console.log(`🔄 Final adjustment: moved assistant to summary to complete user-assistant pair`);
    }
  }

  if (adjustedIndex !== splitIndex) {
    // console.log(`📍 Split index adjusted: ${splitIndex} -> ${adjustedIndex} to preserve message pairs`);
  }

  return adjustedIndex;
}

// 유지할 최근 메시지 개수 결정 (동적) - 이제 사용하지 않음
function getRetainMessageCount(
  totalMessages: number,
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): number {
  // 토큰 기반으로 변경되어 이 함수는 더 이상 사용하지 않음
  // 하위 호환성을 위해 유지
  return Math.min(totalMessages, 10);
}

// 대화 요약 생성
export async function summarizeConversation(
  messages: ChatMessage[],
  apiKey: string,
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): Promise<string> {

  // 최적의 분할점 찾기
  const { messagesToSummarize, messagesToRetain } = findOptimalRetainMessages(messages, config);

  if (messagesToSummarize.length === 0) {
    return '';
  }

  const conversationText = messagesToSummarize
    .map(m => `${m.role === 'user' ? '사용자' : '어시스턴트'}: ${m.content}`)
    .join('\n\n');

  const availableModels = await getSummaryModels(apiKey);

  if (availableModels.length === 0) {
    throw new Error('No summary models available');
  }

  // 우선순위대로 모델 시도 (상위 2개만 시도하도록 제한)
  for (const model of availableModels.slice(0, 2)) {
    try {
      // 타임아웃 설정
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://chat.h4o.kim',
            'X-Title': 'Chatty-Summary'
          },
          body: JSON.stringify({
            model: model.id,
            messages: [{
              role: 'user',
              content: SUMMARY_PROMPT.replace('{conversation}', conversationText)
            }],
            max_tokens: config.summaryTargetTokens,
            temperature: 0.3,  // 일관성을 위해 낮게
            top_p: 0.9
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`⚠️ Summary model ${model.id} failed: ${response.status} - ${errorText}`);
          continue; // 다음 모델 시도
        }

        const data = await response.json() as any;
        const summary = data.choices?.[0]?.message?.content;

        if (summary) {
          return summary.trim();
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.warn(`⚠️ Summary model ${model.id} error:`, error);
      continue; // 다음 모델 시도
    }
  }

  throw new Error('All summary models failed');
}

// 요약과 함께 메시지 구성
export function buildMessagesWithSummary(
  messages: ChatMessage[],
  existingSummary: string | null,
  newMessage: string,
  systemPrompt: string,
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): any[] {

  const result = [];

  // 시스템 프롬프트
  result.push({ role: 'system', content: systemPrompt });

  // 기존 요약이 있으면 추가
  if (existingSummary) {
    result.push({
      role: 'system',
      content: `[이전 대화 요약]\n${existingSummary}\n\n[현재 대화]`
    });
  }

  // 전체 대화 + 새 메시지의 토큰 수 확인
  const tempMessages = [...messages, { role: 'user' as const, content: newMessage, timestamp: Date.now() }];
  const totalTokens = estimateTokenCount(tempMessages);

  // 토큰 수가 임계값 이하면 전체 대화 히스토리 보존 (분할 안함)
  if (totalTokens <= config.maxTokensBeforeSummary) {
    // 전체 메시지 히스토리 포함
    messages.forEach(msg => {
      result.push({ role: msg.role, content: msg.content });
    });
  } else {
    // 최적의 메시지 분할 (토큰 기준)
    const { messagesToRetain } = findOptimalRetainMessages(messages, config);

    // 최근 메시지들만 포함
    messagesToRetain.forEach(msg => {
      result.push({ role: msg.role, content: msg.content });
    });
  }

  // 새 메시지
  result.push({ role: 'user', content: newMessage });

  return result;
}

// 요약 응답 인터페이스
export interface SummaryResponse {
  summary: string;
  summarizedMessageCount: number;
  remainingMessages: ChatMessage[];
  totalTokensAfterSummary: number;
}

// 전체 요약 처리 함수
export async function processSummarization(
  messages: ChatMessage[],
  apiKey: string,
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): Promise<SummaryResponse> {

  const summary = await summarizeConversation(messages, apiKey, config);

  // 최적의 메시지 분할
  const { messagesToSummarize, messagesToRetain } = findOptimalRetainMessages(messages, config);
  const summarizedCount = messagesToSummarize.length;

  return {
    summary,
    summarizedMessageCount: summarizedCount,
    remainingMessages: messagesToRetain,
    totalTokensAfterSummary: estimateTokenCount(messagesToRetain)
  };
}


