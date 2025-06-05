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

  function handleBackdropClick(event) {
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

  function handleKeydown(event) {
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
        <label class="auth-method-option">
          <input 
            type="radio" 
            bind:group={authMethod} 
            value="server"
          />
          <span class="auth-method-label">
            🔐 Server Login
            <small>Authenticate with server password</small>
          </span>
        </label>

        <label class="auth-method-option">
          <input 
            type="radio" 
            bind:group={authMethod} 
            value="api-key"
          />
          <span class="auth-method-label">
            🔑 Personal API Key
            <small>Use your own OpenRouter API key</small>
          </span>
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
    gap: 15px;
    margin-bottom: 25px;
  }

  .auth-method-option {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
    padding: 15px;
    border: 1px solid #333;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .auth-method-option:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: #555;
  }

  .auth-method-option input[type="radio"] {
    margin-top: 2px;
  }

  .auth-method-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .auth-method-label small {
    color: #888;
    font-size: 12px;
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
    border-color: #00ff00;
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
    color: #00ff00;
    text-decoration: none;
  }

  .api-key-help a:hover {
    text-decoration: underline;
  }

  .auth-submit-btn {
    background: #00ff00;
    color: #000;
    border: none;
    border-radius: 4px;
    padding: 12px 20px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .auth-submit-btn:hover:not(:disabled) {
    background: #00dd00;
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
