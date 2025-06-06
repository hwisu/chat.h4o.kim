import { Hono } from 'hono';
import type { Env, ChatRequest, ChatResponse } from '../types';
import { getRoleSystemPrompt } from '../roles';
import { 
  processChatMessage, 
  getHelpMessage,
  ChatProcessingContext,
  ChatRequestParams
} from '../services/chat';
import { authRequired, getUserIdFromContext, getSessionIdFromContext } from '../middleware/auth';
import { getApiKey, getSelectedModel } from './models';
import { getUserRole } from './roles';
import { RESPONSE_MESSAGES, HTTP_STATUS } from './constants';
import { successResponse, errorResponse, asyncHandler, parseJsonBody } from './utils';

const chat = new Hono<{ Bindings: Env }>();

// Process chat message
chat.post('/chat', authRequired, asyncHandler(async (c) => {
  const userId = getUserIdFromContext(c);
  const sessionId = getSessionIdFromContext(c);
  
  const { message, ...otherParams } = await parseJsonBody<ChatRequest & {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
  }>(c, ['message']);

  if (!message?.trim()) {
    return errorResponse(c, RESPONSE_MESSAGES.MESSAGE_REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }

  // Prepare request parameters
  const params: ChatRequestParams = {
    message,
    model: otherParams.model,
    temperature: otherParams.temperature ?? 0.7,
    max_tokens: otherParams.max_tokens ?? 1500,
    top_p: otherParams.top_p ?? 0.9,
    frequency_penalty: otherParams.frequency_penalty ?? 0.1,
    presence_penalty: otherParams.presence_penalty ?? 0.1
  };

  // Get API key, model, and role information
  const apiKey = getApiKey(c);
  const selectedModel = await getSelectedModel(c, params.model, true);
  const currentRole = getUserRole(sessionId);
  const systemPrompt = getRoleSystemPrompt(currentRole);

  // Build processing context
  const context: ChatProcessingContext = {
    userId,
    sessionId,
    currentRole,
    apiKey,
    selectedModel,
    systemPrompt
  };

  // Process chat message
  const response = await processChatMessage(context, params);
  return successResponse(c, response);
}));

// Get help message
chat.get('/help', asyncHandler(async (c) => {
  const helpMessage = getHelpMessage();
  return successResponse(c, { message: helpMessage });
}));

export default chat;
