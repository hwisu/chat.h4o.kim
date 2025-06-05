// API Client utilities for terminal chat
// Handles all server communication with consistent error handling and authentication

// Base API client class
export class ApiClient {
    constructor(userApiKey = null, sessionToken = null) {
        this.userApiKey = userApiKey;
        this.sessionToken = sessionToken;
    }

    // Update authentication credentials
    setCredentials(userApiKey = null, sessionToken = null) {
        this.userApiKey = userApiKey;
        this.sessionToken = sessionToken;
    }

    // Prepare headers with authentication
    prepareHeaders(additionalHeaders = {}) {
        const headers = { 'Content-Type': 'application/json', ...additionalHeaders };

        if (this.userApiKey) {
            headers['X-User-API-Key'] = this.userApiKey;
        }
        if (this.sessionToken) {
            headers['X-Session-Token'] = this.sessionToken;
        }

        return headers;
    }

    // Generic API request with error handling
    async request(endpoint, options = {}) {
        const { method = 'GET', body = null, headers = {} } = options;

        const requestOptions = {
            method,
            headers: this.prepareHeaders(headers)
        };

        if (body && method !== 'GET') {
            requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        try {
            const response = await fetch(endpoint, requestOptions);
            return { response, ok: response.ok, status: response.status };
        } catch (error) {
            console.error(`API request failed for ${endpoint}:`, error);
            throw error;
        }
    }

    // Get models from server
    async getModels() {
        const { response, ok, status } = await this.request('/api/models');

        if (status === 401) {
            return { success: false, error: 'Authentication required', status: 401 };
        }

        if (ok) {
            const data = await response.json();
            return { success: true, models: data.models };
        } else {
            return { success: false, error: `HTTP ${status}`, status };
        }
    }

    // Set model on server
    async setModel(modelId) {
        const { response, ok, status } = await this.request('/api/set-model', {
            method: 'POST',
            body: { model: modelId }
        });

        if (ok) {
            const data = await response.json();
            return { success: data.success, data };
        } else {
            return { success: false, error: `HTTP ${status}`, status };
        }
    }

    // Send chat message
    async sendChatMessage(requestData) {
        const { response, ok, status } = await this.request('/api/chat', {
            method: 'POST',
            body: requestData
        });

        if (status === 401) {
            return { success: false, error: 'Authentication required', status: 401 };
        }

        if (ok) {
            const data = await response.json();
            return { success: true, data };
        } else {
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                errorData = { error: `HTTP ${status}` };
            }
            return { success: false, error: errorData.error || `HTTP ${status}`, status };
        }
    }

    // Login to server
    async login(password) {
        const { response, ok } = await this.request('/api/login', {
            method: 'POST',
            body: { password }
        });

        const data = await response.json();
        return { success: ok && data.login_success, data };
    }

    // Clear chat context
    async clearContext() {
        const { response, ok, status } = await this.request('/api/context/clear', {
            method: 'POST'
        });

        if (ok) {
            return { success: true };
        } else {
            const errorData = await response.json();
            return { success: false, error: errorData.error || `HTTP ${status}` };
        }
    }

    // Get help information
    async getHelp() {
        const { response, ok } = await this.request('/api/help');

        if (ok) {
            const data = await response.json();
            return { success: true, response: data.response };
        } else {
            return { success: false, error: 'Failed to get help' };
        }
    }

    // Get authentication status
    async getAuthStatus() {
        const { response, ok } = await this.request('/api/auth-status');

        if (ok) {
            const data = await response.json();
            return {
                success: true,
                authenticated: data.authenticated,
                authMethod: data.auth_method,
                authType: data.auth_type
            };
        } else {
            return {
                success: false,
                authenticated: false,
                authMethod: null,
                authType: null
            };
        }
    }

    // Get roles from server
    async getRoles() {
        const { response, ok, status } = await this.request('/api/roles');

        if (status === 401) {
            return { success: false, error: 'Authentication required', status: 401 };
        }

        if (ok) {
            const data = await response.json();
            return { success: true, roles: data.roles };
        } else {
            return { success: false, error: `HTTP ${status}`, status };
        }
    }

    // Set role on server
    async setRole(roleId) {
        const { response, ok, status } = await this.request('/api/set-role', {
            method: 'POST',
            body: { role: roleId }
        });

        if (ok) {
            const data = await response.json();
            return { success: data.success, error: data.error };
        } else {
            return { success: false, error: `HTTP ${status}` };
        }
    }
}

// Factory function to create API client with current credentials
export function createApiClient(userApiKey = null, sessionToken = null) {
    return new ApiClient(userApiKey, sessionToken);
}
