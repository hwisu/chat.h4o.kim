import { ChatMessage, OpenRouterModel, OpenRouterModelsResponse } from '../types';

// Constants
const SUMMARY_CACHE_DURATION_MS = 5 * 60 * 1000; // 5분
const TOKEN_CACHE_MAX_SIZE = 1000;
const TOKEN_CACHE_CLEANUP_SIZE = 50;
const TOKENS_PER_WORD_RATIO = 0.75;
const MAX_RETRY_MODELS = 3;
const MIN_MESSAGES_FOR_SUMMARY = 10;
const MIN_MESSAGES_FOR_CONVERSATION = 4;

// Summary prompt
const SUMMARY_PROMPT = `
Summarize the following conversation between a user and an AI assistant.
Focus on key points, questions, and information shared.
Be comprehensive yet concise, preserving all important context for continuing the conversation.
Your summary will be used as context for continuing the conversation, so make sure to include any relevant details.
`.trim();

// 요약 설정
export interface SummarizationConfig {
  maxTokensBeforeSummary: number;  // 24000토큰 (128k 컨텍스트의 약 20%)
  summaryTargetTokens: number;     // 800토큰 (짧게)
  targetRetainTokens: number;      // 10000토큰 (최근 대화 유지 목표)
  minRetainTokens: number;         // 6000토큰 (최소 유지)
  maxRetainTokens: number;         // 15000토큰 (최대 유지)
}

export interface SummaryResponse {
  summary: string;
  summarizedMessageCount: number;
  remainingMessages: ChatMessage[];
  totalTokensAfterSummary: number;
}

export interface SummaryModelCache {
  models: OpenRouterModel[];
  timestamp: number;
}

export const DEFAULT_SUMMARY_CONFIG: SummarizationConfig = {
  maxTokensBeforeSummary: 24000,
  summaryTargetTokens: 800,
  targetRetainTokens: 10000,
  minRetainTokens: 6000,
  maxRetainTokens: 15000
};

export class SummarizationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SummarizationError';
  }
}

// 캐시
let summaryModelsCache: SummaryModelCache | null = null;
const tokenCountCache = new Map<string, number>();

/**
 * 요약용 모델 우선순위 계산
 */
function getSummaryModelPriority(modelId: string): number {
  const priorityMap = {
    'google_flash_free': 1,
    'gemma_3_free': 2,
    'google_free': 3,
    'free': 4,
    'default': 5
  };

  if (modelId.includes('google') && modelId.includes('flash') && modelId.includes('free')) {
    return priorityMap.google_flash_free;
  }
  if (modelId.includes('gemma-3') && modelId.includes('free')) {
    return priorityMap.gemma_3_free;
  }
  if (modelId.includes('google') && modelId.includes('free')) {
    return priorityMap.google_free;
  }
  if (modelId.includes('free')) {
    return priorityMap.free;
  }
  return priorityMap.default;
}

/**
 * 요약용 모델 필터링 및 정렬
 */
function filterSummaryModels(models: OpenRouterModel[]): OpenRouterModel[] {
  const freeModels = models.filter(model => model.id.includes(':free'));

  return freeModels.sort((a, b) => {
    const priorityA = getSummaryModelPriority(a.id);
    const priorityB = getSummaryModelPriority(b.id);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    const contextLengthA = a.context_length || 0;
    const contextLengthB = b.context_length || 0;

    if (contextLengthA !== contextLengthB) {
      return contextLengthB - contextLengthA;
    }

    return a.id.localeCompare(b.id);
  });
}

/**
 * 요약용 모델 목록 가져오기
 */
async function getSummaryModels(apiKey: string): Promise<OpenRouterModel[]> {
  if (summaryModelsCache && 
      Date.now() - summaryModelsCache.timestamp < SUMMARY_CACHE_DURATION_MS) {
    return summaryModelsCache.models;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://chat.h4o.kim',
        'X-Title': 'Chatty'
      }
    });

    if (!response.ok) {
      throw new SummarizationError(
        `Failed to fetch models: ${response.status} ${response.statusText}`,
        'MODEL_FETCH_FAILED'
      );
    }

    const data = await response.json() as OpenRouterModelsResponse;
    const summaryModels = filterSummaryModels(data.data);

    summaryModelsCache = {
      models: summaryModels,
      timestamp: Date.now()
    };

    console.log(`📊 Summary models available (first 3):`, 
      summaryModels.slice(0, 3).map(m => `${m.id}: ${m.context_length} tokens`).join('\n  ')
    );

    return summaryModels;
  } catch (error) {
    if (error instanceof SummarizationError) {
      throw error;
    }
    throw new SummarizationError(
      `Could not fetch available models: ${error}`,
      'MODEL_FETCH_ERROR'
    );
  }
}

