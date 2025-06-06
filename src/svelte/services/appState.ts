/**
 * 앱 상태 관리자 - 전역 상태와 이벤트 처리
 * 모달 관리는 modalService로 분리됨
 */

import { appService } from './appService';
import { modalService } from './modalService';
import { setError, clearError } from '../stores/ui.svelte';

export class AppStateManager {
  constructor() {
    this.initializeGlobalAPI();
  }

  /**
   * 모달 이벤트 핸들러들
   */
  async handleAuthSuccess(): Promise<void> {
    modalService.hideAuthModal();
    clearError();
    try {
      await appService.initialize();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Initialization failed');
    }
  }

  handleModelSelect(): void {
    modalService.hideModelModal();
    // 모델 선택 로직은 ModelModal 컴포넌트에서 처리
  }

  handleRoleSelect(): void {
    modalService.hideRoleModal();
    // 역할 선택 로직은 RoleModal 컴포넌트에서 처리
  }

  /**
   * 스크롤 처리
   */
  handleScrollToBottom(): void {
    const chatArea = document.querySelector('.chat-area');
    if (chatArea) {
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  }

  /**
   * 전역 API 초기화 (기존 코드와의 호환성)
   */
  private initializeGlobalAPI(): void {
    (window as any).svelteApp = {
      showAuthModal: () => modalService.showAuthModal(),
      showModelModal: () => modalService.showModelModal(),
      showRoleModal: () => modalService.showRoleModal(),
      sendMessage: (message: string) => {
        // ChatInput 컴포넌트로 전달하는 로직
        console.log('Global sendMessage called:', message);
      }
    };
  }

  /**
   * 앱 초기화
   */
  async initialize(): Promise<void> {
    try {
      await appService.initialize();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'App initialization failed');
    }
  }
}

// 싱글톤 인스턴스
export const appStateManager = new AppStateManager(); 
