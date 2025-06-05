// API Client for server communication
// 서버 API 엔드포인트와 통신하는 클라이언트

class ApiClient {
  constructor() {
    this.userApiKey = null;
    this.sessionToken = null;
    // 초기화 시 저장된 인증 정보 복원
    this.restoreAuth();
  }

  // 인증 헤더 준비
  prepareHeaders(additionalHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...additionalHeaders
    };

    if (this.userApiKey) {
      headers['X-User-API-Key'] = this.userApiKey;
    }

    if (this.sessionToken) {
      headers['X-Session-Token'] = this.sessionToken;
    }

    // 디버깅용 로그
    console.log('API Headers:', {
      hasUserApiKey: !!this.userApiKey,
      hasSessionToken: !!this.sessionToken,
      sessionToken: this.sessionToken ? 'exists' : 'missing'
    });

    return headers;
  }

  // 일반적인 API 요청 메서드
  async request(endpoint, options = {}) {
    const { method = 'GET', body = null, headers = {} } = options;

    const requestOptions = {
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
      throw error;
    }
  }

  // 인증 상태 확인
  async checkAuthStatus() {
    const { response, ok, status } = await this.request('/api/auth-status');
    
    if (ok) {
      const data = await response.json();
      return { success: true, data };
    } else {
      return { success: false, status };
    }
  }

  // 서버 로그인
  async login(password) {
    const { response, ok, status } = await this.request('/api/login', {
      method: 'POST',
      body: { password }
    });

    if (ok) {
      const data = await response.json();
      if (data.login_success && data.session_token) {
        this.sessionToken = data.session_token;
        sessionStorage.setItem('session_token', data.session_token);
        
        // 디버깅용 로그
        console.log('Login success - token saved:', {
          token: data.session_token ? 'received' : 'missing',
          stored: sessionStorage.getItem('session_token') ? 'stored' : 'not stored'
        });
        
        return { success: true, data: { ...data, success: true, message: data.response } };
      } else if (data.login_failed) {
        return { success: false, error: data.response || 'Login failed', status };
      }
      return { success: false, error: 'Unknown login response', status };
    } else {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${status}` }));
      return { success: false, error: errorData.response || errorData.error || `HTTP ${status}`, status };
    }
  }

  // API 키 설정
  async setApiKey(apiKey) {
    const { response, ok, status } = await this.request('/api/set-api-key', {
      method: 'POST',
      body: { apiKey }
    });

    if (ok) {
      const data = await response.json();
      if (data.success) {
        this.userApiKey = apiKey;
        // 로컬 저장 (암호화는 별도 구현)
        localStorage.setItem('user_api_key', apiKey);
      }
      return { success: true, data };
    } else {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${status}` }));
      return { success: false, error: errorData.error || `HTTP ${status}`, status };
    }
  }

  // 모델 목록 가져오기
  async getModels() {
    const { response, ok, status } = await this.request('/api/models');

    if (status === 401) {
      return { success: false, error: 'Authentication required', status: 401 };
    }

    if (ok) {
      const data = await response.json();
      return { success: true, models: data.models };
    } else {
      return { success: false, error: `HTTP ${status}`, status };
    }
  }

  // 모델 설정
  async setModel(modelId) {
    const { response, ok, status } = await this.request('/api/set-model', {
      method: 'POST',
      body: { model: modelId }
    });

    if (ok) {
      const data = await response.json();
      return { success: data.success, data };
    } else {
      return { success: false, error: `HTTP ${status}`, status };
    }
  }

  // 역할 목록 가져오기
  async getRoles() {
    const { response, ok, status } = await this.request('/api/roles');

    if (status === 401) {
      return { success: false, error: 'Authentication required', status: 401 };
    }

    if (ok) {
      const data = await response.json();
      return { success: true, roles: data.roles };
    } else {
      return { success: false, error: `HTTP ${status}`, status };
    }
  }

  // 역할 설정
  async setRole(roleId) {
    const { response, ok, status } = await this.request('/api/set-role', {
      method: 'POST',
      body: { role: roleId }
    });

    if (ok) {
      const data = await response.json();
      return { success: data.success, data };
    } else {
      return { success: false, error: `HTTP ${status}`, status };
    }
  }

  // 채팅 메시지 전송
  async sendMessage(messageContent) {
    const { response, ok, status } = await this.request('/api/chat', {
      method: 'POST',
      body: { message: messageContent }
    });

    if (status === 401) {
      return { success: false, error: 'Authentication required', status: 401 };
    }

    if (ok) {
      const data = await response.json();
      return { success: true, data };
    } else {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: `HTTP ${status}` };
      }
      return { success: false, error: errorData.response || errorData.error || `HTTP ${status}`, status };
    }
  }

  // 컨텍스트 정보 가져오기
  async getContextInfo() {
    const { response, ok, status } = await this.request('/api/context');

    if (ok) {
      const data = await response.json();
      return { success: true, data };
    } else {
      return { success: false, error: `HTTP ${status}`, status };
    }
  }

  // 로컬 스토리지에서 인증 정보 복원
  restoreAuth() {
    this.sessionToken = sessionStorage.getItem('session_token');
    this.userApiKey = localStorage.getItem('user_api_key');
    
    // 디버깅용 로그
    console.log('Auth restored:', {
      sessionToken: this.sessionToken ? 'restored' : 'not found',
      userApiKey: this.userApiKey ? 'restored' : 'not found'
    });
  }

  // 로그아웃
  logout() {
    this.sessionToken = null;
    this.userApiKey = null;
    sessionStorage.removeItem('session_token');
    localStorage.removeItem('user_api_key');
  }
}

// 전역 API 클라이언트 인스턴스
export const apiClient = new ApiClient(); 
