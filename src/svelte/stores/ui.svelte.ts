// Svelte 5 runes는 전역적으로 사용 가능

export interface UIState {
  isLoading: boolean;
  currentView: string;
  error: string | null;
  showSystemMessage: boolean;
}

const initialUIState: UIState = {
  isLoading: false,
  currentView: 'chat',
  error: null,
  showSystemMessage: true
};

// Svelte 5 runes 사용
export const uiState = $state<UIState>({ ...initialUIState });

// UI 관련 헬퍼 함수들
export function setError(error: string | null) {
  uiState.error = error;
}

export function clearError() {
  uiState.error = null;
}

export function setLoading(isLoading: boolean) {
  uiState.isLoading = isLoading;
}

export function setCurrentView(view: string) {
  uiState.currentView = view;
}

export function toggleSystemMessage() {
  uiState.showSystemMessage = !uiState.showSystemMessage;
} 
