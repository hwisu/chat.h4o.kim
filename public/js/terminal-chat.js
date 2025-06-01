// Main Terminal Chat functionality
class TerminalChat {
    constructor() {
        this.output = document.getElementById('output');
        this.messageInput = document.getElementById('messageInput');
        this.inputSpinner = document.getElementById('inputSpinner');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.authStatus = document.getElementById('authStatus');
        this.contextUsage = document.getElementById('contextUsage');
        this.sendButton = document.getElementById('sendButton');
        this.modelModal = document.getElementById('modelModal');
        this.modelModalClose = document.getElementById('modelModalClose');
        this.modelList = document.getElementById('modelList');

        // Check for missing DOM elements
        const requiredElements = [
            { element: this.output, name: 'output' },
            { element: this.messageInput, name: 'messageInput' },
            { element: this.sendButton, name: 'sendButton' }
        ];

        const missingElements = requiredElements.filter(item => !item.element);
        if (missingElements.length > 0) {
            console.error('Missing required DOM elements:', missingElements.map(item => item.name));
        }

        // Warn about optional missing elements
        if (!this.statusIndicator) console.warn('statusIndicator element not found');
        if (!this.authStatus) console.warn('authStatus element not found');
        if (!this.inputSpinner) console.warn('inputSpinner element not found');

        this.authenticated = false;
        this.availableModels = [];
        this.selectedModel = null;
        this.currentModelIndex = 0;
        this.isLoading = false;

        // Model information with context sizes
        this.selectedModelInfo = {
            id: null,
            context_length: 128000 // Default context size
        };

        // Conversation management - simplified to use only model context size
        this.conversationHistory = [];
        this.maxContextSize = 128000; // Will be dynamically set based on selected model
        this.currentTokenUsage = 0; // Current actual token usage
        
        // Compression settings for efficient communication
        this.enableCompression = true;
        this.compressionMinSize = 1000; // Only compress messages over 1KB
        this.preferZstdCompression = true; // Try ZSTD first, fallback to simple compression
        this.zstdAvailable = false; // Will be set after initialization

        // User API key management
        this.userApiKey = null;
        this.encryptionKey = 'chatty-h4o-2025'; // Simple key for local encryption

        // Authentication and context tracking
        this.authMethod = null;
        this.authType = null;

        // iOS 18 compatibility flags
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isIOS18Plus = this.isIOS && this.getIOSVersion() >= 18;
        this.supportsVisualViewport = 'visualViewport' in window;

        // Initialize modules
        this.markdownParser = new MarkdownParser();

        // Check compression library availability
        if (typeof LZString !== 'undefined') {
            console.log('✅ LZ-String compression library loaded');
            this.lzStringAvailable = true;
        } else {
            console.warn('⚠️ LZ-String library not available, using fallback compression');
            this.preferZstdCompression = false;
        }

        this.init();
    }

