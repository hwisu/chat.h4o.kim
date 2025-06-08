import { MODEL_CONFIG } from '../routes/constants';

/**
 * Enhanced API key validation service
 */

export interface ApiKeyValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Comprehensive API key validation
 */
export function validateApiKey(apiKey: string): ApiKeyValidationResult {
  const result: ApiKeyValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  // Basic format validation
  if (!apiKey || typeof apiKey !== 'string') {
    result.errors.push('API key is required');
    result.isValid = false;
    return result;
  }

  // Trim whitespace
  apiKey = apiKey.trim();

  // Check prefix
  if (!apiKey.startsWith(MODEL_CONFIG.API_KEY_PREFIX)) {
    result.errors.push(`API key must start with ${MODEL_CONFIG.API_KEY_PREFIX}`);
    result.isValid = false;
  }

  // Check length
  if (apiKey.length < MODEL_CONFIG.MIN_API_KEY_LENGTH) {
    result.errors.push(`API key must be at least ${MODEL_CONFIG.MIN_API_KEY_LENGTH} characters long`);
    result.isValid = false;
  }

  // Check for suspicious patterns
  if (apiKey.includes('test') || apiKey.includes('example') || apiKey.includes('dummy')) {
    result.warnings.push('API key appears to be a test/example key');
  }

  // Check entropy (basic)
  const uniqueChars = new Set(apiKey).size;
  if (uniqueChars < 10) {
    result.warnings.push('API key has low entropy');
  }

  return result;
}

/**
 * Validate environment configuration
 */
export function validateEnvironmentConfig(env: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required variables
  const required = ['OPENROUTER_API_KEY', 'JWT_SECRET', 'BRAVE_SEARCH_API_KEY'];
  for (const key of required) {
    if (!env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // Validate JWT secret strength
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long');
  }

  // Validate API keys
  if (env.OPENROUTER_API_KEY) {
    const validation = validateApiKey(env.OPENROUTER_API_KEY);
    if (!validation.isValid) {
      errors.push(`Invalid OPENROUTER_API_KEY: ${validation.errors.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
} 
