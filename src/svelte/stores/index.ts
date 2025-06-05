// 모든 스토어들을 한 곳에서 내보내기
export * from './auth.svelte';
export type { AuthState } from './auth.svelte';
export * from './models.svelte';
export * from './messages.svelte';
export * from './ui.svelte';

// 기존 코드와의 호환성을 위한 별칭 (runes 기반)
export { authState, authState as authStore } from './auth.svelte';
export { modelsState as modelsStore } from './models.svelte';
export { messagesState as messagesStore } from './messages.svelte';
export { uiState as uiStore } from './ui.svelte';

// 역할과 컨텍스트 스토어 (Svelte 5 runes 사용)
export interface RoleInfo {
  name: string;
  description: string;
}

export interface RoleState {
  available: any[];
  selected: string | null;
  selectedInfo: RoleInfo;
  isLoading: boolean;
}

export interface ContextState {
  usage: string;
  maxSize: number;
  currentSize: number;
  percentage: number;
  lastTokenUsage: any | null;
}

// Svelte 5 runes 사용
export const rolesState = $state<RoleState>({
  available: [],
  selected: null,
  selectedInfo: {
    name: '🤖 General Assistant',
    description: 'General purpose AI assistant'
  },
  isLoading: false
});

export const contextState = $state<ContextState>({
  usage: '--',
  maxSize: 128000,
  currentSize: 0,
  percentage: 0,
  lastTokenUsage: null
});

// 기존 호환성을 위한 별칭
export const rolesStore = rolesState;
export const contextStore = contextState;

// 헬퍼 함수들
export function updateRoles(rolesData: Partial<RoleState>) {
  Object.assign(rolesState, rolesData);
}

export function updateContext(contextData: Partial<ContextState>) {
  Object.assign(contextState, contextData);
} 
