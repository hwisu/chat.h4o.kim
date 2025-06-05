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
const SUMMARY_PROMPT = `
Summarize the following conversation between a user and an AI assistant.
Focus on key points, questions, and information shared.
Be comprehensive yet concise, preserving all important context for continuing the conversation.
Your summary will be used as context for continuing the conversation, so make sure to include any relevant details.
`;

// 요약용 모델 캐시 (5분)
let summaryModelsCache: { models: OpenRouterModel[], timestamp: number } | null = null;
const SUMMARY_CACHE_DURATION = 5 * 60 * 1000; // 5분

// 요약용 모델 우선순위 계산
function getSummaryModelPriority(modelId: string): number {
  if (modelId.includes('google') && modelId.includes('flash') && modelId.includes('free')) {
    return 1;
  }

  if (modelId.includes('gemma-3') && modelId.includes('free')) {
    return 2;
  }

  if (modelId.includes('google') && modelId.includes('free')) {
    return 3;
  }

  if (modelId.includes('free')) {
    return 4;
  }

  return 5;
}

// 요약용 모델 필터링 및 정렬
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

// 요약용 모델 목록 가져오기 (완전히 동적)
async function getSummaryModels(apiKey: string): Promise<OpenRouterModel[]> {
  if (summaryModelsCache &&
      Date.now() - summaryModelsCache.timestamp < SUMMARY_CACHE_DURATION) {
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

    if (response.ok) {
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
    } else {
      console.warn(`Failed to fetch models: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch models: ${response.status}`);
    }
  } catch (error) {
    console.warn('Failed to fetch summary models from API:', error);
    throw new Error(`Could not fetch available models: ${error}`);
  }
}

// 하드코딩된 폴백 모델 제거 - 항상 동적으로 받아온 모델만 사용

// 토큰 캐싱을 위한 Map
const tokenCountCache = new Map<string, number>();

// 토큰 수 추정 (대략적)
export function estimateTokenCount(messages: ChatMessage[]): number {
  if (!messages || messages.length === 0) return 0;

  const cacheKey = messages.map(m => m.role + m.content.substring(0, 10)).join('|');

  if (tokenCountCache.has(cacheKey)) {
    return tokenCountCache.get(cacheKey)!;
  }

  if (tokenCountCache.size > 1000) {
    const keysToDelete = [...tokenCountCache.keys()].slice(0, 50);
    keysToDelete.forEach(key => tokenCountCache.delete(key));
  }

  const allText = messages.map(msg => msg.content).join(' ');

  const wordCount = allText.split(/\s+/).length;
  const estimatedTokens = Math.ceil(wordCount / 0.75);

  tokenCountCache.set(cacheKey, estimatedTokens);

  return estimatedTokens;
}

// 요약이 필요한지 확인 (토큰 기준 + 메시지 수 기준)
export function shouldTriggerSummary(
  messages: ChatMessage[],
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): boolean {
  // 최소 메시지 수 체크 (요약하기에 충분한 대화가 있어야 함)
  if (messages.length < 10) {
    return false;
  }
  
  const estimatedTokens = estimateTokenCount(messages);
  
  // 토큰 수가 기준을 넘어야 하고, 최소한의 대화 세션이 있어야 함
  return estimatedTokens > config.maxTokensBeforeSummary;
}

// 자연스러운 대화 단위를 유지하면서 유지할 메시지들 찾기
function findOptimalRetainMessages(
  messages: ChatMessage[],
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): { messagesToSummarize: ChatMessage[], messagesToRetain: ChatMessage[] } {
  if (messages.length < 4) {
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

  splitIndex = Math.max(4, ensureConversationCompleteness(messages, splitIndex));
  splitIndex = Math.min(messages.length - 2, splitIndex);

  return {
    messagesToSummarize: messages.slice(0, splitIndex),
    messagesToRetain: messages.slice(splitIndex)
  };
}

// 대화 완전성 확보 (user-assistant 페어 유지)
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
    if (splitIndex + 1 < messages.length) {
      return splitIndex + 1;
    }
    return splitIndex;
  }

  if (nextMessage.role === 'user') {
    if (splitIndex - 1 > 0) {
      return splitIndex - 1;
    }
    return splitIndex;
  }

  return splitIndex;
}

// 대화 요약 생성 (완전히 동적 모델 선택)
export async function summarizeConversation(
  messages: ChatMessage[],
  apiKey: string,
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG,
  fallbackModelId?: string // 사용자가 현재 선택한 모델을 폴백으로 사용
): Promise<string> {
  if (messages.length < 4) {
    return '';
  }

  let summaryModels: OpenRouterModel[] = [];
  
  try {
    summaryModels = await getSummaryModels(apiKey);
  } catch (error) {
    console.warn('Could not fetch summary models dynamically:', error);
    
    // 동적 모델 가져오기 실패 시 현재 사용자 모델을 폴백으로 사용
    if (fallbackModelId) {
      console.log(`🔄 Using current user model as summary fallback: ${fallbackModelId}`);
      summaryModels = [{
        id: fallbackModelId,
        name: fallbackModelId.split('/').pop() || fallbackModelId,
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
      }];
    } else {
      throw new Error('No summary models available and no fallback model provided');
    }
  }

  if (!summaryModels || summaryModels.length === 0) {
    throw new Error('No summary models available');
  }

  const conversationText = messages.map(msg => {
    const role = msg.role.toUpperCase();
    return `${role}: ${msg.content}`;
  }).join('\n\n');

  // 여러 모델을 순차적으로 시도
  for (let i = 0; i < Math.min(3, summaryModels.length); i++) {
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
            {
              role: 'system',
              content: SUMMARY_PROMPT
            },
            {
              role: 'user',
              content: conversationText
            }
          ],
          max_tokens: config.summaryTargetTokens,
          temperature: 0.3,
          frequency_penalty: 0.5,
          presence_penalty: 0.5
        })
      });

      if (response.ok) {
        const result: any = await response.json();

        if (result.choices && result.choices.length > 0) {
          const summary = result.choices[0].message.content.trim();
          console.log(`✅ Summarization successful with model: ${summaryModelId}`);
          return summary;
        }
      } else {
        console.warn(`❌ Summarization failed with model ${summaryModelId}: ${response.status} ${response.statusText}`);
        
        if (i === summaryModels.length - 1) {
          throw new Error(`All summary models failed. Last error: ${response.status} ${response.statusText}`);
        }
        // 다음 모델로 계속
      }
    } catch (error) {
      console.warn(`❌ Error with summary model ${summaryModelId}:`, error);
      
      if (i === Math.min(3, summaryModels.length) - 1) {
        throw new Error(`All summary models failed. Last error: ${error}`);
      }
      // 다음 모델로 계속
    }
  }

  throw new Error('Failed to generate summary with any available model');
}

// 요약과 함께 메시지 구성
export function buildMessagesWithSummary(
  messages: ChatMessage[],
  existingSummary: string | null,
  newMessage: string,
  systemPrompt: string,
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): any[] {
  const apiMessages = [];

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
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG,
  currentUserModel?: string // 현재 사용자가 선택한 모델
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

  if (messagesToSummarize.length < 4) {
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
        Math.ceil(summary.split(/\s+/).length / 0.75)
    };
  } catch (error) {
    throw new Error(`Summary generation failed: ${error}`);
  }
}


