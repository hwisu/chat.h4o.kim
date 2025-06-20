import { Hono } from 'hono';
import { authRequired, getUserIdFromContext } from '../middleware/auth';
import { contextManager } from '../services/context';
import type { Env } from '../types';
import { RESPONSE_MESSAGES } from './constants';
import { asyncHandler, successResponse } from './utils';

const context = new Hono<{ Bindings: Env }>();

// Get current conversation context
context.get('/context', authRequired, asyncHandler(async (c) => {
  const userId = getUserIdFromContext(c);
  const contextData = await contextManager.getOrCreateContext(userId);

  return successResponse(c, {
    context: {
      id: contextData.id,
      messageCount: contextData.conversationHistory.length,
      summary: contextData.summary,
      tokenUsage: contextData.tokenUsage,
      lastUpdated: contextData.updatedAt,
      createdAt: contextData.createdAt
    },
    usage: `${contextData.tokenUsage} tokens`,
    maxSize: contextData.maxTokens,
    currentSize: contextData.tokenUsage
  });
}));

// Clear conversation context
context.post('/context/clear', authRequired, asyncHandler(async (c) => {
  const userId = getUserIdFromContext(c);
  await contextManager.clearContext(userId);

  return successResponse(c, {}, RESPONSE_MESSAGES.CONTEXT_CLEARED);
}));

// Get context statistics
context.get('/context/stats', authRequired, asyncHandler(async (c) => {
  const stats = contextManager.getStats();
  return successResponse(c, { stats });
}));

export default context;
