// Main Terminal Chat functionality
class TerminalChat {
    constructor() {
        this.output = document.getElementById('output');
        this.messageInput = document.getElementById('messageInput');
        this.inputSpinner = document.getElementById('inputSpinner');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.authStatus = document.getElementById('authStatus');
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

        this.authenticated = false;
        this.availableModels = [];
        this.selectedModel = null;
        this.currentModelIndex = 0;
        this.isLoading = false;
        this.isComposing = false;

        // Mobile detection
        this.isMobile = /iPad|iPhone|iPod|Android/.test(navigator.userAgent);

        // Initialize modules
        this.markdownParser = new MarkdownParser();

        this.init();
    }

    async init() {
        await this.checkAuthenticationStatus();
        this.selectedModel = this.getStoredModel();
        this.updateModelTitle();
        this.setupEventListeners();
        this.updateSendButton();
        this.autoResizeTextarea();

        if (this.messageInput) {
            this.messageInput.focus();
        }

        // Background model initialization
        this.initializeModelsBackground();
    }

    async checkAuthenticationStatus() {
        try {
            const response = await fetch('/api/auth/status', {
                method: 'GET',
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                this.authenticated = data.authenticated || false;
            } else {
                this.authenticated = false;
            }
        } catch (error) {
            console.warn('Failed to check auth status:', error);
            this.authenticated = this.getStoredAuth(); // fallback to cookie check
        }

        this.setAuthenticated(this.authenticated);
    }

    async initializeModelsBackground() {
        try {
            await this.loadModelsBackground();
            if (!this.selectedModel || this.selectedModel === 'auto') {
                await this.setModelAuto();
            } else {
                this.updateModelTitle();
            }
        } catch (error) {
            console.warn('Background model initialization failed:', error);
        }
    }

    async loadModelsBackground() {
        if (this.availableModels.length === 0) {
            this.availableModels = this.getStoredModels();
        }

        if (this.availableModels.length === 0) {
            try {
                const response = await fetch('/api/models', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.models && Array.isArray(data.models)) {
                        this.availableModels = data.models.map(model =>
                            typeof model === 'string' ? model : model.id
                        );
                        this.setStoredModels(this.availableModels);
                        console.log('Models loaded in background:', this.availableModels.length);
                        this.updateModelTitle();
                    }
                }
            } catch (error) {
                console.warn('Failed to load models in background:', error);
            }
        }
    }

    async setModelAuto() {
        try {
            const response = await fetch('/api/set-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

    getStoredAuth() {
        // Check if auth cookie exists
        const cookies = document.cookie.split(';');
        const authCookie = cookies.find(cookie => cookie.trim().startsWith('auth_token='));
        return !!authCookie;
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

    setAuthenticated(authenticated, isLoginSuccess = false) {
        this.authenticated = authenticated;
        if (authenticated) {
            if (this.statusIndicator) {
                this.statusIndicator.classList.add('authenticated');
            }
            if (this.authStatus) {
                this.authStatus.textContent = 'Authenticated';
                this.authStatus.style.color = '#00aa00';
            }

            // Remove auth required message
            const authMsg = document.querySelector('.auth-required-message');
            if (authMsg) {
                authMsg.remove();
            }

            // Show welcome message only on first load (not on login success)
            if (!isLoginSuccess && !document.querySelector('.welcome-message')) {
                this.addSystemMessage('✅ Welcome back to AI Chat Terminal!\n\nYou are already authenticated. Start chatting with AI models or click the model name in the header to select different models.', 'welcome-message');
            }
        } else {
            if (this.statusIndicator) {
                this.statusIndicator.classList.remove('authenticated');
            }
            if (this.authStatus) {
                this.authStatus.textContent = 'Authentication required';
                this.authStatus.style.color = '#666';
            }

            // Show auth required message if not authenticated
            if (!document.querySelector('.auth-required-message')) {
                this.addSystemMessage('🔐 Authentication required to access AI models.\n\nType: /login YOUR_PASSWORD\n\nOnce authenticated, you can:\n• Chat with free AI models\n• Click the model name in the header to select different models', 'auth-required-message');
            }
        }
    }

    setupEventListeners() {
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

        window.addEventListener('resize', ensureScrollToBottom);
        this.messageInput.addEventListener('focus', ensureScrollToBottom);
        this.messageInput.addEventListener('blur', ensureScrollToBottom);
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
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);

                try {
                    response = await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: message }),
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
            console.log(`Response time: ${responseTime.toFixed(2)}ms`);

            if (response.ok) {
                if (data.login_success) {
                    this.setAuthenticated(true, true);
                }
                if (data.response && !data.login_success) {
                    this.addAssistantMessage(data.response, data.model, data.korean_optimized);
                }
                if (data.response && data.login_success) {
                    this.addSystemMessage(data.response, 'login-response-message');
                }
            } else {
                if (response.status === 401 || data.auth_required) {
                    this.setAuthenticated(false);
                    this.addErrorMessage('Authentication required. Use /login <password> to authenticate.');
                } else {
                    this.addErrorMessage(data.error || 'Unknown error occurred');
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
        // Change send button icon to asterisk with animation
        const sendArrow = this.sendButton.querySelector('.send-arrow');
        if (sendArrow) {
            sendArrow.textContent = '✱';
            sendArrow.classList.add('asterisk-anim');
        }
    }

    hideLoading() {
        this.hideTypingAnimation();
        this.updateSendButton();
        // Restore send button icon to up arrow
        const sendArrow = this.sendButton.querySelector('.send-arrow');
        if (sendArrow) {
            sendArrow.textContent = '↑';
            sendArrow.classList.remove('asterisk-anim');
        }
    }

    showTypingAnimation() {
        this.hideTypingAnimation();

        const timestamp = new Date().toLocaleTimeString();
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant-message typing-message';
        typingDiv.innerHTML = `
            <div class="message-header">[AI] ${timestamp}</div>
            <div class="message-content">
            </div>
        `;
        this.output.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTypingAnimation() {
        const typingMessage = this.output.querySelector('.typing-message');
        if (typingMessage) {
            typingMessage.remove();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            this.output.scrollTop = this.output.scrollHeight;

            setTimeout(() => {
                this.output.scrollTop = this.output.scrollHeight;
            }, 50);
        });
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
            modelTitle.textContent = this.shortenModelName(modelName) || modelName;
        }
    }

    showModelModal() {
        if (!this.authenticated) {
            this.addSystemMessage('Please login first to change models.');
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

        // Load models if not already loaded
        if (this.availableModels.length === 0) {
            await this.loadModelsBackground();
        }

        // Clear loading and populate list
        this.modelList.innerHTML = '';

        if (this.availableModels.length === 0) {
            this.modelList.innerHTML = '<div class="model-list-loading">No models available</div>';
            return;
        }

        this.availableModels.forEach((model, index) => {
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
                const providerColor = this.markdownParser.stringToColor(provider);

                // Add star for meta and google models
                const star = (provider === 'meta-llama' || provider === 'google') ? ' ✱' : '';

                modelItem.innerHTML = `
                    <div style="color: ${providerColor}; font-weight: 500;">${provider}/${modelName}${star}</div>
                    <div class="model-provider">${provider}</div>
                `;
            } else {
                modelItem.textContent = model;
            }

            modelItem.addEventListener('click', () => {
                this.selectModelFromModal(model, index);
            });

            this.modelList.appendChild(modelItem);
        });
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
            const response = await fetch('/api/set-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.selectedModel = modelName;
                    localStorage.setItem('selected-model', modelName);
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
}

// Initialize the terminal chat when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new TerminalChat();
});
