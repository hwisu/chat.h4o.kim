// Main Terminal Chat functionality
class TerminalChat {
    constructor() {
        this.output = document.getElementById('output');
        this.input = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.modelList = document.getElementById('modelList');
        this.contextUsage = document.getElementById('contextUsage');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.authStatus = document.getElementById('authStatus');
        this.modelModal = document.getElementById('modelModal');
        this.modelModalClose = document.getElementById('modelModalClose');
        this.modelTitle = document.getElementById('modelTitle');

        this.selectedModel = localStorage.getItem('selectedModel') || 'auto';
        this.selectedModelInfo = null;
        this.conversationHistory = [];
        this.isAuthenticated = false;
        this.availableModels = [];
        this.isLoading = false;
        this.lastUsage = null; // 마지막 요청의 토큰 사용량 저장

        this.maxContextSize = 128000; // Will be dynamically set based on selected model
        this.currentTokenUsage = 0; // Current actual token usage (from server)

        // User API key management
        this.userApiKey = null;
        this.encryptionKey = 'chatty-h4o-2025'; // Simple key for local encryption

        // Session-based authentication (disappears when tab closes)
        this.sessionToken = null;

        // Authentication and context tracking
        this.authMethod = null;
        this.authType = null;

        // iOS 18 compatibility flags
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isIOS18Plus = this.isIOS && this.getIOSVersion() >= 18;
        this.supportsVisualViewport = 'visualViewport' in window;

        // Initialize modules
        this.markdownParser = new MarkdownParser();

        // Role management
        this.roleManager = new RoleManager();
        this.selectedRole = this.roleManager.getStoredRole();
        this.roleModal = document.getElementById('roleModal');
        this.roleModalClose = document.getElementById('roleModalClose');
        this.roleTitle = document.getElementById('roleTitle');
        this.roleList = document.getElementById('roleList');

        this.init();
    }

