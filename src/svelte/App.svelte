<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Header from './components/Header.svelte';
  import ChatArea from './components/ChatArea.svelte';
  import ChatInput from './components/ChatInput.svelte';
  // 모달 컴포넌트들을 동적으로 로드
  let AuthModal: any = $state(null);
  let ModelModal: any = $state(null);
  let RoleModal: any = $state(null);

  // 동적 로드 함수들
  async function loadAuthModal() {
    if (!AuthModal) {
      const module = await import('./components/AuthModal.svelte');
      AuthModal = module.default;
    }
    return AuthModal;
  }

  async function loadModelModal() {
    if (!ModelModal) {
      const module = await import('./components/ModelModal.svelte');
      ModelModal = module.default;
    }
    return ModelModal;
  }

  async function loadRoleModal() {
    if (!RoleModal) {
      const module = await import('./components/RoleModal.svelte');
      RoleModal = module.default;
    }
    return RoleModal;
  }
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

  <!-- 모달들 - 동적 로드 -->
  {#if modalState.showAuthModal}
    {#await loadAuthModal() then AuthModalComponent}
      <AuthModalComponent 
        onClose={closeAuthModal}
        onSuccess={handleAuthSuccess}
      />
    {/await}
  {/if}

  {#if modalState.showModelModal}
    {#await loadModelModal() then ModelModalComponent}
      <ModelModalComponent 
        onClose={closeModelModal}
        onSelect={handleModelSelect}
      />
    {/await}
  {/if}

  {#if modalState.showRoleModal}
    {#await loadRoleModal() then RoleModalComponent}
      <RoleModalComponent 
        onClose={closeRoleModal}
        onSelect={handleRoleSelect}
      />
    {/await}
  {/if}
</div>

<style>
  :global(html) {
    scroll-behavior: smooth;
    scroll-padding-top: 60px;
    /* 모바일 키보드 최적화 */
    -webkit-text-size-adjust: 100%;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :global(body) {
    scroll-behavior: smooth;
    /* 모바일 터치 최적화 */
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    overscroll-behavior-y: none;
  }

  .app {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #000000;
    color: #ffffff;
    font-family: 'MonoplexKRNerd', monospace;
    border: none;
    outline: none;
    margin: 0;
    padding: 0;
  }


</style> 
