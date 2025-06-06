<script lang="ts">
  import { modelsState } from '../stores/models.svelte';
  import { updateModels } from '../stores/models.svelte';
  import { apiClient } from '../services/api.js';
  import { setError } from '../stores/ui.svelte';

  // Svelte 5 props 시스템 사용
  let { onClose, onSelect } = $props();

  let isLoading = $state(false);
  let expandedFamilies = $state(new Set<string>());

  // 모델 패밀리 정의
  const MODEL_FAMILIES = {
    'anthropic': {
      name: 'Anthropic',
      icon: '🔵',
      description: 'Claude 모델 시리즈'
    },
    'openai': {
      name: 'OpenAI',
      icon: '🟢',
      description: 'GPT 모델 시리즈'
    },
    'google': {
      name: 'Google',
      icon: '🔴',
      description: 'Gemini 모델 시리즈'
    },
    'meta': {
      name: 'Meta',
      icon: '🔶',
      description: 'Llama 모델 시리즈'
    },
    'mistral': {
      name: 'Mistral',
      icon: '🟡',
      description: 'Mistral 모델 시리즈'
    },
    'cohere': {
      name: 'Cohere',
      icon: '🟣',
      description: 'Command 모델 시리즈'
    },
    'other': {
      name: '기타',
      icon: '⚪',
      description: '기타 모델들'
    }
  };

  // 모델을 패밀리별로 그룹화
  let groupedModels = $derived(() => {
    const grouped: { [family: string]: any[] } = {};
    
    Object.keys(MODEL_FAMILIES).forEach(family => {
      grouped[family] = [];
    });

    modelsState.available.forEach(model => {
      const modelName = model.name?.toLowerCase() || model.id?.toLowerCase() || '';
      let family = 'other';

      if (modelName.includes('claude') || modelName.includes('anthropic')) {
        family = 'anthropic';
      } else if (modelName.includes('gpt') || modelName.includes('openai')) {
        family = 'openai';
      } else if (modelName.includes('gemini') || modelName.includes('google')) {
        family = 'google';
      } else if (modelName.includes('llama') || modelName.includes('meta')) {
        family = 'meta';
      } else if (modelName.includes('mistral')) {
        family = 'mistral';
      } else if (modelName.includes('cohere') || modelName.includes('command')) {
        family = 'cohere';
      }

      grouped[family].push(model);
    });

    return grouped;
  });

  function close() {
    onClose?.();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  function toggleFamily(familyId: string) {
    if (expandedFamilies.has(familyId)) {
      expandedFamilies.delete(familyId);
    } else {
      expandedFamilies.add(familyId);
    }
    expandedFamilies = new Set(expandedFamilies);
  }

  async function selectModel(modelId: string) {
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

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
    }
  }

  // 모델 이름 포맷팅
  function formatModelName(model: any) {
    if (!model) return '';
    return model.name || model.id || 'Unknown Model';
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
        {#each Object.entries(MODEL_FAMILIES) as [familyId, family]}
          {@const familyModels = groupedModels()[familyId] || []}
          {#if familyModels.length > 0}
            <div class="family-section">
              <button 
                class="family-header"
                onclick={() => toggleFamily(familyId)}
                aria-expanded={expandedFamilies.has(familyId)}
              >
                <div class="family-info">
                  <span class="family-icon">{family.icon}</span>
                  <div class="family-text">
                    <span class="family-name">{family.name}</span>
                    <span class="family-count">({familyModels.length}개)</span>
                  </div>
                </div>
                <span class="family-toggle {expandedFamilies.has(familyId) ? 'expanded' : ''}">
                  ▼
                </span>
              </button>
              
              {#if expandedFamilies.has(familyId)}
                <div class="family-models">
                  {#each familyModels as model}
                    <button 
                      class="model-list-item {model.id === modelsState.selected ? 'selected' : ''}"
                      onclick={() => selectModel(model.id)}
                      disabled={isLoading}
                      aria-label="Select {formatModelName(model)}"
                    >
                      <div class="model-info">
                        <div class="model-name">
                          {formatModelName(model)}
                          {#if model.context_length}
                            <span class="model-context">({Math.round(model.context_length / 1000)}K)</span>
                          {/if}
                        </div>
                      </div>
                      {#if model.id === modelsState.selected}
                        <span class="model-selected-indicator">✓</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
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
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    color: #888;
    gap: 10px;
  }

  .model-list-empty {
    padding: 40px 20px;
    text-align: center;
    color: #888;
    font-style: italic;
  }

  /* 패밀리 섹션 */
  .family-section {
    margin-bottom: 8px;
  }

  .family-header {
    width: 100%;
    background: none;
    border: none;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
    color: #ddd;
  }

  .family-header:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .family-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .family-icon {
    font-size: 20px;
  }

  .family-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .family-name {
    font-size: 16px;
    font-weight: 500;
    color: #eee;
  }

  .family-count {
    font-size: 12px;
    color: #888;
  }

  .family-toggle {
    font-size: 12px;
    color: #888;
    transition: transform 0.2s;
  }

  .family-toggle.expanded {
    transform: rotate(180deg);
  }

  /* 패밀리별 모델 목록 */
  .family-models {
    margin-left: 16px;
    border-left: 2px solid #333;
    padding-left: 16px;
    margin-top: 8px;
    margin-bottom: 16px;
  }

  .model-list-item {
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

  .model-list-item:hover:not(:disabled) {
    border-color: #555;
    background: rgba(255, 255, 255, 0.05);
  }

  .model-list-item.selected {
    border-color: #4CAF50;
    background: rgba(76, 175, 80, 0.1);
  }

  .model-list-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .model-info {
    flex: 1;
    min-width: 0;
  }

  .model-name {
    font-size: 14px;
    font-weight: 500;
    color: #eee;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .model-context {
    font-size: 12px;
    color: #888;
    font-weight: 400;
  }

  .model-selected-indicator {
    color: #4CAF50;
    font-size: 16px;
    font-weight: bold;
    margin-left: 8px;
    flex-shrink: 0;
  }

  .model-modal-loading {
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
    font-size: 14px;
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
    .model-modal-content {
      width: 95%;
      max-height: 85vh;
    }

    .model-modal-header {
      padding: 16px;
    }

    .model-list {
      padding: 8px;
    }

    .family-header {
      padding: 10px 12px;
    }

    .model-list-item {
      padding: 10px 12px;
    }

    .family-models {
      margin-left: 12px;
      padding-left: 12px;
    }
  }
</style> 