    // iOS version detection for compatibility
    getIOSVersion() {
        const match = navigator.userAgent.match(/OS (\d+)_/);
        return match ? parseInt(match[1]) : 0;
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

        // Restore session token if available
        this.sessionToken = sessionStorage.getItem('session_token');

        // Set initial UI state (will be updated after server verification)
        this.updateModelTitle();
        this.setupEventListeners();
        this.updateSendButton();
        this.autoResizeTextarea();

        if (this.input) {
            this.input.focus();
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

        // Then initialize models and roles
        await Promise.all([
            this.initializeModelsBackground(),
            this.initializeRolesBackground()
        ]);

        // Initialize context display
        this.updateContextDisplay();
    }

    async initializeRolesBackground() {
        // Only try to load roles if we have authentication
        if (!this.isAuthenticated && !this.userApiKey) {
            return; // Skip role loading if not authenticated
        }

        try {
            await this.roleManager.loadRoles(this.userApiKey, this.sessionToken);
            this.updateRoleTitle();
        } catch (error) {
            console.warn('Background role initialization failed:', error);
        }
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
        this.input.addEventListener('focusin', () => {
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
        // Try to fetch fresh models from server if authenticated
        if (this.isAuthenticated || this.userApiKey) {
            try {
                // Prepare headers with authentication
                const headers = { 'Content-Type': 'application/json' };
                if (this.userApiKey) {
                    headers['X-User-API-Key'] = this.userApiKey;
                }
                if (this.sessionToken) {
                    headers['X-Session-Token'] = this.sessionToken;
                }

                const response = await fetch('/api/models', {
                    method: 'GET',
                    headers: headers
                });

                if (response.status === 401) {
                    // Authentication failed - clear auth state and use cache
                    this.setAuthenticated(false);
                    this.availableModels = this.getStoredModels();
                    return;
                }

                if (response.ok) {
                    const data = await response.json();
                    if (data.models && Array.isArray(data.models)) {
                        this.availableModels = data.models.map(model =>
                            typeof model === 'string' ? model : model.id
                        );
                        this.setStoredModels(this.availableModels);

                        this.updateModelTitle();
                        return;
                    }
                }
            } catch (error) {
                console.warn('Failed to fetch fresh models:', error);
            }
        }

        // Fallback to cached models if not authenticated or server request failed
        if (this.availableModels.length === 0) {
            this.availableModels = this.getStoredModels();
        }
    }

    async setModelAuto() {
        try {
            // Prepare headers with user API key if available
            const headers = { 'Content-Type': 'application/json' };
            if (this.userApiKey) {
                headers['X-User-API-Key'] = this.userApiKey;
            }
            if (this.sessionToken) {
                headers['X-Session-Token'] = this.sessionToken;
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
            const stored = localStorage.getItem('cached-models');
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }

    setStoredModels(models) {
        try {
            localStorage.setItem('cached-models', JSON.stringify(models));
        } catch (error) {
            console.warn('Failed to cache models:', error);
        }
    }

    updateWelcomeMessage() {
        // Remove existing auth and welcome messages
        const existingAuth = document.querySelector('.auth-required-message');
        if (existingAuth) {
            existingAuth.remove();
        }

        const existingWelcome = document.querySelector('.welcome-message');
        if (existingWelcome) {
            existingWelcome.remove();
        }

        if (!this.isAuthenticated && !this.userApiKey) {
            // Show options for authentication OR API key
            this.addSystemMessage(`🔐 Choose access method:\n\n📡 Server Login: /login <password>\n🔑 Personal Key: /set-api-key <key>\n\n💡 Choose ONE option`, 'auth-required-message');
            return;
        }

        // Show welcome message when authenticated
        let accessMethod = '';
        if (this.userApiKey) {
            accessMethod = '🔑 Personal API Key';
        } else if (this.isAuthenticated) {
            accessMethod = '📡 Server Key';
        }

        this.addSystemMessage(`✅ Welcome to Chatty!\n\n${accessMethod}\n\n💬 Start chatting or type /help for commands`, 'welcome-message');
    }

    setAuthenticated(authenticated) {
        this.isAuthenticated = authenticated;
        this.updateAuthStatus();

        // 인증 상태 변경 후 즉시 모델 목록 갱신
        if (authenticated) {
            this.initializeModelsBackground();
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

        this.input.addEventListener('compositionstart', () => {
            this.isComposing = true;
        });

        this.input.addEventListener('compositionend', () => {
            this.isComposing = false;
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    return; // Allow line break
                } else {
                    e.preventDefault();
                    const messageText = this.input.value.trim();

                    if (!this.isComposing && messageText && !this.isLoading) {
                        this.sendMessage();
                    }
                }
            }
        });

        this.input.addEventListener('input', () => {
            this.autoResizeTextarea();
            this.updateSendButton();
        });

        // Enhanced send button events for iOS 18
        this.setupSendButtonEvents();

        this.input.focus();
        this.handleViewportChanges();

        // Model modal event listeners
        if (this.modelModalClose) {
            this.modelModalClose.addEventListener('click', () => {
                this.hideModelModal();
            });
        }

        if (this.modelModal) {
            // Enhanced backdrop click handling for mobile
            const handleBackdropClick = (e) => {
                if (e.target === this.modelModal) {
                    this.hideModelModal();
                }
            };

            this.modelModal.addEventListener('click', handleBackdropClick);

            // Add touch support for backdrop
            if ('ontouchstart' in window) {
                let touchStartTarget = null;

                this.modelModal.addEventListener('touchstart', (e) => {
                    touchStartTarget = e.target;
                }, { passive: true });

                this.modelModal.addEventListener('touchend', (e) => {
                    // Only close if touch started and ended on the backdrop
                    if (touchStartTarget === this.modelModal && e.target === this.modelModal) {
                        this.hideModelModal();
                    }
                    touchStartTarget = null;
                }, { passive: true });
            }
        }

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modelModal.classList.contains('show')) {
                this.hideModelModal();
            }
        });

        // Role title click handler for showing role selection modal
        const roleTitle = document.getElementById('roleTitle');
        if (roleTitle) {
            roleTitle.addEventListener('click', () => {
                this.showRoleModal();
            });
            roleTitle.style.cursor = 'pointer';
        }

        // Role modal event listeners
        if (this.roleModalClose) {
            this.roleModalClose.addEventListener('click', () => {
                this.hideRoleModal();
            });
        }

        if (this.roleModal) {
            // Enhanced backdrop click handling for mobile
            const handleBackdropClick = (e) => {
                if (e.target === this.roleModal) {
                    this.hideRoleModal();
                }
            };

            this.roleModal.addEventListener('click', handleBackdropClick);

            // Add touch support for backdrop
            if ('ontouchstart' in window) {
                let touchStartTarget = null;

                this.roleModal.addEventListener('touchstart', (e) => {
                    touchStartTarget = e.target;
                }, { passive: true });

                this.roleModal.addEventListener('touchend', (e) => {
                    if (touchStartTarget === this.roleModal && e.target === this.roleModal) {
                        this.hideRoleModal();
                    }
                    touchStartTarget = null;
                }, { passive: true });
            }
        }

        // ESC key to close role modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.roleModal && this.roleModal.classList.contains('show')) {
                this.hideRoleModal();
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
        this.input.addEventListener('focus', () => {
            if (this.isIOS18Plus) {
                setTimeout(ensureScrollToBottom, 300);
            } else {
                ensureScrollToBottom();
            }
        });

        this.input.addEventListener('blur', ensureScrollToBottom);

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
        if (this.isLoading) return;

        const userInput = this.input.value.trim();
        if (!userInput) return;

        // Handle commands first
        if (userInput.startsWith('/')) {
            await this.handleCommand(userInput);
            return;
        }

        // Show user message
        this.addMessage(userInput, 'user');
        this.input.value = '';

        this.isLoading = true;
        this.showLoading();

        try {
            // 단순화된 요청 데이터 - 서버에서 컨텍스트 관리
            const requestData = {
                message: userInput,
                model: this.selectedModel,
                temperature: 0.7,
                max_tokens: 1500,
                top_p: 0.9,
                frequency_penalty: 0.1,
                presence_penalty: 0.1
            };

            // Make API request
            const headers = { 'Content-Type': 'application/json' };
            if (this.userApiKey) {
                headers['X-User-API-Key'] = this.userApiKey;
            }
            if (this.sessionToken) {
                headers['X-Session-Token'] = this.sessionToken;
            }

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (parseError) {
                    // If JSON parsing fails, create a fallback error data
                    errorData = { error: `HTTP ${response.status}`, response: null };
                }

                if (response.status === 401) {
                    this.setAuthenticated(false);
                    const errorMessage = errorData?.response || errorData?.error || '❌ Authentication required. Please login first.';
                    this.addMessage(errorMessage, 'error');
                    return;
                }

                const errorMessage = errorData?.error || errorData?.response || `HTTP ${response.status}`;
                throw new Error(errorMessage);
            }

            const data = await response.json();

            if (!data.response) {
                throw new Error('Empty response from server');
            }

            console.log('Server response data:', data);
            console.log('Server usage data:', data.usage);

            // 서버가 컨텍스트를 관리하므로 토큰 사용량만 업데이트
            if (data.usage) {
                this.lastUsage = data.usage; // 토큰 사용량 저장
                console.log('Setting lastUsage:', this.lastUsage);
                const totalTokens = data.usage.total_tokens || (data.usage.prompt_tokens + data.usage.completion_tokens);
                this.currentTokenUsage = totalTokens;
            } else {
                console.warn('No usage data in server response');
                this.lastUsage = null;
            }

            // Add assistant response to conversation
            this.addMessage(data.response, 'assistant', data.model);

            // 컨텍스트 표시 업데이트 (서버 관리이므로 추정값만 표시)
            this.updateContextDisplay();

            // 요약 적용 알림
            if (data.summaryApplied && data.summarizedMessageCount > 0) {
                this.addSystemMessage(`📝 Context optimized: ${data.summarizedMessageCount} messages summarized`, 'summary-applied');
            }

        } catch (error) {
            console.error('Chat error:', error);
            this.addMessage(`❌ Error: ${error.message}`, 'error');
        } finally {
            this.isLoading = false;
            this.hideLoading();
            this.input.focus();
        }
    }

