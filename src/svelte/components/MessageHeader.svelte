<script lang="ts">
  import { rolesState } from '../stores/roles.svelte';

  interface Props {
    role: 'user' | 'assistant' | 'system';
    timestamp: number;
    model?: string;
  }

  let { role, timestamp, model = '' }: Props = $props();

  // 시간 포맷팅
  function formatTime(timestamp: number) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });
  }

  // Assistant 역할의 표시 이름 가져오기
  function getAssistantLabel() {
    return rolesState.selectedInfo?.name || '🤖 Assistant';
  }
</script>

<div class="message-header {role}">
  {#if role === 'user'}
    <span class="message-label">[USER] {formatTime(timestamp)}</span>
  {:else if role === 'system'}
    <span class="message-label">[SYSTEM] {formatTime(timestamp)}</span>
  {:else}
    <span class="message-label">[{getAssistantLabel()}] {formatTime(timestamp)}{model ? ` - ${model}` : ''}</span>
  {/if}
</div>

<style>
  .message-header {
    margin-bottom: 8px;
    font-size: 14px;
    font-family: 'MonoplexKRNerd', monospace;
  }

  .message-header.user {
    text-align: right;
  }

  .message-header.assistant {
    text-align: left;
  }

  .message-label {
    font-weight: 500;
  }

  .message-header.user .message-label {
    color: #00ff00;
  }

  .message-header.assistant .message-label {
    color: #ccc;
  }

  .message-header.system .message-label {
    color: #ff8c00;
  }
</style> 
