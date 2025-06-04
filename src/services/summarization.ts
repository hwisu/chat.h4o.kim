import { ChatMessage, OpenRouterModel, OpenRouterModelsResponse, ChatCompletionResponse } from '../types';

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
    return summaryModelsCache.models;
  }

  try {
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

  // 뒤에서부터 토큰을 세면서 적절한 지점 찾기
  for (let i = messages.length - 1; i >= 0; i--) {
    const messageTokens = estimateTokenCount([messages[i]]);

    // 목표 토큰을 넘지 않는 선에서 최대한 유지
    if (retainTokens + messageTokens <= config.maxRetainTokens) {
      retainTokens += messageTokens;
      retainIndex = i;
    } else {
      break;
    }
  }

  // 최소 토큰 보장 및 대화 완전성 확보
  if (retainTokens < config.minRetainTokens && retainIndex > 0) {
    // 최소 토큰에 도달할 때까지 더 포함
    for (let i = retainIndex - 1; i >= 0; i--) {
      const messageTokens = estimateTokenCount([messages[i]]);
      retainTokens += messageTokens;
      retainIndex = i;

      if (retainTokens >= config.minRetainTokens) {
        break;
      }
    }
  }

  // 대화 완전성 확보: user-assistant 페어가 완전히 유지되도록 조정
  const originalIndex = retainIndex;
  retainIndex = ensureConversationCompleteness(messages, retainIndex);

  if (retainIndex !== originalIndex) {
    retainTokens = estimateTokenCount(messages.slice(retainIndex));
  }

  const messagesToSummarize = messages.slice(0, retainIndex);
  const messagesToRetain = messages.slice(retainIndex);

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
    } else if (lastSummaryMsg.role === 'user' && firstRetainMsg.role === 'assistant') {
      // user -> assistant 쌍이 분리된 경우, assistant를 요약으로 이동
      adjustedIndex = adjustedIndex + 1;
    }
  }

  if (adjustedIndex !== splitIndex) {
  }

  return adjustedIndex;
}

// 대화 요약 생성
export async function summarizeConversation(
  messages: ChatMessage[],
  apiKey: string,
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): Promise<string> {
  if (!messages || messages.length === 0) {
    return '';
  }

  // 요약 모델 목록 가져오기
  const summaryModels = await getSummaryModels(apiKey);

  if (summaryModels.length === 0) {
    throw new Error('No suitable summary models available');
  }

  // 메시지 형식 변환 및 대화 텍스트 생성
  const conversationText = messages.map(msg => {
    const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    return `${role}: ${msg.content}`;
  }).join('\n\n');

  // 요약 프롬프트 구성
  const promptText = SUMMARY_PROMPT.replace('{conversation}', conversationText);

  // 첫 번째 적합한 모델 선택
  const selectedModel = summaryModels[0];

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://chat.h4o.kim',
        'X-Title': 'Chatty-Summarizer'
      },
      body: JSON.stringify({
        model: selectedModel.id,
        messages: [
          { role: 'user', content: promptText }
        ],
        max_tokens: config.summaryTargetTokens,
        temperature: 0.3, // 요약은 보수적으로
        top_p: 0.8,
        frequency_penalty: 0.0,
        presence_penalty: 0.0
      })
    });

    if (!response.ok) {
      throw new Error(`Summary API error: ${response.status}`);
    }

    const data = await response.json() as ChatCompletionResponse;

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid summary response structure');
    }

    const summaryText = data.choices[0].message.content || '';

    if (!summaryText) {
      throw new Error('Empty summary received');
    }

    return summaryText;
  } catch (error) {
    console.error('Summary generation error:', error);
    throw error;
  }
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
  if (messages.length === 0) {
    return {
      summary: '',
      summarizedMessageCount: 0,
      remainingMessages: [],
      totalTokensAfterSummary: 0
    };
  }

  const { messagesToSummarize, messagesToRetain } = findOptimalRetainMessages(
    messages,
    config
  );

  if (messagesToSummarize.length === 0) {
    return {
      summary: '',
      summarizedMessageCount: 0,
      remainingMessages: messages,
      totalTokensAfterSummary: estimateTokenCount(messages)
    };
  }

  // 요약 생성
  const summary = await summarizeConversation(
    messagesToSummarize,
    apiKey,
    config
  );

  // 새로운 토큰 카운트 계산
  const totalTokensAfterSummary = estimateTokenCount([
    { role: 'system', content: summary, timestamp: Date.now() },
    ...messagesToRetain
  ]);

  return {
    summary,
    summarizedMessageCount: messagesToSummarize.length,
    remainingMessages: messagesToRetain,
    totalTokensAfterSummary
  };
}


