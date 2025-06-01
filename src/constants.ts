// Models that are known to be good with Korean and multilingual support
export const KOREAN_FRIENDLY_MODELS = [
  'gemma',
  'llama',
  'claude',
  'google',
  'meta',
];

// Providers that do NOT train on user data (safe to use)
export const SAFE_PROVIDERS = [
  'anthropic', 'openai', 'meta', 'meta-llama', 'mistral', 'cohere',
  'fireworks', 'together', 'deepinfra', 'groq', 'baseten', 'cerebras',
  'nvidia'
];
