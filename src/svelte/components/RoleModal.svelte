<script lang="ts">
  import { rolesState, setSelectedRole } from '../stores/roles.svelte';
  import { apiClient } from '../services/apiClient';
  import { updateRoles } from '../stores/roles.svelte';

  // Svelte 5 props 시스템 사용
  let { onClose, onSelect } = $props();

  let isOpen = $state(false);
  let isLoading = $state(false);

  function close() {
    onClose?.();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  async function selectRole(roleId: string) {
    try {
      isLoading = true;

      const result = await apiClient.setRole(roleId);

      if (result.success) {
        // 선택된 롤 정보 업데이트
        const selectedRole = rolesState.available.find(r => r.id === roleId);
        if (selectedRole) {
          updateRoles({
            selected: roleId,
            selectedInfo: {
              id: selectedRole.id,
              name: selectedRole.name,
              description: selectedRole.description,
              icon: selectedRole.icon
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

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
    }
  }

  // 롤 이름 포맷팅
  function formatRoleName(role: any) {
    if (!role) return '';
    return role.name || role.id || 'Unknown Role';
  }

  // 롤 설명 포맷팅 (최대 100글자)
  function formatRoleDescription(description: string) {
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
      {#if rolesState.isLoading}
        <div class="role-list-loading">
          <div class="loading-spinner"></div>
          Loading roles...
        </div>
      {:else if rolesState.available.length === 0}
        <div class="role-list-empty">
          No roles available. Please check your authentication.
        </div>
      {:else}
        <div class="simple-role-list">
          {#each rolesState.available as role}
            <button
              class="role-list-item {role.id === rolesState.selected ? 'selected' : ''}"
              onclick={() => selectRole(role.id)}
              disabled={isLoading}
              aria-label="Select {formatRoleName(role)}"
            >
              <div class="role-info">
                <div class="role-name">
                  {#if role.icon}
                    <span class="role-icon">{role.icon}</span>
                  {/if}
                  {formatRoleName(role)}
                </div>
                {#if role.description}
                  <div class="role-description">
                    {formatRoleDescription(role.description)}
                  </div>
                {/if}
              </div>
              {#if role.id === rolesState.selected}
                <span class="role-selected-indicator">✓</span>
              {/if}
            </button>
          {/each}
        </div>
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
    font-size: 20px;
    color: #eee;
  }

  .role-modal-close {
    background: none;
    border: none;
    color: #888;
    font-size: 26px;
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
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    color: #888;
    gap: 10px;
  }

  .role-list-empty {
    padding: 40px 20px;
    text-align: center;
    color: #888;
    font-style: italic;
  }

  .role-list-item {
    width: 100%;
    background: none;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: all 0.2s;
    color: #ddd;
    text-align: left;
  }

  .role-list-item:hover:not(:disabled) {
    border-color: #555;
    background: rgba(255, 255, 255, 0.05);
  }

  .role-list-item.selected {
    border-color: #4CAF50;
    background: rgba(76, 175, 80, 0.1);
  }

  .role-list-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .role-info {
    flex: 1;
    min-width: 0;
  }

  .role-name {
    font-size: 16px;
    font-weight: 500;
    color: #eee;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .role-icon {
    font-size: 18px;
  }

  .role-description {
    font-size: 14px;
    color: #aaa;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .role-selected-indicator {
    color: #4CAF50;
    font-size: 18px;
    font-weight: bold;
    margin-left: 8px;
    flex-shrink: 0;
  }

  .role-modal-loading {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #eee;
    font-size: 16px;
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #333;
    border-top: 2px solid #4CAF50;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* 모바일 최적화 */
  @media (max-width: 768px) {
    .role-modal-content {
      width: 95%;
      max-height: 85vh;
    }

    .role-modal-header {
      padding: 16px;
    }

    .role-list {
      padding: 8px;
    }

    .role-list-item {
      padding: 10px 12px;
    }
  }
</style>
