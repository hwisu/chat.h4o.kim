/**
 * 모달 컴포넌트의 공통 기능을 제공하는 유틸리티
 */

export interface ModalCallbacks {
  onClose?: () => void;
}

/**
 * 모달 닫기 함수
 */
export function createCloseHandler(callbacks: ModalCallbacks) {
  return function close() {
    callbacks.onClose?.();
  };
}

/**
 * 배경 클릭 시 모달 닫기 핸들러
 */
export function createBackdropClickHandler(closeHandler: () => void) {
  return function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeHandler();
    }
  };
}

/**
 * 키보드 이벤트 핸들러 (ESC로 모달 닫기)
 */
export function createKeydownHandler(closeHandler: () => void, additionalHandlers?: (event: KeyboardEvent) => void) {
  return function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeHandler();
    } else if (additionalHandlers) {
      additionalHandlers(event);
    }
  };
}

/**
 * 모달의 공통 이벤트 핸들러들을 생성하는 팩토리 함수
 */
export function createModalHandlers(callbacks: ModalCallbacks, additionalKeyHandlers?: (event: KeyboardEvent) => void) {
  const close = createCloseHandler(callbacks);
  const handleBackdropClick = createBackdropClickHandler(close);
  const handleKeydown = createKeydownHandler(close, additionalKeyHandlers);

  return {
    close,
    handleBackdropClick,
    handleKeydown
  };
} 
