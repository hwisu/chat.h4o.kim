<script lang="ts">
  import { authState } from '../stores/auth.svelte';
import { modelsState } from '../stores/models.svelte';
import { rolesState } from '../stores/roles.svelte';
import { contextState } from '../stores/context.svelte';

  // Svelte 5 props 시스템 사용
  interface Props {
    onModelClick: () => void;
    onRoleClick?: () => void;
  }

  let { onModelClick, onRoleClick }: Props = $props();
</script>

<div class="chat-header">
  <div class="chat-title">
    <button 
      class="model-title" 
      class:authenticated={authState.isAuthenticated}
      onclick={onModelClick}
      aria-label="Select model"
    >
      {modelsState.selectedInfo.name}
    </button>
    <button 
      class="role-title" 
      onclick={onRoleClick}
      aria-label="Select role"
    >
      {rolesState.selectedInfo.name}
    </button>
  </div>
  <div class="header-right">
    <div class="header-info">
      <div class="context-info">
        Context: {Math.round(modelsState.selectedInfo.contextSize / 1000)}K
      </div>
      <div class="auth-status">
        {#if authState.isAuthenticated}
          Server Key
        {:else}
          {authState.status}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 20px;
    background: #111;
    border-bottom: 1px solid #333;
    min-height: 60px;
    border: none;
  }

  .chat-title {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .model-title, .role-title {
    background: none;
    border: none;
    font-family: inherit;
    font-size: clamp(12px, 2vw, 16px); /* 동적 글자 크기 */
    cursor: pointer;
    padding: 8px 12px;
    border-radius: 4px;
    transition: all 0.2s;
    font-weight: 500;
    height: 40px; /* 고정 높이로 세로 정렬 */
    display: flex;
    align-items: center;
  }

  .model-title {
    color: #ff4444; /* 미인증 상태 색상 */
  }

  .model-title.authenticated {
    color: #00ff00; /* 인증 상태 색상 */
  }

  .model-title:hover, .role-title:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .role-title {
    color: #88ccff;
  }

  .header-right {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px; /* 왼쪽과 같은 높이 */
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .context-info {
    font-size: clamp(10px, 1.5vw, 14px); /* 동적 글자 크기 */
    color: #88ccff;
    font-weight: 500;
  }

  .auth-status {
    font-size: clamp(9px, 1.2vw, 12px); /* 동적 글자 크기 */
    color: #666;
  }

  @media (max-width: 768px) {
    .chat-header {
      padding: 8px 15px;
      min-height: 50px;
    }
    
    .chat-title {
      gap: 10px;
    }
    
    .model-title, .role-title {
      font-size: 12px;
      padding: 4px 8px;
    }
  }
</style> 
