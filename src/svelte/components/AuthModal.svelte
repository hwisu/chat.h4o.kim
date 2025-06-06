<script lang="ts">
  import { loginUser, setUserApiKey } from '../services/app.js';
  import { setError, clearError } from '../stores/ui.svelte';

  // Svelte 5 props 시스템 사용
  let { onClose, onSuccess } = $props();

  let authMethod = $state('server'); // 'server' or 'api-key'
  let password = $state('');
  let apiKey = $state('');
  let isLoading = $state(false);
  let error = $state('');

  function close() {
    onClose?.();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

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

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
    } else if (event.key === 'Enter') {
      if (authMethod === 'server') {
        handleServerLogin();
      } else {
        handleApiKeyAuth();
      }
    }
  }
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
  <div class="auth-modal-content">
    <div class="auth-modal-header">
      <h3 id="auth-modal-title">🔐 Choose Authentication Method</h3>
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
            <div class="auth-method-title">
              🔐 Server Login
            </div>
            <div class="auth-method-description">
              Authenticate with server password
            </div>
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
            <div class="auth-method-title">
              🔑 Personal API Key
            </div>
            <div class="auth-method-description">
              Use your own OpenRouter API key
            </div>
          </div>
        </label>
      </div>

      <!-- 서버 로그인 폼 -->
      {#if authMethod === 'server'}
        <div class="auth-form">
          <label for="password">Server Password:</label>
          <input 
            id="password"
            type="password" 
            bind:value={password}
            placeholder="Enter server password"
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
          <label for="api-key">OpenRouter API Key:</label>
          <input 
            id="api-key"
            type="password" 
            bind:value={apiKey}
            placeholder="sk-or-v1-..."
            disabled={isLoading}
          />
          <small class="api-key-help">
            Get your API key from <a href="https://openrouter.ai/settings/keys" target="_blank">OpenRouter</a>
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
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  .auth-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #333;
  }

  .auth-modal-header h3 {
    margin: 0;
    font-size: 18px;
    color: #eee;
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
    padding: 20px;
  }

  .auth-method-selector {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 25px;
  }

  .auth-method-option {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    cursor: pointer;
    padding: 16px;
    border: 2px solid #333;
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
    gap: 15px;
  }

  .auth-form label {
    font-weight: 500;
    color: #ddd;
  }

  .auth-form input {
    background: #222;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 12px;
    color: #eee;
    font-size: 14px;
    transition: border-color 0.2s;
  }

  .auth-form input:focus {
    outline: none;
    border-color: #4CAF50;
  }

  .auth-form input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .api-key-help {
    color: #888;
    font-size: 12px;
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
    border-radius: 6px;
    padding: 12px 20px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
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
    border-radius: 4px;
    padding: 12px;
    color: #ff6b6b;
    font-size: 14px;
    margin-top: 15px;
  }
</style> 
