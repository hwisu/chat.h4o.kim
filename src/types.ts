export interface Env {
  BRAVE_SEARCH_API_KEY: string;
  OPENROUTER_API_KEY: string;
  ACCESS_PASSWORD?: string;
  JWT_SECRET?: string;
  ASSETS: Fetcher;
  DB: D1Database;
}

// OpenRouter API Types based on official documentation
export interface Architecture {
  input_modalities: string[];
  output_modalities: string[];
  tokenizer: string;
  instruct_type?: string;
  modality?: string;
}

export interface Pricing {
  prompt: string;
  completion: string;
  image?: string;
  request?: string;
  input_cache_read?: string;
  input_cache_write?: string;
  web_search?: string;
  internal_reasoning?: string;
}

export interface TopProvider {
  context_length?: number;
  max_completion_tokens?: number;
  is_moderated?: boolean;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  created?: number;
  description?: string;
  architecture: Architecture;
  top_provider?: TopProvider;
  pricing: Pricing;
  context_length: number;
  hugging_face_id?: string;
  per_request_limits?: Record<string, any>;
  supported_parameters?: string[];
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

// Chat completion types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface Choice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: any[];
  };
  finish_reason: string | null;
  native_finish_reason?: string | null;
  error?: any;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Choice[];
  created: number;
  model: string;
  object: string;
  usage?: Usage;
  system_fingerprint?: string;
}

// =============================================================================
// API Request/Response Types - 클라이언트와 서버 간 공통 타입
// =============================================================================

// 기본 API 응답 형식 - 모든 엔드포인트에서 사용하는 표준 형식
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// 인증 관련
export interface LoginRequest extends Record<string, unknown> {
  password: string;
}

export interface LoginResponseData {
  login_success: boolean;
  login_failed?: boolean;
  session_token?: string;
  response: string;
}

export interface AuthStatusData {
  authenticated: boolean;
  method?: 'server' | 'api-key';
  contextUsage?: string;
}

// API 키 관련
export interface SetApiKeyRequest extends Record<string, unknown> {
  apiKey: string;
}

export interface SetApiKeyResponseData {
  message: string;
  response: string;
}

// 모델 관련
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context_length?: number;
  selected?: boolean;
  supportsTools?: boolean;
}



// 역할 관련
export interface RoleInfo {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  selected?: boolean;
}



// 채팅 관련
export interface ChatResponseData {
  response: string;
  model: string;
  usage?: Usage;
  role: string;
  currentModel: string;
  tokensUsed?: number;
  messageCount?: number;
}

// 컨텍스트 관련
export interface ContextData {
  context: {
    id: string;
    messageCount: number;
    summary?: string;
    tokenUsage: number;
    lastUpdated: string;
  };
}



export interface HelpResponseData {
  message: string;
}
