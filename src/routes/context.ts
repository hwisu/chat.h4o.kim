import { Hono } from 'hono';
import { Env } from '../types';
import { contextManager } from '../services/context-manager';
import { checkAuthenticationOrUserKey } from './auth';
import { getSessionId } from './roles';

const context = new Hono<{ Bindings: Env }>();

// 사용자 ID 획득 헬퍼 함수
function getUserId(c: any): string {
  const sessionToken = c.req.header('X-Session-Token');
  const userApiKey = c.req.header('X-User-API-Key');
  return contextManager.getUserId(sessionToken, userApiKey);
}

// GET /api/context - 현재 컨텍스트 상태 조회
context.get('/context', async (c) => {
  if (!await checkAuthenticationOrUserKey(c)) {
    return c.json({
      error: 'Authentication required',
      auth_required: true
    }, 401);
  }

  try {
    const userId = getUserId(c);
    const userContext = await contextManager.getOrCreateContext(userId);

    return c.json({
      success: true,
      context: {
        conversationHistory: userContext.conversationHistory,
        summary: userContext.summary,
        tokenUsage: userContext.tokenUsage,
        model: userContext.model,
        role: userContext.role,
        messageCount: userContext.conversationHistory.length,
        lastActivity: userContext.lastActivity,
        createdAt: userContext.createdAt
      }
    });
  } catch (error) {
    console.error('Error fetching context:', error);
    return c.json({
      error: 'Failed to fetch context',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /api/context/clear - 컨텍스트 클리어
context.post('/context/clear', async (c) => {
  if (!await checkAuthenticationOrUserKey(c)) {
    return c.json({
      error: 'Authentication required',
      auth_required: true
    }, 401);
  }

  try {
    const userId = getUserId(c);
    await contextManager.clearContext(userId);

    return c.json({
      success: true,
      message: 'Context cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing context:', error);
    return c.json({
      error: 'Failed to clear context',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// DELETE /api/context - 컨텍스트 완전 삭제
context.delete('/context', async (c) => {
  if (!await checkAuthenticationOrUserKey(c)) {
    return c.json({
      error: 'Authentication required',
      auth_required: true
    }, 401);
  }

  try {
    const userId = getUserId(c);
    const deleted = await contextManager.deleteContext(userId);

    return c.json({
      success: true,
      deleted,
      message: deleted ? 'Context deleted successfully' : 'No context found'
    });
  } catch (error) {
    console.error('Error deleting context:', error);
    return c.json({
      error: 'Failed to delete context',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /api/context/stats - 컨텍스트 통계 (디버깅용)
context.get('/context/stats', async (c) => {
  if (!await checkAuthenticationOrUserKey(c)) {
    return c.json({
      error: 'Authentication required',
      auth_required: true
    }, 401);
  }

  try {
    const stats = contextManager.getStats();
    return c.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching context stats:', error);
    return c.json({
      error: 'Failed to fetch context stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default context;
