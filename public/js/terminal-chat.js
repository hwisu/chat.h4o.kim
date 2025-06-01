// Main Terminal Chat functionality
class TerminalChat {
    constructor() {
        this.output = document.getElementById('output');
        this.input = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.modelSelector = document.getElementById('modelSelector');
        this.modelList = document.getElementById('modelList');
        this.contextUsage = document.getElementById('contextUsage');
        this.authButton = document.getElementById('authButton');
        this.authModal = document.getElementById('authModal');
        this.apiKeyModal = document.getElementById('apiKeyModal');
        this.authPasswordInput = document.getElementById('authPassword');
        this.apiKeyInput = document.getElementById('apiKey');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.authStatus = document.getElementById('authStatus');
        this.modelModal = document.getElementById('modelModal');
        this.modelModalClose = document.getElementById('modelModalClose');
        this.modelTitle = document.getElementById('modelTitle');
        this.inputSpinner = document.getElementById('inputSpinner');

        this.selectedModel = localStorage.getItem('selectedModel') || 'auto';
        this.selectedModelInfo = null;
        this.conversationHistory = [];
        this.isAuthenticated = false;
        this.availableModels = [];
        this.isLoading = false;

        this.maxContextSize = 128000; // Will be dynamically set based on selected model
        this.currentTokenUsage = 0; // Current actual token usage (from server)
        this.estimatedTokenUsage = 0; // Estimated usage (client-side)
        
        // Compression settings for efficient communication
        this.enableCompression = true;
        this.compressionMinSize = 500; // Compress messages over 500 bytes
        this.compressionMethod = 'auto'; // auto, field-shortening, lz-string
        this.lzStringAvailable = false;

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

        // Check compression library availability
        if (typeof LZString !== 'undefined') {
            console.log('✅ LZ-String compression library loaded');
            this.lzStringAvailable = true;
        } else {
            console.warn('⚠️ LZ-String library not available, using fallback compression');
            this.compressionMethod = 'field-shortening';
        }

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
                if (this.sessionToken) {
                    headers['X-Session-Token'] = this.sessionToken;
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
        // Remove existing auth messages
        const existingAuth = document.querySelector('.auth-required-message');
        if (existingAuth) {
            existingAuth.remove();
        }

        if (!this.isAuthenticated && !this.userApiKey) {
            // Show options for authentication OR API key
            this.addSystemMessage(`🔐 Choose your access method:\n\n📡 Option 1: Server Login\n• Use /login <password> to authenticate\n• Uses server's API key (free access)\n\n🔑 Option 2: Personal API Key\n• Use /set-api-key <your-key> to set your own key\n• Uses your OpenRouter account and quota\n• Get your key: https://openrouter.ai/settings/keys\n\n💡 You only need to choose ONE option!`, 'auth-required-message');
            return;
        }

        if (!document.querySelector('.welcome-message')) {
            let accessMethod = '';
            if (this.userApiKey) {
                accessMethod = '🔑 Using your personal API key';
            } else if (this.isAuthenticated) {
                accessMethod = '📡 Using server API key';
            }
            
            this.addSystemMessage(`✅ Welcome to Chatty!\n\n🧠 Features:\n• Conversation context maintained across messages\n• Type /help to see available commands\n• Start chatting with AI models!\n\n${accessMethod}`, 'welcome-message');
        }
    }

    setAuthenticated(authenticated) {
        this.isAuthenticated = authenticated;
        if (authenticated) {
            if (this.statusIndicator) {
                this.statusIndicator.classList.add('authenticated');
            }
            if (this.authStatus) {
                this.authStatus.textContent = '🔑 Personal API Key';
                this.authStatus.style.color = '#00ff00';
            }

            // Load models when authenticated
            this.loadModelsBackground();
            // Update welcome message to remove auth prompts
            this.updateWelcomeMessage();
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
            // Update welcome message to show auth prompts
            this.updateWelcomeMessage();
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
        if (this.apiKeyModalClose) {
            this.apiKeyModalClose.addEventListener('click', () => {
                this.hideModelModal();
            });
        }

        if (this.apiKeyModal) {
            this.apiKeyModal.addEventListener('click', (e) => {
                if (e.target === this.apiKeyModal) {
                    this.hideModelModal();
                }
            });
        }

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.apiKeyModal.classList.contains('show')) {
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
            // Prepare messages for API
            const messages = this.prepareMessagesForAPI(userInput);
            
            // Compress conversation history if needed
            const compressionResult = this.compressConversationHistory(this.conversationHistory);
            
            // Prepare request data
            let requestData = {
                message: userInput,
                model: this.selectedModel,
                temperature: 0.7,
                max_tokens: 1500,
                top_p: 0.9,
                frequency_penalty: 0.1,
                presence_penalty: 0.1
            };

            // Add compression data based on method
            if (compressionResult.method === 'lz-string') {
                requestData.compressed = true;
                requestData.compression_method = 'lz-string';
                requestData.h = compressionResult.data;
                requestData.m = userInput;
            } else if (compressionResult.method === 'field-shortening') {
                // Use field shortening format
                requestData.h = JSON.parse(compressionResult.data).m;
                requestData.b = JSON.parse(compressionResult.data).b;
            } else {
                // No compression - only add conversationHistory if it has content
                if (this.conversationHistory && this.conversationHistory.length > 0) {
                    requestData.conversationHistory = this.conversationHistory;
                }
            }

            // Prepare headers
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
                const errorData = await response.json();
                
                if (response.status === 401) {
                    this.setAuthenticated(false);
                    this.addMessage(errorData.response || '❌ Authentication required. Please login first.', 'error');
                    return;
                }
                
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.response) {
                throw new Error('Empty response from server');
            }

            // Add assistant response to conversation
            this.addMessage(data.response, 'assistant');
            
            // Update actual token usage if provided by server
            if (data.usage) {
                const totalTokens = data.usage.total_tokens || (data.usage.prompt_tokens + data.usage.completion_tokens);
                this.currentTokenUsage = totalTokens;
                
                // Add assistant message with actual token count
                this.addToConversationHistory('assistant', data.response, data.usage.completion_tokens);
                
                console.log(`📊 Token usage: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${totalTokens} total`);
            } else {
                // Fallback to estimated tokens
                this.addToConversationHistory('assistant', data.response);
            }
            
            // Update context display
            this.updateContextDisplay();

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
                            this.setAuthenticated(true);
                            this.addMessage(loginData.response, 'system');
                            // Save session token for this tab session
                            if (loginData.session_token) {
                                this.sessionToken = loginData.session_token;
                                sessionStorage.setItem('session_token', this.sessionToken);
                            }
                            // Remove auth required messages and update welcome
                            this.updateWelcomeMessage();
                            success = true;
                        } else {
                            this.addMessage(loginData.response || '❌ Authentication failed.', 'error');
                        }
                        break;

                    case 'clear':
                        this.clearConversationHistory();
                        this.output.innerHTML = '';
                        this.addSystemMessage('🔄 Chat cleared. How can I help you?');
                        success = true;
                        break;

                    case 'help':
                        const helpResponse = await fetch('/api/help');
                        const helpData = await helpResponse.json();
                        this.addMessage(helpData.response, 'system');
                        success = true;
                        break;

                    case 'models':
                        await this.handleModelsCommand();
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

    async handleModelsCommand() {
        if (!this.isAuthenticated && !this.userApiKey) {
            this.addMessage('❌ Authentication required.\n\nUse /login <password> or /set-api-key <key> first.', 'error');
            return;
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.userApiKey) {
                headers['X-User-API-Key'] = this.userApiKey;
            }

            const response = await fetch('/api/models', {
                method: 'GET',
                headers: headers
            });

            if (response.ok) {
                const data = await response.json();
                if (data.models && Array.isArray(data.models)) {
                    let modelList = `📋 Available Models (${data.models.length} total)\n\n`;
                    data.models.forEach((model, index) => {
                        const modelId = typeof model === 'string' ? model : model.id;
                        modelList += `${index + 1}. ${modelId}\n`;
                    });
                    modelList += `\nUsage: /set-model <model-id> or /set-model auto`;
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
        localStorage.setItem('selectedModel', modelId);
        
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
            localStorage.setItem('user_api_key', encryptedKey);
            this.userApiKey = apiKey;
            
            // Update auth status
            this.setAuthenticated(false); // Reset server auth
            this.updateAuthStatus();
            
            // Clear models cache to force refresh with new key
            this.availableModels = [];
            localStorage.removeItem('cached-models');
            
            this.addMessage('✅ Personal API key set successfully!\n\n🔑 You\'re now using your own OpenRouter account.\n\nFeatures:\n• Access to all models in your account\n• Uses your quota and billing\n• Commands: /models, /set-model <id>\n\n💡 Your key is stored locally and encrypted.', 'system');
            
            // Load models with new key
            await this.loadModelsBackground();
            
        } catch (error) {
            console.error('API key setup error:', error);
            this.addMessage(`❌ Error setting API key: ${error.message}`, 'error');
        }
    }

    removeUserApiKey() {
        localStorage.removeItem('user_api_key');
        this.userApiKey = null;
        this.setAuthenticated(false);
        this.updateAuthStatus();
        
        // Clear models cache
        this.availableModels = [];
        localStorage.removeItem('cached-models');
        
        this.addMessage('✅ Personal API key removed.\n\n📡 You can now:\n• Login with server password: /login <password>\n• Or set a new personal key: /set-api-key <key>', 'system');
    }

    showApiKeyStatus() {
        if (this.userApiKey) {
            const maskedKey = this.userApiKey.substring(0, 8) + '...' + this.userApiKey.substring(this.userApiKey.length - 4);
            this.addMessage(`🔑 Personal API Key Status: Active\n\nKey: ${maskedKey}\nSource: Local storage (encrypted)\n\nCommands:\n• /remove-api-key - Remove current key\n• /models - View available models`, 'system');
        } else if (this.isAuthenticated) {
            this.addMessage(`📡 Server Authentication: Active\n\nUsing server's API key for free access.\n\nCommands:\n• /set-api-key <key> - Switch to personal key\n• /models - View available models`, 'system');
        } else {
            this.addMessage(`❌ No authentication active.\n\nChoose one option:\n• /login <password> - Use server key\n• /set-api-key <key> - Use personal key\n\nGet API key: https://openrouter.ai/settings/keys`, 'system');
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
        if (this.inputSpinner) {
            this.inputSpinner.style.display = 'flex';
        }
        if (this.sendButton) {
            this.sendButton.textContent = '⏳';
            this.sendButton.disabled = true;
        }
    }

    hideLoading() {
        this.isLoading = false;
        if (this.inputSpinner) {
            this.inputSpinner.style.display = 'none';
        }
        if (this.sendButton) {
            this.sendButton.textContent = '↑';
            this.sendButton.disabled = false;
        }
    }

    addMessage(content, role, model = null) {
        const timestamp = new Date().toLocaleTimeString();
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        
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
        
        messageDiv.innerHTML = `
            <div class="message-header">${header}</div>
            <div class="message-content">${role === 'assistant' ? this.markdownParser.renderContent(content) : this.escapeHtml(content)}</div>
        `;
        
        this.output.appendChild(messageDiv);
        this.scrollToBottom();
        
        // Syntax highlighting for code blocks if it's an assistant message
        if (role === 'assistant' && typeof hljs !== 'undefined') {
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
        
        // Truncate if still too long
        if (shortened.length > 20) {
            shortened = shortened.substring(0, 17) + '...';
        }
        
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
            modelItem.className = 'model-list-item';
            
            // Check if this is the currently selected model
            if (modelId === this.selectedModel) {
                modelItem.classList.add('selected');
            }
            
            modelItem.innerHTML = `
                <div class="model-name">${this.shortenModelName(modelId)}</div>
                <div class="model-id">${modelId}</div>
            `;
            
            modelItem.addEventListener('click', () => {
                this.setModel(modelId);
                this.hideModelModal();
            });
            
            this.modelList.appendChild(modelItem);
        });
    }

    async setModel(modelId) {
        this.selectedModel = modelId;
        localStorage.setItem('selectedModel', modelId);
        
        // Update model info and context size
        this.updateModelInfo(modelId);
        
        // Update title
        this.updateModelTitle();
        
        this.addMessage(`✅ Model set to: ${modelId}`, 'system');
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
        // Calculate estimated tokens for all messages that will be sent to API
        let totalTokens = 0;
        
        this.conversationHistory.forEach(msg => {
            totalTokens += this.estimateTokens(msg.content);
        });
        
        this.estimatedTokenUsage = totalTokens;
        
        // Use actual token usage if available, otherwise fall back to estimated
        const actualUsage = this.currentTokenUsage || this.estimatedTokenUsage;
        
        // Auto-trim conversation if it exceeds 80% of model context
        const contextLimit = this.maxContextSize * 0.8; // Use 80% of available context
        if (actualUsage > contextLimit && this.conversationHistory.length > 2) {
            console.log(`🔄 Auto-trimming conversation: ${actualUsage} > ${contextLimit} tokens`);
            
            // Remove oldest messages until we're under the limit
            while (this.estimatedTokenUsage > contextLimit && this.conversationHistory.length > 2) {
                const removed = this.conversationHistory.shift();
                this.estimatedTokenUsage -= this.estimateTokens(removed.content);
            }
            
            console.log(`✂️ Trimmed to ${this.conversationHistory.length} messages, ~${this.estimatedTokenUsage} tokens`);
        }
        
        this.updateContextDisplay();
        return actualUsage;
    }

    // Update context display with real usage
    updateContextDisplay() {
        if (!this.contextUsage) return;

        // Use actual token usage if available, otherwise estimated
        const displayUsage = this.currentTokenUsage || this.estimatedTokenUsage;
        const remainingTokens = this.maxContextSize - displayUsage;
        const usagePercentage = Math.round((displayUsage / this.maxContextSize) * 100);
        
        // Format context size display
        let contextSizeDisplay;
        if (this.maxContextSize >= 1000000) {
            contextSizeDisplay = `${Math.round(this.maxContextSize / 1000000)}M`;
        } else if (this.maxContextSize >= 1000) {
            contextSizeDisplay = `${Math.round(this.maxContextSize / 1000)}k`;
        } else {
            contextSizeDisplay = this.maxContextSize.toString();
        }
        
        // Show: "Context: 128k (5%)" with indicator for actual vs estimated
        const usageIndicator = this.currentTokenUsage > 0 ? '' : '~'; // ~ for estimated
        const displayText = `Context: ${contextSizeDisplay} (${usageIndicator}${usagePercentage}%)`;

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
    addToConversationHistory(role, content, actualTokens = null) {
        const estimatedTokens = this.estimateTokens(content);
        
        this.conversationHistory.push({
            role: role,
            content: content,
            timestamp: Date.now(),
            estimatedTokens: estimatedTokens,
            actualTokens: actualTokens
        });

        // Update token usage
        if (actualTokens) {
            // Recalculate actual usage based on all messages with actual tokens
            this.currentTokenUsage = this.conversationHistory.reduce((sum, msg) => {
                return sum + (msg.actualTokens || msg.estimatedTokens || this.estimateTokens(msg.content));
            }, 0);
        }

        // Calculate and update current usage
        this.calculateCurrentTokenUsage();
    }

    // Clear conversation history
    clearConversationHistory() {
        this.conversationHistory = [];
        this.currentTokenUsage = 0;
        this.estimatedTokenUsage = 0;
        this.updateContextDisplay();
        this.addSystemMessage('🔄 Conversation history cleared.', 'history-cleared');
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

    updateModelTitle() {
        if (this.modelTitle) {
            let modelName = this.selectedModel;
            if (!modelName || modelName === 'auto') {
                modelName = this.availableModels && this.availableModels.length > 0 ? this.availableModels[0] : 'whoami';
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
                
                console.log('Auth status updated:', {
                    authenticated: this.isAuthenticated,
                    method: this.authMethod,
                    type: this.authType,
                    hasUserKey: !!this.userApiKey
                });
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
            console.log('Auth status check failed:', error.message);
        }
        
        this.updateAuthStatus();
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

        return messages;
    }

    /**
     * 압축 유틸리티 메서드들
     */
    compressConversationHistory(history, method = this.compressionMethod) {
        if (!this.enableCompression || !history || history.length === 0) {
            return {
                data: JSON.stringify(history),
                method: 'none',
                originalSize: JSON.stringify(history).length,
                compressedSize: JSON.stringify(history).length,
                compressionRatio: 0
            };
        }

        const originalData = JSON.stringify(history);
        const originalSize = originalData.length;

        // Skip compression for small data
        if (originalSize < this.compressionMinSize) {
            return {
                data: originalData,
                method: 'none',
                originalSize: originalSize,
                compressedSize: originalSize,
                compressionRatio: 0
            };
        }

        let compressedData;
        let actualMethod = method;

        // Auto-select compression method based on data size and availability
        if (method === 'auto') {
            if (this.lzStringAvailable && history.length > 10) {
                actualMethod = 'lz-string';
            } else {
                actualMethod = 'field-shortening';
            }
        }

        try {
            const startTime = performance.now();

            switch (actualMethod) {
                case 'lz-string':
                    compressedData = this.compressWithLZString(history);
                    break;
                case 'field-shortening':
                    compressedData = this.compressWithFieldShortening(history);
                    break;
                default:
                    compressedData = originalData;
                    actualMethod = 'none';
            }

            const endTime = performance.now();
            const compressedSize = compressedData.length;
            const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

            console.log(`📦 Compression: ${actualMethod}, ${originalSize}→${compressedSize} bytes (${compressionRatio.toFixed(1)}% saved, ${(endTime - startTime).toFixed(2)}ms)`);

            return {
                data: compressedData,
                method: actualMethod,
                originalSize: originalSize,
                compressedSize: compressedSize,
                compressionRatio: compressionRatio,
                compressionTime: endTime - startTime
            };
        } catch (error) {
            console.warn('Compression failed, using uncompressed data:', error);
            return {
                data: originalData,
                method: 'none',
                originalSize: originalSize,
                compressedSize: originalSize,
                compressionRatio: 0
            };
        }
    }

    compressWithFieldShortening(history) {
        // 필드명 단축 + 적극적 최적화
        if (history.length === 0) return JSON.stringify([]);

        const baseTimestamp = Math.min(...history.map(msg => msg.timestamp || Date.now()));
        const compressed = history.map(msg => ({
            r: msg.role === 'user' ? 'u' : 'a',
            c: msg.content,
            t: (msg.timestamp || Date.now()) - baseTimestamp
        }));

        return JSON.stringify({
            b: baseTimestamp,
            m: compressed
        });
    }

    compressWithLZString(history) {
        // 필드명 단축 + LZ-String 조합
        const fieldCompressed = this.compressWithFieldShortening(history);
        return LZString.compress(fieldCompressed);
    }

    decompressConversationHistory(compressedData, method) {
        if (!compressedData || method === 'none') {
            try {
                return JSON.parse(compressedData);
            } catch {
                return [];
            }
        }

        try {
            let decompressed;

            switch (method) {
                case 'lz-string':
                    const lzDecompressed = LZString.decompress(compressedData);
                    decompressed = JSON.parse(lzDecompressed);
                    break;
                case 'field-shortening':
                    decompressed = JSON.parse(compressedData);
                    break;
                default:
                    decompressed = JSON.parse(compressedData);
            }

            // Handle compressed format
            if (decompressed.b !== undefined && decompressed.m !== undefined) {
                const baseTimestamp = decompressed.b;
                return decompressed.m.map(msg => ({
                    role: msg.r === 'u' ? 'user' : 'assistant',
                    content: msg.c,
                    timestamp: msg.t + baseTimestamp
                }));
            }

            return decompressed;
        } catch (error) {
            console.error('Decompression failed:', error);
            return [];
        }
    }
}

// Initialize the terminal chat when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new TerminalChat();
});
