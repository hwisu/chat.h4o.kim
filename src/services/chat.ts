import { ChatCompletionResponse, ChatMessage } from '../types';
import { contextManager } from './context';
import {
  buildMessagesWithSummary,
  estimateTokenCount,
  processSummarization
} from './summarization';

// Constants
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1500;
const DEFAULT_TOP_P = 0.9;
const DEFAULT_FREQUENCY_PENALTY = 0.1;
const DEFAULT_PRESENCE_PENALTY = 0.1;
const DEFAULT_TIMEOUT_MS = 15000;
const SUMMARY_THRESHOLD_TOKENS = 24000;
const MIN_MESSAGES_FOR_SUMMARY = 10;
const SYSTEM_PROMPT_PREVIEW_LENGTH = 100;

export interface ContextProcessingResult {
  finalMessages: ChatMessage[];
  currentSummary: string | null;
  summaryData: any;
  actualTokenCount: number;
}

export interface ChatRequestParams {
  message: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

export interface ChatProcessingContext {
  userId: string;
  currentRole: string;
  apiKey: string;
  selectedModel: string;
  systemPrompt: string;
}

export interface ChatResponse {
  response: string;
  model: string;
  usage?: any;
  role: string;
  currentModel: string;
  tokensUsed?: number;
  messageCount?: number;
}

export class ChatError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'ChatError';
  }
}

/**
 * 메시지 중복 필터링
 */
function filterDuplicateMessages(messages: ChatMessage[], newMessage: string): ChatMessage[] {
  return messages.filter(m => !(m.role === 'user' && m.content === newMessage));
}

/**
 * 요약 필요성 확인
 */
function shouldTriggerSummary(
  actualTokenCount: number,
  currentSummary: string | null,
  messagesLength: number
): boolean {
  return actualTokenCount > SUMMARY_THRESHOLD_TOKENS && 
         !currentSummary && 
         messagesLength >= MIN_MESSAGES_FOR_SUMMARY;
}

/**
 * 컨텍스트 처리 및 요약 기능
 */
export async function processContextAndSummary(
  chatMessages: ChatMessage[],
  currentSummary: string | null,
  newMessage: string,
  systemPrompt: string,
  apiKey: string,
  currentUserModel?: string
): Promise<ContextProcessingResult> {
  if (!chatMessages || !Array.isArray(chatMessages)) {
    throw new ChatError('Invalid chat messages provided', 'INVALID_MESSAGES');
  }

  // 현재 상태로 임시 메시지 구성해서 실제 토큰 수 확인
  const preliminaryMessages = buildMessagesWithSummary(
    chatMessages,
    currentSummary,
    newMessage,
    systemPrompt
  );

  const actualTokenCount = estimateTokenCount(preliminaryMessages.map(m => ({
    role: m.role,
    content: m.content,
    timestamp: Date.now()
  })));

  const needsSummary = shouldTriggerSummary(actualTokenCount, currentSummary, chatMessages.length);

  let summaryData: any = null;
  let finalMessages = chatMessages;
  let finalSummary = currentSummary;

  if (needsSummary) {
    try {
      summaryData = await processSummarization(chatMessages, apiKey, undefined, currentUserModel);
      finalMessages = summaryData.remainingMessages;
      finalSummary = summaryData.summary;
    } catch (error) {
      console.warn('❌ Auto-summary failed, proceeding without summary:', error instanceof Error ? error.message : error);
    }
  }

  return {
    finalMessages,
    currentSummary: finalSummary,
    summaryData,
    actualTokenCount
  };
}

/**
 * API 요청 본문 준비
 */
export function prepareChatRequest(
  messages: any[],
  selectedModel: string,
  temperature: number = DEFAULT_TEMPERATURE,
  max_tokens: number = DEFAULT_MAX_TOKENS,
  top_p: number = DEFAULT_TOP_P,
  frequency_penalty: number = DEFAULT_FREQUENCY_PENALTY,
  presence_penalty: number = DEFAULT_PRESENCE_PENALTY
): any {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new ChatError('Messages array is required and cannot be empty', 'EMPTY_MESSAGES');
  }

  if (!selectedModel) {
    throw new ChatError('Model selection is required', 'MISSING_MODEL');
  }

  return {
    model: selectedModel,
    messages: messages,
    max_tokens: max_tokens,
    temperature: temperature,
    top_p: top_p,
    frequency_penalty: frequency_penalty,
    presence_penalty: presence_penalty,
    stream: false
  };
}

/**
 * OpenRouter API 호출 (타임아웃 포함)
 */
export async function callOpenRouterAPI(
  apiKey: string, 
  body: any, 
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  if (!apiKey) {
    throw new ChatError('API key is required', 'MISSING_API_KEY');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://chat.h4o.kim',
        'X-Title': 'Chatty',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      body: JSON.stringify(body),
      cf: {
        cacheTtl: 0,
        cacheEverything: false
      },
      signal: controller.signal
    });

    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ChatError('Request timeout', 'TIMEOUT', 408);
    }
    throw new ChatError(`Network error: ${error}`, 'NETWORK_ERROR', 500);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * API 응답 검증 및 파싱
 */
