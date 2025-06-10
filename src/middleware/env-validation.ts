import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

/**
 * Environment validation middleware
 * Ensures all required environment variables are present
 */
export async function validateEnvironment(c: Context, next: Next): Promise<void> {
  const requiredEnvVars = [
    'OPENROUTER_API_KEY',
    'JWT_SECRET',
    'BRAVE_SEARCH_API_KEY'
  ];

  const missingVars = requiredEnvVars.filter(envVar => !c.env[envVar]);

  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars);
    throw new HTTPException(500, {
      message: 'Server configuration error: Missing required environment variables'
    });
  }

  // Validate JWT_SECRET strength
  const jwtSecret = c.env.JWT_SECRET;
  if (jwtSecret.length < 32) {
    throw new HTTPException(500, {
      message: 'Server configuration error: JWT_SECRET must be at least 32 characters'
    });
  }

  // Validate API key formats
  const openRouterKey = c.env.OPENROUTER_API_KEY;
  if (!openRouterKey.startsWith('sk-or-v1-')) {
    throw new HTTPException(500, {
      message: 'Server configuration error: Invalid OpenRouter API key format'
    });
  }

  await next();
}

/**
 * Generate a secure JWT secret
 * Run this function to generate a new secret for production
 */
export function generateSecureJWTSecret(): string {
  // Generate 32 bytes (256 bits) of random data
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...randomBytes));
}
