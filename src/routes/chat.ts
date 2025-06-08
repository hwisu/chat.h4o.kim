import { Hono } from 'hono';
import { authRequired, getUserIdFromContext } from '../middleware/auth';
import { getRoleSystemPrompt } from '../roles';
import {
    ChatProcessingContext,
    ChatRequestParams,
    getHelpMessage,
    processChatMessage
} from '../services/chat';
import type { Env } from '../types';
import { CHAT_CONFIG, ErrorStatus, RESPONSE_MESSAGES } from './constants';
import { getApiKey, getSelectedModel } from './models';
import { getUserRole } from './roles';
import { asyncHandler, errorResponse, parseJsonBody, successResponse } from './utils';

const chat = new Hono<{ Bindings: Env }>();

// Enhanced chat request interface with proper typing
interface ChatRequestBody extends Record<string, unknown> {
  message: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

// Parameter validation helper
function validateChatParams(params: Partial<ChatRequestBody>): string | null {
  // Temperature validation (controls randomness: 0.0 = deterministic, 2.0 = very random)
  if (params.temperature !== undefined && 
      (params.temperature < CHAT_CONFIG.MIN_TEMPERATURE || params.temperature > CHAT_CONFIG.MAX_TEMPERATURE)) {
    return RESPONSE_MESSAGES.PARAMETER_OUT_OF_RANGE('temperature', CHAT_CONFIG.MIN_TEMPERATURE, CHAT_CONFIG.MAX_TEMPERATURE);
  }

  // Max tokens validation (maximum number of tokens to generate)
  if (params.max_tokens !== undefined && 
      (params.max_tokens < CHAT_CONFIG.MIN_MAX_TOKENS || params.max_tokens > CHAT_CONFIG.MAX_MAX_TOKENS)) {
    return RESPONSE_MESSAGES.PARAMETER_OUT_OF_RANGE('max_tokens', CHAT_CONFIG.MIN_MAX_TOKENS, CHAT_CONFIG.MAX_MAX_TOKENS);
  }

  // Top-p validation (nucleus sampling: 0.1 = use top 10% of tokens, 1.0 = use all tokens)
  if (params.top_p !== undefined && 
      (params.top_p < CHAT_CONFIG.MIN_TOP_P || params.top_p > CHAT_CONFIG.MAX_TOP_P)) {
    return RESPONSE_MESSAGES.PARAMETER_OUT_OF_RANGE('top_p', CHAT_CONFIG.MIN_TOP_P, CHAT_CONFIG.MAX_TOP_P);
  }

  // Frequency penalty validation (penalizes frequently used tokens: negative = encourage, positive = discourage)
  if (params.frequency_penalty !== undefined && 
      (params.frequency_penalty < CHAT_CONFIG.MIN_PENALTY || params.frequency_penalty > CHAT_CONFIG.MAX_PENALTY)) {
    return RESPONSE_MESSAGES.PARAMETER_OUT_OF_RANGE('frequency_penalty', CHAT_CONFIG.MIN_PENALTY, CHAT_CONFIG.MAX_PENALTY);
  }

  // Presence penalty validation (penalizes tokens that already appeared: negative = encourage, positive = discourage)
  if (params.presence_penalty !== undefined && 
      (params.presence_penalty < CHAT_CONFIG.MIN_PENALTY || params.presence_penalty > CHAT_CONFIG.MAX_PENALTY)) {
    return RESPONSE_MESSAGES.PARAMETER_OUT_OF_RANGE('presence_penalty', CHAT_CONFIG.MIN_PENALTY, CHAT_CONFIG.MAX_PENALTY);
  }

  return null; // All validations passed
}

// Process chat message
chat.post('/chat', authRequired, asyncHandler(async (c) => {
  const userId = getUserIdFromContext(c);
  
  const { message, ...otherParams } = await parseJsonBody<ChatRequestBody>(c, ['message']);

  // Message validation
  if (!message?.trim()) {
    return errorResponse(c, RESPONSE_MESSAGES.MESSAGE_REQUIRED, ErrorStatus.BAD_REQUEST);
  }

  // Message length validation (prevents extremely large requests)
  if (message.length > CHAT_CONFIG.MAX_MESSAGE_LENGTH) {
    return errorResponse(c, RESPONSE_MESSAGES.MESSAGE_TOO_LONG(CHAT_CONFIG.MAX_MESSAGE_LENGTH), ErrorStatus.BAD_REQUEST);
  }

  // Parameter validation
  const validationError = validateChatParams(otherParams);
  if (validationError) {
    return errorResponse(c, validationError, ErrorStatus.BAD_REQUEST);
  }

  // Prepare request parameters with defaults from CHAT_CONFIG
  const params: ChatRequestParams = {
    message,
    model: otherParams.model,
    // Default values with explanatory comments
    temperature: otherParams.temperature ?? CHAT_CONFIG.DEFAULT_TEMPERATURE,        // Controls response creativity
    max_tokens: otherParams.max_tokens ?? CHAT_CONFIG.DEFAULT_MAX_TOKENS,           // Limits response length
    top_p: otherParams.top_p ?? CHAT_CONFIG.DEFAULT_TOP_P,                         // Controls vocabulary diversity
    frequency_penalty: otherParams.frequency_penalty ?? CHAT_CONFIG.DEFAULT_FREQUENCY_PENALTY, // Reduces repetition
    presence_penalty: otherParams.presence_penalty ?? CHAT_CONFIG.DEFAULT_PRESENCE_PENALTY     // Encourages topic diversity
  };

  // Get API key, model, and role information
  const apiKey = await getApiKey(c);
  const selectedModel = await getSelectedModel(c, params.model, true);
      const currentRole = getUserRole(userId);
  const systemPrompt = getRoleSystemPrompt(currentRole);

  // Build processing context
      const context: ChatProcessingContext = {
      userId,
    currentRole,
    apiKey,
    selectedModel,
    systemPrompt,
    env: c.env
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