/**
 * 토큰 수 추정 (캐싱 포함)
 */
export function estimateTokenCount(messages: ChatMessage[]): number {
  if (!messages || messages.length === 0) return 0;

  const cacheKey = messages.map(m => m.role + m.content.substring(0, 10)).join('|');

  if (tokenCountCache.has(cacheKey)) {
    return tokenCountCache.get(cacheKey)!;
  }

  // 캐시 크기 관리
  if (tokenCountCache.size > TOKEN_CACHE_MAX_SIZE) {
    const keysToDelete = [...tokenCountCache.keys()].slice(0, TOKEN_CACHE_CLEANUP_SIZE);
    keysToDelete.forEach(key => tokenCountCache.delete(key));
  }

  const allText = messages.map(msg => msg.content).join(' ');
  const wordCount = allText.split(/\s+/).length;
  const estimatedTokens = Math.ceil(wordCount / TOKENS_PER_WORD_RATIO);

  tokenCountCache.set(cacheKey, estimatedTokens);
  return estimatedTokens;
}

/**
 * 요약이 필요한지 확인
 */
export function shouldTriggerSummary(
  messages: ChatMessage[],
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): boolean {
  if (messages.length < MIN_MESSAGES_FOR_SUMMARY) {
    return false;
  }
  
  const estimatedTokens = estimateTokenCount(messages);
  return estimatedTokens > config.maxTokensBeforeSummary;
}

/**
 * 유지할 메시지들 찾기
 */
function findOptimalRetainMessages(
  messages: ChatMessage[],
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): { messagesToSummarize: ChatMessage[], messagesToRetain: ChatMessage[] } {
  if (messages.length < MIN_MESSAGES_FOR_CONVERSATION) {
    return {
      messagesToSummarize: [],
      messagesToRetain: messages
    };
  }

  let splitIndex = messages.length;

  while (splitIndex > 2) {
    const messagesToRetain = messages.slice(splitIndex - 1);
    const retainTokenEstimate = estimateTokenCount(messagesToRetain);

    if (retainTokenEstimate >= config.minRetainTokens &&
        retainTokenEstimate <= config.maxRetainTokens) {
      break;
    }

    if (retainTokenEstimate > config.maxRetainTokens) {
      splitIndex += 2;
      break;
    }

    splitIndex -= 2;
  }

  splitIndex = Math.max(MIN_MESSAGES_FOR_CONVERSATION, ensureConversationCompleteness(messages, splitIndex));
  splitIndex = Math.min(messages.length - 2, splitIndex);

  return {
    messagesToSummarize: messages.slice(0, splitIndex),
    messagesToRetain: messages.slice(splitIndex)
  };
}

/**
 * 대화 완전성 확보 (user-assistant 페어 유지)
 */
function ensureConversationCompleteness(messages: ChatMessage[], splitIndex: number): number {
  if (splitIndex <= 0 || splitIndex >= messages.length) {
    return splitIndex;
  }

  const nextMessage = messages[splitIndex];
  const previousMessage = messages[splitIndex - 1];

  if (
    (nextMessage.role === 'assistant' && previousMessage.role === 'user') ||
    (nextMessage.role === 'user' && previousMessage.role === 'assistant')
  ) {
    return splitIndex;
  }

  if (nextMessage.role === 'assistant') {
    return splitIndex + 1 < messages.length ? splitIndex + 1 : splitIndex;
  }

  if (nextMessage.role === 'user') {
    return splitIndex - 1 > 0 ? splitIndex - 1 : splitIndex;
  }

  return splitIndex;
}

/**
 * 폴백 모델 생성
 */
function createFallbackModel(modelId: string): OpenRouterModel {
  return {
    id: modelId,
    name: modelId.split('/').pop() || modelId,
    context_length: 131072,
    architecture: {
      input_modalities: ['text'],
      output_modalities: ['text'],
      tokenizer: 'unknown'
    },
    pricing: {
      prompt: '0',
      completion: '0'
    }
  };
}

/**
 * 대화 요약 생성
 */
