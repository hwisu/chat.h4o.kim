// API Response Constants
export const RESPONSE_MESSAGES = {
  // Auth
  LOGIN_SUCCESS: '✅ Login successful',
  LOGIN_FAILED: '❌ Invalid password',
  INVALID_REQUEST_FORMAT: '❌ Invalid request format',
  API_KEY_SET_SUCCESS: '✅ API key set successfully',
  API_KEY_VALIDATED: 'API key has been validated and stored locally',
  
  // Models
  MODEL_SET_SUCCESS: (model: string) => `✅ Model set to: ${model}`,
  MODEL_AUTO_SET_SUCCESS: '✅ Model set to auto-select (Korean optimized)',
  INVALID_API_KEY: 'Invalid API key. Please check your OpenRouter API key.',
  MODELS_FETCH_FAILED: 'Failed to fetch models',
  
  // Roles
  ROLE_SET_SUCCESS: (roleName: string) => `Role set to: ${roleName}`,
  INVALID_ROLE: (roleId: string) => `Invalid role: ${roleId}`,
  ROLE_REQUIRED: 'Role ID is required',
  
  // Context
  CONTEXT_CLEARED: 'Context cleared successfully',
  CONTEXT_FETCH_FAILED: 'Failed to retrieve context',
  CONTEXT_CLEAR_FAILED: 'Failed to clear context',
  CONTEXT_STATS_FAILED: 'Failed to get context stats',
  
  // Chat
  MESSAGE_REQUIRED: 'Message is required',
  CHAT_ERROR: 'An error occurred during chat processing',
  HELP_FAILED: 'Failed to get help message',
  
  // General
  UNAUTHORIZED: 'Unauthorized access',
  INTERNAL_ERROR: 'Internal server error'
} as const;

// API Configuration
export const API_CONFIG = {
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  REQUEST_TIMEOUT: 3000, // 3 seconds
  COOKIE_MAX_AGE: 86400, // 24 hours
} as const;

// Model Configuration
export const MODEL_CONFIG = {
  DEFAULT_MODEL: 'meta-llama/llama-3.1-8b-instruct:free',
  AUTO_SELECT: 'auto',
  API_KEY_PREFIX: 'sk-or-v1-',
  MIN_API_KEY_LENGTH: 20,
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  TIMEOUT: 408,
  INTERNAL_ERROR: 500,
} as const; 
