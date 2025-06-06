<script lang="ts">
  import { onMount } from 'svelte';
  import { messagesState } from '../stores/messages.svelte';
import { authState } from '../stores/auth.svelte';
import { uiState } from '../stores/ui.svelte';
  import ChatMessage from './ChatMessage.svelte';

  let chatContainer: HTMLDivElement;

  // 스크롤을 하단으로 이동
  function scrollToBottom() {
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  // 메시지가 업데이트될 때마다 스크롤 조정 (Svelte 5 runes 방식)
  $effect(() => {
    // messagesState 변경을 감지하여 스크롤 조정
    messagesState.length;
    scrollToBottom();
  });

  onMount(() => {
    scrollToBottom();
  });

  // 환영 메시지 생성
  function getWelcomeMessage() {
    const currentTime = new Date().toLocaleString();
    
    return `[SYSTEM] ${currentTime}

🌟 Choose access method:

🔐 Server Login: /login <password>
🔑 Personal Key: /set-api-key <key>

💡 Choose ONE option`;
  }
</script>

<div class="chat-output" bind:this={chatContainer}>
  <!-- 시스템 환영 메시지 -->
  {#if uiState.showSystemMessage && !authState.isAuthenticated}
    <div class="message system">
      <div class="message-content">
        {@html getWelcomeMessage().replace(/\n/g, '<br>')}
      </div>
      <div class="message-timestamp">
        {new Date().toLocaleTimeString()}
      </div>
    </div>
  {/if}

  <!-- 채팅 메시지들 -->
  {#each messagesState as message, index}
    <ChatMessage 
      role={message.role}
      content={message.content}
      timestamp={typeof message.timestamp === 'object' ? message.timestamp.getTime() : message.timestamp}
      model={(message as any).model || ''}
      tokenUsage={(message as any).tokenUsage || {}}
      type={(message as any).type || ''}
    />
  {/each}

  <!-- 로딩 인디케이터 -->
  {#if uiState.isLoading}
    <div class="message assistant loading">
      <div class="message-content">
        <div class="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  {/if}

  <!-- 에러 메시지는 시스템 메시지로 처리되므로 별도 UI 제거 -->
</div>

<style>
  .chat-output {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    padding-top: 80px; /* 상단 고정 헤더를 위한 공간 */
    padding-bottom: 120px; /* 하단 입력창을 위한 공간 */
    background: #0a0a0a;
    scroll-behavior: smooth;
  }

  .message {
    margin-bottom: 20px;
    opacity: 0;
    animation: fadeIn 0.3s ease-in-out forwards;
  }



  .message.loading {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 15px;
  }

  .message-content {
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 8px;
  }

  .message-timestamp {
    font-size: 10px;
    color: #666;
    opacity: 0.7;
  }

  .loading-dots {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .loading-dots span {
    width: 8px;
    height: 8px;
    background: #666;
    border-radius: 50%;
    animation: loadingPulse 1.4s infinite ease-in-out both;
  }

  .loading-dots span:nth-child(1) {
    animation-delay: -0.32s;
  }

  .loading-dots span:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes loadingPulse {
    0%, 80%, 100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }

  /* 스크롤바 스타일링 */
  .chat-output::-webkit-scrollbar {
    width: 6px;
  }

  .chat-output::-webkit-scrollbar-track {
    background: #111;
  }

  .chat-output::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 3px;
  }

  .chat-output::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
</style> 
