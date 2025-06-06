import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { checkAuthenticationOrUserKey, getUserId } from '../services/auth';

/**
 * 인증이 필요한 라우트에 적용하는 미들웨어
 */
export async function authRequired(c: Context, next: Next) {
  const sessionToken = c.req.header('X-Session-Token');
  const userApiKey = c.req.header('X-User-API-Key');
  const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';
  
  const isAuthenticated = await checkAuthenticationOrUserKey(sessionToken, userApiKey, jwtSecret);
  
  if (!isAuthenticated) {
    throw new HTTPException(401, { 
      message: 'Authentication required. Please login first or provide a valid API key.' 
    });
  }
  
  // 인증된 사용자 정보를 컨텍스트에 추가
  const userId = getUserId(sessionToken, userApiKey);
  c.set('userId', userId);
  c.set('sessionId', userId); // 기존 코드와의 호환성을 위해
  c.set('isAuthenticated', true);
  
  await next();
}

/**
 * 선택적 인증 미들웨어 (인증되지 않아도 통과하지만 인증 정보는 설정)
 */
export async function optionalAuth(c: Context, next: Next) {
  const sessionToken = c.req.header('X-Session-Token');
  const userApiKey = c.req.header('X-User-API-Key');
  const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';
  
  const isAuthenticated = await checkAuthenticationOrUserKey(sessionToken, userApiKey, jwtSecret);
  
  if (isAuthenticated) {
    const userId = getUserId(sessionToken, userApiKey);
    c.set('userId', userId);
    c.set('sessionId', userId);
    c.set('isAuthenticated', true);
  } else {
    c.set('isAuthenticated', false);
  }
  
  await next();
}

/**
 * 헬퍼 함수: 컨텍스트에서 사용자 ID 가져오기
 */
export function getUserIdFromContext(c: Context): string {
  return c.get('userId') || 'anonymous';
}

/**
 * 헬퍼 함수: 컨텍스트에서 세션 ID 가져오기
 */
export function getSessionIdFromContext(c: Context): string {
  return c.get('sessionId') || 'anonymous';
}

/**
 * 헬퍼 함수: 인증 상태 확인
 */
export function isAuthenticatedFromContext(c: Context): boolean {
  return c.get('isAuthenticated') || false;
} 
