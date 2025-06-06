<script lang="ts">
  import { modelsState } from '../stores/models.svelte';
  import { updateModels } from '../stores/models.svelte';
  import { apiClient } from '../services/api.js';
  import { setError } from '../stores/ui.svelte';

  // Svelte 5 props 시스템 사용
  let { onClose, onSelect } = $props();

  let isLoading = $state(false);
  let expandedFamilies = $state(new Set<string>());

  // 모델명에서 prefix 추출 (/ 앞의 첫 번째 단어)
  function extractModelPrefix(modelName: string): string {
    if (!modelName) return 'other';
    
    const slashIndex = modelName.indexOf('/');
    if (slashIndex === -1) return 'other';
    
    return modelName.substring(0, slashIndex).toLowerCase();
  }

  // prefix를 표시용으로 포맷팅
  function formatPrefixName(prefix: string): string {
    if (prefix === 'other') return 'Other Models';
    
    // 첫 글자를 대문자로, 나머지는 그대로
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }

  // prefix별 아이콘 (간단한 해시 기반)
  function getPrefixIcon(prefix: string): string {
    if (prefix === 'other') return '⚪';
    
    // 단순한 해시로 일관된 아이콘 선택
    const icons = ['🔵', '🟢', '🔴', '🔶', '🟡', '🟣', '🔷', '🟠', '⭐', '💙'];
    let hash = 0;
    for (let i = 0; i < prefix.length; i++) {
      hash = ((hash << 5) - hash) + prefix.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return icons[Math.abs(hash) % icons.length];
  }

  // 모델을 prefix별로 그룹화 (4개 이상인 것만)
  let groupedModels = $derived(() => {
    const prefixCount: { [prefix: string]: any[] } = {};
    
    // 먼저 모든 prefix별로 모델 수집
    modelsState.available.forEach(model => {
      const modelName = model.name || model.id || '';
      const prefix = extractModelPrefix(modelName);
      
      if (!prefixCount[prefix]) {
        prefixCount[prefix] = [];
      }
      
      prefixCount[prefix].push(model);
    });

    // 4개 이상인 prefix만 유지, 나머지는 'other'로 이동
    const grouped: { [prefix: string]: any[] } = {};
    const otherModels: any[] = [];

    Object.entries(prefixCount).forEach(([prefix, models]) => {
      if (models.length >= 4) {
        grouped[prefix] = models;
      } else {
        otherModels.push(...models);
      }
    });

    // 'other' 그룹이 있다면 추가
    if (otherModels.length > 0) {
      grouped['other'] = otherModels;
    }

    // 각 그룹의 모델들을 이름순으로 정렬
    Object.keys(grouped).forEach(prefix => {
      grouped[prefix].sort((a, b) => {
        const nameA = a.name || a.id || '';
        const nameB = b.name || b.id || '';
        return nameA.localeCompare(nameB);
      });
    });

    return grouped;
  });

  // prefix 목록을 정렬 (모델 수가 많은 순, 그 다음 이름순, other는 항상 마지막)
  let sortedPrefixes = $derived(() => {
    const prefixes = Object.keys(groupedModels());
    
    return prefixes.sort((a, b) => {
      // 'other'는 항상 마지막
      if (a === 'other') return 1;
      if (b === 'other') return -1;
      
      // 모델 수가 많은 순
      const countDiff = (groupedModels()[b]?.length || 0) - (groupedModels()[a]?.length || 0);
      if (countDiff !== 0) return countDiff;
      
      // 이름순
      return formatPrefixName(a).localeCompare(formatPrefixName(b));
    });
  });

  function close() {
    onClose?.();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  function toggleFamily(prefixId: string) {
    if (expandedFamilies.has(prefixId)) {
      expandedFamilies.delete(prefixId);
    } else {
      expandedFamilies.add(prefixId);
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
        {#each sortedPrefixes() as prefixId}
          {@const prefixModels = groupedModels()[prefixId] || []}
          {#if prefixModels.length > 0}
            <div class="family-section">
              <button 
                class="family-header"
                onclick={() => toggleFamily(prefixId)}
                aria-expanded={expandedFamilies.has(prefixId)}
              >
                <div class="family-info">
                  <span class="family-icon">{getPrefixIcon(prefixId)}</span>
                  <div class="family-text">
                    <span class="family-name">{formatPrefixName(prefixId)}</span>
                    <span class="family-count">({prefixModels.length} models)</span>
                  </div>
                </div>
                <span class="family-toggle {expandedFamilies.has(prefixId) ? 'expanded' : ''}">
                  ▼
                </span>
              </button>
              
              {#if expandedFamilies.has(prefixId)}
                <div class="family-models">
                  {#each prefixModels as model}
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
