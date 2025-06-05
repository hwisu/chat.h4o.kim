// UI utilities for terminal chat
// Handles scrolling, text area resize, iOS compatibility, and viewport management

// iOS version detection for compatibility
export function getIOSVersion() {
    const match = navigator.userAgent.match(/OS (\d+)_/);
    return match ? parseInt(match[1]) : 0;
}

// Smooth scroll to bottom with delay
export function scrollToBottom(outputElement) {
    if (!outputElement) return;
    setTimeout(() => {
        outputElement.scrollTop = outputElement.scrollHeight;
    }, 10);
}

// Auto-resize textarea based on content
export function autoResizeTextarea(inputElement, maxHeight = 200) {
    if (!inputElement) return;
    inputElement.style.height = 'auto';
    inputElement.style.height = Math.min(inputElement.scrollHeight, maxHeight) + 'px';
}

// iOS 18 specific setup for compatibility
export function setupIOS18Compatibility(isIOS18Plus, setupViewportFixFn, setupEnhancedKeyboardHandlingFn) {
    if (!isIOS18Plus) return;

    // Enhanced touch handling for iOS 18
    if ('ontouchstart' in window) {
        document.addEventListener('touchstart', () => {}, { passive: true });
    }

    // iOS 18 viewport height fix
    setupViewportFixFn();

    // Enhanced keyboard handling
    setupEnhancedKeyboardHandlingFn();
}

// iOS 18 viewport units fix
export function setupViewportFix() {
    const setViewportHeight = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);

        // Use dynamic viewport units if supported
        if (CSS.supports('height', '100dvh')) {
            document.documentElement.style.setProperty('--real-vh', '100dvh');
        } else {
            document.documentElement.style.setProperty('--real-vh', `${window.innerHeight}px`);
        }
    };

    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', () => {
        setTimeout(setViewportHeight, 100);
    });
}

// Enhanced keyboard handling for iOS 18
export function setupEnhancedKeyboardHandling(supportsVisualViewport, handleViewportResizeFn, isIOS18Plus, scrollToBottomFn, inputElement) {
    if (supportsVisualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            handleViewportResizeFn();
        });
    }

    // iOS 18 enhanced input focus handling
    if (inputElement) {
        inputElement.addEventListener('focusin', () => {
            if (isIOS18Plus) {
                setTimeout(() => {
                    scrollToBottomFn();
                }, 300);
            }
        });
    }
}

// Handle viewport resize for keyboard management
export function handleViewportResize(scrollToBottomFn) {
    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const isKeyboardOpen = viewportHeight < window.innerHeight;

    if (isKeyboardOpen) {
        // Keyboard is open
        document.body.classList.add('keyboard-open');
        setTimeout(() => {
            scrollToBottomFn();
        }, 100);
    } else {
        // Keyboard is closed
        document.body.classList.remove('keyboard-open');
    }
}

// Setup viewport change handlers
export function setupViewportChangeHandlers(supportsVisualViewport, scrollToBottomFn, isIOS18Plus, inputElement, setupViewportFixFn) {
    const ensureScrollToBottom = () => {
        setTimeout(() => {
            scrollToBottomFn();
        }, 100);
    };

    if (supportsVisualViewport) {
        window.visualViewport.addEventListener('resize', ensureScrollToBottom);
    }

    window.addEventListener('resize', ensureScrollToBottom);

    // Enhanced focus handling for iOS 18
    if (inputElement) {
        inputElement.addEventListener('focus', () => {
            if (isIOS18Plus) {
                setTimeout(ensureScrollToBottom, 300);
            } else {
                ensureScrollToBottom();
            }
        });

        inputElement.addEventListener('blur', ensureScrollToBottom);
    }

    // iOS 18 orientation change handling
    if (isIOS18Plus) {
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                setupViewportFixFn();
                ensureScrollToBottom();
            }, 200);
        });
    }
}

// 메시지 내용을 클립보드에 복사하는 함수
export function copyMessageContent(messageId) {
    const contentElement = document.getElementById(`content-${messageId}`);
    if (contentElement) {
        // Get text content without formatting
        const text = contentElement.textContent;
        navigator.clipboard.writeText(text).then(() => {
            // Visual feedback
            const button = document.getElementById(`copy-response-${messageId}`);
            if (button) {
                const originalText = button.textContent;
                button.textContent = 'copied!';
                button.classList.add('copied');
                setTimeout(() => {
                    button.textContent = originalText;
                    button.classList.remove('copied');
                }, 2000);
            }
        }).catch(err => {
        });
    }
}
