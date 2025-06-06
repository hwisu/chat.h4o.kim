import { Context } from 'hono';
import { HTTP_STATUS } from './constants';

// Standard API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  [key: string]: any; // Allow additional properties for backward compatibility
}

// Success Response Helper
export function successResponse<T>(c: Context, data?: T, message?: string, additionalProps?: Record<string, any>) {
  const response: ApiResponse<T> = {
    success: true,
    ...(data !== undefined && { data }),
    ...(message && { message }),
    ...additionalProps
  };
  return c.json(response);
}

// Error Response Helper
export function errorResponse(c: Context, message: string, statusCode: number = HTTP_STATUS.INTERNAL_ERROR, additionalProps?: Record<string, any>) {
  const response: ApiResponse = {
    success: false,
    error: message,
    ...additionalProps
  };
  return c.json(response, statusCode as any);
}

// Async Error Handler Wrapper
export function asyncHandler(fn: (c: Context) => Promise<Response>) {
  return async (c: Context) => {
    try {
      return await fn(c);
    } catch (error) {
      console.error('Route error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return errorResponse(c, message, HTTP_STATUS.INTERNAL_ERROR);
    }
  };
}

// Request Body Parser with Validation
export async function parseJsonBody<T>(c: Context, requiredFields?: (keyof T)[]): Promise<T> {
  try {
    const body = await c.req.json() as T;
    
    if (requiredFields) {
      for (const field of requiredFields) {
        if (body[field] === undefined || body[field] === null) {
          throw new Error(`Missing required field: ${String(field)}`);
        }
      }
    }
    
    return body;
  } catch (error) {
    throw new Error('Invalid request format');
  }
}

// Cookie Helper
export function setCookie(c: Context, name: string, value: string, maxAge?: number) {
  const cookieValue = maxAge === 0 
    ? `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`
    : `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge || 86400}; HttpOnly; SameSite=Strict`;
  
  c.header('Set-Cookie', cookieValue);
}

// Get Cookie Helper
export function getCookieValue(c: Context, name: string): string | null {
  const cookies = c.req.header('Cookie');
  if (!cookies?.includes(`${name}=`)) {
    return null;
  }
  return decodeURIComponent(cookies.split(`${name}=`)[1]?.split(';')[0] || '');
}

// Timeout Handler for Fetch Requests
export async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number }) {
  const { timeout = 3000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
} 
