<script lang="ts">
  import { messagesStore, uiStore } from '../stores.js';
  import { apiClient } from '../services/api.js';
  import { addMessage, setError } from '../stores.js';
  import { initializeApp } from '../services/app.js';

  // Svelte 5 props 시스템 사용
  let { onScrollToBottom } = $props();

  let message = $state('');
  let textareaRef: HTMLTextAreaElement = $state();

  async function send() {
    const content = message.trim();
    if (!content || $uiStore.isLoading) return;

    try {
      // 사용자 메시지 추가
      addMessage({
        role: 'user',
        content: content,
        timestamp: Date.now()
      });

      // UI 상태 업데이트
      uiStore.update(state => ({ ...state, isLoading: true }));
      
      // 입력 초기화
      message = '';
      adjustTextareaHeight();

      // 스크롤 바닥으로
      onScrollToBottom?.();

      // 로그인 명령어 처리
      if (content.startsWith('/login ')) {
        const password = content.substring(7).trim();
        const result = await apiClient.login(password);
        
        if (result.success) {
          // 성공 메시지 추가
          addMessage({
            role: 'system',
            content: result.data.message || 'Login successful',
            timestamp: Date.now(),
            type: 'success'
          });
          
          // 인증 상태 업데이트
          await initializeApp();
        } else {
          // 에러 메시지 추가  
          addMessage({
            role: 'system',
            content: result.error || 'Login failed',
            timestamp: Date.now(),
            type: 'error'
          });
        }
      } else {
        // 일반 채팅 메시지 처리
        const result = await apiClient.sendMessage(content);

        if (result.success && result.data) {
          // AI 응답 추가
          if (result.data.response) {
            console.log('Token usage from API:', result.data.usage);
            addMessage({
              role: 'assistant',
              content: result.data.response,
              timestamp: Date.now(),
              model: result.data.model,
              tokenUsage: result.data.usage || {}
            });
          }
        } else {
          // 에러 메시지를 시스템 메시지로 추가
          addMessage({
            role: 'system',
            content: result.error || 'Failed to send message',
            timestamp: Date.now(),
            type: 'error'
          });
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // 에러 메시지를 시스템 메시지로 추가
      addMessage({
        role: 'system',
        content: 'Failed to send message: ' + error.message,
        timestamp: Date.now(),
        type: 'error'
      });
    } finally {
      uiStore.update(state => ({ ...state, isLoading: false }));
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleInput() {
    adjustTextareaHeight();
  }

  function adjustTextareaHeight() {
    if (!textareaRef) return;
    
    textareaRef.style.height = 'auto';
    const newHeight = Math.min(textareaRef.scrollHeight, 120);
    textareaRef.style.height = `${newHeight}px`;
  }

  // 메시지가 변경될 때 높이 조정
  $effect(() => {
    if (message !== undefined && textareaRef) {
      adjustTextareaHeight();
    }
  });
</script>

<div class="chat-input-container">
  <div class="input-wrapper">
    <textarea
      bind:this={textareaRef}
      bind:value={message}
      class="chat-input"
      rows="1"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      placeholder="Type your message..."
      oninput={handleInput}
      onkeydown={handleKeydown}
      disabled={$uiStore.isLoading}
      aria-label="Chat message input"
    ></textarea>
    
    <button 
      class="send-button {!message.trim() || $uiStore.isLoading ? 'disabled' : ''}" 
      onclick={send} 
      disabled={!message.trim() || $uiStore.isLoading}
      aria-label="Send message"
    >
      {#if $uiStore.isLoading}
        <div class="loading-spinner"></div>
      {:else}
        <span class="send-icon">↑</span>
      {/if}
    </button>
  </div>
  
  {#if $messagesStore.length === 0}
    <div class="input-hint">
      Press Enter to send, Shift+Enter for new line
    </div>
  {/if}
</div>

<style>
  .chat-input-container {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #1a1a1a;
    z-index: 1000;
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;
    padding: 16px;
  }

  .input-wrapper {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    position: relative;
  }

  .chat-input {
    flex: 1;
    background: transparent;
    border: none;
    border-radius: 0;
    color: #eee;
    font-size: 14px;
    font-family: inherit;
    line-height: 1.5;
    padding: 12px 0;
    resize: none;
    outline: none;
    transition: none;
    min-height: 44px;
    max-height: 120px;
    overflow-y: auto;
  }

  .chat-input:focus {
    background: transparent;
  }

  .chat-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .chat-input::placeholder {
    color: #666;
  }

  .send-button {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: #00ff00;
    color: #000;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    font-size: 18px;
    font-weight: bold;
  }

  .send-button:hover:not(:disabled) {
    background: #00dd00;
    transform: scale(1.05);
  }

  .send-button:active:not(:disabled) {
    transform: scale(0.95);
  }

  .send-button.disabled {
    background: #333;
    color: #666;
    cursor: not-allowed;
    transform: none;
  }

  .send-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #333;
    border-top: 2px solid #000;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .input-hint {
    position: absolute;
    bottom: -20px;
    left: 16px;
    font-size: 11px;
    color: #666;
    pointer-events: none;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* 스크롤바 스타일링 */
  .chat-input::-webkit-scrollbar {
    width: 4px;
  }

  .chat-input::-webkit-scrollbar-track {
    background: transparent;
  }

  .chat-input::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 2px;
  }

  .chat-input::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
</style> 
