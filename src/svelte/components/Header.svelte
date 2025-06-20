<script lang="ts">
  import { authState } from '../stores/auth.svelte';
  import { contextState } from '../stores/context.svelte';
  import { modelsState } from '../stores/models.svelte';
  import { rolesState } from '../stores/roles.svelte';

  // Svelte 5 props 시스템 사용
  interface Props {
    onModelClick: () => void;
    onRoleClick?: () => void;
  }

  let { onModelClick, onRoleClick }: Props = $props();

  // 스크롤 기반 헤더 표시/숨김
  let headerVisible = $state(true);
  let lastScrollY = $state(0);
  let scrollTimeout: NodeJS.Timeout | null = null;

  function handleScroll() {
    const currentScrollY = window.scrollY;
    
    if (currentScrollY > lastScrollY && currentScrollY > 100) {
      headerVisible = false;
    } else {
      headerVisible = true;
    }
    
    lastScrollY = currentScrollY;

    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    scrollTimeout = setTimeout(() => {
      headerVisible = true;
    }, 1000);
  }

  // 컨텍스트 사용률 계산
  $effect(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        window.removeEventListener('scroll', handleScroll);
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
      };
    }
  });

  function getContextUsageText(): string {
    // 인증되지 않은 경우 whoami 표시
    if (!authState.isAuthenticated) {
      return 'whoami';
    }
    
    const modelContextSize = modelsState.selectedInfo.contextSize;
    const currentTokens = contextState.currentSize;
    const contextSizeInK = Math.round(modelContextSize / 1000);
    
    if (currentTokens > 0 && modelContextSize > 0) {
      const percentage = (currentTokens / modelContextSize) * 100;
      const currentInK = currentTokens >= 1000 ? 
        `${(currentTokens / 1000).toFixed(1)}K` : 
        currentTokens.toString();
      
      return `${currentInK}/${contextSizeInK}K (${Math.round(percentage)}%)`;
    }
    return `0/${contextSizeInK}K (0%)`;
  }
</script>

<div class="chat-header" class:visible={headerVisible} class:hidden={!headerVisible}>
  <div class="header-left">
    <button 
      class="model-title" 
      class:authenticated={authState.isAuthenticated}
      onclick={onModelClick}
      aria-label="Select model"
    >
      <span class="model-name">{modelsState.selectedInfo.name}</span>
      {#if modelsState.selectedInfo.supportsTools}
        <span class="tools-indicator" title="Supports Function Calling / Tools">t</span>
      {/if}
    </button>
  </div>
  
  <div class="header-center">
    <button 
      class="role-title" 
      onclick={onRoleClick}
      aria-label="Select role"
    >
      {authState.isAuthenticated ? rolesState.selectedInfo.name : 'whoami'}
    </button>
  </div>
  
  <div class="header-right">
    <div class="context-info">
      {getContextUsageText()}
    </div>
  </div>
</div>

<style>
  .chat-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1001;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 10px 20px;
    padding-top: max(10px, env(safe-area-inset-top));
    background: #111;
    border-bottom: 1px solid #333;
    min-height: 60px;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .chat-header.visible {
    transform: translateY(0);
  }

  .chat-header.hidden {
    transform: translateY(-100%);
  }

  .header-left {
    display: flex;
    justify-content: flex-start;
    align-items: center;
  }

  .header-center {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .header-right {
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }

  .model-title, .role-title {
    background: none;
    border: none;
    font-family: inherit;
    font-size: clamp(14px, 2vw, 18px);
    cursor: pointer;
    padding: 8px 12px;
    border-radius: 4px;
    transition: all 0.2s;
    font-weight: 500;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .model-name {
    display: flex;
    align-items: center;
  }

  .tools-indicator {
    font-size: 12px;
    font-weight: bold;
    color: #00ff00;
    background: rgba(0, 255, 0, 0.2);
    border: 1px solid #00ff00;
    border-radius: 3px;
    padding: 2px 4px;
    line-height: 1;
    opacity: 0.9;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 1; }
  }

  .model-title {
    color: #ff4444;
  }

  .model-title.authenticated {
    color: #00ff00;
  }

  .model-title:hover, .role-title:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .role-title {
    color: #88ccff;
    font-weight: 600;
  }

  .context-info {
    font-size: clamp(12px, 1.5vw, 16px);
    color: #88ccff;
    font-weight: 500;
  }

  @media (max-width: 768px) {
    .chat-header {
      padding: 8px 15px;
      min-height: 50px;
      grid-template-columns: 1fr auto 1fr;
    }
    
    .model-title, .role-title {
      font-size: 14px;
      padding: 4px 8px;
    }

    .context-info {
      font-size: 12px;
    }
  }

  @media (max-width: 480px) {
    .chat-header {
      padding: 6px 12px;
      grid-template-columns: auto 1fr auto;
    }

    .header-center {
      padding: 0 10px;
    }
  }
</style> 
