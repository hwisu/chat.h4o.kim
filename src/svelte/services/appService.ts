/**
 * 앱 초기화 및 주요 기능 관리 서비스
 */

import { updateAuth } from '../stores/auth.svelte';
import { updateContext } from '../stores/context.svelte';
import { updateModels } from '../stores/models.svelte';
import { updateRoles } from '../stores/roles.svelte';
import { clearError, setError, setLoading } from '../stores/ui.svelte';
import { apiClient } from './apiClient';
import {
    AUTH_METHODS,
    DEFAULT_VALUES
} from './constants';
import type { ModelInfo, RoleInfo, ServiceApiResponse } from './types';
import {
    calculateContextPercentage,
    createDefaultModelInfo,
    createDefaultRoleInfo,
    ensureArray,
    extractErrorMessage,
    getWelcomeMessage,
    isNonEmptyArray
} from './utils';

export class AppService {
  /**
   * 앱 초기화
   */
  async initialize(): Promise<void> {
    try {
      setLoading(true);
      clearError();
      
      // 1. 로컬 저장된 인증 정보 복원
      apiClient.restoreAuth();
      
      // 2. 서버 인증 상태 확인 (한 번만)
      const isAuthenticated = await this.checkAuthenticationStatus();
      
      // 3. 인증된 경우 필요한 데이터 로드
      if (isAuthenticated) {
        await this.loadAllData();
      }
      
      // 4. 시스템 메시지 표시
      this.showWelcomeMessage();
    } catch (error) {
      console.error('[AppService] App initialization failed:', error);
      setError(`Failed to initialize app: ${extractErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  /**
   * 모든 필요한 데이터 로드
   */
  async loadAllData(): Promise<void> {
    await Promise.all([
      this.loadModels(),
      this.loadRoles(),
      this.loadContextInfo()
    ]);
  }

  /**
   * 인증 상태 확인
   */
  async checkAuthenticationStatus(): Promise<boolean> {
    try {
      const result = await apiClient.checkAuthStatus();
      
      if (result.success && result.data) {
        const { authenticated, method, contextUsage } = result.data;
        
        updateAuth({
          isAuthenticated: authenticated,
          status: authenticated ? 'Authenticated' : 'Authentication required',
          method: (method === AUTH_METHODS.SERVER || method === AUTH_METHODS.API_KEY) ? method : null
        });
        
        if (contextUsage) {
          updateContext({ usage: contextUsage });
        }
        
        return authenticated;
      } else {
        this.setUnauthenticatedState();
        return false;
      }
    } catch (error) {
      console.error('[AppService] Auth status check failed:', error);
      this.setUnauthenticatedState('Connection error');
      return false;
    }
  }

  /**
   * 미인증 상태로 설정
   */
  private setUnauthenticatedState(status: string = 'Authentication required'): void {
    updateAuth({
      isAuthenticated: false,
      status,
      method: null
    });
  }

  /**
   * 모델 목록 로드
   */
  async loadModels(): Promise<void> {
    try {
      updateModels({ isLoading: true });
      
      const result = await apiClient.getModels();
      
      if (result.success && result.data && result.data.models) {
        // 배열이 유효한지 확인
        const models = ensureArray<ModelInfo>(result.data.models);
        updateModels({
          available: models,
          isLoading: false
        });
        
        this.updateSelectedModel(models);
      } else {
        console.error('Failed to load models:', result?.error || 'Unknown error');
        updateModels({ 
          available: [],
          isLoading: false 
        });
      }
    } catch (error) {
      console.error('Error loading models:', error);
      updateModels({ 
        available: [],
        isLoading: false 
      });
    }
  }

  /**
   * 선택된 모델 정보 업데이트
   */
  private updateSelectedModel(models: ModelInfo[]): void {
    if (!isNonEmptyArray(models)) {
      
      return;
    }
    
    const selectedModel = models.find(m => m.selected) || models[0];
    if (selectedModel) {
      updateModels({
        selected: selectedModel.id,
        selectedInfo: {
          name: selectedModel.name,
          provider: selectedModel.provider,
          contextSize: selectedModel.context_length || DEFAULT_VALUES.CONTEXT_SIZE
        }
      });
    }
  }

  /**
   * 역할 목록 로드
   */
  async loadRoles(): Promise<void> {
    try {
      updateRoles({ isLoading: true });
      
      const result = await apiClient.getRoles();
      
      if (result.success && result.data && result.data.roles) {
        // 배열이 유효한지 확인
        const roles = ensureArray<RoleInfo>(result.data.roles);
        updateRoles({
          available: roles,
          isLoading: false
        });
        
        this.updateSelectedRole(roles);
      } else {
        console.error('Failed to load roles:', result?.error || 'Unknown error');
        updateRoles({ 
          available: [],
          isLoading: false 
        });
      }
    } catch (error) {
      console.error('Error loading roles:', error);
      updateRoles({ 
        available: [],
        isLoading: false 
      });
    }
  }

  /**
   * 선택된 역할 정보 업데이트
   */
  private updateSelectedRole(roles: RoleInfo[]): void {
    if (!isNonEmptyArray(roles)) {
      
      return;
    }
    
    const selectedRole = roles.find(r => r.selected) || roles[0];
    if (selectedRole) {
      updateRoles({
        selected: selectedRole.id,
        selectedInfo: {
          name: selectedRole.name,
          description: selectedRole.description || ''
        }
      });
    }
  }

  /**
   * 컨텍스트 정보 로드
   */
  async loadContextInfo(): Promise<void> {
    try {
      const result = await apiClient.getContextInfo();
      
      if (result.success && result.data) {
        const { usage, maxSize, currentSize } = result.data;
        updateContext({
          usage,
          maxSize: maxSize || DEFAULT_VALUES.CONTEXT_SIZE,
          currentSize: currentSize || 0,
          percentage: calculateContextPercentage(currentSize || 0, maxSize || DEFAULT_VALUES.CONTEXT_SIZE)
        });
      }
    } catch (error) {
      console.error('Error loading context info:', error);
    }
  }

  /**
   * 환영 메시지 표시
   */
  private showWelcomeMessage(): void {
    // 시스템 메시지는 ChatArea 컴포넌트에서 처리
    // 여기서는 메시지 생성만 담당
  }

  /**
   * 사용자 로그인
   */
  async login(password: string): Promise<ServiceApiResponse<any>> {
    try {
      console.log('[AppService] Login attempt starting...');
      setLoading(true);
      
      const result = await apiClient.login(password);
      
      if (result.success) {
        console.log('[AppService] Login successful, updating auth state...');
        updateAuth({
          isAuthenticated: true,
          status: 'Authenticated via server',
          method: AUTH_METHODS.SERVER,
          sessionToken: result.data?.session_token
        });
        
        console.log('[AppService] Auth state updated, loading data...');
        // 로그인 성공 후 데이터 로드
        await this.loadAllData();
        
        console.log('[AppService] Login completed successfully');
        // 서버에서 온 메시지를 그대로 전달
        return { 
          success: true, 
          data: {
            ...result.data,
            message: result.data?.message || 'Login successful'
          }
        };
      } else {
        console.log('[AppService] Login failed:', result.error);
        setError(result.error || 'Login failed');
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      console.error('[AppService] Login error:', error);
      setError(`Login failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }

  /**
   * API 키 설정
   */
  async setApiKey(apiKey: string): Promise<ServiceApiResponse<any>> {
    try {
      setLoading(true);
      
      const result = await apiClient.setApiKey(apiKey);
      
      if (result.success) {
        updateAuth({
          isAuthenticated: true,
          status: 'Authenticated via API key',
          method: AUTH_METHODS.API_KEY,
          userApiKey: apiKey
        });
        
        // API 키 설정 성공 후 데이터 로드
        await this.loadAllData();
        
        return { success: true };
      } else {
        setError(result.error || 'API key validation failed');
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      console.error('API key setup error:', error);
      setError(`API key setup failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }

  /**
   * 로그아웃
   */
  logout(): void {
    apiClient.logout();
    
    updateAuth({
      isAuthenticated: false,
      status: 'Authentication required',
      method: null,
      userApiKey: null,
      sessionToken: null
    });
    
    // 기본 상태로 리셋
    updateModels({
      available: [],
      selected: null,
      selectedInfo: createDefaultModelInfo()
    });
    
    updateRoles({
      available: [],
      selected: null,
      selectedInfo: createDefaultRoleInfo()
    });

    clearError();
  }

  /**
   * 환영 메시지 가져오기
   */
  getWelcomeMessage(): string {
    return getWelcomeMessage();
  }
}

// 싱글톤 인스턴스
export const appService = new AppService();

// 기존 호환성을 위한 함수 exports
export const initializeApp = () => appService.initialize();
export const checkAuthenticationStatus = () => appService.checkAuthenticationStatus();
export const loadAllData = () => appService.loadAllData();
export const loadModels = () => appService.loadModels();
export const loadRoles = () => appService.loadRoles();
export const loadContextInfo = () => appService.loadContextInfo();
export const loginUser = (password: string) => appService.login(password);
export const setUserApiKey = (apiKey: string) => appService.setApiKey(apiKey);
export const logout = () => appService.logout(); 
