import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { checkAuthenticationOrUserKey, extractUserIdFromJWT } from '../services/auth';

/**
 * Authentication middleware - handles all auth logic in one place
 */
export async function authRequired(c: Context, next: Next): Promise<void> {
  const sessionToken = c.req.header('X-Session-Token');
  const userApiKey = c.req.header('X-User-API-Key');
  const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';
  
  const isAuthenticated = await checkAuthenticationOrUserKey(sessionToken, userApiKey, jwtSecret);
  
  if (!isAuthenticated) {
    throw new HTTPException(401, { 
      message: 'Authentication required. Please login first or provide a valid API key.' 
    });
  }
  
  // Store auth info in context for use in handlers
  c.set('userApiKey', userApiKey);
  c.set('sessionToken', sessionToken);
  c.set('userId', await extractUserIdFromJWT(sessionToken, jwtSecret));
  
  await next();
}

/**
 * Optional authentication middleware (passes through without authentication but sets context)
 */
export async function optionalAuth(c: Context, next: Next): Promise<void> {
  const sessionToken = c.req.header('X-Session-Token');
  const userApiKey = c.req.header('X-User-API-Key');
  const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';
  
  const isAuthenticated = await checkAuthenticationOrUserKey(sessionToken, userApiKey, jwtSecret);
  
  if (isAuthenticated) {
    const userId = await extractUserIdFromJWT(sessionToken, jwtSecret);
    c.set('userId', userId);
    c.set('isAuthenticated', true);
    c.set('sessionToken', sessionToken);
    c.set('userApiKey', userApiKey);
    c.set('jwtSecret', jwtSecret);
  } else {
    c.set('isAuthenticated', false);
  }
  
  await next();
}

/**
 * Get authenticated user ID from context
 */
export function getUserIdFromContext(c: Context): string {
  return c.get('userId') || 'anonymous';
}



/**
 * Helper function: Check authentication status
 */
export function isAuthenticatedFromContext(c: Context): boolean {
  return c.get('isAuthenticated') || false;
}

/**
 * Get auth information from context
 */
export function getAuthFromContext(c: Context): {
  userApiKey?: string;
  sessionToken?: string;
  userId: string;
} {
  return {
    userApiKey: c.get('userApiKey'),
    sessionToken: c.get('sessionToken'),
    userId: c.get('userId') || 'anonymous'
  };
} 
