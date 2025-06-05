import { initializeApp } from './app';
import { 
  authState, 
  setError, 
  clearError,
  type AuthState 
} from '../stores';

interface ModalState {
  showAuthModal: boolean;
  showModelModal: boolean;
  showRoleModal: boolean;
}

export class AppStateManager {
  private modalState: ModalState = {
    showAuthModal: false,
    showModelModal: false,
    showRoleModal: false
  };

  private modalSubscribers: ((state: ModalState) => void)[] = [];

  constructor() {
    this.initializeGlobalAPI();
  }

  // 모달 상태 구독
  subscribeToModals(callback: (state: ModalState) => void) {
    this.modalSubscribers.push(callback);
    callback(this.modalState); // 초기 상태 전달
    
    return () => {
      const index = this.modalSubscribers.indexOf(callback);
      if (index > -1) {
        this.modalSubscribers.splice(index, 1);
      }
    };
  }

  private notifyModalSubscribers() {
    this.modalSubscribers.forEach(callback => callback(this.modalState));
  }

  // 모달 제어 메서드들
  showAuthModal() {
    this.modalState.showAuthModal = true;
    this.notifyModalSubscribers();
  }

  hideAuthModal() {
    this.modalState.showAuthModal = false;
    this.notifyModalSubscribers();
  }

  showModelModal() {
    this.modalState.showModelModal = true;
    this.notifyModalSubscribers();
  }

  hideModelModal() {
    this.modalState.showModelModal = false;
    this.notifyModalSubscribers();
  }

  showRoleModal() {
    this.modalState.showRoleModal = true;
    this.notifyModalSubscribers();
  }

  hideRoleModal() {
    this.modalState.showRoleModal = false;
    this.notifyModalSubscribers();
  }

  // 헤더 클릭 이벤트 처리
  async handleModelClick() {
    if (authState.isAuthenticated) {
      this.showModelModal();
    } else {
      this.showAuthModal();
    }
  }

  async handleRoleClick() {
    if (authState.isAuthenticated) {
      this.showRoleModal();
    } else {
      this.showAuthModal();
    }
  }

  // 모달 이벤트 핸들러들
  async handleAuthSuccess() {
    this.hideAuthModal();
    clearError();
    try {
      await initializeApp();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Initialization failed');
    }
  }

  handleModelSelect() {
    this.hideModelModal();
    // 모델 선택 로직은 ModelModal 컴포넌트에서 처리
  }

  handleRoleSelect() {
    this.hideRoleModal();
    // 역할 선택 로직은 RoleModal 컴포넌트에서 처리
  }

  // 스크롤 처리
  handleScrollToBottom() {
    const chatArea = document.querySelector('.chat-area');
    if (chatArea) {
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  }

  // 전역 API 초기화 (기존 코드와의 호환성)
  private initializeGlobalAPI() {
    (window as any).svelteApp = {
      showAuthModal: () => this.showAuthModal(),
      showModelModal: () => this.showModelModal(),
      showRoleModal: () => this.showRoleModal(),
      sendMessage: (message: string) => {
        // ChatInput 컴포넌트로 전달하는 로직
        console.log('Global sendMessage called:', message);
      }
    };
  }

  // 앱 초기화
  async initialize() {
    try {
      await initializeApp();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'App initialization failed');
    }
  }
}

// 싱글톤 인스턴스
export const appStateManager = new AppStateManager(); 
