<script lang="ts">
  import { messagesState } from '../stores/messages.svelte';
import { uiState } from '../stores/ui.svelte';
  import { chatService } from '../services/chatService';

  // Svelte 5 props 시스템 사용
  let { onScrollToBottom } = $props();

  let message = $state('');
  let textareaRef: HTMLTextAreaElement | undefined = $state();

  async function send() {
    const content = message.trim();
    if (!content || uiState.isLoading) return;

    // 입력 초기화
    message = '';
    adjustTextareaHeight();

    // 스크롤 바닥으로
    onScrollToBottom?.();

    // ChatService에 메시지 전송 위임
    await chatService.sendMessage(content);
    
    // 메시지 전송 후 포커스 복원
    focusInput();
  }

  function handleKeydown(e: KeyboardEvent) {
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

  // 컴포넌트 마운트 시 포커스 설정
  $effect(() => {
    if (textareaRef) {
      // 약간의 지연을 두어 다른 초기화가 완료된 후 포커스
      setTimeout(() => {
        textareaRef?.focus();
      }, 100);
    }
  });

  // 메시지 전송 후 포커스 복원
  function focusInput() {
    setTimeout(() => {
      textareaRef?.focus();
    }, 50);
  }
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
      inputmode="text"
      enterkeyhint="send"
      data-ms-editor="false"
      data-gramm="false"
      data-gramm_editor="false"
      data-enable-grammarly="false"
      placeholder="Type your message..."
      oninput={handleInput}
      onkeydown={handleKeydown}
      disabled={uiState.isLoading}
      aria-label="Chat message input"
      style="font-variant-ligatures: none;"
    ></textarea>
    
    <button 
      class="send-button {!message.trim() || uiState.isLoading ? 'disabled' : ''}" 
      onclick={send} 
      disabled={!message.trim() || uiState.isLoading}
      aria-label="Send message"
    >
      {#if uiState.isLoading}
        <div class="loading-spinner"></div>
      {:else}
        <span class="send-icon">↑</span>
      {/if}
    </button>
  </div>
  
  {#if messagesState.length === 0}
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
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    
    /* 모바일 키보드 대응 */
    contain: layout style;
    transform: translateZ(0);
    will-change: transform;
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
    font-size: 16px;
    font-family: inherit;
    line-height: 1.5;
    padding: 12px 0;
    resize: none;
    outline: none;
    transition: none;
    min-height: 44px;
    max-height: 120px;
    overflow-y: auto;
    
    /* 모바일 키보드 예측 텍스트 비활성화 */
    -webkit-user-select: text;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    font-variant-ligatures: none;
    text-rendering: optimizeSpeed;
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
    font-size: 20px;
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
    font-size: 13px;
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
