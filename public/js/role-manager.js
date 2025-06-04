// Role Manager for handling AI role selection and management
class RoleManager {
    constructor() {
        this.availableRoles = [];
        this.selectedRole = 'general';
        this.storageKey = 'selected-role';
    }

    // Load roles from server
    async loadRoles(userApiKey = null, sessionToken = null) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (userApiKey) {
                headers['X-User-API-Key'] = userApiKey;
            }
            if (sessionToken) {
                headers['X-Session-Token'] = sessionToken;
            }

            const response = await fetch('/api/roles', {
                method: 'GET',
                headers: headers
            });

            if (response.ok) {
                const data = await response.json();
                if (data.roles && Array.isArray(data.roles)) {
                    this.availableRoles = data.roles;
                }
            } else if (response.status === 401) {
                console.warn('⚠️ Role loading failed: Authentication required');
                return false;
            }
        } catch (error) {
            console.warn('Failed to load roles:', error);
        }
        return false;
    }

    // Set role on server and locally
    async setRole(roleId, userApiKey = null, sessionToken = null) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (userApiKey) {
                headers['X-User-API-Key'] = userApiKey;
            }
            if (sessionToken) {
                headers['X-Session-Token'] = sessionToken;
            }

            const response = await fetch('/api/set-role', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ role: roleId })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.setStoredRole(roleId);
                    return { success: true };
                } else {
                    return { success: false, error: data.error || 'Failed to set role' };
                }
            } else {
                return { success: false, error: `HTTP ${response.status}` };
            }
        } catch (error) {
            console.error('Error setting role:', error);
            return { success: false, error: error.message };
        }
    }

    // Get stored role from localStorage
    getStoredRole() {
        try {
            return localStorage.getItem(this.storageKey) || 'general';
        } catch {
            return 'general';
        }
    }

    // Store role in localStorage
    setStoredRole(roleId) {
        try {
            localStorage.setItem(this.storageKey, roleId);
        } catch (error) {
            console.warn('Failed to store role:', error);
        }
    }

    // Get role display name with icon
    getRoleDisplayName(roleId) {
        const role = this.availableRoles.find(r => r.id === roleId);
        if (role) {
            return `${role.icon || '🤖'} ${role.name}`;
        }
        return '🤖 General Assistant';
    }

    // Format role name for display in title
    formatRoleNameForDisplay(roleId) {
        const role = this.availableRoles.find(r => r.id === roleId);
        if (role) {
            return `${role.icon || '🤖'} ${role.name}`;
        }
        return '🤖 General Assistant';
    }

    // Get role by ID
    getRoleById(roleId) {
        return this.availableRoles.find(r => r.id === roleId);
    }

    // Get all available roles
    getAllRoles() {
        return this.availableRoles;
    }

    // Check if role exists
    hasRole(roleId) {
        return this.availableRoles.some(r => r.id === roleId);
    }
}
