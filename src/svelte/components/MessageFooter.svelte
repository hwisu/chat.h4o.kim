<script lang="ts">
  interface TokenUsage {
    input?: number; 
    output?: number; 
    prompt_tokens?: number; 
    completion_tokens?: number; 
    total_tokens?: number; 
  }

  interface Props {
    tokenUsage: TokenUsage;
    content: string;
  }

  let { tokenUsage, content }: Props = $props();

  console.log('[MessageFooter] Received tokenUsage:', tokenUsage);
  console.log('[MessageFooter] TokenUsage type:', typeof tokenUsage);
  console.log('[MessageFooter] TokenUsage keys:', tokenUsage ? Object.keys(tokenUsage) : 'null/undefined');

  function formatTokens(tokens: number): string {
    if (tokens < 1000) {
      return tokens.toString();
    } else {
      return (tokens / 1000).toFixed(1) + 'K';
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(content).then(() => {
      // 복사 성공 피드백은 별도 구현 가능
    });
  }
</script>

<div class="message-footer">
  <div class="token-usage">
    {#if tokenUsage.prompt_tokens && tokenUsage.completion_tokens}
      ↑ {formatTokens(tokenUsage.prompt_tokens)} ↓ {formatTokens(tokenUsage.completion_tokens)} (total: {formatTokens(tokenUsage.total_tokens || (tokenUsage.prompt_tokens + tokenUsage.completion_tokens))})
    {:else if tokenUsage.total_tokens}
      total: {formatTokens(tokenUsage.total_tokens)}
    {:else if tokenUsage.input && tokenUsage.output}
      ↑ {formatTokens(tokenUsage.input)} ↓ {formatTokens(tokenUsage.output)}
    {/if}
  </div>
  <button class="copy-button" onclick={copyToClipboard}>
    copy all
  </button>
</div>

<style>
  .message-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    margin-top: 8px;
  }

  .token-usage {
    color: #98BB6C; /* springGreen - 토큰 사용량 */
    font-family: 'MonoplexKRNerd', monospace;
  }

  .copy-button {
    background: none;
    border: 1px solid #666;
    color: #ccc;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    font-family: 'MonoplexKRNerd', monospace;
    transition: all 0.2s;
  }

  .copy-button:hover {
    border-color: #999;
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
  }
</style> 