export async function summarizeConversation(
  messages: ChatMessage[],
  apiKey: string,
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG,
  fallbackModelId?: string
): Promise<string> {
  if (messages.length < MIN_MESSAGES_FOR_CONVERSATION) {
    return '';
  }

  let summaryModels: OpenRouterModel[] = [];
  
  try {
    summaryModels = await getSummaryModels(apiKey);
  } catch (error) {
    console.warn('Could not fetch summary models dynamically:', error);
    
    if (fallbackModelId) {
      console.log(`🔄 Using current user model as summary fallback: ${fallbackModelId}`);
      summaryModels = [createFallbackModel(fallbackModelId)];
    } else {
      throw new SummarizationError(
        'No summary models available and no fallback model provided',
        'NO_MODELS_AVAILABLE'
      );
    }
  }

  if (!summaryModels || summaryModels.length === 0) {
    throw new SummarizationError('No summary models available', 'NO_MODELS_AVAILABLE');
  }

  const conversationText = messages.map(msg => {
    const role = msg.role.toUpperCase();
    return `${role}: ${msg.content}`;
  }).join('\n\n');

  const maxRetries = Math.min(MAX_RETRY_MODELS, summaryModels.length);
  
  for (let i = 0; i < maxRetries; i++) {
    const summaryModelId = summaryModels[i].id;
    
    try {
      console.log(`🔄 Attempting summarization with model: ${summaryModelId}`);
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://chat.h4o.kim',
          'X-Title': 'Chatty Context Summarization'
        },
        body: JSON.stringify({
          model: summaryModelId,
          messages: [
            { role: 'system', content: SUMMARY_PROMPT },
            { role: 'user', content: conversationText }
          ],
          max_tokens: config.summaryTargetTokens,
          temperature: 0.3,
          frequency_penalty: 0.5,
          presence_penalty: 0.5
        })
      });

      if (response.ok) {
        const result: any = await response.json();

        if (result.choices?.[0]?.message?.content) {
          const summary = result.choices[0].message.content.trim();
          console.log(`✅ Summarization successful with model: ${summaryModelId}`);
          return summary;
        }
      } else {
        console.warn(`❌ Summarization failed with model ${summaryModelId}: ${response.status} ${response.statusText}`);
        
        if (i === maxRetries - 1) {
          throw new SummarizationError(
            `All summary models failed. Last error: ${response.status} ${response.statusText}`,
            'ALL_MODELS_FAILED'
          );
        }
      }
    } catch (error) {
      console.warn(`❌ Error with summary model ${summaryModelId}:`, error);
      
      if (i === maxRetries - 1) {
        throw new SummarizationError(
          `All summary models failed. Last error: ${error}`,
          'ALL_MODELS_FAILED'
        );
      }
    }
  }

  throw new SummarizationError('Failed to generate summary with any available model', 'SUMMARY_GENERATION_FAILED');
}

/**
 * 요약과 함께 메시지 구성
 */
export function buildMessagesWithSummary(
  messages: ChatMessage[],
  existingSummary: string | null,
  newMessage: string,
  systemPrompt: string
): any[] {
  const apiMessages: any[] = [];

  apiMessages.push({
    role: 'system',
    content: systemPrompt
  });

  if (existingSummary) {
    apiMessages.push({
      role: 'system',
      content: `Previous conversation summary: ${existingSummary}`
    });
  }

  for (const message of messages) {
    apiMessages.push({
      role: message.role,
      content: message.content
    });
  }

  if (newMessage) {
    apiMessages.push({
      role: 'user',
      content: newMessage
    });
  }

  return apiMessages;
}

/**
 * 전체 요약 처리 함수
 */
export async function processSummarization(
  messages: ChatMessage[],
  apiKey: string,
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG,
  currentUserModel?: string
): Promise<SummaryResponse> {
  if (!shouldTriggerSummary(messages, config)) {
    return {
      summary: '',
      summarizedMessageCount: 0,
      remainingMessages: messages,
      totalTokensAfterSummary: estimateTokenCount(messages)
    };
  }

  const { messagesToSummarize, messagesToRetain } = findOptimalRetainMessages(messages, config);

  if (messagesToSummarize.length < MIN_MESSAGES_FOR_CONVERSATION) {
    return {
      summary: '',
      summarizedMessageCount: 0,
      remainingMessages: messages,
      totalTokensAfterSummary: estimateTokenCount(messages)
    };
  }

  try {
    const summary = await summarizeConversation(messagesToSummarize, apiKey, config, currentUserModel);

    return {
      summary,
      summarizedMessageCount: messagesToSummarize.length,
      remainingMessages: messagesToRetain,
      totalTokensAfterSummary:
        estimateTokenCount(messagesToRetain) +
        Math.ceil(summary.split(/\s+/).length / TOKENS_PER_WORD_RATIO)
    };
  } catch (error) {
    if (error instanceof SummarizationError) {
      throw error;
    }
    throw new SummarizationError(`Summary generation failed: ${error}`, 'PROCESSING_FAILED');
  }
}