async function validateAndParseResponse(response: Response, selectedModel: string): Promise<ChatCompletionResponse> {
  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenRouter API error:', {
      status: response.status,
      statusText: response.statusText,
      model: selectedModel,
      error: errorText
    });

    if (response.status === 401) {
      throw new ChatError('Invalid API key. Please check your OpenRouter API key.', 'INVALID_API_KEY', 401);
    }

    throw new ChatError(`Chat API error: ${response.status} - ${errorText}`, 'API_ERROR', response.status);
  }

  try {
    const chatData: ChatCompletionResponse = await response.json();

    if (!chatData.choices?.[0]?.message) {
      throw new ChatError('Invalid response structure from API', 'INVALID_RESPONSE');
    }

    return chatData;
  } catch (error) {
    if (error instanceof ChatError) {
      throw error;
    }
    throw new ChatError('Failed to parse API response', 'PARSE_ERROR');
  }
}

/**
 * 시스템 프롬프트 미리보기 생성
 */
function getSystemPromptPreview(systemPrompt: string): string {
  if (!systemPrompt) return 'No system prompt';
  return systemPrompt.length > SYSTEM_PROMPT_PREVIEW_LENGTH 
    ? systemPrompt.substring(0, SYSTEM_PROMPT_PREVIEW_LENGTH) + '...'
    : systemPrompt;
}

/**
 * 메인 채팅 처리 로직
 */
export async function processChatMessage(
  context: ChatProcessingContext,
  params: ChatRequestParams
): Promise<ChatResponse> {
  const { userId, currentRole, apiKey, selectedModel, systemPrompt } = context;
  const { 
    message, 
    temperature = DEFAULT_TEMPERATURE, 
    max_tokens = DEFAULT_MAX_TOKENS, 
    top_p = DEFAULT_TOP_P, 
    frequency_penalty = DEFAULT_FREQUENCY_PENALTY, 
    presence_penalty = DEFAULT_PRESENCE_PENALTY 
  } = params;

  if (!message?.trim()) {
    throw new ChatError('Message content is required', 'EMPTY_MESSAGE');
  }



  try {
    // 사용자 메시지를 컨텍스트에 추가
    await contextManager.addMessage(userId, 'user', message);

    // 현재 컨텍스트 상태 가져오기 (방금 추가한 메시지 포함)
    const updatedContext = await contextManager.getOrCreateContext(userId);

    // 컨텍스트 처리 및 요약
    const contextResult = await processContextAndSummary(
      updatedContext.conversationHistory,
      updatedContext.summary,
      message,
      systemPrompt,
      apiKey,
      selectedModel
    );

    // 최종 메시지 구성 (중복 방지)
    const filteredMessages = filterDuplicateMessages(contextResult.finalMessages, message);
    const messages = buildMessagesWithSummary(
      filteredMessages,
      contextResult.currentSummary,
      message,
      systemPrompt
    );

    // API 요청 준비
    const chatRequestBody = prepareChatRequest(
      messages,
      selectedModel,
      temperature,
      max_tokens,
      top_p,
      frequency_penalty,
      presence_penalty
    );

    // API 호출
    const chatResponse = await callOpenRouterAPI(apiKey, chatRequestBody);
    const chatData = await validateAndParseResponse(chatResponse, selectedModel);

    const assistantResponse = chatData.choices[0].message.content || '';

    // 어시스턴트 응답을 컨텍스트에 추가
    await contextManager.addMessage(userId, 'assistant', assistantResponse);

    // 컨텍스트 업데이트 (요약, 토큰 사용량 등)
    await contextManager.updateContext(userId, {
      summary: contextResult.currentSummary,
      conversationHistory: [...contextResult.finalMessages,
        { role: 'user', content: message, timestamp: Date.now() },
        { role: 'assistant', content: assistantResponse, timestamp: Date.now() }
      ],
      tokenUsage: chatData.usage?.total_tokens || 0
    });

    // 성공 응답 구성
    return {
      response: assistantResponse,
      model: selectedModel,
      usage: chatData.usage,
      role: currentRole,
      currentModel: selectedModel,
      tokensUsed: chatData.usage?.total_tokens,
      messageCount: messages.length
    };

  } catch (error) {
    if (error instanceof ChatError) {
      throw error;
    }
    throw new ChatError(`Chat processing failed: ${error}`, 'PROCESSING_ERROR');
  }
}

/**
 * 도움말 메시지 생성
 */
export function getHelpMessage(): string {
  return `🤖 **Chatty H4O Assistant**

**Available Commands:**
• \`/login <password>\` - Login with server password
• \`/help\` - Show this help message

**Features:**
• 🧠 Automatic context summarization
• 🔄 Smart model selection
• 💾 Persistent conversation history
• 🎭 Multiple AI personalities
• 🔐 Secure authentication

**Interface Options:**
• Click Model button to select AI models
• Click Role button to change AI personality
• Header displays current context usage

**Tips:**
• Use the interface buttons for model and role selection
• Login required to access AI features
• Context is automatically managed for optimal performance

Type your message to start chatting!`;
} 
