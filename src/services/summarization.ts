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

// 요약용 모델 목록 가져오기
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
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json() as OpenRouterModelsResponse;
      const summaryModels = filterSummaryModels(data.data);

      summaryModelsCache = {
        models: summaryModels,
        timestamp: Date.now()
      };

      return summaryModels;
    }
  } catch (error) {
    return getFallbackSummaryModels();
  }

  return getFallbackSummaryModels();
}

function getFallbackSummaryModels(): OpenRouterModel[] {
  const hardcodedModels = [
    'google/gemma-3-flash:free',
    'google/gemini-1.5-flash:free',
    'anthropic/claude-3-haiku:free',
    'google/gemma-7b:free',
    'mistralai/mistral-7b:free'
  ];

  return hardcodedModels.map(id => ({
    id,
    name: id.split('/').pop() || id,
    context_length: 16000,
    architecture: {
      input_modalities: ['text'],
      output_modalities: ['text'],
      tokenizer: 'unknown'
    },
    pricing: {
      prompt: '0',
      completion: '0'
    }
  }));
}

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

// 요약이 필요한지 확인 (토큰 기준)
export function shouldTriggerSummary(
  messages: ChatMessage[],
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): boolean {
  const estimatedTokens = estimateTokenCount(messages);
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

// 대화 요약 생성
export async function summarizeConversation(
  messages: ChatMessage[],
  apiKey: string,
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
): Promise<string> {
  if (messages.length < 4) {
    return '';
  }

  const summaryModels = await getSummaryModels(apiKey);
  if (!summaryModels || summaryModels.length === 0) {
    throw new Error('No summary models available');
  }

  const summaryModelId = summaryModels[0].id;

  const conversationText = messages.map(msg => {
    const role = msg.role.toUpperCase();
    return `${role}: ${msg.content}`;
  }).join('\n\n');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://h4o.kim/',
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

  if (!response.ok) {
    throw new Error(`Summarization failed: ${response.status} ${response.statusText}`);
  }

  try {
    const result = await response.json();

    if (result.choices && result.choices.length > 0) {
      return result.choices[0].message.content.trim();
    }

    throw new Error('Invalid response format from summary API');
  } catch (error) {
    throw new Error('Failed to generate summary');
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
  config: SummarizationConfig = DEFAULT_SUMMARY_CONFIG
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
    const summary = await summarizeConversation(messagesToSummarize, apiKey, config);

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