    async handleCommand(message) {
        // Clear input immediately after command is entered
        this.input.value = '';
        this.autoResizeTextarea();
        this.updateSendButton();

        return new Promise(async (resolve) => {
            const parts = message.substring(1).split(' ');
            const command = parts[0].toLowerCase();
            const args = parts.slice(1);

            try {
                let success = false;
                let data = null;

                switch (command) {
                    case 'login':
                        if (args.length === 0) {
                            this.addMessage('❌ Password required.\n\nUsage: /login <password>', 'error');
                            break;
                        }

                        const password = args.join(' ');
                        const loginResponse = await fetch('/api/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ password })
                        });

                        const loginData = await loginResponse.json();

                        if (loginResponse.ok && loginData.login_success) {
                            // Save session token for this tab session
                            if (loginData.session_token) {
                                this.sessionToken = loginData.session_token;
                                sessionStorage.setItem('session_token', this.sessionToken);
                            }

                            // Clear old cached data to force fresh loading after login
                            this.availableModels = [];
                            localStorage.removeItem('cached-models');

                            // Update authentication info from server first
                            await this.updateAuthenticationInfo();

                            // Then load models and roles sequentially
                            await this.initializeModelsBackground();
                            await this.initializeRolesBackground();

                            // Update welcome message after everything is loaded
                            this.updateWelcomeMessage();

                            this.addMessage(loginData.response, 'system');
                            success = true;
                        } else {
                            this.addMessage(loginData.response || '❌ Authentication failed.', 'error');
                        }
                        break;

                    case 'clear':
                        try {
                            const headers = { 'Content-Type': 'application/json' };
                            if (this.userApiKey) {
                                headers['X-User-API-Key'] = this.userApiKey;
                            }
                            if (this.sessionToken) {
                                headers['X-Session-Token'] = this.sessionToken;
                            }

                            const response = await fetch('/api/context/clear', {
                                method: 'POST',
                                headers: headers
                            });

                            if (response.ok) {
                                // 클라이언트 상태도 초기화
                                this.conversationHistory = [];
                                this.currentTokenUsage = 0;
                                this.output.innerHTML = '';
                                this.updateContextDisplay();
                                this.addSystemMessage('🔄 Chat cleared. How can I help you?');
                                success = true;
                            } else {
                                const errorData = await response.json();
                                this.addMessage(`❌ Failed to clear context: ${errorData.error}`, 'error');
                            }
                        } catch (error) {
                            console.error('Clear context error:', error);
                            this.addMessage(`❌ Error clearing context: ${error.message}`, 'error');
                        }
                        break;

                    case 'help':
                        const helpResponse = await fetch('/api/help');
                        const helpData = await helpResponse.json();
                        this.addMessage(helpData.response, 'system');
                        success = true;
                        break;

                    case 'models':
                        const filterArg = args.length > 0 ? args.join(' ') : null;
                        await this.handleModelsCommand(filterArg);
                        success = true;
                        break;

                    case 'set-model':
                        if (args.length === 0) {
                            this.addMessage('❌ Model ID required.\n\nUsage: /set-model <model-id> or /set-model auto', 'error');
                            break;
                        }

                        const modelId = args.join(' ');
                        await this.setModel(modelId);
                        success = true;
                        break;

                    case 'set-api-key':
                        if (args.length === 0) {
                            this.addMessage('❌ API key required.\n\nUsage: /set-api-key <your-openrouter-key>\n\nGet your key: https://openrouter.ai/settings/keys', 'error');
                            break;
                        }

                        const apiKey = args.join(' ');
                        await this.setUserApiKey(apiKey);
                        success = true;
                        break;

                    case 'remove-api-key':
                        this.removeUserApiKey();
                        success = true;
                        break;

                    case 'api-key-status':
                        this.showApiKeyStatus();
                        success = true;
                        break;

                    case 'roles':
                        await this.handleRolesCommand();
                        success = true;
                        break;

                    case 'set-role':
                        if (args.length === 0) {
                            this.addMessage('❌ Role ID required.\n\nUsage: /set-role <role-id>\n\nUse /roles to see available roles', 'error');
                            break;
                        }

                        const roleId = args.join(' ');
                        await this.setRole(roleId);
                        success = true;
                        break;

                    default:
                        this.addMessage(`❌ Unknown command: /${command}\n\nType /help for available commands.`, 'error');
                        break;
                }

                resolve({ success, data });
            } catch (error) {
                console.error('Command error:', error);
                this.addMessage(`❌ Error executing command: ${error.message}`, 'error');
                resolve({ success: false, data: null });
            }
        });
    }

    async handleModelsCommand(filterArg = null) {
        if (!this.isAuthenticated && !this.userApiKey) {
            this.addMessage('❌ Authentication required.\n\nUse /login <password> or /set-api-key <key> first.', 'error');
            return;
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.userApiKey) {
                headers['X-User-API-Key'] = this.userApiKey;
            }
            if (this.sessionToken) {
                headers['X-Session-Token'] = this.sessionToken;
            }

            const response = await fetch('/api/models', {
                method: 'GET',
                headers: headers
            });

            if (response.ok) {
                const data = await response.json();
                if (data.models && Array.isArray(data.models)) {
                    // Filter models if filter argument is provided
                    let filteredModels = data.models;
                    if (filterArg) {
                        filteredModels = data.models.filter(model => {
                            const modelId = typeof model === 'string' ? model : model.id;
                            return modelId.toLowerCase().includes(filterArg.toLowerCase());
                        });
                    }

                    if (filteredModels.length === 0) {
                        const filterMessage = filterArg ? ` matching "${filterArg}"` : '';
                        this.addMessage(`❌ No models found${filterMessage}.`, 'error');
                        return;
                    }

                    // Build model list
                    const filterMessage = filterArg ? ` matching "${filterArg}"` : '';
                    let modelList = `📋 Available Models${filterMessage} (${filteredModels.length}/${data.models.length} total)\n\n`;

                    filteredModels.forEach((model, index) => {
                        const modelId = typeof model === 'string' ? model : model.id;
                        modelList += `${index + 1}. ${modelId}\n`;
                    });

                    modelList += `\nUsage: /set-model <model-id> or /set-model auto`;
                    if (filterArg) {
                        modelList += `\n💡 Use /models without filter to see all models`;
                    }

                    this.addMessage(modelList, 'system');
                } else {
                    this.addMessage('❌ No models available.', 'error');
                }
            } else {
                this.addMessage('❌ Failed to fetch models.', 'error');
            }
        } catch (error) {
            console.error('Models fetch error:', error);
            this.addMessage(`❌ Error fetching models: ${error.message}`, 'error');
        }
    }

    async setModel(modelId) {
        this.selectedModel = modelId;
        localStorage.setItem('selected-model', modelId);

        // Update model info and context size
        this.updateModelInfo(modelId);

        // Update title
        this.updateModelTitle();

        this.addMessage(`✅ Model set to: ${modelId}`, 'system');
    }

    async setUserApiKey(apiKey) {
        try {
            // Simple validation
            if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
                this.addMessage('❌ Invalid API key format. Should start with "sk-" and be at least 20 characters.', 'error');
                return;
            }

            // Store encrypted API key
            const encryptedKey = this.simpleEncrypt(apiKey, this.encryptionKey);
            localStorage.setItem('user-api-key', encryptedKey);
            this.userApiKey = apiKey;

            // Update auth status immediately from server
            await this.updateAuthenticationInfo();

            // Clear models cache to force refresh with new key
            this.availableModels = [];
            localStorage.removeItem('cached-models');

            // Update welcome message to show API key usage
            this.updateWelcomeMessage();

            // Load models with new key
            await this.loadModelsBackground();

        } catch (error) {
            console.error('API key setup error:', error);
            this.addMessage(`❌ Error setting API key: ${error.message}`, 'error');
        }
    }

    removeUserApiKey() {
        localStorage.removeItem('user-api-key');
        this.userApiKey = null;

        // Clear models cache
        this.availableModels = [];
        localStorage.removeItem('cached-models');

        // Update auth status immediately from server
        this.updateAuthenticationInfo().then(() => {
            // Update welcome message
            this.updateWelcomeMessage();
        });

        this.addMessage('✅ Personal API key removed\n\n📡 Use /login <password> or /set-api-key <key>', 'system');
    }

    showApiKeyStatus() {
        if (this.userApiKey) {
            const maskedKey = this.userApiKey.substring(0, 8) + '...' + this.userApiKey.substring(this.userApiKey.length - 4);
            this.addMessage(`🔑 Personal API Key: Active\n\nKey: ${maskedKey}\n\n• /remove-api-key - Remove key\n• /models - View models`, 'system');
        } else if (this.isAuthenticated) {
            this.addMessage(`📡 Server Authentication: Active\n\n• /set-api-key <key> - Switch to personal\n• /models - View models`, 'system');
        } else {
            this.addMessage(`❌ No authentication\n\n• /login <password> - Server key\n• /set-api-key <key> - Personal key`, 'system');
        }
    }

    simpleEncrypt(text, key) {
        // Simple XOR encryption for local storage
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(result);
    }

    simpleDecrypt(encrypted, key) {
        try {
            const decoded = atob(encrypted);
            let result = '';
            for (let i = 0; i < decoded.length; i++) {
                result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
        } catch {
            return null;
        }
    }

    showLoading() {
        this.isLoading = true;
        if (this.sendButton) {
            // Create spinner dots inside button
            this.sendButton.innerHTML = `
                <div class="button-spinner">
                    <div class="button-spinner-dot"></div>
                    <div class="button-spinner-dot"></div>
                    <div class="button-spinner-dot"></div>
                </div>
            `;
            this.sendButton.disabled = true;
        }
    }

    hideLoading() {
        this.isLoading = false;
        if (this.sendButton) {
            this.sendButton.innerHTML = '<span class="send-arrow" style="font-size: 22px; font-weight: bold;">↑</span>';
            this.sendButton.disabled = false;
        }
    }

    addMessage(content, role, model = null) {
        const timestamp = new Date().toLocaleTimeString();
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;

        // Generate a unique ID for this message
        const messageId = 'msg-' + Math.random().toString(36).substr(2, 9);
        messageDiv.id = messageId;

        let header = '';
        if (role === 'user') {
            header = `[USER] ${timestamp}`;
        } else if (role === 'assistant') {
            header = `[ASSISTANT] ${timestamp}`;
            if (model) {
                header += ` - ${this.shortenModelName(model)}`;
            }
        } else if (role === 'system') {
            header = `[SYSTEM] ${timestamp}`;
        } else if (role === 'error') {
            header = `[ERROR] ${timestamp}`;
        }

        // Apply markdown rendering to both user and assistant messages, but not system or error messages
        const shouldRenderMarkdown = role === 'assistant' || role === 'user';

        // Create the message content first
        const messageContent = shouldRenderMarkdown ? this.markdownParser.renderContent(content) : this.escapeHtml(content);

        // Add copy button for both user and assistant messages (if they contain code blocks)
        let copyButton = '';
        if (shouldRenderMarkdown) {
            // Check if content likely contains a code block
            const hasCodeBlock = this.contentLikelyHasCodeBlock(content);

            if (role === 'assistant' || hasCodeBlock) {
                copyButton = `<button id="copy-response-${messageId}" class="copy-response-button" onclick="copyMessageContent('${messageId}')">copy all</button>`;
            }
        }

        messageDiv.innerHTML = `
            <div class="message-header">
${header}
            </div>
            <div class="message-content" id="content-${messageId}">${messageContent}</div>
${copyButton ? `<div class="message-footer">${copyButton}</div>` : ''}
        `;

        // 토큰 사용량 표시 및 디버깅 (AI 응답 메시지에만)
        if (role === 'assistant') {
            console.log('Last usage data:', this.lastUsage);

            // 토큰 사용량 정보가 있으면 footer에 표시
            if (this.lastUsage && (this.lastUsage.prompt_tokens || this.lastUsage.completion_tokens)) {
                const promptTokens = this.formatTokenCount(this.lastUsage.prompt_tokens || 0);
                const completionTokens = this.formatTokenCount(this.lastUsage.completion_tokens || 0);

                const tokenUsage = `<span class="token-prompt">↑ ${promptTokens}</span> <span class="token-completion">↓ ${completionTokens}</span>`;

                // footer가 있으면 토큰 정보를 왼쪽에 추가
                const footer = messageDiv.querySelector('.message-footer');
                if (footer) {
                    footer.innerHTML = `<div class="token-usage-inline">${tokenUsage}</div>${footer.innerHTML}`;
                } else {
                    // footer가 없으면 토큰 정보만으로 footer 생성
                    const tokenFooter = document.createElement('div');
                    tokenFooter.className = 'message-footer';
                    tokenFooter.innerHTML = `<div class="token-usage-inline">${tokenUsage}</div>`;
                    messageDiv.appendChild(tokenFooter);
                }

                console.log('Token info added to footer:', promptTokens, completionTokens);
            } else {
                console.log('No token usage data available for this message');
            }
        }

        this.output.appendChild(messageDiv);
        this.scrollToBottom();

        // Syntax highlighting for code blocks for both user and assistant messages
        if (shouldRenderMarkdown && typeof hljs !== 'undefined') {
            messageDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }
    }

    addSystemMessage(content, className = '') {
        this.addMessage(content, 'system');
        if (className) {
            const lastMessage = this.output.lastElementChild;
            if (lastMessage) {
                lastMessage.classList.add(className);
            }
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    scrollToBottom() {
        setTimeout(() => {
            this.output.scrollTop = this.output.scrollHeight;
        }, 10);
    }

    shortenModelName(modelName) {
        if (!modelName) return '';

        // Remove common prefixes and make more readable
        let shortened = modelName
            .replace(/^(meta-llama\/|google\/|anthropic\/|openai\/|mistralai\/|microsoft\/|huggingfaceh4\/|nousresearch\/|teknium\/|gryphe\/|undi95\/|koboldai\/|pygmalionai\/|alpindale\/|jondurbin\/|neversleep\/|cognitivecomputations\/|lizpreciatior\/|migtissera\/|austism\/|xwin-lm\/|01-ai\/|togethercomputer\/|nvidia\/|intel\/|sambanova\/)/i, '')
            .replace(/:free$/, '')
            .replace(/-instruct$/, '')
            .replace(/-chat$/, '')
            .replace(/-v\d+(\.\d+)*$/, '')
            .replace(/(\d+)b$/, '$1B')
            .replace(/(\d+)x(\d+)b$/, '$1×$2B');

        // Return full name without truncation - allow wrapping to multiple lines
        return shortened;
    }

    showModelModal() {
        if (!this.isAuthenticated && !this.userApiKey) {
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
            const modelId = typeof model === 'string' ? model : model.id;
            const modelItem = document.createElement('div');
            modelItem.className = 'model-item';

            // Check if this is the currently selected model
            if (modelId === this.selectedModel) {
                modelItem.classList.add('selected');
            }

            modelItem.innerHTML = `
                <div class="model-name">${this.shortenModelName(modelId)}</div>
            `;

            // Add both click and touch events for better mobile support
            const selectModel = () => {
                this.setModel(modelId);
                this.hideModelModal();
            };

            modelItem.addEventListener('click', selectModel);

            // Enhanced touch support for mobile
            if ('ontouchstart' in window) {
                let touchStartTime = 0;

                modelItem.addEventListener('touchstart', (e) => {
                    touchStartTime = Date.now();
                }, { passive: true });

                modelItem.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    const touchDuration = Date.now() - touchStartTime;
                    if (touchDuration < 500) { // Prevent accidental long presses
                        selectModel();
                    }
                }, { passive: false });
            }

            this.modelList.appendChild(modelItem);
        });
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
        } else {
            // Fallback for models without context info or string-only models
            this.selectedModelInfo = {
                id: modelName,
                context_length: this.getDefaultContextSize(modelName)
            };
            this.maxContextSize = this.selectedModelInfo.context_length;
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

    // Update context display (서버에서 실제 관리, 클라이언트는 표시만)
    updateContextDisplay() {
        if (!this.contextUsage) return;

        // 서버에서 받은 실제 토큰 사용량 표시 (없으면 기본값)
        const displayUsage = this.currentTokenUsage || 0;
        const usagePercentage = this.maxContextSize > 0 ? Math.round((displayUsage / this.maxContextSize) * 100) : 0;

        // Format context size display
        let contextSizeDisplay;
        if (this.maxContextSize >= 1000000) {
            contextSizeDisplay = `${Math.round(this.maxContextSize / 1000000)}M`;
        } else if (this.maxContextSize >= 1000) {
            contextSizeDisplay = `${Math.round(this.maxContextSize / 1000)}k`;
        } else {
            contextSizeDisplay = this.maxContextSize.toString();
        }

        // Show: "Context: 128k (5%)"
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

    // Clear conversation history (클라이언트 상태만 초기화)
    clearConversationHistory() {
        this.conversationHistory = [];
        this.currentTokenUsage = 0;
        this.updateContextDisplay();
    }

    // User API Key Management Methods
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
        } else if (this.isAuthenticated) {
            if (this.statusIndicator) {
                this.statusIndicator.classList.add('authenticated');
            }
            if (this.authStatus) {
                this.authStatus.textContent = '📡 Server Key';
                this.authStatus.style.color = '#00ff00';
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

    updateModelTitle() {
        if (this.modelTitle) {
            let modelName = this.selectedModel;
            if (!modelName || modelName === 'auto') {
                if (this.availableModels && this.availableModels.length > 0) {
                    modelName = this.availableModels[0];
                } else if (this.isAuthenticated || this.userApiKey) {
                    modelName = 'loading...';  // Show loading when authenticated but no models yet
                } else {
                    modelName = 'login required';  // More descriptive when not authenticated
                }
            }

            let displayName = this.shortenModelName(modelName) || modelName;

            // 사용자 API 키 사용시 표시 추가
            if (this.userApiKey) {
                displayName += ' 👑';
            }

            this.modelTitle.textContent = displayName;
        }
    }

    autoResizeTextarea() {
        if (this.input) {
            this.input.style.height = 'auto';
            this.input.style.height = Math.min(this.input.scrollHeight, 200) + 'px';
        }
    }

    updateSendButton() {
        const hasText = this.input && this.input.value.trim().length > 0;
        const canSend = hasText && !this.isLoading;

        if (this.sendButton) {
            this.sendButton.disabled = !canSend;

            if (canSend) {
                this.sendButton.style.opacity = '1';
                this.sendButton.style.transform = 'scale(1)';
            } else {
                this.sendButton.style.opacity = '0.5';
                this.sendButton.style.transform = 'scale(0.9)';
            }
        }
    }

    handleSendButtonPress() {
        const messageText = this.input ? this.input.value.trim() : '';

        if (messageText && !this.isLoading) {
            this.sendMessage();
        }
    }

    async updateAuthenticationInfo() {
        try {
            // Prepare headers with user API key if available
            const headers = { 'Content-Type': 'application/json' };
            if (this.userApiKey) {
                headers['X-User-API-Key'] = this.userApiKey;
            }
            if (this.sessionToken) {
                headers['X-Session-Token'] = this.sessionToken;
            }

            const response = await fetch('/api/auth-status', {
                method: 'GET',
                headers: headers
            });

            if (response.ok) {
                const data = await response.json();
                this.isAuthenticated = data.authenticated;
                this.authMethod = data.auth_method;
                this.authType = data.auth_type;
            } else {
                // Server error or not authenticated
                this.isAuthenticated = false;
                this.authMethod = null;
                this.authType = null;
            }
        } catch (error) {
            // On network error, assume not authenticated
            this.isAuthenticated = false;
            this.authMethod = null;
            this.authType = null;
        }

        this.updateAuthStatus();
    }

    async handleRolesCommand() {
        if (!this.isAuthenticated && !this.userApiKey) {
            this.addMessage('❌ Authentication required.\n\nUse /login <password> or /set-api-key <key> first.', 'error');
            return;
        }

        try {
            await this.roleManager.loadRoles(this.userApiKey, this.sessionToken);

            if (this.roleManager.availableRoles.length === 0) {
                this.addMessage('❌ No roles available.', 'error');
                return;
            }

            let roleList = `🎭 Available Roles (${this.roleManager.availableRoles.length})\n\n`;

            this.roleManager.availableRoles.forEach((role) => {
                const current = role.id === this.selectedRole ? ' ← Current' : '';
                roleList += `${role.icon || '🤖'} ${role.id}${current}\n   ${role.description}\n\n`;
            });

            roleList += `Usage: /set-role <role-id>`;
            this.addMessage(roleList, 'system');
        } catch (error) {
            console.error('Roles fetch error:', error);
            this.addMessage(`❌ Error fetching roles: ${error.message}`, 'error');
        }
    }

    async setRole(roleId) {
        const result = await this.roleManager.setRole(roleId, this.userApiKey, this.sessionToken);

        if (result.success) {
            this.selectedRole = roleId;
            this.updateRoleTitle();
            this.addMessage(`✅ Role set to: ${this.roleManager.getRoleDisplayName(roleId)}`, 'system');
        } else {
            this.addMessage(`❌ Failed to set role: ${result.error}`, 'error');
        }
    }

    showRoleModal() {
        if (!this.isAuthenticated && !this.userApiKey) {
            this.addSystemMessage('Please login with /login <password> or set your API key with /set-api-key <key> first to change roles.');
            return;
        }

        this.populateRoleList();
        this.roleModal.classList.add('show');
    }

    hideRoleModal() {
        this.roleModal.classList.remove('show');
    }

    async populateRoleList() {
        // Show loading state
        this.roleList.innerHTML = '<div class="role-list-loading">Loading roles...</div>';

        // Load roles if not already loaded
        if (this.roleManager.availableRoles.length === 0) {
            await this.roleManager.loadRoles(this.userApiKey, this.sessionToken);
        }

        // Clear loading and populate list
        this.roleList.innerHTML = '';

        if (this.roleManager.availableRoles.length === 0) {
            this.roleList.innerHTML = '<div class="role-list-loading">No roles available</div>';
            return;
        }

        this.roleManager.availableRoles.forEach((role) => {
            const roleItem = document.createElement('div');
            roleItem.className = 'role-item';

            // Check if this is the currently selected role
            if (role.id === this.selectedRole) {
                roleItem.classList.add('selected');
            }

            roleItem.innerHTML = `
                <div class="role-header">
                    <span class="role-icon">${role.icon || '🤖'}</span>
                    <span class="role-name">${role.name}</span>
                </div>
                <div class="role-description">${role.description}</div>
            `;

            // Add both click and touch events for better mobile support
            const selectRole = () => {
                this.setRole(role.id);
                this.hideRoleModal();
            };

            roleItem.addEventListener('click', selectRole);

            // Enhanced touch support for mobile
            if ('ontouchstart' in window) {
                let touchStartTime = 0;

                roleItem.addEventListener('touchstart', (e) => {
                    touchStartTime = Date.now();
                }, { passive: true });

                roleItem.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    const touchDuration = Date.now() - touchStartTime;
                    if (touchDuration < 500) {
                        selectRole();
                    }
                }, { passive: false });
            }

            this.roleList.appendChild(roleItem);
        });
    }

    updateRoleTitle() {
        if (this.roleTitle) {
            const displayName = this.roleManager.formatRoleNameForDisplay(this.selectedRole);
            this.roleTitle.textContent = displayName;
        }
    }

    // 토큰 수 포맷팅 (예: 5000 -> 5k)
    formatTokenCount(count) {
        if (!count) return '0';

        if (count >= 1000) {
            return (count / 1000).toFixed(1) + 'k';
        }

        return count.toString();
    }

    // Helper function to detect if content likely contains a code block
    contentLikelyHasCodeBlock(content) {
        // Check for markdown code block syntax (```), or indented code blocks, or inline code (`)
        return content.includes('```') ||
               content.includes('    ') || // 4 spaces for indented code
               (content.includes('`') && !content.includes('```')) ||
               // Check for likely array/object notations
               content.includes('[') && content.includes(']') ||
               content.includes('{') && content.includes('}') ||
               // Check for common programming language keywords
               content.match(/\b(function|var|const|let|if|else|for|while|return|class|import|export)\b/);
    }
}

