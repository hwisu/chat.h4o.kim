<script lang="ts">
  import { onMount } from 'svelte';
  import Header from './components/Header.svelte';
  import ChatArea from './components/ChatArea.svelte';
  import ChatInput from './components/ChatInput.svelte';
  import AuthModal from './components/AuthModal.svelte';
  import ModelModal from './components/ModelModal.svelte';
  import RoleModal from './components/RoleModal.svelte';
  import { 
    authStore, 
    modelsStore, 
    rolesStore, 
    messagesStore, 
    uiStore 
  } from './stores';
  import { apiClient } from './services/api';
  import { initializeApp } from './services/app';

  // UI 상태
  let showAuthModal = $state(false);
  let showModelModal = $state(false);
  let showRoleModal = $state(false);

  onMount(async () => {
    // 앱 초기화
    await initializeApp();
    
    // 전역 window 객체에 Svelte 앱 등록 (기존 코드와의 호환성)
    (window as any).svelteApp = {
      // 외부에서 사용할 수 있는 메서드들
      showAuthModal: () => showAuthModal = true,
      showModelModal: () => showModelModal = true,
      showRoleModal: () => showRoleModal = true,
      sendMessage: (message) => {
        // ChatInput 컴포넌트로 전달
      }
    };
  });

  // 모달 이벤트 핸들러
  function handleAuthSuccess(event) {
    showAuthModal = false;
    // 인증 성공 후 모델/역할 로드
    initializeApp();
  }

  function handleModelSelect(event) {
    showModelModal = false;
    // 선택된 모델 설정
  }

  function handleRoleSelect(event) {
    showRoleModal = false;
    // 선택된 역할 설정
  }

  function handleScrollToBottom() {
    // ChatArea에게 스크롤 요청
    const chatArea = document.querySelector('.chat-area');
    if (chatArea) {
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  }

  // 헤더 클릭 이벤트
  function onModelClick() {
    if ($authStore.isAuthenticated) {
      showModelModal = true;
    } else {
      showAuthModal = true;
    }
  }

  function onRoleClick() {
    if ($authStore.isAuthenticated) {
      showRoleModal = true;
    } else {
      showAuthModal = true;
    }
  }
</script>

<div class="app">
  <Header 
    onModelClick={onModelClick}
    onRoleClick={onRoleClick}
  />
  
  <ChatArea />
  
  <ChatInput onScrollToBottom={handleScrollToBottom} />

  <!-- 모달들 -->
  {#if showAuthModal}
    <AuthModal 
      onClose={() => showAuthModal = false}
      onSuccess={handleAuthSuccess}
    />
  {/if}

  {#if showModelModal}
    <ModelModal 
      onClose={() => showModelModal = false}
      onSelect={handleModelSelect}
    />
  {/if}

  {#if showRoleModal}
    <RoleModal 
      onClose={() => showRoleModal = false}
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
