<script lang="ts">
  import CodeHighlighter from './CodeHighlighter.svelte';

  interface Props {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }

  let { role, content, timestamp }: Props = $props();
</script>

{#if role === 'user'}
  <div class="user-message-wrapper">
    <div class="message-content {role}">
      <CodeHighlighter {content} {role} />
    </div>
  </div>
{:else}
  <div class="message-content {role}">
    <CodeHighlighter {content} {role} />
  </div>
{/if}

<style>
  .message-content {
    line-height: 1.6;
    font-size: 16px;
    word-wrap: break-word;
    overflow-wrap: break-word;
    margin-bottom: 8px;
  }

  .message-content.user {
    text-align: right;
    color: #E6C384; /* carpYellow - 사용자 메시지 */
  }

  .message-content.assistant {
    text-align: left;
    color: #DCD7BA; /* fujiWhite - 어시스턴트 메시지 */
  }

  /* 사용자 메시지 래퍼 - 리스트가 깨지지 않도록 */
  .user-message-wrapper {
    display: inline-block;
    text-align: right;
    width: 100%;
  }

  .user-message-wrapper .message-content {
    display: inline-block;
    max-width: 80%;
    text-align: left; /* 내용은 왼쪽 정렬로 읽기 쉽게 */
    background: rgba(0, 0, 0, 0.2);
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
</style> 
