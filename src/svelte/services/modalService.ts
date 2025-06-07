/**
 * 모달 상태 관리 서비스
 */

import type { ModalState } from './types';
import { authState } from '../stores/auth.svelte';

export class ModalService {
  private modalState: ModalState = {
    showAuthModal: false,
    showModelModal: false,
    showRoleModal: false
  };

  private subscribers: ((state: ModalState) => void)[] = [];

  /**
   * 모달 상태 구독
   */
  subscribe(callback: (state: ModalState) => void): () => void {
    this.subscribers.push(callback);
    callback(this.modalState); // 초기 상태 전달
    
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  /**
   * 구독자들에게 상태 변경 알림
   */
  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback({ ...this.modalState }));
  }

  /**
   * 현재 인증 상태 확인
   */
  private isCurrentlyAuthenticated(): boolean {
    return authState.isAuthenticated === true;
  }

  /**
   * Auth 모달 표시
   */
  showAuthModal(): void {
    this.modalState.showAuthModal = true;
    this.notifySubscribers();
  }

  /**
   * Auth 모달 숨김
   */
  hideAuthModal(): void {
    this.modalState.showAuthModal = false;
    this.notifySubscribers();
  }

  /**
   * 인증 성공 후 상태 새로고침
   */
  refreshAfterAuth(): void {
    console.log('[ModalService] Refreshing after authentication...');
    // Force close auth modal and ensure state is clean
    this.modalState.showAuthModal = false;
    this.notifySubscribers();
    
    // Log current auth state for debugging
    const currentAuthState = authState;
    console.log('[ModalService] Auth state after refresh:', {
      isAuthenticated: currentAuthState.isAuthenticated,
      status: currentAuthState.status,
      method: currentAuthState.method,
      hasSessionToken: !!currentAuthState.sessionToken,
      hasApiKey: !!currentAuthState.userApiKey
    });
  }

  /**
   * Model 모달 표시
   */
  showModelModal(): void {
    this.modalState.showModelModal = true;
    this.notifySubscribers();
  }

  /**
   * Model 모달 숨김
   */
  hideModelModal(): void {
    this.modalState.showModelModal = false;
    this.notifySubscribers();
  }

  /**
   * Role 모달 표시
   */
  showRoleModal(): void {
    this.modalState.showRoleModal = true;
    this.notifySubscribers();
  }

  /**
   * Role 모달 숨김
   */
  hideRoleModal(): void {
    this.modalState.showRoleModal = false;
    this.notifySubscribers();
  }

  /**
   * 모든 모달 숨김
   */
  hideAllModals(): void {
    this.modalState.showAuthModal = false;
    this.modalState.showModelModal = false;
    this.modalState.showRoleModal = false;
    this.notifySubscribers();
  }

  /**
   * 헤더 클릭 이벤트 처리 - 모델 관련
   */
  handleModelClick(): void {
    if (this.isCurrentlyAuthenticated()) {
      this.showModelModal();
    } else {
      this.showAuthModal();
    }
  }

  /**
   * 헤더 클릭 이벤트 처리 - 역할 관련
   */
  handleRoleClick(): void {
    if (this.isCurrentlyAuthenticated()) {
      this.showRoleModal();
    } else {
      this.showAuthModal();
    }
  }

  /**
   * 현재 모달 상태 반환
   */
  getCurrentState(): Readonly<ModalState> {
    return { ...this.modalState };
  }
}

// 싱글톤 인스턴스
export const modalService = new ModalService(); 
