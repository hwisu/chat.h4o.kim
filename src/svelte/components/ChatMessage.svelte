<script lang="ts">
  import MessageHeader from './MessageHeader.svelte';
  import MessageContent from './MessageContent.svelte';
  import MessageFooter from './MessageFooter.svelte';

  interface Props {
    role?: 'user' | 'assistant' | 'system';
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
    type?: string;
  }

  let { 
    role = 'user', 
    content = '', 
    timestamp = Date.now(),
    model = '',
    tokenUsage = {},
    type = ''
  }: Props = $props();
</script>

<div class="message {role} {type}" data-timestamp="{timestamp}">
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

  .message.system.success {
    background: rgba(34, 139, 34, 0.2);
    border: 1px solid rgba(0, 255, 0, 0.4);
    border-radius: 8px;
    padding: 15px;
    margin: 20px 0;
  }

  .message.system.models {
    background: rgba(139, 69, 19, 0.3);
    border: 1px solid rgba(255, 140, 0, 0.5);
    border-radius: 8px;
    padding: 15px;
    margin: 20px 0;
  }

  .message.system.error {
    background: rgba(255, 68, 68, 0.1);
    border: 1px solid rgba(255, 68, 68, 0.3);
    border-radius: 8px;
    padding: 15px;
    color: #ff6b6b;
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
