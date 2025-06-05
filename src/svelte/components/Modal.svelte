<script>
  // Svelte 5 props 시스템 사용
  let { title = '', isOpen = false, onClose } = $props();
  
  // 모달 닫기 함수
  function closeModal() {
    onClose?.();
  }
  
  // 이벤트 디스패처
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

{#if isOpen}
<div class="modal-backdrop" onclick={closeModal}>
  <div class="modal-content" onclick={(e) => e.stopPropagation()}>
    <div class="modal-header">
      <h3>{title}</h3>
      <button class="modal-close" onclick={closeModal}>×</button>
    </div>
    <div class="modal-body">
      {#if children}
        {@render children()}
      {/if}
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  
  .modal-content {
    background-color: #1a1a1a;
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 0 20px rgba(0, 255, 0, 0.2);
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 15px;
    border-bottom: 1px solid #333;
  }
  
  .modal-header h3 {
    margin: 0;
    color: #00ff00;
  }
  
  .modal-close {
    background: none;
    border: none;
    font-size: 24px;
    color: #999;
    cursor: pointer;
  }
  
  .modal-close:hover {
    color: #00ff00;
  }
  
  .modal-body {
    padding: 15px;
  }
</style> 
