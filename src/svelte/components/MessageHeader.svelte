<script lang="ts">
  interface Props {
    role: 'user' | 'assistant';
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
</script>

<div class="message-header {role}">
  {#if role === 'user'}
    <span class="message-label">[USER] {formatTime(timestamp)}</span>
  {:else}
    <span class="message-label">[ASSISTANT] {formatTime(timestamp)}{model ? ` - ${model}` : ''}</span>
  {/if}
</div>

<style>
  .message-header {
    margin-bottom: 8px;
    font-size: 14px;
    font-family: 'MonoplexKRNerd', 'JetBrains Mono', monospace;
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
</style> 
