// Svelte 5 runes는 전역적으로 사용 가능

export interface AuthState {
  isAuthenticated: boolean;
  status: string;
  method: 'server' | 'api-key' | null;
  userApiKey: string | null;
  sessionToken: string | null;
}

const initialAuthState: AuthState = {
  isAuthenticated: false,
  status: 'Authentication required',
  method: null,
  userApiKey: null,
  sessionToken: null
};

// Svelte 5 runes 사용
export const authState = $state<AuthState>({ ...initialAuthState });

// 인증 관련 헬퍼 함수들
export function updateAuth(authData: Partial<AuthState>) {
  Object.assign(authState, authData);
}

export function resetAuth() {
  Object.assign(authState, initialAuthState);
}

export function setAuthenticated(isAuthenticated: boolean, method?: 'server' | 'api-key') {
  authState.isAuthenticated = isAuthenticated;
  authState.method = method || authState.method;
  authState.status = isAuthenticated ? 'Authenticated' : 'Authentication required';
} 
