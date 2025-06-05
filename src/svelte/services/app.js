// App initialization service
// 앱 시작 시 필요한 초기화 로직들

import { apiClient } from './api.js';
import { updateAuth } from '../stores/auth.svelte.ts';
import { updateModels } from '../stores/models.svelte.ts';
import { updateRoles } from '../stores/roles.svelte.ts';
import { updateContext } from '../stores/context.svelte.ts';
import { setLoading, setError } from '../stores/ui.svelte.ts';

// 앱 초기화 메인 함수
export async function initializeApp() {
  try {
    setLoading(true);
    
    // 1. 로컬 저장된 인증 정보 복원
    apiClient.restoreAuth();
    
    // 2. 서버 인증 상태 확인
    await checkAuthenticationStatus();
    
    // 3. 인증된 경우 모델/역할/컨텍스트 정보 로드
    const authStatus = await apiClient.checkAuthStatus();
    if (authStatus.success && authStatus.data.authenticated) {
      await Promise.all([
        loadModels(),
        loadRoles(),
        loadContextInfo()
      ]);
    }
    
    // 4. 시스템 메시지 표시
    showWelcomeMessage();
    
    // 5. 앱 초기화 완료
    console.log('✅ App initialization completed');
    
  } catch (error) {
    console.error('App initialization failed:', error);
    setError('Failed to initialize app: ' + error.message);
  } finally {
    setLoading(false);
  }
}

// 인증 상태 확인
export async function checkAuthenticationStatus() {
  try {
    const result = await apiClient.checkAuthStatus();
    
    if (result.success) {
      const { authenticated, method, contextUsage } = result.data;
      
      updateAuth({
        isAuthenticated: authenticated,
        status: authenticated ? 'Authenticated' : 'Authentication required',
        method: method || null
      });
      
      if (contextUsage) {
        updateContext({ usage: contextUsage });
      }
      
      return authenticated;
    } else {
      updateAuth({
        isAuthenticated: false,
        status: 'Authentication required',
        method: null
      });
      return false;
    }
  } catch (error) {
    console.error('Auth status check failed:', error);
    updateAuth({
      isAuthenticated: false,
      status: 'Connection error',
      method: null
    });
    return false;
  }
}

// 모델 목록 로드
export async function loadModels() {
  try {
    updateModels({ isLoading: true });
    
    const result = await apiClient.getModels();
    
    if (result.success) {
      updateModels({
        available: result.models,
        isLoading: false
      });
      
      // 선택된 모델 정보 업데이트
      const selectedModel = result.models.find(m => m.selected) || result.models[0];
      if (selectedModel) {
        updateModels({
          selected: selectedModel.id,
          selectedInfo: {
            name: selectedModel.name,
            provider: selectedModel.provider,
            contextSize: selectedModel.context_length || 128000
          }
        });
      }
    } else {
      console.error('Failed to load models:', result.error);
      updateModels({ isLoading: false });
    }
  } catch (error) {
    console.error('Error loading models:', error);
    updateModels({ isLoading: false });
  }
}

// 역할 목록 로드
export async function loadRoles() {
  try {
    updateRoles({ isLoading: true });
    
    const result = await apiClient.getRoles();
    
    if (result.success) {
      updateRoles({
        available: result.roles,
        isLoading: false
      });
      
      // 선택된 역할 정보 업데이트
      const selectedRole = result.roles.find(r => r.selected) || result.roles[0];
      if (selectedRole) {
        updateRoles({
          selected: selectedRole.id,
          selectedInfo: {
            name: selectedRole.name,
            description: selectedRole.description || ''
          }
        });
      }
    } else {
      console.error('Failed to load roles:', result.error);
      updateRoles({ isLoading: false });
    }
  } catch (error) {
    console.error('Error loading roles:', error);
    updateRoles({ isLoading: false });
  }
}

// 컨텍스트 정보 로드
export async function loadContextInfo() {
  try {
    const result = await apiClient.getContextInfo();
    
    if (result.success) {
      const { usage, maxSize, currentSize } = result.data;
      updateContext({
        usage,
        maxSize: maxSize || 128000,
        currentSize: currentSize || 0,
        percentage: currentSize && maxSize ? (currentSize / maxSize * 100) : 0
      });
    }
  } catch (error) {
    console.error('Error loading context info:', error);
  }
}

// 환영 메시지 표시
function showWelcomeMessage() {
  // 시스템 메시지는 ChatArea 컴포넌트에서 처리
  const welcomeMessage = {
    role: 'system',
    content: getWelcomeMessage(),
    timestamp: new Date()
  };
  
  // 메시지 스토어에는 추가하지 않고, UI에서 별도로 표시
}

// 환영 메시지 생성
function getWelcomeMessage() {
  const currentTime = new Date().toLocaleString();
  
  return `[SYSTEM] ${currentTime}

🌟 Choose access method:

🔐 Server Login: /login <password>
🔑 Personal Key: /set-api-key <key>

💡 Choose ONE option`;
}

// 사용자 로그인
export async function loginUser(password) {
  try {
    setLoading(true);
    
    const result = await apiClient.login(password);
    
    if (result.success) {
      updateAuth({
        isAuthenticated: true,
        status: 'Authenticated via server',
        method: 'server',
        sessionToken: result.data.token
      });
      
      // 로그인 성공 후 데이터 로드
      await Promise.all([
        loadModels(),
        loadRoles(),
        loadContextInfo()
      ]);
      
      return { success: true };
    } else {
      setError(result.error || 'Login failed');
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('Login error:', error);
    setError('Login failed: ' + error.message);
    return { success: false, error: error.message };
  } finally {
    setLoading(false);
  }
}

// API 키 설정
export async function setUserApiKey(apiKey) {
  try {
    setLoading(true);
    
    const result = await apiClient.setApiKey(apiKey);
    
    if (result.success) {
      updateAuth({
        isAuthenticated: true,
        status: 'Authenticated via API key',
        method: 'api-key',
        userApiKey: apiKey
      });
      
      // API 키 설정 성공 후 데이터 로드
      await Promise.all([
        loadModels(),
        loadRoles(),
        loadContextInfo()
      ]);
      
      return { success: true };
    } else {
      setError(result.error || 'API key validation failed');
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('API key setup error:', error);
    setError('API key setup failed: ' + error.message);
    return { success: false, error: error.message };
  } finally {
    setLoading(false);
  }
}

// 로그아웃
export function logout() {
  apiClient.logout();
  
  updateAuth({
    isAuthenticated: false,
    status: 'Authentication required',
    method: null,
    userApiKey: null,
    sessionToken: null
  });
  
  updateModels({
    available: [],
    selected: null,
    selectedInfo: {
      name: 'whoami',
      provider: '',
      contextSize: 128000
    }
  });
  
  updateRoles({
    available: [],
    selected: null,
    selectedInfo: {
      name: '🤖 General Assistant',
      description: 'General purpose AI assistant'
    }
  });
} 
