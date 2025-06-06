/**
 * API 클라이언트 - 서버와의 HTTP 통신을 담당
 */

import type { 
  ServiceApiResponse, 
  AuthInfo, 
  ModelInfo, 
  RoleInfo, 
  ChatResponse, 
  LoginResponse, 
  AuthStatusResponse,
  ModelsResponse,
  RolesResponse,
  SetApiKeyResponse,
  ContextResponse
} from './types';
import { STORAGE_KEYS, API_ENDPOINTS } from './constants';
import { createApiResponse, extractErrorMessage } from './utils';

export class ApiClient {
  private authInfo: AuthInfo = {
    userApiKey: null,
    sessionToken: null
  };

  constructor() {
    this.restoreAuth();
  }

  /**
   * 인증 헤더 준비
   */
  private prepareHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...additionalHeaders
    };

    if (this.authInfo.userApiKey) {
      headers['X-User-API-Key'] = this.authInfo.userApiKey;
    }

    if (this.authInfo.sessionToken) {
      headers['X-Session-Token'] = this.authInfo.sessionToken;
    }

    return headers;
  }

  /**
   * 일반적인 HTTP 요청
   */
  private async makeRequest(
    endpoint: string, 
    options: {
      method?: string;
      body?: any;
      headers?: Record<string, string>;
    } = {}
  ): Promise<{ response: Response; ok: boolean; status: number }> {
    const { method = 'GET', body = null, headers = {} } = options;

    const requestOptions: RequestInit = {
      method,
      headers: this.prepareHeaders(headers)
    };

    if (body && method !== 'GET') {
      requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    try {
      const response = await fetch(endpoint, requestOptions);
      return { response, ok: response.ok, status: response.status };
    } catch (error) {
      throw new Error(`Network error: ${extractErrorMessage(error)}`);
    }
  }

  /**
   * 응답 처리 유틸리티
   */
  private async handleResponse<T>(
    response: Response,
    ok: boolean,
    status: number
  ): Promise<ServiceApiResponse<T>> {
    if (ok) {
      try {
        const data = await response.json() as T;
        return createApiResponse<T>(true, data);
      } catch (error) {
        return createApiResponse<T>(false, undefined, 'Invalid JSON response', status);
      }
    } else {
      try {
        const errorData = await response.json() as any;
        return createApiResponse<T>(false, undefined, errorData.response || errorData.error || `HTTP ${status}`, status);
      } catch {
        return createApiResponse<T>(false, undefined, `HTTP ${status}`, status);
      }
    }
  }

  /**
   * 인증 상태 확인
   */
  async checkAuthStatus(): Promise<ServiceApiResponse<AuthStatusResponse>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.AUTH_STATUS);
    return this.handleResponse<AuthStatusResponse>(response, ok, status);
  }

  /**
   * 서버 로그인
   */
  async login(password: string): Promise<ServiceApiResponse<LoginResponse & { success: boolean; message: string }>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.LOGIN, {
      method: 'POST',
      body: { password }
    });

    if (ok) {
      const data = await response.json() as LoginResponse;
      if (data.login_success && data.session_token) {
        this.authInfo.sessionToken = data.session_token;
        sessionStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, data.session_token);
        
        return createApiResponse(true, { 
          ...data, 
          success: true, 
          message: data.response || 'Login successful' 
        });
      } else if (data.login_failed) {
        return createApiResponse<LoginResponse & { success: boolean; message: string }>(false, undefined, data.response || 'Login failed', status);
      }
      return createApiResponse<LoginResponse & { success: boolean; message: string }>(false, undefined, 'Unknown login response', status);
    } else {
      return this.handleResponse<LoginResponse & { success: boolean; message: string }>(response, ok, status);
    }
  }

  /**
   * API 키 설정
   */
  async setApiKey(apiKey: string): Promise<ServiceApiResponse<{ success: boolean }>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.SET_API_KEY, {
      method: 'POST',
      body: { apiKey }
    });

    if (ok) {
      const data = await response.json() as { success: boolean };
      if (data.success) {
        this.authInfo.userApiKey = apiKey;
        localStorage.setItem(STORAGE_KEYS.USER_API_KEY, apiKey);
      }
      return createApiResponse<{ success: boolean }>(true, data);
    } else {
      return this.handleResponse<{ success: boolean }>(response, ok, status);
    }
  }

  /**
   * 모델 목록 가져오기
   */
  async getModels(): Promise<ServiceApiResponse<{ models: ModelInfo[] }>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.MODELS);
    
    if (status === 401) {
      return createApiResponse<{ models: ModelInfo[] }>(false, undefined, 'Authentication required', 401);
    }

    return this.handleResponse<{ models: ModelInfo[] }>(response, ok, status);
  }

  /**
   * 모델 설정
   */
  async setModel(modelId: string): Promise<ServiceApiResponse<{ success: boolean }>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.SET_MODEL, {
      method: 'POST',
      body: { model: modelId }
    });

    return this.handleResponse<{ success: boolean }>(response, ok, status);
  }

  /**
   * 역할 목록 가져오기
   */
  async getRoles(): Promise<ServiceApiResponse<{ roles: RoleInfo[] }>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.ROLES);
    
    if (status === 401) {
      return createApiResponse<{ roles: RoleInfo[] }>(false, undefined, 'Authentication required', 401);
    }

    return this.handleResponse<{ roles: RoleInfo[] }>(response, ok, status);
  }

  /**
   * 역할 설정
   */
  async setRole(roleId: string): Promise<ServiceApiResponse<{ success: boolean }>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.SET_ROLE, {
      method: 'POST',
      body: { role: roleId }
    });

    return this.handleResponse<{ success: boolean }>(response, ok, status);
  }

  /**
   * 채팅 메시지 전송
   */
  async sendMessage(messageContent: string): Promise<ServiceApiResponse<ChatResponse>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.CHAT, {
      method: 'POST',
      body: { message: messageContent }
    });

    if (status === 401) {
      return createApiResponse<ChatResponse>(false, undefined, 'Authentication required', 401);
    }

    return this.handleResponse<ChatResponse>(response, ok, status);
  }

  /**
   * 컨텍스트 정보 가져오기
   */
  async getContextInfo(): Promise<ServiceApiResponse<{ usage?: string; maxSize?: number; currentSize?: number }>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.CONTEXT);
    return this.handleResponse(response, ok, status);
  }

  /**
   * 로컬 스토리지에서 인증 정보 복원
   */
  restoreAuth(): void {
    this.authInfo.sessionToken = sessionStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
    this.authInfo.userApiKey = localStorage.getItem(STORAGE_KEYS.USER_API_KEY);
  }

  /**
   * 로그아웃
   */
  logout(): void {
    this.authInfo.sessionToken = null;
    this.authInfo.userApiKey = null;
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_API_KEY);
  }

  /**
   * 현재 인증 정보 반환
   */
  getAuthInfo(): Readonly<AuthInfo> {
    return { ...this.authInfo };
  }
}

// 싱글톤 인스턴스
export const apiClient = new ApiClient(); 
