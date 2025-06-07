/**
 * API 클라이언트 - 서버와의 HTTP 통신을 담당
 */

import type { 
  ServiceApiResponse, 
  AuthInfo, 
  ModelInfo, 
  RoleInfo, 
  ChatResponseData, 
  LoginResponseData, 
  AuthStatusData,
  ModelsResponseData,
  RolesResponseData,
  SetApiKeyResponseData,
  ContextData,
  ApiResponse
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
        const serverResponse = await response.json() as ApiResponse<T>;
        
        // 서버가 표준 ApiResponse 구조로 응답하는 경우
        if (serverResponse.success !== undefined) {
          if (serverResponse.success && serverResponse.data) {
            return createApiResponse<T>(true, serverResponse.data, serverResponse.message);
          } else {
            return createApiResponse<T>(false, undefined, serverResponse.error || 'Request failed', status);
          }
        } else {
          // 레거시 응답인 경우 래핑
          return createApiResponse<T>(true, serverResponse as T);
        }
      } catch (error) {
        return createApiResponse<T>(false, undefined, 'Invalid JSON response', status);
      }
    } else {
      try {
        const errorData = await response.json() as ApiResponse<any>;
        return createApiResponse<T>(
          false, 
          undefined, 
          errorData.error || errorData.data?.response || `HTTP ${status}`, 
          status
        );
      } catch {
        return createApiResponse<T>(false, undefined, `HTTP ${status}`, status);
      }
    }
  }

  /**
   * 인증 상태 확인
   */
  async checkAuthStatus(): Promise<ServiceApiResponse<AuthStatusData>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.AUTH_STATUS);
    return this.handleResponse<AuthStatusData>(response, ok, status);
  }

  /**
   * 서버 로그인
   */
  async login(password: string): Promise<ServiceApiResponse<LoginResponseData & { success: boolean; message: string }>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.LOGIN, {
      method: 'POST',
      body: { password }
    });

    if (ok) {
      const serverResponse = await response.json() as ApiResponse<LoginResponseData>;
      
      // 서버가 성공 응답을 보낸 경우
      if (serverResponse.success && serverResponse.data) {
        const loginData = serverResponse.data;
        
        
        if (loginData.login_success && loginData.session_token) {
          this.authInfo.sessionToken = loginData.session_token;
          sessionStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, loginData.session_token);
          
          return createApiResponse(true, { 
            ...loginData, 
            success: true, 
            message: serverResponse.message || loginData.response || 'Login successful' 
          });
        }
      }
      
      // 서버가 실패 응답을 보낸 경우 (success: false)
      if (!serverResponse.success) {
        const errorData = serverResponse.data as any;
        return createApiResponse<LoginResponseData & { success: boolean; message: string }>(
          false, 
          undefined, 
          serverResponse.error || errorData?.response || 'Login failed', 
          status
        );
      }
      
      // 예상하지 못한 응답 구조
      return createApiResponse<LoginResponseData & { success: boolean; message: string }>(
        false, 
        undefined, 
        'Unknown login response format', 
        status
      );
    } else {
      return this.handleResponse<LoginResponseData & { success: boolean; message: string }>(response, ok, status);
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
      const serverResponse = await response.json() as ApiResponse<SetApiKeyResponseData>;
      
      if (serverResponse.success) {
        this.authInfo.userApiKey = apiKey;
        localStorage.setItem(STORAGE_KEYS.USER_API_KEY, apiKey);
        
        return createApiResponse<{ success: boolean }>(true, { success: true });
      } else {
        return createApiResponse<{ success: boolean }>(false, undefined, serverResponse.error || 'API key setting failed', status);
      }
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
  async sendMessage(messageContent: string): Promise<ServiceApiResponse<ChatResponseData>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.CHAT, {
      method: 'POST',
      body: { message: messageContent }
    });

    if (status === 401) {
      return createApiResponse<ChatResponseData>(false, undefined, 'Authentication required', 401);
    }

    if (ok) {
      try {
        const serverResponse = await response.json() as ApiResponse<ChatResponseData>;
        // Extract the actual chat data from the server response
        if (serverResponse.success && serverResponse.data) {
          return createApiResponse<ChatResponseData>(true, serverResponse.data);
        } else {
          return createApiResponse<ChatResponseData>(false, undefined, serverResponse.error || 'Chat request failed', status);
        }
      } catch (error) {
        return createApiResponse<ChatResponseData>(false, undefined, 'Invalid JSON response', status);
      }
    } else {
      return this.handleResponse<ChatResponseData>(response, ok, status);
    }
  }

  /**
   * 컨텍스트 정보 가져오기
   */
  async getContextInfo(): Promise<ServiceApiResponse<{ usage?: string; maxSize?: number; currentSize?: number }>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.CONTEXT);
    return this.handleResponse(response, ok, status);
  }

  /**
   * 도움말 메시지 가져오기
   */
  async getHelp(): Promise<ServiceApiResponse<{ message: string }>> {
    const { response, ok, status } = await this.makeRequest(API_ENDPOINTS.HELP);
    return this.handleResponse(response, ok, status);
  }

  /**
   * 로컬 스토리지에서 인증 정보 복원
   */
  restoreAuth(): void {
    const sessionToken = sessionStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
    const userApiKey = localStorage.getItem(STORAGE_KEYS.USER_API_KEY);
    

    
    this.authInfo.sessionToken = sessionToken;
    this.authInfo.userApiKey = userApiKey;
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
