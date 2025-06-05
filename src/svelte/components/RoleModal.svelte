<script lang="ts">
  import { rolesStore } from '../stores.js';
  import { apiClient } from '../services/api.js';
  import { updateRoles, setError } from '../stores.js';

  // Svelte 5 props 시스템 사용
  let { onClose, onSelect } = $props();

  let isLoading = $state(false);

  function close() {
    onClose?.();
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  async function selectRole(roleId) {
    try {
      isLoading = true;
      
      const result = await apiClient.setRole(roleId);
      
      if (result.success) {
        // 선택된 롤 정보 업데이트
        const selectedRole = $rolesStore.available.find(r => r.id === roleId);
        if (selectedRole) {
          updateRoles({
            selected: roleId,
            selectedInfo: {
              name: selectedRole.name,
              description: selectedRole.description,
              system_prompt: selectedRole.system_prompt
            }
          });
        }
        
        onSelect?.({ roleId });
      } else {
        // 에러는 모달에서 직접 처리하지 않고 상위에서 처리
        console.error('Failed to set role:', result.error);
      }
    } catch (error) {
      console.error('Error selecting role:', error);
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      close();
    }
  }

  // 롤 이름 포맷팅
  function formatRoleName(role) {
    if (!role) return '';
    return role.name || role.id || 'Unknown Role';
  }

  // 롤 설명 포맷팅 (최대 100글자)
  function formatRoleDescription(description) {
    if (!description) return '';
    return description.length > 100 ? description.substring(0, 100) + '...' : description;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div 
  class="role-modal-backdrop" 
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="role-modal-title"
  tabindex="0"
>
  <div class="role-modal-content">
    <div class="role-modal-header">
      <h3 id="role-modal-title">🎭 Select Role</h3>
      <button class="role-modal-close" onclick={close} aria-label="Close">&times;</button>
    </div>

    <div class="role-list">
      {#if $rolesStore.isLoading}
        <div class="role-list-loading">
          <div class="loading-spinner"></div>
          Loading roles...
        </div>
      {:else if $rolesStore.available.length === 0}
        <div class="role-list-empty">
          No roles available. Please check your authentication.
        </div>
      {:else}
        {#each $rolesStore.available as role}
          <button 
            class="role-list-item {role.id === $rolesStore.selected ? 'selected' : ''}"
            onclick={() => selectRole(role.id)}
            disabled={isLoading}
            aria-label="Select {formatRoleName(role)}"
          >
            <div class="role-info">
              <div class="role-name">{formatRoleName(role)}</div>
              {#if role.description}
                <div class="role-description">
                  {formatRoleDescription(role.description)}
                </div>
              {/if}
            </div>
            {#if role.id === $rolesStore.selected}
              <span class="role-selected-indicator">✓</span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>

    {#if isLoading}
      <div class="role-modal-loading">
        Setting role...
      </div>
    {/if}
  </div>
</div>

<style>
  .role-modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .role-modal-content {
    background: #111;
    border: 1px solid #333;
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  .role-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }

  .role-modal-header h3 {
    margin: 0;
    font-size: 18px;
    color: #eee;
  }

  .role-modal-close {
    background: none;
    border: none;
    color: #888;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .role-modal-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .role-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
  }

  .role-list-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 40px;
    color: #888;
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #333;
    border-top: 2px solid #00ff00;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .role-list-empty {
    text-align: center;
    padding: 40px;
    color: #888;
  }

  .role-list-item {
    width: 100%;
    background: none;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 15px;
    margin-bottom: 8px;
    color: #eee;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-align: left;
  }

  .role-list-item:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
    border-color: #555;
  }

  .role-list-item.selected {
    background: rgba(0, 255, 0, 0.1);
    border-color: #00ff00;
  }

  .role-list-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .role-info {
    flex: 1;
  }

  .role-name {
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 6px;
  }

  .role-description {
    font-size: 12px;
    color: #888;
    line-height: 1.4;
  }

  .role-selected-indicator {
    color: #00ff00;
    font-size: 16px;
    font-weight: bold;
  }

  .role-modal-loading {
    background: rgba(0, 255, 0, 0.1);
    border-top: 1px solid #333;
    padding: 15px;
    text-align: center;
    color: #00ff00;
    font-size: 14px;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* 스크롤바 스타일링 */
  .role-list::-webkit-scrollbar {
    width: 6px;
  }

  .role-list::-webkit-scrollbar-track {
    background: #111;
  }

  .role-list::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 3px;
  }

  .role-list::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
</style> 
