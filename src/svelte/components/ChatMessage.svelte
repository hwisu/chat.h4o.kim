<script lang="ts">
  import MessageHeader from './MessageHeader.svelte';
  import MessageContent from './MessageContent.svelte';
  import MessageFooter from './MessageFooter.svelte';

  interface Props {
    role?: 'user' | 'assistant';
    content?: string;
    timestamp?: number;
    model?: string;
    tokenUsage?: { 
      input?: number; 
      output?: number; 
      prompt_tokens?: number; 
      completion_tokens?: number; 
      total_tokens?: number; 
    };
  }

  let { 
    role = 'user', 
    content = '', 
    timestamp = Date.now(),
    model = '',
    tokenUsage = {}
  }: Props = $props();
</script>

<div class="message {role}" data-timestamp="{timestamp}">
  <MessageHeader {role} {timestamp} {model} />
  <MessageContent {role} {content} {timestamp} />
  {#if role === 'assistant'}
    <MessageFooter {tokenUsage} {content} />
  {/if}
</div>

<style>
  .message {
    margin-bottom: 25px;
    opacity: 0;
    animation: fadeIn 0.3s ease-in-out forwards;
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
</style> 
