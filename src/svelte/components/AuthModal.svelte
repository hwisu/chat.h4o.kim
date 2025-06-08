<script lang="ts">
  import { loginUser, setUserApiKey } from '../services/appService';
  import { clearError } from '../stores/ui.svelte';
  import { createModalHandlers } from '../utils/modalUtils';

  // Svelte 5 props 시스템 사용
  let { onClose, onSuccess } = $props();

  let authMethod = $state('server'); // 'server' or 'api-key'
  let password = $state('');
  let apiKey = $state('');
  let isLoading = $state(false);
  let error = $state('');

  // 모달 공통 핸들러 생성
  const modalHandlers = createModalHandlers(
    { onClose },
    (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        if (authMethod === 'server') {
          handleServerLogin();
        } else {
          handleApiKeyAuth();
        }
      }
    }
  );
  
  const { close, handleBackdropClick, handleKeydown } = modalHandlers;

  async function handleServerLogin() {
    if (!password.trim()) {
      error = 'Please enter password';
      return;
    }

    isLoading = true;
    error = '';
    clearError();

    const result = await loginUser(password);

    if (result.success) {
      onSuccess?.({ method: 'server' });
    } else {
      error = result.error || 'Login failed';
    }

    isLoading = false;
  }

  async function handleApiKeyAuth() {
    if (!apiKey.trim()) {
      error = 'Please enter API key';
      return;
    }

    if (!apiKey.startsWith('sk-or-v1-')) {
      error = 'Invalid API key format. Must start with sk-or-v1-';
      return;
    }

    isLoading = true;
    error = '';
    clearError();

    const result = await setUserApiKey(apiKey);

    if (result.success) {
      onSuccess?.({ method: 'api-key' });
    } else {
      error = result.error || 'API key validation failed';
    }

    isLoading = false;
  }

  // handleKeydown은 modalHandlers에서 처리됨
</script>

<svelte:window onkeydown={handleKeydown} />

<div 
  class="auth-modal-backdrop" 
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="auth-modal-title"
  tabindex="0"
