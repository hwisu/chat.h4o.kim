import { Context } from 'hono';
import { HttpStatus, ErrorStatus, ErrorStatusCode } from './constants';

// Standard API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Success Response Helper with improved type safety
export function successResponse<T>(
  c: Context, 
  data?: T, 
  message?: string
): Response {
  const response: ApiResponse<T> = {
    success: true,
    ...(data !== undefined && { data }),
    ...(message && { message })
  };
  return c.json(response);
}

// Error Response Helper with proper Hono StatusCode typing
export function errorResponse(
  c: Context, 
  message: string, 
  statusCode: ErrorStatusCode = ErrorStatus.INTERNAL_ERROR, 
  data?: unknown
): Response {
  const response: ApiResponse = {
    success: false,
    error: message,
    ...(data !== undefined && data !== null && { data })
  };
  
  c.status(statusCode);
  return c.json(response);
}

// Async Error Handler Wrapper with improved error handling
export function asyncHandler(
  fn: (c: Context) => Promise<Response>
): (c: Context) => Promise<Response> {
  return async (c: Context): Promise<Response> => {
    try {
      return await fn(c);
    } catch (error) {
      console.error('Route error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return errorResponse(c, message, ErrorStatus.INTERNAL_ERROR);
    }
  };
}

// Request Body Parser with improved type safety
export async function parseJsonBody<T extends Record<string, unknown>>(
  c: Context, 
  requiredFields?: Array<keyof T>
): Promise<T> {
  try {
    const body = await c.req.json() as T;
    
    if (requiredFields?.length) {
      const missingFields = requiredFields.filter(
        field => body[field] === undefined || body[field] === null
      );
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }
    }
    
    return body;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request format';
    throw new Error(message);
  }
}

// Cookie helper functions with improved type safety
export function getCookieValue(c: Context, name: string): string | undefined {
  const cookie = c.req.header('Cookie');
  
  if (!cookie) return undefined;
  
  const match = cookie
    .split(';')
    .find(cookie => cookie.trim().startsWith(`${name}=`));
    
  return match?.split('=')[1]?.trim();
}

export function setCookie(
  c: Context, 
  name: string, 
  value: string, 
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  } = {}
): void {
  const { maxAge = 86400, httpOnly = true, secure = true, sameSite = 'Strict' } = options;
  
  const cookieString = [
    `${name}=${value}`,
    `Max-Age=${maxAge}`,
    `Path=/`,
    httpOnly && 'HttpOnly',
    secure && 'Secure',
    `SameSite=${sameSite}`
  ].filter(Boolean).join('; ');
  
  c.header('Set-Cookie', cookieString);
}

// Request timeout helper for external API calls
interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number;
}

export async function fetchWithTimeout(
  url: string, 
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = 3000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
} 
