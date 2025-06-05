import { writable } from 'svelte/store';

// 인증 스토어
export const authStore = writable({
  isAuthenticated: false,
  status: 'Authentication required',
  method: null, // 'server' or 'api-key'
  userApiKey: null,
  sessionToken: null
});

// 모델 스토어
export const modelsStore = writable({
  available: [],
  selected: null,
  selectedInfo: {
    name: 'whoami',
    provider: '',
    contextSize: 128000
  },
  isLoading: false
});

// 역할 스토어
export const rolesStore = writable({
  available: [],
  selected: null,
  selectedInfo: {
    name: '🤖 General Assistant',
    description: 'General purpose AI assistant'
  },
  isLoading: false
});

// 메시지 스토어
export const messagesStore = writable([]);

// 컨텍스트 스토어
export const contextStore = writable({
  usage: '--',
  maxSize: 128000,
  currentSize: 0,
  percentage: 0,
  lastTokenUsage: null
});

// UI 상태 스토어
export const uiStore = writable({
  isLoading: false,
  currentView: 'chat', // 'chat', 'settings', etc.
  error: null,
  showSystemMessage: true
});

// 앱 상태 스토어
export const appStore = writable({
  isInitialized: false,
  version: '1.0.0',
  lastUpdate: null
});

// 스토어 업데이트 헬퍼 함수들
export function updateAuth(authData) {
  authStore.update(current => ({
    ...current,
    ...authData
  }));
}

export function updateModels(modelsData) {
  modelsStore.update(current => ({
    ...current,
    ...modelsData
  }));
}

export function updateRoles(rolesData) {
  rolesStore.update(current => ({
    ...current,
    ...rolesData
  }));
}

export function addMessage(message) {
  messagesStore.update(messages => [...messages, message]);
}

export function clearMessages() {
  messagesStore.set([]);
}

export function updateContext(contextData) {
  contextStore.update(current => ({
    ...current,
    ...contextData
  }));
}

export function setError(error) {
  uiStore.update(current => ({
    ...current,
    error
  }));
}

export function clearError() {
  uiStore.update(current => ({
    ...current,
    error: null
  }));
}

export function setLoading(isLoading) {
  uiStore.update(current => ({
    ...current,
    isLoading
  }));
} 
