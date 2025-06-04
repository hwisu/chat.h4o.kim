import { Hono } from 'hono';
import { Env, ChatCompletionResponse, ChatMessage } from '../types';
import { getRoleSystemPrompt } from '../roles';
import {
  estimateTokenCount,
  buildMessagesWithSummary,
  processSummarization
} from '../services/summarization';
import { contextManager } from '../services/context-manager';
import { checkAuthenticationOrUserKey } from './auth';
import { getApiKey, getSelectedModel } from './models';
import { getUserRole, getSessionId } from './roles';

const chat = new Hono<{ Bindings: Env }>();

// 사용자 ID 획득 헬퍼 함수
function getUserId(c: any): string {
  const sessionToken = c.req.header('X-Session-Token');
  const userApiKey = c.req.header('X-User-API-Key');
  return contextManager.getUserId(sessionToken, userApiKey);
}

// GET /api/help - 도움말 반환
chat.get('/help', async (c) => {
  return c.json({
    success: true,
    response: `📖 Chatty Commands:\n\n🔐 Authentication:\n/login <password>          - Authenticate with server\n\n🔑 API Key Management:\n/set-api-key <key>         - Set your personal OpenRouter API key\n/remove-api-key            - Remove personal API key (use server key)\n/api-key-status            - Check current API key status\n\n🎭 Role Management:\n/roles                     - List available AI roles\n/set-role <role-id>        - Set AI personality/role\n\n🤖 Model Commands:\n/models                    - List available AI models\n/set-model <id>            - Set specific model\n/set-model auto            - Use auto-selection\n\n💬 Chat Commands:\n/clear                     - Clear conversation history\n/token-info [on|off]       - Toggle token usage display\n/help                      - Show this help\n\n💡 Features:\n• Personal API key support (stored locally & encrypted)\n• Role-based AI personalities for specialized tasks\n• Conversation context maintained across messages\n• Automatic summarization at 24k tokens for efficiency\n• Smart token management with detailed usage tracking\n• Optimized parameters for better responses\n\n🌐 Get your API key: https://openrouter.ai/settings/keys`
  });
});

// 컨텍스트 처리 및 요약 함수
interface ContextProcessingResult {
  finalMessages: ChatMessage[];
  currentSummary: string | null;
  summaryData: any;
  actualTokenCount: number;
}

async function processContextAndSummary(
  chatMessages: ChatMessage[],
  currentSummary: string | null,
  newMessage: string,
  systemPrompt: string,
  apiKey: string
): Promise<ContextProcessingResult> {
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

  const needsSummary = actualTokenCount > 24000 && !currentSummary;

  let summaryData: any = null;
  let finalMessages = chatMessages;
  let finalSummary = currentSummary;

  if (needsSummary) {
    try {
      summaryData = await processSummarization(chatMessages, apiKey);
      finalMessages = summaryData.remainingMessages;
      finalSummary = summaryData.summary;
    } catch (error) {
      console.warn('Auto-summary failed, proceeding without summary:', error);
    }
  }

  return {
    finalMessages,
    currentSummary: finalSummary,
    summaryData,
    actualTokenCount
  };
}

// API 요청 준비 함수
function prepareChatRequest(
  messages: any[],
  selectedModel: string,
  temperature: number = 0.7,
  max_tokens: number = 1500,
  top_p: number = 0.9,
  frequency_penalty: number = 0.1,
  presence_penalty: number = 0.1
) {
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

// 타임아웃과 함께 OpenRouter API를 호출하는 함수
async function callOpenRouterAPI(apiKey: string, body: any, timeoutMs: number = 15000): Promise<Response> {
  // 타임아웃 설정으로 응답 속도 개선
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
  } finally {
    clearTimeout(timeoutId);
  }
}

// POST /api/chat - 서버 컨텍스트 기반 채팅
chat.post('/chat', async (c) => {
  // Check authentication first
  if (!await checkAuthenticationOrUserKey(c)) {
    return c.json({
      error: 'Authentication required',
      auth_required: true,
      response: `❌ Authentication required.\n\nUse: /login <password>`
    }, 401);
  }

  try {
    const requestBody: any = await c.req.json();

    // 단순한 요청 데이터 처리
    const {
      message,
      model,
      temperature = 0.7,
      max_tokens = 1500,
      top_p = 0.9,
      frequency_penalty = 0.1,
      presence_penalty = 0.1
    } = requestBody;

    if (!message) {
      return c.json({ error: 'Message is required' }, 400);
    }

    try {
      // 사용자 식별 및 컨텍스트 가져오기
      const userId = getUserId(c);
      const sessionId = getSessionId(c);
      const currentRole = getUserRole(sessionId);

      // 서버에서 컨텍스트 가져오기/생성
      const context = await contextManager.getOrCreateContext(userId);

      // API 키 및 모델 설정
      const apiKey = getApiKey(c);
      const selectedModel = await getSelectedModel(c, model, true);
      const systemPrompt = getRoleSystemPrompt(currentRole);

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
        apiKey
      );

      // 최종 메시지 구성
      const messages = buildMessagesWithSummary(
        contextResult.finalMessages.filter(m => m.role !== 'user' || m.content !== message), // 중복 방지
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

      const chatResponse = await callOpenRouterAPI(apiKey, chatRequestBody);

      if (!chatResponse.ok) {
        const errorText = await chatResponse.text();
        console.error('OpenRouter API error:', {
          status: chatResponse.status,
          statusText: chatResponse.statusText,
          model: selectedModel,
          messageCount: messages.length
        });

        if (chatResponse.status === 401) {
          return c.json({
            error: 'Invalid API key. Please check your OpenRouter API key.',
            details: errorText,
            auth_required: true
          }, 401);
        }

        return c.json({
          error: `Chat API error: ${chatResponse.status}`,
          details: errorText
        }, 500);
      }

      const chatData: ChatCompletionResponse = await chatResponse.json();

      if (!chatData.choices?.[0]?.message) {
        return c.json({ error: 'Invalid response structure' }, 500);
      }

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

      // 응답 데이터 구성
      const responseData = {
        response: assistantResponse,
        model: selectedModel,
        usage: chatData.usage,
        summaryApplied: !!contextResult.summaryData,
        summarizedMessageCount: contextResult.summaryData?.summarizedMessageCount || 0,
        messageCount: updatedContext.conversationHistory.length + 1, // +1 for assistant response
        timestamp: Date.now()
      };

      return c.json(responseData);
    } catch (apiError) {
      console.error('API error:', apiError);
      return c.json({
        error: apiError instanceof Error ? apiError.message : 'API configuration error',
        details: 'Please check your API key configuration'
      }, 500);
    }

  } catch (error) {
    console.error('Chat error:', error);
    return c.json({
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default chat;
