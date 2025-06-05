// Svelte 5 runes는 전역적으로 사용 가능

export interface ContextState {
  usage: string;
  maxSize: number;
  currentSize: number;
  percentage: number;
  lastTokenUsage: any | null;
}

const initialContextState: ContextState = {
  usage: '--',
  maxSize: 128000,
  currentSize: 0,
  percentage: 0,
  lastTokenUsage: null
};

// Svelte 5 runes 사용
export const contextState = $state<ContextState>({ ...initialContextState });

// 컨텍스트 관련 헬퍼 함수들
export function updateContext(contextData: Partial<ContextState>) {
  Object.assign(contextState, contextData);
}

export function setContextUsage(usage: string) {
  contextState.usage = usage;
}

export function setContextSize(currentSize: number, maxSize?: number) {
  contextState.currentSize = currentSize;
  if (maxSize) {
    contextState.maxSize = maxSize;
  }
  contextState.percentage = maxSize ? (currentSize / maxSize * 100) : 0;
}

export function setTokenUsage(tokenUsage: any) {
  contextState.lastTokenUsage = tokenUsage;
}

// 기존 호환성을 위한 별칭
export const contextStore = contextState; 