>
  <div class="auth-modal-content {error ? 'error-state' : ''}">
    <div class="auth-modal-header">
      <h3 id="auth-modal-title">Authentication</h3>
      <button class="auth-modal-close" onclick={close} aria-label="Close">&times;</button>
    </div>

    <div class="auth-modal-body">
      <!-- 인증 방법 선택 -->
      <div class="auth-method-selector">
        <label class="auth-method-option {authMethod === 'server' ? 'selected' : ''}">
          <input 
            type="radio" 
            bind:group={authMethod} 
            value="server"
            class="auth-radio-input"
          />
          <div class="auth-radio-custom"></div>
          <div class="auth-method-content">
            <div class="auth-method-title">Server Login</div>
            <div class="auth-method-description">Authenticate with password</div>
          </div>
        </label>

        <label class="auth-method-option {authMethod === 'api-key' ? 'selected' : ''}">
          <input 
            type="radio" 
            bind:group={authMethod} 
            value="api-key"
            class="auth-radio-input"
          />
          <div class="auth-radio-custom"></div>
          <div class="auth-method-content">
            <div class="auth-method-title">Personal API Key</div>
            <div class="auth-method-description">Use your OpenRouter API key</div>
          </div>
        </label>
      </div>

      <!-- 서버 로그인 폼 -->
      {#if authMethod === 'server'}
        <div class="auth-form">
          <label for="password">Password:</label>
          <input 
            id="password"
            type="password" 
            bind:value={password}
            placeholder="Enter password"
            disabled={isLoading}
          />
          <button 
            class="auth-submit-btn"
            onclick={handleServerLogin}
            disabled={isLoading || !password.trim()}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </div>
      {/if}

      <!-- API 키 입력 폼 -->
      {#if authMethod === 'api-key'}
        <div class="auth-form">
          <label for="api-key">API Key:</label>
          <input 
            id="api-key"
            type="password" 
            bind:value={apiKey}
            placeholder="sk-or-v1-..."
            disabled={isLoading}
          />
          <small class="api-key-help">
            Get your key from <a href="https://openrouter.ai/settings/keys" target="_blank">OpenRouter</a>
          </small>
          <button 
            class="auth-submit-btn"
            onclick={handleApiKeyAuth}
            disabled={isLoading || !apiKey.trim()}
          >
            {isLoading ? 'Validating...' : 'Set API Key'}
          </button>
        </div>
      {/if}

      <!-- 에러 메시지 -->
      {#if error}
        <div class="auth-error">
          {error}
        </div>
      {/if}

    </div>
  </div>
</div>

<style>
  .auth-modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .auth-modal-content {
    background: #111;
    border: 1px solid #333;
    border-radius: 12px;
    width: 90%;
    max-width: 420px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    transition: all 0.3s ease;
  }

  .auth-modal-content.error-state {
    border-color: #ff4444;
    box-shadow: 0 8px 32px rgba(255, 68, 68, 0.2);
  }

  .auth-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px 24px 20px 24px;
    border-bottom: 1px solid #333;
  }

  .auth-modal-header h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #fff;
  }

  .auth-modal-close {
    background: none;
    border: none;
    color: #888;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .auth-modal-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .auth-modal-body {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .auth-method-selector {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .auth-method-option {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    cursor: pointer;
    padding: 16px;
    border: 1px solid #333;
    border-radius: 8px;
    transition: all 0.2s;
    background: rgba(255, 255, 255, 0.02);
  }

  .auth-method-option:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: #555;
  }

  .auth-method-option.selected {
    border-color: #4CAF50;
    background: rgba(76, 175, 80, 0.08);
  }

  /* 기본 라디오 버튼 숨기기 */
  .auth-radio-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  /* 커스텀 라디오 버튼 */
  .auth-radio-custom {
    position: relative;
    width: 20px;
    height: 20px;
    border: 2px solid #555;
    border-radius: 50%;
    background: #222;
    transition: all 0.2s;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .auth-method-option:hover .auth-radio-custom {
    border-color: #777;
  }

  .auth-method-option.selected .auth-radio-custom {
    border-color: #4CAF50;
    background: #4CAF50;
  }

  .auth-method-option.selected .auth-radio-custom::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 8px;
    height: 8px;
    background: #111;
    border-radius: 50%;
  }

  .auth-method-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .auth-method-title {
    font-size: 16px;
    font-weight: 500;
    color: #eee;
    line-height: 1.3;
  }

  .auth-method-description {
    font-size: 13px;
    color: #aaa;
    line-height: 1.4;
  }

  .auth-method-option.selected .auth-method-title {
    color: #fff;
  }

  .auth-method-option.selected .auth-method-description {
    color: #ccc;
  }

  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .auth-form label {
    font-weight: 500;
    color: #ddd;
  }

  .auth-form input {
    background: #1a1a1a;
    border: 1px solid #404040;
    border-radius: 8px;
    padding: 12px 16px;
    color: #fff;
    font-size: 14px;
    transition: all 0.2s;
  }

  .auth-form input:focus {
    outline: none;
    border-color: #4CAF50;
    background: #0f0f0f;
    box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.1);
  }

  .auth-form input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .api-key-help {
    color: #888;
    font-size: 12px;
    margin-top: -8px;
  }

  .api-key-help a {
    color: #4CAF50;
    text-decoration: none;
  }

  .api-key-help a:hover {
    text-decoration: underline;
  }

  .auth-submit-btn {
    background: #4CAF50;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 14px 20px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 8px;
  }

  .auth-submit-btn:hover:not(:disabled) {
    background: #45a049;
  }

  .auth-submit-btn:disabled {
    background: #444;
    color: #888;
    cursor: not-allowed;
  }

  .auth-error {
    background: rgba(255, 68, 68, 0.1);
    border: 1px solid rgba(255, 68, 68, 0.3);
    border-radius: 8px;
    padding: 12px 16px;
    color: #ff6b6b;
    font-size: 14px;
    font-weight: 500;
  }
</style> 
