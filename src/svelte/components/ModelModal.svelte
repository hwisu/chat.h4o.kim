<script lang="ts">
  import { modelsState } from '../stores/models.svelte';
import { updateModels } from '../stores/models.svelte';
import { apiClient } from '../services/api.js';
import { setError } from '../stores/ui.svelte';

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

  async function selectModel(modelId) {
    try {
      isLoading = true;
      
      const result = await apiClient.setModel(modelId);
      
      if (result.success) {
        // 선택된 모델 정보 업데이트
        const selectedModel = modelsState.available.find(m => m.id === modelId);
        if (selectedModel) {
          updateModels({
            selected: modelId,
            selectedInfo: {
              name: selectedModel.name,
              provider: selectedModel.provider,
              contextSize: selectedModel.context_length || 128000
            }
          });
        }
        
        onSelect?.({ modelId });
      } else {
        // 에러는 모달에서 직접 처리하지 않고 상위에서 처리
        console.error('Failed to set model:', result.error);
      }
    } catch (error) {
      console.error('Error selecting model:', error);
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      close();
    }
  }

  // 모델 이름 포맷팅
  function formatModelName(model) {
    if (!model) return '';
    return model.name || model.id || 'Unknown Model';
  }

  // 모델 제공업체 색상
  function getProviderColor(provider) {
    const colors = {
      'openai': '#00a67e',
      'anthropic': '#d4a574',
      'google': '#4285f4',
      'meta': '#1877f2',
      'mistral': '#ff7000',
      'cohere': '#39594c',
      'default': '#666'
    };
    return colors[provider?.toLowerCase()] || colors.default;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div 
  class="model-modal-backdrop" 
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="model-modal-title"
  tabindex="0"
>
  <div class="model-modal-content">
    <div class="model-modal-header">
      <h3 id="model-modal-title">🤖 Select Model</h3>
      <button class="model-modal-close" onclick={close} aria-label="Close">&times;</button>
    </div>

    <div class="model-list">
      {#if modelsState.isLoading}
        <div class="model-list-loading">
          <div class="loading-spinner"></div>
          Loading models...
        </div>
      {:else if modelsState.available.length === 0}
        <div class="model-list-empty">
          No models available. Please check your authentication.
        </div>
      {:else}
        {#each modelsState.available as model}
          <button 
            class="model-list-item {model.id === modelsState.selected ? 'selected' : ''}"
            onclick={() => selectModel(model.id)}
            disabled={isLoading}
            aria-label="Select {formatModelName(model)}"
          >
            <div class="model-info">
              <div class="model-name">{formatModelName(model)}</div>
              <div class="model-details">
                <span 
                  class="model-provider" 
                  style="color: {getProviderColor(model.provider)}"
                >
                  {model.provider || 'Unknown'}
                </span>
                {#if model.context_length}
                  <span class="model-context">
                    {model.context_length.toLocaleString()} tokens
                  </span>
                {/if}
              </div>
            </div>
            {#if model.id === modelsState.selected}
              <span class="model-selected-indicator">✓</span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>

    {#if isLoading}
      <div class="model-modal-loading">
        Setting model...
      </div>
    {/if}
  </div>
</div>

<style>
  .model-modal-backdrop {
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

  .model-modal-content {
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

  .model-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }

  .model-modal-header h3 {
    margin: 0;
    font-size: 18px;
    color: #eee;
  }

  .model-modal-close {
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

  .model-modal-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .model-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
  }

  .model-list-loading {
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

  .model-list-empty {
    text-align: center;
    padding: 40px;
    color: #888;
  }

  .model-list-item {
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

  .model-list-item:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
    border-color: #555;
  }

  .model-list-item.selected {
    background: rgba(0, 255, 0, 0.1);
    border-color: #00ff00;
  }

  .model-list-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .model-info {
    flex: 1;
  }

  .model-name {
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 4px;
  }

  .model-details {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #888;
  }

  .model-provider {
    font-weight: 500;
  }

  .model-context {
    color: #666;
  }

  .model-selected-indicator {
    color: #00ff00;
    font-size: 16px;
    font-weight: bold;
  }

  .model-modal-loading {
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
  .model-list::-webkit-scrollbar {
    width: 6px;
  }

  .model-list::-webkit-scrollbar-track {
    background: #111;
  }

  .model-list::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 3px;
  }

  .model-list::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
</style> 
