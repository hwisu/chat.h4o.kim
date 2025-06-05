<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Header from './components/Header.svelte';
  import ChatArea from './components/ChatArea.svelte';
  import ChatInput from './components/ChatInput.svelte';
  import AuthModal from './components/AuthModal.svelte';
  import ModelModal from './components/ModelModal.svelte';
  import RoleModal from './components/RoleModal.svelte';
  import { appStateManager } from './services/appState';

  // 모달 상태 관리
  let modalState = $state({
    showAuthModal: false,
    showModelModal: false,
    showRoleModal: false
  });

  let unsubscribeModals: (() => void) | null = null;

  onMount(async () => {
    // 앱 초기화
    await appStateManager.initialize();
    
    // 모달 상태 구독
    unsubscribeModals = appStateManager.subscribeToModals((state) => {
      modalState = { ...state };
    });
  });

  onDestroy(() => {
    if (unsubscribeModals) {
      unsubscribeModals();
    }
  });

  // 이벤트 핸들러들 - AppStateManager에 위임
  const handleModelClick = () => appStateManager.handleModelClick();
  const handleRoleClick = () => appStateManager.handleRoleClick();
  const handleAuthSuccess = () => appStateManager.handleAuthSuccess();
  const handleModelSelect = () => appStateManager.handleModelSelect();
  const handleRoleSelect = () => appStateManager.handleRoleSelect();
  const handleScrollToBottom = () => appStateManager.handleScrollToBottom();
  
  // 모달 닫기 핸들러들
  const closeAuthModal = () => appStateManager.hideAuthModal();
  const closeModelModal = () => appStateManager.hideModelModal();
  const closeRoleModal = () => appStateManager.hideRoleModal();
</script>

<div class="app">
  <Header 
    onModelClick={handleModelClick}
    onRoleClick={handleRoleClick}
  />
  
  <ChatArea />
  
  <ChatInput onScrollToBottom={handleScrollToBottom} />

  <!-- 모달들 -->
  {#if modalState.showAuthModal}
    <AuthModal 
      onClose={closeAuthModal}
      onSuccess={handleAuthSuccess}
    />
  {/if}

  {#if modalState.showModelModal}
    <ModelModal 
      onClose={closeModelModal}
      onSelect={handleModelSelect}
    />
  {/if}

  {#if modalState.showRoleModal}
    <RoleModal 
      onClose={closeRoleModal}
      onSelect={handleRoleSelect}
    />
  {/if}
</div>

<style>
  .app {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #000000;
    color: #ffffff;
    font-family: 'MonoplexKRNerd', 'JetBrains Mono', monospace;
    border: none;
    outline: none;
    margin: 0;
    padding: 0;
  }
</style> 
