// 서비스 레이어 상수 정의

export const STORAGE_KEYS = {
  SESSION_TOKEN: 'session_token',
  USER_API_KEY: 'user_api_key'
} as const;

export const API_ENDPOINTS = {
  AUTH_STATUS: '/api/auth-status',
  LOGIN: '/api/login',
  SET_API_KEY: '/api/set-api-key',
  MODELS: '/api/models',
  SET_MODEL: '/api/set-model',
  ROLES: '/api/roles',
  SET_ROLE: '/api/set-role',
  CHAT: '/api/chat',
  CONTEXT: '/api/context'
} as const;

export const DEFAULT_VALUES = {
  CONTEXT_SIZE: 128000,
  ROLE_NAME: 'whoami',
  ROLE_DESCRIPTION: 'Please authenticate to select a role',
  MODEL_NAME: 'whoami'
} as const;

export const COMMANDS = {
  LOGIN_PREFIX: '/login ',
  SET_API_KEY_PREFIX: '/set-api-key '
} as const;

export const MESSAGE_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error'
} as const;

export const AUTH_METHODS = {
  SERVER: 'server',
  API_KEY: 'api-key'
} as const; 