// Global function to copy message content only (not header or token usage)
function copyMessageContent(messageId) {
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
            console.error('Failed to copy message content:', err);
        });
    }
}

// Initialize the terminal chat when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new TerminalChat();

    // 토큰 사용량 표시를 위한 CSS 스타일 추가
    const style = document.createElement('style');
    style.textContent = `
    .message-header {
        text-align: left !important;
        font-size: 11px;
        color: #666;
        margin-bottom: 8px;
        font-family: 'JetBrains Mono', 'Courier New', monospace;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .assistant-message .message-header {
        justify-content: space-between;
    }

    .user-message .message-header {
        justify-content: space-between;
    }

    .message-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
        width: 100%;
    }

    .token-usage-inline {
        font-size: 11px;
        color: #aaa;
        opacity: 0.9;
        background-color: rgba(0, 0, 0, 0.1);
        padding: 4px 8px;
        border-radius: 4px;
        display: inline-block;
        flex-shrink: 0;
    }

    .copy-response-button {
        background: rgba(0, 0, 0, 0.7);
        color: #ccc;
        border: 1px solid #444;
        border-radius: 3px;
        padding: 4px 8px;
        font-size: 11px;
        font-family: 'JetBrains Mono', 'Courier New', monospace;
        cursor: pointer;
        transition: all 0.2s ease;
        backdrop-filter: blur(4px);
        text-transform: lowercase;
        flex-shrink: 0;
        margin-left: auto;
    }

    .copy-response-button:hover {
        background: rgba(0, 0, 0, 0.9);
        color: #00ff88;
        border-color: #00ff88;
        transform: scale(1.05);
    }

    .copy-response-button:active {
        transform: scale(0.95);
    }

    .copy-response-button.copied {
        background: rgba(0, 40, 0, 0.8);
        color: #00ff88;
        border-color: #00ff88;
    }

    .token-usage-inline .token-prompt,
    .token-usage-inline .token-completion {
        display: inline-block;
        margin: 0 3px;
    }

    .token-usage-inline .token-prompt {
        color: #7fbf7f;
    }

    .token-usage-inline .token-completion {
        color: #7f7fbf;
    }
    `;
    document.head.appendChild(style);
});