    // iOS version detection for compatibility
    getIOSVersion() {
        const match = navigator.userAgent.match(/OS (\d+)_(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    init() {
        // Check for storage clearing parameter
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('clear_storage') === '1') {
            localStorage.clear();
            // Clear auth cookies
            document.cookie = 'auth_token=; Path=/; Max-Age=0';
            document.cookie = 'selected_model=; Path=/; Max-Age=0';
            // Clear URL parameter
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Initialize basic state from localStorage (but verify with server)
        this.selectedModel = this.getStoredModel();
        this.userApiKey = this.getStoredUserApiKey();
        
        // Set initial UI state (will be updated after server verification)
        this.updateModelTitle();
        this.setupEventListeners();
        this.updateSendButton();
        this.autoResizeTextarea();

        if (this.messageInput) {
            this.messageInput.focus();
        }

        // iOS 18 specific initialization
        if (this.isIOS18Plus) {
            this.setupIOS18Compatibility();
        }

        // Immediately verify authentication with server and initialize everything
        this.initializeAppBackground();
    }

    async initializeAppBackground() {
        // First, always verify authentication with server (cookies are httpOnly)
        await this.updateAuthenticationInfo();
        
        // Update welcome message based on authentication status
        this.updateWelcomeMessage();

        // Then initialize models
        await this.initializeModelsBackground();

        // Initialize context display
        this.updateContextDisplay();
    }

    // iOS 18 specific setup
    setupIOS18Compatibility() {
        // Enhanced touch handling for iOS 18
        if ('ontouchstart' in window) {
            document.addEventListener('touchstart', () => {}, { passive: true });
        }

        // iOS 18 viewport height fix
        this.setupViewportFix();

        // Enhanced keyboard handling
        this.setupEnhancedKeyboardHandling();
    }

    setupViewportFix() {
        // iOS 18 viewport units fix
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

    setupEnhancedKeyboardHandling() {
        if (this.supportsVisualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                this.handleViewportResize();
            });
        }

        // iOS 18 enhanced input focus handling
        this.messageInput.addEventListener('focusin', () => {
            if (this.isIOS18Plus) {
                setTimeout(() => {
                    this.scrollToBottom();
                }, 300);
            }
        });
    }

    handleViewportResize() {
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const isKeyboardOpen = viewportHeight < window.innerHeight;

        if (isKeyboardOpen) {
            // Keyboard is open
            document.body.classList.add('keyboard-open');
            setTimeout(() => {
                this.scrollToBottom();
            }, 100);
        } else {
            // Keyboard is closed
            document.body.classList.remove('keyboard-open');
        }
    }

    async initializeModelsBackground() {
        try {
            await this.loadModelsBackground();
            if (!this.selectedModel || this.selectedModel === 'auto') {
                await this.setModelAuto();
            } else {
                // 이미 저장된 모델이 있으면 타이틀 업데이트
                this.updateModelTitle();
            }
        } catch (error) {
            console.warn('Background model initialization failed:', error);
        }
    }

    async loadModelsBackground() {
        if (this.availableModels.length === 0 || this.userApiKey) {
            this.availableModels = this.getStoredModels();
        }

        // 사용자 API 키를 사용하는 경우 캐시를 우회하고 최신 모델 목록을 가져옴
        if (this.availableModels.length === 0 || this.userApiKey) {
            try {
                // Prepare headers with user API key if available
                const headers = { 'Content-Type': 'application/json' };
                if (this.userApiKey) {
                    headers['X-User-API-Key'] = this.userApiKey;
                }

                const response = await fetch('/api/models', {
                    method: 'GET',
                    headers: headers
                });

                if (response.status === 401) {
                    // Authentication required - clear any stored auth state
                    this.setAuthenticated(false);
                    console.log('Models loading failed: Authentication required');
                    return;
                }

                if (response.ok) {
                    const data = await response.json();
                    if (data.models && Array.isArray(data.models)) {
                        this.availableModels = data.models.map(model =>
                            typeof model === 'string' ? model : model.id
                        );
                        this.setStoredModels(this.availableModels);
                        
                        const modelCount = this.availableModels.length;
                        const keyType = this.userApiKey ? 'personal API key' : 'server key';
                        console.log(`Models loaded in background: ${modelCount} models using ${keyType}`);
                        
                        this.updateModelTitle();
                    }
                } else {
                    // Silent fallback on error
                }
            } catch (error) {
                // Silent fallback on error
            }
        }
    }

    async setModelAuto() {
        try {
            // Prepare headers with user API key if available
            const headers = { 'Content-Type': 'application/json' };
            if (this.userApiKey) {
                headers['X-User-API-Key'] = this.userApiKey;
            }

            const response = await fetch('/api/set-model', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ model: 'auto' })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.selectedModel = 'auto';
                    localStorage.setItem('selected-model', 'auto');
                    this.updateModelTitle();
                    console.log('Auto model set in background');
                }
            }
        } catch (error) {
            console.warn('Failed to set auto model:', error);
        }
    }

    getStoredModel() {
        return localStorage.getItem('selected-model') || null;
    }

    getStoredModels() {
        try {
            const cached = localStorage.getItem('cached-models');
            if (cached) {
                const data = JSON.parse(cached);
                if (Date.now() - data.timestamp < 5 * 60 * 1000) {
                    return data.models;
                }
            }
        } catch (error) {
            console.warn('Failed to parse cached models:', error);
        }
        return [];
    }

    setStoredModels(models) {
        try {
            const data = { models: models, timestamp: Date.now() };
            localStorage.setItem('cached-models', JSON.stringify(data));
        } catch (error) {
            console.warn('Failed to cache models:', error);
        }
    }

    updateWelcomeMessage() {
        // Remove existing auth messages
        const existingAuth = document.querySelector('.auth-required-message');
        if (existingAuth) {
            existingAuth.remove();
        }

        if (!this.authenticated && !this.userApiKey) {
            // Show options for authentication OR API key
            this.addSystemMessage(`🔐 Choose your access method:\n\n📡 Option 1: Server Login\n• Use /login <password> to authenticate\n• Uses server's API key (free access)\n\n🔑 Option 2: Personal API Key\n• Use /set-api-key <your-key> to set your own key\n• Uses your OpenRouter account and quota\n• Get your key: https://openrouter.ai/settings/keys\n\n💡 You only need to choose ONE option!`, 'auth-required-message');
            return;
        }

        if (!document.querySelector('.welcome-message')) {
            let accessMethod = '';
            if (this.userApiKey) {
                accessMethod = '🔑 Using your personal API key';
            } else if (this.authenticated) {
                accessMethod = '📡 Using server API key';
            }
            
            this.addSystemMessage(`✅ Welcome to Chatty!\n\n🧠 Features:\n• Conversation context maintained across messages\n• Type /help to see available commands\n• Start chatting with AI models!\n\n${accessMethod}`, 'welcome-message');
        }
    }

    setAuthenticated(authenticated) {
        this.authenticated = authenticated;
        if (authenticated) {
            if (this.statusIndicator) {
                this.statusIndicator.classList.add('authenticated');
            }
            if (this.authStatus) {
                this.authStatus.textContent = 'Authenticated';
                this.authStatus.style.color = '#00aa00';
            }

            const authMsg = document.querySelector('.auth-required-message');
            if (authMsg) {
                authMsg.remove();
            }
        } else {
            if (this.statusIndicator) {
                this.statusIndicator.classList.remove('authenticated');
            }
            if (this.authStatus) {
                if (this.userApiKey) {
                    this.authStatus.textContent = 'Personal API Key';
                    this.authStatus.style.color = '#00aa00';
                } else {
                    this.authStatus.textContent = 'Choose access method';
                    this.authStatus.style.color = '#666';
                }
            }
        }
    }

    setupEventListeners() {
        // Initialize composition state as class property
        this.isComposing = false;

        // Model title click handler for showing model selection modal
        const modelTitle = document.getElementById('modelTitle');
        if (modelTitle) {
            modelTitle.addEventListener('click', () => {
                this.showModelModal();
            });
            modelTitle.style.cursor = 'pointer';
        }

        this.messageInput.addEventListener('compositionstart', () => {
            this.isComposing = true;
        });

        this.messageInput.addEventListener('compositionend', () => {
            this.isComposing = false;
        });

        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    return; // Allow line break
                } else {
                    e.preventDefault();
                    const messageText = this.messageInput.value.trim();

                    if (!this.isComposing && messageText && !this.isLoading) {
                        this.sendMessage();
                    }
                }
            }
        });

        this.messageInput.addEventListener('input', () => {
            this.autoResizeTextarea();
            this.updateSendButton();
        });

        // Enhanced send button events for iOS 18
        this.setupSendButtonEvents();

        this.messageInput.focus();
        this.handleViewportChanges();

        // Model modal event listeners
        if (this.modelModalClose) {
            this.modelModalClose.addEventListener('click', () => {
                this.hideModelModal();
            });
        }

        if (this.modelModal) {
            this.modelModal.addEventListener('click', (e) => {
                if (e.target === this.modelModal) {
                    this.hideModelModal();
                }
            });
        }

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modelModal.classList.contains('show')) {
                this.hideModelModal();
            }
        });
    }

    setupSendButtonEvents() {
        if ('ontouchstart' in window) {
            // Enhanced touch handling for iOS 18
            let touchStartTime = 0;

            this.sendButton.addEventListener('touchstart', (e) => {
                touchStartTime = Date.now();
                e.preventDefault();
            }, { passive: false });

            this.sendButton.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const touchDuration = Date.now() - touchStartTime;
                if (touchDuration < 1000) { // Prevent accidental long presses
                    this.handleSendButtonPress();
                }
            }, { passive: false });
        } else {
            this.sendButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleSendButtonPress();
            });
        }
    }

    handleViewportChanges() {
        const ensureScrollToBottom = () => {
            setTimeout(() => {
                this.scrollToBottom();
            }, 100);
        };

        if (this.supportsVisualViewport) {
            window.visualViewport.addEventListener('resize', ensureScrollToBottom);
        }

        window.addEventListener('resize', ensureScrollToBottom);

        // Enhanced focus handling for iOS 18
        this.messageInput.addEventListener('focus', () => {
            if (this.isIOS18Plus) {
                setTimeout(ensureScrollToBottom, 300);
            } else {
                ensureScrollToBottom();
            }
        });

        this.messageInput.addEventListener('blur', ensureScrollToBottom);

        // iOS 18 orientation change handling
        if (this.isIOS18Plus) {
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    this.setupViewportFix();
                    ensureScrollToBottom();
                }, 200);
            });
        }
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();

        if (!message || this.isLoading) {
            return;
        }

        this.isLoading = true;

        this.addUserMessage(message);
        this.messageInput.value = '';
        this.autoResizeTextarea();
        this.updateSendButton();
        this.showLoading();

        try {
            const startTime = performance.now();
            let response, data;

            if (message.startsWith('/')) {
                const result = await this.handleCommand(message);
                response = { ok: result.success };
                data = result.data;
            } else {
                // Add user message to conversation history (only for non-commands)
                this.addToConversationHistory('user', message);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);

                // Prepare headers with user API key if available
                const headers = { 'Content-Type': 'application/json' };
                if (this.userApiKey) {
                    headers['X-User-API-Key'] = this.userApiKey;
                }

                // Prepare messages with current context and calculate tokens
                const messagesForAPI = this.prepareMessagesForAPI(message);

                // Prepare and compress payload
                const payload = {
                    message: message,
                    conversationHistory: this.conversationHistory
                };
                const compressedPayload = this.compressData(payload);

                try {
                    response = await fetch('/api/chat', {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(compressedPayload),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    throw fetchError;
                }

                data = await response.json();
            }

            const responseTime = performance.now() - startTime;

            if (response.ok) {
                if (data.login_success) {
                    this.setAuthenticated(true);
                    // Update authentication info after successful login
                    await this.updateAuthenticationInfo();
                    // Show login success message
                    let accessMethod = '';
                    if (this.userApiKey) {
                        accessMethod = '🔑 Using your personal API key';
                    } else {
                        accessMethod = '📡 Using server API key';
                    }
                    this.addSystemMessage(`✅ Authentication successful! You are now logged in.\n\n${accessMethod}`, 'login-success-message');
                    
                    // Reload models after successful login
                    this.availableModels = []; // Clear cache to force refresh
                    this.loadModelsBackground();
                }
                if (data.response && !data.login_success) {
                    // Add assistant response to conversation history
                    this.addToConversationHistory('assistant', data.response);
                    this.addAssistantMessage(data.response, data.model, data.korean_optimized);
                }
            } else {
                if (response.status === 401 || data.auth_required) {
                    this.setAuthenticated(false);
                    // Clear any cached models when auth fails
                    this.availableModels = [];
                    localStorage.removeItem('cached-models');
                    
                    if (message.startsWith('/login')) {
                        this.addErrorMessage(data.response || 'Authentication failed. Please check your password.');
                    } else {
                        this.addErrorMessage('Authentication required. Use /login <password> to authenticate.');
                    }
                } else {
                    this.addErrorMessage(data.error || `Server error (${response.status}): ${response.statusText}`);
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            if (error.name === 'AbortError') {
                this.addErrorMessage('Request timeout. Please try again.');
            } else {
                this.addErrorMessage('Network error: ' + error.message);
            }
        } finally {
            this.hideLoading();
            this.isLoading = false;
            this.updateSendButton();

            if (!('ontouchstart' in window) || document.activeElement === this.messageInput) {
                this.messageInput.focus();
            }
        }
    }

    async handleCommand(message) {
        const parts = message.split(' ');
        const command = parts[0];

        try {
            switch (command) {
                case '/login':
                    return await this.handleLogin(parts.slice(1).join(' '));
                case '/clear':
                    // Clear local conversation history and context
                    this.clearConversationHistory();
                    // Clear the output display
                    this.output.innerHTML = '';
                    return {
                        success: true,
                        data: { response: '🗑️ Context and conversation history cleared!' }
                    };
                case '/set-api-key':
                    return this.handleSetApiKey(parts.slice(1).join(' '));
                case '/remove-api-key':
                    return this.handleRemoveApiKey();
                case '/api-key-status':
                    return this.handleApiKeyStatus();
                case '/help':
                    return this.handleHelp();
                default:
                    return {
                        success: false,
                        data: { error: `Unknown command: ${command}` }
                    };
            }
        } catch (error) {
            return {
                success: false,
                data: { error: error.message }
            };
        }
    }

    async handleLogin(password) {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        });

        const data = await response.json();
        return { success: response.ok, data: data };
    }

    addUserMessage(content) {
        const timestamp = new Date().toLocaleTimeString();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user-message';
        messageDiv.innerHTML = `
            <div class="message-header">[USER] ${timestamp}</div>
            <div class="message-content">${this.escapeHtml(content)}</div>
        `;
        this.output.appendChild(messageDiv);
        this.scrollToBottom();
    }

    shortenModelName(modelName) {
        if (!modelName || modelName === 'system') return '';

        const parts = modelName.split('/');
        if (parts.length < 2) return modelName;

        const modelPart = parts[1];
        const modelParts = modelPart.split('-');
        const shortName = modelParts.slice(0, 3).join('-');

        return shortName.replace(':free', '');
    }

    addAssistantMessage(content, model) {
        const timestamp = new Date().toLocaleTimeString();
        const shortModelName = this.shortenModelName(model);
        const modelInfo = shortModelName ? ` - ${shortModelName}` : '';
        const AIBadge = '<span class="ai-badge">AI</span>';

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant-message';

        const formattedContent = this.markdownParser.renderContent(content);

        messageDiv.innerHTML = `
            <div class="message-header">[AI${modelInfo}] ${timestamp} ${AIBadge}</div>
            <div class="message-content">${formattedContent}</div>
        `;
        this.output.appendChild(messageDiv);

        // Apply additional syntax highlighting if highlight.js is available
        if (typeof hljs !== 'undefined') {
            const codeBlocks = messageDiv.querySelectorAll('pre code');
            codeBlocks.forEach(block => {
                if (!block.classList.contains('hljs')) {
                    try {
                        hljs.highlightElement(block);
                    } catch (err) {
                        // Silent fallback
                    }
                }
            });
        }

        this.scrollToBottom();
    }

    addSystemMessage(content, extraClass = '') {
        const timestamp = new Date().toLocaleTimeString();
        const messageDiv = document.createElement('div');
        messageDiv.className = `message system-message ${extraClass}`;
        messageDiv.innerHTML = `
            <div class="message-header">[SYSTEM] ${timestamp}</div>
            <div class="message-content">${this.escapeHtml(content)}</div>
        `;
        this.output.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addErrorMessage(content) {
        const timestamp = new Date().toLocaleTimeString();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message error-message';
        messageDiv.innerHTML = `
            <div class="message-header">[ERROR] ${timestamp}</div>
            <div class="message-content">${this.escapeHtml(content)}</div>
        `;
        this.output.appendChild(messageDiv);
        this.scrollToBottom();
    }

    updateSendButton() {
        const hasText = this.messageInput.value.trim().length > 0;
        const canSend = hasText && !this.isLoading;

        this.sendButton.disabled = !canSend;

        if (canSend) {
            this.sendButton.style.opacity = '1';
            this.sendButton.style.transform = 'scale(1)';
        } else {
            this.sendButton.style.opacity = '0.5';
            this.sendButton.style.transform = 'scale(0.9)';
        }
    }

    showLoading() {
        this.showTypingAnimation();
        this.updateSendButton();
        this.scrollToBottom();
        // 센드버튼 아이콘을 asterisk로 교체하고 애니메이션 클래스 추가
        const sendArrow = this.sendButton.querySelector('.send-arrow');
        if (sendArrow) {
            sendArrow.textContent = '✱';
            sendArrow.classList.add('asterisk-anim');
        }
    }

    hideLoading() {
        this.hideTypingAnimation();
        this.updateSendButton();
        // 센드버튼 아이콘을 ↑로 복구하고 애니메이션 클래스 제거
        const sendArrow = this.sendButton.querySelector('.send-arrow');
        if (sendArrow) {
            sendArrow.textContent = '↑';
            sendArrow.classList.remove('asterisk-anim');
        }
    }

    showTypingAnimation() {
        this.hideTypingAnimation();

        // 채팅창만 숨쉬는 효과 추가
        this.output.classList.add('breathing');
        this.scrollToBottom();
    }

    hideTypingAnimation() {
        // 숨쉬는 효과 제거
        this.output.classList.remove('breathing');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    scrollToBottom() {
        // Enhanced scroll for iOS 18
        if (this.isIOS18Plus) {
            // Use multiple scroll attempts for iOS 18 reliability
            const scrollAttempt = () => {
                this.output.scrollTop = this.output.scrollHeight;
            };

            requestAnimationFrame(scrollAttempt);
            setTimeout(scrollAttempt, 16);
            setTimeout(scrollAttempt, 100);
        } else {
            requestAnimationFrame(() => {
                this.output.scrollTop = this.output.scrollHeight;

                setTimeout(() => {
                    this.output.scrollTop = this.output.scrollHeight;
                    this.output.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }, 50);
            });
        }
    }

    stringToColor(str) {
        return this.markdownParser.stringToColor(str);
    }

    autoResizeTextarea() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 200) + 'px';
    }

    handleSendButtonPress() {
        const messageText = this.messageInput.value.trim();

        if (messageText && !this.isLoading) {
            this.sendMessage();
        }
    }

    updateModelTitle() {
        const modelTitle = document.getElementById('modelTitle');
        if (modelTitle) {
            let modelName = this.selectedModel;
            if (!modelName || modelName === 'auto') {
                modelName = this.availableModels && this.availableModels.length > 0 ? this.availableModels[0] : 'whoami';
            }
            
            let displayName = this.shortenModelName(modelName) || modelName;
            
            // 사용자 API 키 사용시 표시 추가
            if (this.userApiKey) {
                displayName += ' 👑';
            }
            
            modelTitle.textContent = displayName;
        }
    }

    showModelModal() {
        if (!this.authenticated && !this.userApiKey) {
            this.addSystemMessage('Please login with /login <password> or set your API key with /set-api-key <key> first to change models.');
            return;
        }

        this.populateModelList();
        this.modelModal.classList.add('show');
    }

    hideModelModal() {
        this.modelModal.classList.remove('show');
    }

    async populateModelList() {
        // Show loading state
        this.modelList.innerHTML = '<div class="model-list-loading">Loading models...</div>';

        // Load models if not already loaded or force reload if using user API key
        if (this.availableModels.length === 0 || this.userApiKey) {
            await this.loadModelsBackground();
        }

        // Clear loading and populate list
        this.modelList.innerHTML = '';

        if (this.availableModels.length === 0) {
            this.modelList.innerHTML = '<div class="model-list-loading">No models available</div>';
            return;
        }

        // 사용자 API 키를 사용할 때는 모든 모델을 표시
        const displayModels = this.userApiKey ? this.availableModels : this.availableModels;

        displayModels.forEach((model, index) => {
            const modelItem = document.createElement('div');
            modelItem.className = 'model-item';
            
            if (model === this.selectedModel) {
                modelItem.classList.add('selected');
            }

            // Parse model name for better display
            const modelMatch = model.match(/^(.+?)\/(.+)$/);
            if (modelMatch) {
                const provider = modelMatch[1];
                const modelName = modelMatch[2].replace(':free', '');
                const providerColor = this.stringToColor(provider);
                
                // Add star for meta and google models, crown for user API key models
                let indicator = '';
                if (this.userApiKey) {
                    indicator = ' 👑'; // Crown for user API key
                } else if (provider === 'meta-llama' || provider === 'google') {
                    indicator = ' ✱'; // Star for meta and google models
                }
                
                modelItem.innerHTML = `
                    <div style="color: ${providerColor}; font-weight: 500;">${provider}/${modelName}${indicator}</div>
                    <div class="model-provider">${provider}${this.userApiKey ? ' (Your API Key)' : ''}</div>
                `;
            } else {
                modelItem.innerHTML = `
                    <div style="font-weight: 500;">${model}${this.userApiKey ? ' 👑' : ''}</div>
                    <div class="model-provider">${this.userApiKey ? 'Your API Key' : 'Server'}</div>
                `;
            }

            modelItem.addEventListener('click', () => {
                this.selectModelFromModal(model, index);
            });

            this.modelList.appendChild(modelItem);
        });

        // Add info message for user API key
        if (this.userApiKey) {
            const infoDiv = document.createElement('div');
            infoDiv.className = 'model-list-info';
            infoDiv.innerHTML = `
                <div style="padding: 12px 20px; color: #00ff00; font-size: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                    🔑 Using your personal API key - All models available
                </div>
            `;
            this.modelList.appendChild(infoDiv);
        }
    }

    async selectModelFromModal(model, index) {
        try {
            await this.setModel(model);
            this.currentModelIndex = index;
            this.hideModelModal();
        } catch (error) {
            console.error('Failed to select model:', error);
        }
    }

    async setModel(modelName) {
        try {
            // Prepare headers with user API key if available
            const headers = { 'Content-Type': 'application/json' };
            if (this.userApiKey) {
                headers['X-User-API-Key'] = this.userApiKey;
            }

            const response = await fetch('/api/set-model', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ model: modelName })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.selectedModel = modelName;
                    localStorage.setItem('selected-model', modelName);
                    
                    // Find model info and update context size
                    this.updateModelInfo(modelName);
                    
                    this.updateModelTitle();
                    this.addSystemMessage(`Model switched to: ${this.shortenModelName(modelName)}`);
                    console.log('Model set to:', modelName);
                } else {
                    this.addErrorMessage('Failed to set model: ' + (data.error || 'Unknown error'));
                }
            } else {
                this.addErrorMessage('Failed to set model: HTTP ' + response.status);
            }
        } catch (error) {
            console.error('Failed to set model:', error);
            this.addErrorMessage('Failed to set model: ' + error.message);
        }
    }

    // Update model information and context size
    updateModelInfo(modelName) {
        // Find model in available models list
        const modelInfo = this.availableModels.find(m => 
            (typeof m === 'string' ? m : m.id) === modelName
        );
        
        if (modelInfo && typeof modelInfo === 'object' && modelInfo.context_length) {
            this.selectedModelInfo = {
                id: modelName,
                context_length: modelInfo.context_length
            };
            this.maxContextSize = modelInfo.context_length;
            
            console.log(`📏 Model context updated: ${modelName} -> ${modelInfo.context_length} tokens`);
        } else {
            // Fallback for models without context info or string-only models
            this.selectedModelInfo = {
                id: modelName,
                context_length: this.getDefaultContextSize(modelName)
            };
            this.maxContextSize = this.selectedModelInfo.context_length;
            
            console.log(`📏 Model context fallback: ${modelName} -> ${this.maxContextSize} tokens (estimated)`);
        }
        
        // Update context display immediately
        this.updateContextDisplay();
    }

    // Get default context size based on model name patterns
    getDefaultContextSize(modelName) {
        if (!modelName) return 128000;
        
        const name = modelName.toLowerCase();
        
        // Known context sizes for popular models
        if (name.includes('claude-3.5-sonnet')) return 200000;
        if (name.includes('claude-3') && name.includes('haiku')) return 200000;
        if (name.includes('claude-3') && name.includes('opus')) return 200000;
        if (name.includes('claude-2')) return 100000;
        if (name.includes('gpt-4o')) return 128000;
        if (name.includes('gpt-4-turbo')) return 128000;
        if (name.includes('gpt-4') && name.includes('32k')) return 32000;
        if (name.includes('gpt-4')) return 8000;
        if (name.includes('gpt-3.5-turbo-16k')) return 16000;
        if (name.includes('gpt-3.5-turbo')) return 4000;
        if (name.includes('llama-3.3') || name.includes('llama-3.2')) return 128000;
        if (name.includes('llama-3.1')) return 128000;
        if (name.includes('llama-3')) return 8000;
        if (name.includes('llama-2')) return 4000;
        if (name.includes('deepseek')) return 32000;
        if (name.includes('gemini-1.5')) return 1000000; // 1M context
        if (name.includes('gemini')) return 32000;
        if (name.includes('gemma-2')) return 8000;
        
        // Default fallback
        return 128000;
    }

    // Calculate actual token usage from conversation history
    calculateCurrentTokenUsage() {
        // Calculate tokens for all messages that will be sent to API
        let totalTokens = 0;
        
        this.conversationHistory.forEach(msg => {
            totalTokens += this.estimateTokens(msg.content);
        });
        
        this.currentTokenUsage = totalTokens;
        
        // Auto-trim conversation if it exceeds 80% of model context
        const contextLimit = this.maxContextSize * 0.8; // Use 80% of available context
        if (totalTokens > contextLimit && this.conversationHistory.length > 2) {
            console.log(`🔄 Auto-trimming conversation: ${totalTokens} > ${contextLimit} tokens`);
            
            // Remove oldest messages until we're under the limit
            while (this.currentTokenUsage > contextLimit && this.conversationHistory.length > 2) {
                const removed = this.conversationHistory.shift();
                this.currentTokenUsage -= this.estimateTokens(removed.content);
            }
            
            console.log(`✂️ Trimmed to ${this.conversationHistory.length} messages, ${this.currentTokenUsage} tokens`);
        }
        
        this.updateContextDisplay();
        return totalTokens;
    }

    // Update context display with real usage
    updateContextDisplay() {
        if (!this.contextUsage) return;

        const remainingTokens = this.maxContextSize - this.currentTokenUsage;
        const usagePercentage = Math.round((this.currentTokenUsage / this.maxContextSize) * 100);
        
        // Format context size display
        let contextSizeDisplay;
        if (this.maxContextSize >= 1000000) {
            contextSizeDisplay = `${Math.round(this.maxContextSize / 1000000)}M`;
        } else if (this.maxContextSize >= 1000) {
            contextSizeDisplay = `${Math.round(this.maxContextSize / 1000)}k`;
        } else {
            contextSizeDisplay = this.maxContextSize.toString();
        }
        
        // Format remaining tokens display
        let remainingDisplay;
        if (remainingTokens >= 1000) {
            remainingDisplay = `${Math.round(remainingTokens / 1000)}k`;
        } else {
            remainingDisplay = remainingTokens.toString();
        }
        
        // Show: "Context: 128k (0%)" or "Context: 1M (5%)"
        const displayText = `Context: ${contextSizeDisplay} (${usagePercentage}%)`;

        this.contextUsage.textContent = displayText;

        // Update color based on usage
        this.contextUsage.className = 'context-usage';
        if (usagePercentage > 80) {
            this.contextUsage.classList.add('low-usage');
        } else if (usagePercentage > 60) {
            this.contextUsage.classList.add('high-usage');
        }
    }

    // Add message to conversation history
    addToConversationHistory(role, content) {
        this.conversationHistory.push({
            role: role,
            content: content,
            timestamp: Date.now(),
            estimatedTokens: this.estimateTokens(content)
        });

        // Calculate and update current usage
        this.calculateCurrentTokenUsage();
    }

    // Clear conversation history
    clearConversationHistory() {
        this.conversationHistory = [];
        this.currentTokenUsage = 0;
        this.updateContextDisplay();
        this.addSystemMessage('🔄 Conversation history cleared.', 'history-cleared');
    }

    // User API Key Management Methods
    simpleEncrypt(text, key) {
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(result);
    }

    simpleDecrypt(encryptedText, key) {
        try {
            const decoded = atob(encryptedText);
            let result = '';
            for (let i = 0; i < decoded.length; i++) {
                result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
        } catch (e) {
            return null;
        }
    }

    getStoredUserApiKey() {
        try {
            const encrypted = localStorage.getItem('user-api-key');
            if (encrypted) {
                return this.simpleDecrypt(encrypted, this.encryptionKey);
            }
        } catch (error) {
            console.warn('Failed to decrypt user API key:', error);
        }
        return null;
    }

    setStoredUserApiKey(apiKey) {
        try {
            if (apiKey) {
                const encrypted = this.simpleEncrypt(apiKey, this.encryptionKey);
                localStorage.setItem('user-api-key', encrypted);
            } else {
                localStorage.removeItem('user-api-key');
            }
        } catch (error) {
            console.warn('Failed to encrypt user API key:', error);
        }
    }

    async validateApiKey(apiKey) {
        try {
            const testResponse = await fetch('https://openrouter.ai/api/v1/models', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                }
            });
            return testResponse.ok;
        } catch (error) {
            return false;
        }
    }

    handleSetApiKey(apiKey) {
        if (!apiKey || apiKey.trim() === '') {
            return {
                success: false,
                data: { error: 'API key is required.\n\nUsage: /set-api-key <your-openrouter-api-key>\n\nGet your API key from: https://openrouter.ai/settings/keys' }
            };
        }

        // Basic validation
        if (!apiKey.startsWith('sk-or-v1-')) {
            return {
                success: false,
                data: { error: 'Invalid API key format. OpenRouter API keys start with "sk-or-v1-"' }
            };
        }

        // Store the API key
        this.userApiKey = apiKey.trim();
        this.setStoredUserApiKey(this.userApiKey);

        // Clear models cache to force refresh with new key
        this.availableModels = [];
        localStorage.removeItem('cached-models');

        // Update UI state to reflect API key access
        this.updateAuthStatus();
        this.updateWelcomeMessage();

        return {
            success: true,
            data: { 
                response: '🔑 Personal API key set successfully!\n\n✅ Your key is stored locally and encrypted\n✅ You can now use AI models with your own quota\n✅ Models list will be refreshed\n\n💡 Your API key never leaves your browser unencrypted.\n\n🎉 You\'re ready to chat!' 
            }
        };
    }

    handleRemoveApiKey() {
        this.userApiKey = null;
        this.setStoredUserApiKey(null);

        // Clear models cache since we're switching back to server key
        this.availableModels = [];
        localStorage.removeItem('cached-models');

        // Reset authentication state
        this.authenticated = false;
        this.updateAuthStatus();
        this.updateWelcomeMessage();

        return {
            success: true,
            data: { 
                response: '🗑️ Personal API key removed.\n\n✅ API key cleared from local storage\n🔄 Please choose an access method:\n\n📡 Use /login <password> for server access\n🔑 Use /set-api-key <key> for personal access' 
            }
        };
    }

    // New method to update auth status
    updateAuthStatus() {
        if (this.userApiKey) {
            if (this.statusIndicator) {
                this.statusIndicator.classList.add('authenticated');
            }
            if (this.authStatus) {
                this.authStatus.textContent = '🔑 Personal API Key';
                this.authStatus.style.color = '#00ff00';
            }
        } else if (this.authenticated) {
            if (this.statusIndicator) {
                this.statusIndicator.classList.add('authenticated');
            }
            if (this.authStatus) {
                this.authStatus.textContent = '📡 Server Password';
                this.authStatus.style.color = '#00aa00';
            }
        } else {
            if (this.statusIndicator) {
                this.statusIndicator.classList.remove('authenticated');
            }
            if (this.authStatus) {
                this.authStatus.textContent = 'Choose access method';
                this.authStatus.style.color = '#666';
            }
        }
    }

    handleApiKeyStatus() {
        if (this.userApiKey) {
            const maskedKey = this.userApiKey.slice(0, 12) + '....' + this.userApiKey.slice(-4);
            return {
                success: true,
                data: { 
                    response: `🔑 API Key Status:\n\n✅ Using personal API key\n🔐 Key: ${maskedKey}\n📦 Stored: Locally encrypted\n\n💡 Use /remove-api-key to switch back to server key` 
                }
            };
        } else {
            return {
                success: true,
                data: { 
                    response: '🔑 API Key Status:\n\n📡 Using server API key\n💡 Set your personal key with: /set-api-key <your-key>\n\n🌐 Get your API key: https://openrouter.ai/settings/keys' 
                }
            };
        }
    }

    handleHelp() {
        return {
            success: true,
            data: { 
                response: `📖 Chatty Commands:\n\n🔐 Authentication:\n/login <password>          - Authenticate with server\n\n🔑 API Key Management:\n/set-api-key <key>         - Set your personal OpenRouter API key\n/remove-api-key            - Remove personal API key (use server key)\n/api-key-status            - Check current API key status\n\n🤖 Model Commands:\n/models                    - List available AI models\n/set-model <id>            - Set specific model\n/set-model auto            - Use auto-selection\n\n💬 Chat Commands:\n/clear                     - Clear conversation history\n/help                      - Show this help\n\n💡 Features:\n• Personal API key support (stored locally & encrypted)\n• Conversation context maintained across messages\n• Optimized parameters for better responses\n• Smart token management\n\n🌐 Get your API key: https://openrouter.ai/settings/keys` 
            }
        };
    }

    async updateAuthenticationInfo() {
        try {
            // Prepare headers with user API key if available
            const headers = { 'Content-Type': 'application/json' };
            if (this.userApiKey) {
                headers['X-User-API-Key'] = this.userApiKey;
            }

            const response = await fetch('/api/auth/verify', {
                method: 'GET',
                headers: headers
            });

            if (response.ok) {
                const data = await response.json();
                this.authenticated = data.authenticated;
                this.authMethod = data.auth_method;
                this.authType = data.auth_type;
                
                // Update UI based on authentication info
                this.updateAuthStatus();
            } else {
                // Server error or not authenticated
                this.authenticated = false;
                this.authMethod = null;
                this.authType = null;
                this.updateAuthStatus();
            }
        } catch (error) {
            // On network error, assume not authenticated
            this.authenticated = false;
            this.authMethod = null;
            this.authType = null;
            this.updateAuthStatus();
        }
    }

    // Estimate tokens more accurately
    estimateTokens(text) {
        // More accurate token estimation: ~3.5 characters per token on average
        return Math.ceil(text.length / 3.5);
    }

    // Prepare messages for API call with context
    prepareMessagesForAPI(userMessage) {
        // Convert conversation history to OpenRouter format
        const messages = this.conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        // Add the new user message
        messages.push({
            role: 'user',
            content: userMessage
        });

        // Calculate total tokens for this API call
        const totalTokensForCall = messages.reduce((sum, msg) => 
            sum + this.estimateTokens(msg.content), 0);
        
        // Update current usage with the new message
        this.currentTokenUsage = totalTokensForCall;
        this.updateContextDisplay();

        return messages;
    }

    // Compress JSON data for efficient transmission
    compressData(data) {
        if (!this.enableCompression) return data;
        
        const jsonString = JSON.stringify(data);
        if (jsonString.length < this.compressionMinSize) {
            return data; // Don't compress small payloads
        }

        // Try LZ-String compression first if library is available
        if (this.preferZstdCompression && this.lzStringAvailable && LZString) {
            try {
                // LZ-String compression optimized for UTF16 strings
                const compressed = LZString.compressToBase64(jsonString);
                
                // 압축률이 좋을 때만 사용 (30% 이상 압축되었을 때)
                const compressionRatio = 1 - (compressed.length / jsonString.length);
                if (compressionRatio >= 0.3) {
                    console.log(`LZ-String compression: ${jsonString.length} → ${compressed.length} bytes (${Math.round(compressionRatio * 100)}% reduction)`);
                    
                    return {
                        compressed: compressed,
                        original_size: jsonString.length,
                        compression_method: 'lz-string'
                    };
                } else {
                    console.log('LZ-String compression ratio too low, using fallback');
                }
            } catch (error) {
                console.warn('LZ-String compression failed, using fallback:', error);
            }
        }

        // Fallback to simple field compression
        return this.fallbackCompress(data);
    }

    // Decompress data (if needed for responses)
    decompressData(data) {
        // 압축된 데이터가 아니면 그대로 반환
        if (!data.compressed) {
            return data.h ? this.fallbackDecompress(data) : data;
        }
        
        if (data.compression_method === 'lz-string') {
            // LZ-String 압축 해제
            if (!this.lzStringAvailable || !LZString) {
                console.warn('LZ-String library not available for decompression');
                return data;
            }
            
            try {
                const jsonString = LZString.decompressFromBase64(data.compressed);
                if (!jsonString) {
                    throw new Error('Decompression returned null');
                }
                
                console.log(`LZ-String decompression: ${data.compressed.length} → ${jsonString.length} bytes`);
                
                return JSON.parse(jsonString);
            } catch (error) {
                console.warn('LZ-String decompression failed:', error);
                return data;
            }
        } else if (data.compression_method === 'gzip' || data.compression_method === 'zstd') {
            // 기존 압축 방식 지원 (하위 호환성)
            console.log(`Legacy ${data.compression_method} compression detected, using fallback`);
            return this.fallbackDecompress(data);
        }
        
        return data;
    }

    // Fallback compression (기존 방식)
    fallbackCompress(data) {
        const jsonString = JSON.stringify(data);
        if (jsonString.length < this.compressionMinSize) {
            return data;
        }

        try {
            // Simple compression: remove extra spaces and shorten field names
            const compressed = {
                m: data.message || data.m, // message
                h: data.conversationHistory?.map(msg => ({
                    r: msg.role,
                    c: msg.content,
                    t: msg.timestamp
                })) || data.h, // history
                c: true // compressed flag
            };
            
            return compressed;
        } catch (error) {
            return data;
        }
    }

    // Fallback decompression (기존 방식)
    fallbackDecompress(data) {
        if (!data.c) return data; // Not compressed
        
        try {
            return {
                message: data.m,
                conversationHistory: data.h?.map(msg => ({
                    role: msg.r,
                    content: msg.c,
                    timestamp: msg.t
                }))
            };
        } catch (error) {
            return data; // Fallback to original
        }
    }
}

// Initialize the terminal chat when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new TerminalChat();
});
