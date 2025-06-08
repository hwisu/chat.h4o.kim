import { StatusCode } from 'hono/utils/http-status';

// HTTP Error Status Codes - Using Hono's StatusCode type
export const ErrorStatus = {
  BAD_REQUEST: 400 as StatusCode,
  UNAUTHORIZED: 401 as StatusCode,
  FORBIDDEN: 403 as StatusCode,
  NOT_FOUND: 404 as StatusCode,
  CONFLICT: 409 as StatusCode,
  UNPROCESSABLE_ENTITY: 422 as StatusCode,
  INTERNAL_ERROR: 500 as StatusCode,
  BAD_GATEWAY: 502 as StatusCode,
  SERVICE_UNAVAILABLE: 503 as StatusCode
} as const;

// HTTP Success Status Codes
export const SuccessStatus = {
  OK: 200 as StatusCode,
  CREATED: 201 as StatusCode,
  NO_CONTENT: 204 as StatusCode
} as const;

export type ErrorStatusCode = typeof ErrorStatus[keyof typeof ErrorStatus];
export type SuccessStatusCode = typeof SuccessStatus[keyof typeof SuccessStatus];

// Legacy HttpStatus for backwards compatibility
export const HttpStatus = {
  ...SuccessStatus,
  ...ErrorStatus
} as const;

// Chat Configuration Constants
export const CHAT_CONFIG = {
  // Default model parameters
  DEFAULT_TEMPERATURE: 0.7,
  DEFAULT_MAX_TOKENS: 1500,
  DEFAULT_TOP_P: 0.9,
  DEFAULT_FREQUENCY_PENALTY: 0.1,
  DEFAULT_PRESENCE_PENALTY: 0.1,
  
  // Validation limits
  MIN_TEMPERATURE: 0.0,
  MAX_TEMPERATURE: 2.0,
  MIN_MAX_TOKENS: 1,
  MAX_MAX_TOKENS: 8000,
  MIN_TOP_P: 0.0,
  MAX_TOP_P: 1.0,
  MIN_PENALTY: -2.0,
  MAX_PENALTY: 2.0,
  
  // Message constraints
  MAX_MESSAGE_LENGTH: 50000, // 50KB max message size
  MAX_CONTEXT_MESSAGES: 100, // Maximum messages to keep in context
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 60000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 60 // 60 requests per minute
} as const;

// Model Configuration Constants
export const MODEL_CONFIG = {
  API_KEY_PREFIX: 'sk-or-v1-',
  MIN_API_KEY_LENGTH: 64,
  
  // Model filtering
  MIN_FREE_MODEL_SIZE_B: 8, // Minimum 8B parameters for free models
  CONTEXT_SIZE_FALLBACK: 4000, // Default context size when unknown
  
  // Cache settings
  MODEL_CACHE_TTL_MS: 300000, // 5 minutes
  
  // Auto-selection priorities
  FREE_MODEL_PRIORITIES: [
    'meta/llama',
    'google/gemini',
    'deepseek',
    'google/gemma'
  ],
  PREMIUM_MODEL_PRIORITIES: [
    'anthropic/claude',
    'openai/gpt-4',
    'meta/llama',
    'google/gemini',
    'deepseek',
    'google/gemma'
  ]
} as const;

// API Configuration
export const API_CONFIG = {
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  REQUEST_TIMEOUT_MS: 30000, // 30 seconds
  CACHE_DURATION: 300000, // 5 minutes
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000
} as const;

// Enhanced Authentication Configuration
export const AuthConfig = {
  JWT_ISSUER: 'https://chat.h4o.kim',
  JWT_EXPIRY_HOURS: 24,
  JWT_ALGORITHM: 'HS256' as const,
  NONCE_BYTES_LENGTH: 16,
  COOKIE_MAX_AGE: 86400, // 24 hours
  SESSION_TIMEOUT_MS: 86400000, // 24 hours
  
  // Security settings
  MIN_PASSWORD_LENGTH: 8,
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_LOCKOUT_DURATION_MS: 900000, // 15 minutes
  
  // Token settings
  MIN_JWT_SECRET_LENGTH: 32,
  TOKEN_REFRESH_THRESHOLD_MS: 3600000, // 1 hour before expiry
} as const;

// Enhanced Security Configuration
export const SecurityConfig = {
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 900000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  
  // API key validation
  API_KEY_ENTROPY_THRESHOLD: 10,
  API_KEY_BLACKLIST_PATTERNS: ['test', 'example', 'dummy', 'placeholder'],
  
  // Headers
  SECURITY_HEADERS: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  
  // Content Security Policy
  CSP_DIRECTIVES: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://openrouter.ai https://api.search.brave.com",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ]
} as const;

// Response Messages - Functions for dynamic content
export const RESPONSE_MESSAGES = {
  // Authentication messages
  INVALID_API_KEY: 'Invalid API key format',
  PASSWORD_REQUIRED: 'Password is required',
  API_KEY_SET_SUCCESS: 'API key set successfully and validated',
  API_KEY_VALIDATED: 'API key validated successfully',
  LOGIN_SUCCESS: `🎉 Welcome back! Login successful

🤖 **Chatty H4O Assistant Ready**

**Available Commands:**
• \`/help\` - Show detailed help message

**Interface Options:**
• Click **Model** button to select AI models
• Click **Role** button to change AI personality
• Header displays current context usage

**Features:**
• 🧠 Automatic context summarization
• 🔄 Smart model selection
• 💾 Persistent conversation history
• 🎭 Multiple AI personalities

**Tips:**
• Use the interface buttons for model and role selection
• Context is automatically managed for optimal performance

Type your message to start chatting! 🚀`,
  LOGOUT_SUCCESS: '👋 Logout successful. See you next time!',
  
  // Model messages
  MODELS_FETCH_FAILED: 'Failed to fetch models',
  MODEL_SET_SUCCESS: 'Model set successfully',
  MODEL_AUTO_SET_SUCCESS: 'Auto-selection enabled',
  INVALID_MODEL: (modelId: string) => `Invalid model: ${modelId}`,
  
  // Role messages
  ROLE_SET_SUCCESS: (roleName: string) => `Role set to: ${roleName}`,
  INVALID_ROLE: (roleId: string) => `Invalid role: ${roleId}`,
  
  // Chat messages
  MESSAGE_REQUIRED: 'Message content is required',
  MESSAGE_TOO_LONG: (maxLength: number) => `Message too long. Maximum ${maxLength} characters allowed`,
  CHAT_REQUEST_FAILED: 'Chat request failed',
  PARAMETER_OUT_OF_RANGE: (param: string, min: number, max: number) => 
    `Parameter ${param} must be between ${min} and ${max}`,
  
  // General messages
  CONTEXT_CLEARED: 'Context cleared successfully',
  INTERNAL_ERROR: 'Internal server error occurred',
  VALIDATION_ERROR: (field: string) => `Validation failed for field: ${field}`,
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please try again later',
  
  // Service unavailable
  SERVICE_TEMPORARILY_UNAVAILABLE: 'Service temporarily unavailable'
} as const;

// Legacy aliases for backward compatibility
export const ResponseMessage = RESPONSE_MESSAGES; 
