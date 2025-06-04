export interface Env {
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
