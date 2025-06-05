// Main Terminal Chat functionality
// Import required modules
import {
    formatContextLength,
    shortenModelName,
    getProviderColor,
} from './format.utils.js';

import { simpleEncrypt, simpleDecrypt } from './encryption.utils.js';

import {
    getIOSVersion,
    scrollToBottom,
    autoResizeTextarea,
    setupIOS18Compatibility,
    setupViewportFix,
    setupEnhancedKeyboardHandling,
    handleViewportResize,
    setupViewportChangeHandlers,
    copyMessageContent
} from './ui.utils.js';

import {
    getStoredUserApiKey,
    setStoredUserApiKey,
    updateAuthStatus,
    updateAuthenticationInfo
} from './auth.utils.js';

import { createApiClient } from './api.client.js';
import { MarkdownParser } from './markdown.js';
import { RoleManager } from './role-manager.js';
import { MessageRenderer } from './message.utils.js';

// copyMessageContent 함수를 전역에 등록 (HTML onclick에서 사용하기 위함)
window.copyMessageContent = copyMessageContent;

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

        // iOS 호환성을 위한 플래그
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isIOS18Plus = this.isIOS && getIOSVersion() >= 18;
        this.supportsVisualViewport = 'visualViewport' in window;

        // Initialize modules
        this.markdownParser = new MarkdownParser();
        this.messageRenderer = new MessageRenderer(this.markdownParser);

        // API client for server communication
        this.apiClient = createApiClient(this.userApiKey, this.sessionToken);

        // Role management
        this.roleManager = new RoleManager();
        this.selectedRole = this.roleManager.getStoredRole();
        this.roleModal = document.getElementById('roleModal');
        this.roleModalClose = document.getElementById('roleModalClose');
        this.roleTitle = document.getElementById('roleTitle');
        this.roleList = document.getElementById('roleList');

        // RoleManager UI 초기화
        this.roleManager.initializeUI({
            roleModal: this.roleModal,
            roleModalClose: this.roleModalClose,
            roleTitle: this.roleTitle,
            roleList: this.roleList,
            messageRenderer: this.messageRenderer,
            output: this.output
        });

        // API 클라이언트 설정
        this.roleManager.setApiClient(this.apiClient);

        // 역할 타이틀 클릭 이벤트 재설정 (인증 상태를 전달하기 위해)
        if (this.roleTitle) {
            // 기존 이벤트 리스너 제거 (RoleManager에서 추가한 것)
            this.roleTitle.replaceWith(this.roleTitle.cloneNode(true));
            // 새로운 참조 획득
            this.roleTitle = document.getElementById('roleTitle');
            // RoleManager에도 새 참조 설정
            this.roleManager.roleTitle = this.roleTitle;
            // 새 이벤트 리스너 추가
            this.roleTitle.addEventListener('click', () => {
                this.showRoleModal();
            });
            this.roleTitle.style.cursor = 'pointer';
        }

        this.init();
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
        // 인증 관련 함수 대체
        this.userApiKey = getStoredUserApiKey(this.encryptionKey);

        // Restore session token if available
        this.sessionToken = sessionStorage.getItem('session_token');

        // Set initial UI state (will be updated after server verification)
        this.updateModelTitle();
        this.setupEventListeners();
        this.updateSendButton();
        autoResizeTextarea(this.input);

        if (this.input) {
            this.input.focus();
        }

        // iOS 18 호환성 설정 - ui.utils.js의 함수들을 활용하여 단순화
        if (this.isIOS18Plus) {
            setupIOS18Compatibility(
                this.isIOS18Plus,
                setupViewportFix,
                () => {
                    setupEnhancedKeyboardHandling(
                        this.supportsVisualViewport,
                        () => handleViewportResize(() => scrollToBottom(this.output)),
                        this.isIOS18Plus,
                        () => scrollToBottom(this.output),
                        this.input
                    );
                }
            );
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
            // API 클라이언트 업데이트
            this.updateApiCredentials();

            // 역할 매니저에 API 클라이언트 다시 설정 (인증 정보가 변경되었을 수 있음)
            this.roleManager.setApiClient(this.apiClient);

            await this.roleManager.loadRoles();
        } catch (error) {
            console.warn('Background role initialization failed:', error);
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
                // Update API client credentials
                this.updateApiCredentials();

                const result = await this.apiClient.getModels();

                if (result.status === 401) {
                    // Authentication failed - clear auth state and use cache
                    this.setAuthenticated(false);
                    this.availableModels = this.getStoredModels();
                    return;
                }

                if (result.success && result.models && Array.isArray(result.models)) {
                    // Store full model objects to preserve context_length and other info
                    this.availableModels = result.models;
                    this.setStoredModels(this.availableModels);

                    // Debug: Log context_length info for first few models
                    if (this.availableModels.length > 0) {
                        console.log('📊 Client received models context info (first 3):');
                        this.availableModels.slice(0, 3).forEach(model => {
                            const contextLength = typeof model === 'object' ? model.context_length : 'N/A';
                            const modelId = typeof model === 'string' ? model : model.id;
                            console.log(`  ${modelId}: ${contextLength || 'N/A'} tokens`);
                        });
                    }

                    this.updateModelTitle();
                    return;
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
            this.updateApiCredentials();
            const result = await this.apiClient.setModel('auto');

            if (result.success) {
                this.selectedModel = 'auto';
                localStorage.setItem('selected-model', 'auto');
                this.updateModelTitle();
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
            this.messageRenderer.addSystemMessage(`🔐 Choose access method:\n\n📡 Server Login: /login <password>\n🔑 Personal Key: /set-api-key <key>\n\n💡 Choose ONE option`, this.output, 'auth-required-message');
            return;
        }

        // Show welcome message when authenticated
        let accessMethod = '';
        if (this.userApiKey) {
            accessMethod = '🔑 Personal API Key';
        } else if (this.isAuthenticated) {
            accessMethod = '📡 Server Key';
        }

        this.messageRenderer.addSystemMessage(`✅ Welcome to Chatty!\n\n${accessMethod}\n\n💬 Start chatting or type /help for commands`, this.output, 'welcome-message');
    }

    setAuthenticated(authenticated) {
        this.isAuthenticated = authenticated;
        updateAuthStatus(
            { statusIndicator: this.statusIndicator, authStatus: this.authStatus },
            this.isAuthenticated,
            this.userApiKey
        );

        // API 클라이언트 업데이트
        this.updateApiCredentials();

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
            autoResizeTextarea(this.input);
            this.updateSendButton();
        });

        // Enhanced send button events for iOS 18
        this.setupSendButtonEvents();

        this.input.focus();
        setupViewportChangeHandlers(
            this.supportsVisualViewport,
            () => scrollToBottom(this.output),
            this.isIOS18Plus,
            this.input,
            () => setupViewportFix()
        );

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
        this.messageRenderer.addMessage(userInput, 'user', null, this.output);
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
            this.updateApiCredentials();
            const result = await this.apiClient.sendChatMessage(requestData);

            if (result.status === 401) {
                this.setAuthenticated(false);
                const errorMessage = result.error || '❌ Authentication required. Please login first.';
                this.messageRenderer.addMessage(errorMessage, 'error', null, this.output);
                return;
            }

            if (!result.success) {
                throw new Error(result.error);
            }

            const data = result.data;

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
            this.messageRenderer.addMessage(data.response, 'assistant', data.model, this.output, this.lastUsage);

            // 컨텍스트 표시 업데이트 (서버 관리이므로 추정값만 표시)
            this.updateContextDisplay();

            // 요약 적용 알림
            if (data.summaryApplied && data.summarizedMessageCount > 0) {
                this.messageRenderer.addSystemMessage(`📝 Context optimized: ${data.summarizedMessageCount} messages summarized`, this.output, 'summary-applied');
            }

        } catch (error) {
            console.error('Chat error:', error);
            this.messageRenderer.addMessage(`❌ Error: ${error.message}`, 'error', null, this.output);
        } finally {
            this.isLoading = false;
            this.hideLoading();
            this.input.focus();
        }
    }

    async handleCommand(message) {
        // Clear input immediately after command is entered
        this.input.value = '';
        autoResizeTextarea(this.input);
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
                            this.messageRenderer.addMessage('❌ Password required.\n\nUsage: /login <password>', 'error', null, this.output);
                            break;
                        }

                        const password = args.join(' ');
                        const loginResult = await this.apiClient.login(password);

                        if (loginResult.success) {
                            // Save session token for this tab session
                            if (loginResult.data.session_token) {
                                this.sessionToken = loginResult.data.session_token;
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

                            this.messageRenderer.addMessage(loginResult.data.response, 'system', null, this.output);
                            success = true;
                        } else {
                            this.messageRenderer.addMessage(loginResult.data.response || '❌ Authentication failed.', 'error', null, this.output);
                        }
                        break;

                    case 'clear':
                        try {
                            this.updateApiCredentials();
                            const result = await this.apiClient.clearContext();

                            if (result.success) {
                                // 클라이언트 상태도 초기화
                                this.conversationHistory = [];
                                this.currentTokenUsage = 0;
                                this.output.innerHTML = '';
                                this.updateContextDisplay();
                                this.messageRenderer.addSystemMessage('🔄 Chat cleared. How can I help you?', this.output);
                                success = true;
                            } else {
                                this.messageRenderer.addMessage(`❌ Failed to clear context: ${result.error}`, 'error', null, this.output);
                            }
                        } catch (error) {
                            console.error('Clear context error:', error);
                            this.messageRenderer.addMessage(`❌ Error clearing context: ${error.message}`, 'error', null, this.output);
                        }
                        break;

                    case 'help':
                        const helpResult = await this.apiClient.getHelp();
                        if (helpResult.success) {
                            this.messageRenderer.addMessage(helpResult.response, 'system', null, this.output);
                        } else {
                            this.messageRenderer.addMessage('❌ Failed to get help', 'error', null, this.output);
                        }
                        success = true;
                        break;

                    case 'models':
                        const filterArg = args.length > 0 ? args.join(' ') : null;
                        await this.handleModelsCommand(filterArg);
                        success = true;
                        break;

                    case 'set-model':
                        if (args.length === 0) {
                            this.messageRenderer.addMessage('❌ Model ID required.\n\nUsage: /set-model <model-id> or /set-model auto', 'error', null, this.output);
                            break;
                        }

                        const modelId = args.join(' ');
                        await this.setModel(modelId);
                        success = true;
                        break;

                    case 'set-api-key':
                        if (args.length === 0) {
                            this.messageRenderer.addMessage('❌ API key required.\n\nUsage: /set-api-key <your-openrouter-key>\n\nGet your key: https://openrouter.ai/settings/keys', 'error', null, this.output);
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
                        await this.roleManager.handleRolesCommand(
                            this.isAuthenticated
                        );
                        success = true;
                        break;

                    case 'set-role':
                        if (args.length === 0) {
                            this.messageRenderer.addMessage('❌ Role ID required.\n\nUsage: /set-role <role-id>\n\nUse /roles to see available roles', 'error', null, this.output);
                            break;
                        }

                        // API 클라이언트 인증 정보 업데이트
                        this.updateApiCredentials();

                        const roleId = args.join(' ');
                        const result = await this.roleManager.setRole(roleId);
                        if (result.success) {
                            this.selectedRole = this.roleManager.selectedRole;
                        }
                        success = true;
                        break;

                    default:
                        this.messageRenderer.addMessage(`❌ Unknown command: /${command}\n\nType /help for available commands.`, 'error', null, this.output);
                        break;
                }

                resolve({ success, data });
            } catch (error) {
                console.error('Command error:', error);
                this.messageRenderer.addMessage(`❌ Error executing command: ${error.message}`, 'error', null, this.output);
                resolve({ success: false, data: null });
            }
        });
    }

    async handleModelsCommand(filterArg = null) {
        if (!this.isAuthenticated && !this.userApiKey) {
            this.messageRenderer.addMessage('❌ Authentication required.\n\nUse /login <password> or /set-api-key <key> first.', 'error', null, this.output);
            return;
        }

        try {
            this.updateApiCredentials();
            const modelsResult = await this.apiClient.getModels();

            if (modelsResult.success && modelsResult.models && Array.isArray(modelsResult.models)) {
                // Filter models if filter argument is provided
                let filteredModels = modelsResult.models;
                if (filterArg) {
                    filteredModels = modelsResult.models.filter(model => {
                        const modelId = typeof model === 'string' ? model : model.id;
                        return modelId.toLowerCase().includes(filterArg.toLowerCase());
                    });
                }

                if (filteredModels.length === 0) {
                    const filterMessage = filterArg ? ` matching "${filterArg}"` : '';
                    this.messageRenderer.addMessage(`❌ No models found${filterMessage}.`, 'error', null, this.output);
                    return;
                }

                // Build model list
                const filterMessage = filterArg ? ` matching "${filterArg}"` : '';
                let modelList = `📋 Available Models${filterMessage} (${filteredModels.length}/${modelsResult.models.length} total)\n\n`;

                filteredModels.forEach((model, index) => {
                    const modelId = typeof model === 'string' ? model : model.id;
                    const contextLength = typeof model === 'object' ? model.context_length : null;
                    const contextDisplay = formatContextLength(contextLength);
                    modelList += `${index + 1}. ${modelId} (${contextDisplay})\n`;
                });

                modelList += `\nUsage: /set-model <model-id> or /set-model auto`;
                if (filterArg) {
                    modelList += `\n💡 Use /models without filter to see all models`;
                }

                this.messageRenderer.addMessage(modelList, 'system', null, this.output);
            } else {
                this.messageRenderer.addMessage('❌ No models available.', 'error', null, this.output);
            }
        } catch (error) {
            console.error('Models fetch error:', error);
            this.messageRenderer.addMessage(`❌ Error fetching models: ${error.message}`, 'error', null, this.output);
        }
    }

    async setModel(modelId) {
        this.selectedModel = modelId;
        localStorage.setItem('selected-model', modelId);

        // Update model info and context size
        this.updateModelInfo(modelId);

        // Update title
        this.updateModelTitle();

        this.messageRenderer.addMessage(`✅ Model set to: ${modelId}`, 'system', null, this.output);
    }

    async setUserApiKey(apiKey) {
        try {
            // Simple validation
            if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
                this.messageRenderer.addMessage('❌ Invalid API key format. Should start with "sk-" and be at least 20 characters.', 'error', null, this.output);
                return;
            }

            // Store encrypted API key - 인증 관련 함수 대체
            setStoredUserApiKey(apiKey, this.encryptionKey);
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
            this.messageRenderer.addMessage(`❌ Error setting API key: ${error.message}`, 'error', null, this.output);
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

        this.messageRenderer.addMessage('✅ Personal API key removed\n\n📡 Use /login <password> or /set-api-key <key>', 'system', null, this.output);
    }

    showApiKeyStatus() {
        if (this.userApiKey) {
            const maskedKey = this.userApiKey.substring(0, 8) + '...' + this.userApiKey.substring(this.userApiKey.length - 4);
            this.messageRenderer.addMessage(`🔑 Personal API Key: Active\n\nKey: ${maskedKey}\n\n• /remove-api-key - Remove key\n• /models - View models`, 'system', null, this.output);
        } else if (this.isAuthenticated) {
            this.messageRenderer.addMessage(`📡 Server Authentication: Active\n\n• /set-api-key <key> - Switch to personal\n• /models - View models`, 'system', null, this.output);
        } else {
            this.messageRenderer.addMessage(`❌ No authentication\n\n• /login <password> - Server key\n• /set-api-key <key> - Personal key`, 'system', null, this.output);
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

    showModelModal() {
        this.updateApiCredentials();
        this.populateModelList();
        if (this.modelModal) {
            this.modelModal.classList.add('show');
        }
    }

    hideModelModal() {
        if (this.modelModal) {
            this.modelModal.classList.remove('show');
        }
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
            const contextLength = typeof model === 'object' ? model.context_length : null;
            const modelItem = document.createElement('div');
            modelItem.className = 'model-item';

            // Check if this is the currently selected model
            if (modelId === this.selectedModel) {
                modelItem.classList.add('selected');
            }

            // Get provider color for consistency
            const providerColor = getProviderColor(modelId);
            const provider = modelId.split('/')[0] || 'unknown';
            const modelName = shortenModelName(modelId);
            const contextDisplay = formatContextLength(contextLength);

            modelItem.innerHTML = `
                <div class="model-header">
                    <div class="provider-badge" style="background-color: ${providerColor};">${provider}</div>
                    <div class="context-badge">${contextDisplay}</div>
                </div>
                <div class="model-name">${modelName}</div>
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
            console.log(`✅ Model context: ${modelName} = ${modelInfo.context_length} tokens`);
        } else {
            // Fallback when no context info is available (use default 128k)
            this.selectedModelInfo = {
                id: modelName,
                context_length: 128000
            };
            this.maxContextSize = 128000;
            console.warn(`⚠️ Using fallback context for ${modelName}: 128000 tokens`);
        }

        // Update context display immediately
        this.updateContextDisplay();
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

    updateModelTitle() {
        if (this.modelTitle) {
            let modelName = this.selectedModel;
            if (!modelName || modelName === 'auto') {
                if (this.availableModels && this.availableModels.length > 0) {
                    // Extract model ID from first available model
                    const firstModel = this.availableModels[0];
                    modelName = typeof firstModel === 'string' ? firstModel : firstModel.id;
                } else if (this.isAuthenticated || this.userApiKey) {
                    modelName = 'loading...';  // Show loading when authenticated but no models yet
                } else {
                    modelName = 'login required';  // More descriptive when not authenticated
                }
            }

            let displayName = shortenModelName(modelName) || modelName;

            // 사용자 API 키 사용시 표시 추가
            if (this.userApiKey) {
                displayName += ' 👑';
            }

            this.modelTitle.textContent = displayName;
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
        // 인증 관련 함수 대체
        const authInfo = await updateAuthenticationInfo(
            this.apiClient,
            () => this.updateApiCredentials(),
            { statusIndicator: this.statusIndicator, authStatus: this.authStatus },
            this.userApiKey
        );

        // 결과 적용
        this.isAuthenticated = authInfo.isAuthenticated;
        this.authMethod = authInfo.authMethod;
        this.authType = authInfo.authType;
    }

    // Update API client credentials when authentication changes
    updateApiCredentials() {
        // API 클라이언트 인증 정보 업데이트
        this.apiClient.setCredentials(this.userApiKey, this.sessionToken);

        // 역할 매니저에 최신 API 클라이언트 설정
        this.roleManager.setApiClient(this.apiClient);
    }

    // Role 모달 표시 (인증 상태 전달)
    showRoleModal() {
        // API 클라이언트 인증 정보 업데이트
        this.updateApiCredentials();
        this.roleManager.showRoleModal(this.isAuthenticated);
    }
}

// Initialize the terminal chat when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new TerminalChat();
});
