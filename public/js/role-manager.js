// Role Manager for handling AI role selection and management
export class RoleManager {
    constructor() {
        this.availableRoles = [];
        this.selectedRole = 'general';
        this.storageKey = 'selected-role';

        // UI 요소
        this.roleModal = null;
        this.roleModalClose = null;
        this.roleTitle = null;
        this.roleList = null;
        this.messageRenderer = null;
        this.output = null;

        // API 클라이언트 참조
        this.apiClient = null;
    }

    /**
     * UI 요소를 초기화합니다
     * @param {Object} elements - UI 요소들
     * @param {HTMLElement} elements.roleModal - 역할 모달 요소
     * @param {HTMLElement} elements.roleModalClose - 역할 모달 닫기 버튼
     * @param {HTMLElement} elements.roleTitle - 역할 제목 표시 요소
     * @param {HTMLElement} elements.roleList - 역할 목록 요소
     * @param {Object} elements.messageRenderer - 메시지 렌더러 객체
     * @param {HTMLElement} elements.output - 출력 영역 요소
     */
    initializeUI(elements) {
        this.roleModal = elements.roleModal;
        this.roleModalClose = elements.roleModalClose;
        this.roleTitle = elements.roleTitle;
        this.roleList = elements.roleList;
        this.messageRenderer = elements.messageRenderer;
        this.output = elements.output;

        // 역할 제목 클릭 이벤트 설정
        if (this.roleTitle) {
            this.roleTitle.addEventListener('click', () => {
                this.showRoleModal();
            });
            this.roleTitle.style.cursor = 'pointer';
        }

        // 역할 모달 닫기 버튼 이벤트 설정
        if (this.roleModalClose) {
            this.roleModalClose.addEventListener('click', () => {
                this.hideRoleModal();
            });
        }

        // 역할 모달 백드롭 클릭 이벤트 설정
        if (this.roleModal) {
            const handleBackdropClick = (e) => {
                if (e.target === this.roleModal) {
                    this.hideRoleModal();
                }
            };

            this.roleModal.addEventListener('click', handleBackdropClick);

            // 모바일 터치 지원 추가
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

        // ESC 키로 모달 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.roleModal && this.roleModal.classList.contains('show')) {
                this.hideRoleModal();
            }
        });

        // 선택된 역할 표시 업데이트
        this.updateRoleTitle();
    }

    /**
     * API 클라이언트를 설정합니다
     * @param {Object} apiClient - API 클라이언트 객체
     */
    setApiClient(apiClient) {
        this.apiClient = apiClient;
    }

    /**
     * 서버에서 역할을 로드합니다
     * @returns {Promise<boolean>} 성공 여부
     */
    async loadRoles() {
        if (!this.apiClient) {
            console.warn('API client not initialized');
            return false;
        }

        try {
            const result = await this.apiClient.getRoles();

            if (result.success && result.roles && Array.isArray(result.roles)) {
                this.availableRoles = result.roles;
                return true;
            }

            if (result.status === 401) {
                console.warn('⚠️ Role loading failed: Authentication required');
                return false;
            }
        } catch (error) {
            console.warn('Failed to load roles:', error);
        }
        return false;
    }

    /**
     * 역할 목록 명령어 처리
     * @param {boolean} isAuthenticated - 인증 여부
     * @returns {Promise<boolean>} 성공 여부
     */
    async handleRolesCommand(isAuthenticated = false) {
        if (!isAuthenticated) {
            if (this.messageRenderer) {
                this.messageRenderer.addMessage('❌ Authentication required.\n\nUse /login <password> or /set-api-key <key> first.', 'error', null, this.output);
            }
            return false;
        }

        try {
            await this.loadRoles();

            if (this.availableRoles.length === 0) {
                if (this.messageRenderer) {
                    this.messageRenderer.addMessage('❌ No roles available.', 'error', null, this.output);
                }
                return false;
            }

            let roleList = `🎭 Available Roles (${this.availableRoles.length})\n\n`;

            this.availableRoles.forEach((role) => {
                const current = role.id === this.selectedRole ? ' ← Current' : '';
                roleList += `${role.icon || '🤖'} ${role.id}${current}\n   ${role.description}\n\n`;
            });

            roleList += `Usage: /set-role <role-id>`;
            if (this.messageRenderer) {
                this.messageRenderer.addMessage(roleList, 'system', null, this.output);
            }
            return true;
        } catch (error) {
            console.error('Roles fetch error:', error);
            if (this.messageRenderer) {
                this.messageRenderer.addMessage(`❌ Error fetching roles: ${error.message}`, 'error', null, this.output);
            }
            return false;
        }
    }

    /**
     * 역할을 서버에 설정합니다
     * @param {string} roleId - 역할 ID
     * @returns {Promise<Object>} 설정 결과
     */
    async setRole(roleId) {
        if (!this.apiClient) {
            console.warn('API client not initialized');
            return { success: false, error: 'API client not initialized' };
        }

        try {
            const result = await this.apiClient.setRole(roleId);

            if (result.success) {
                this.selectedRole = roleId;
                this.setStoredRole(roleId);
                this.updateRoleTitle();

                if (this.messageRenderer) {
                    this.messageRenderer.addMessage(`✅ Role set to: ${this.getRoleDisplayName(roleId)}`, 'system', null, this.output);
                }
                return { success: true };
            } else {
                if (this.messageRenderer) {
                    this.messageRenderer.addMessage(`❌ Failed to set role: ${result.error || 'Unknown error'}`, 'error', null, this.output);
                }
                return { success: false, error: result.error || 'Failed to set role' };
            }
        } catch (error) {
            console.error('Error setting role:', error);
            if (this.messageRenderer) {
                this.messageRenderer.addMessage(`❌ Error setting role: ${error.message}`, 'error', null, this.output);
            }
            return { success: false, error: error.message };
        }
    }

    /**
     * 역할 모달 표시
     * @param {boolean} isAuthenticated - 인증 여부
     */
    showRoleModal(isAuthenticated = false) {
        if (!isAuthenticated) {
            if (this.messageRenderer) {
                this.messageRenderer.addSystemMessage('Please login with /login <password> or set your API key with /set-api-key <key> first to change roles.', this.output, 'auth-required-message');
            }
            return;
        }

        this.populateRoleList();
        if (this.roleModal) {
            this.roleModal.classList.add('show');
        }
    }

    /**
     * 역할 모달 숨기기
     */
    hideRoleModal() {
        if (this.roleModal) {
            this.roleModal.classList.remove('show');
        }
    }

    /**
     * 역할 목록 채우기
     */
    async populateRoleList() {
        if (this.roleList) {
            this.roleList.innerHTML = '<div class="role-list-loading">Loading roles...</div>';

            if (this.availableRoles.length === 0) {
                await this.loadRoles();
            }

            this.roleList.innerHTML = '';

            if (this.availableRoles.length === 0) {
                this.roleList.innerHTML = '<div class="role-list-loading">No roles available</div>';
                return;
            }

            this.availableRoles.forEach((role) => {
                const roleItem = document.createElement('div');
                roleItem.className = 'role-item';

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

                // 클릭 및 터치 이벤트 추가
                const selectRole = () => {
                    this.setRole(role.id);
                    this.hideRoleModal();
                };

                roleItem.addEventListener('click', selectRole);

                // 모바일 터치 지원 추가
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
    }

    /**
     * 역할 제목 업데이트
     */
    updateRoleTitle() {
        if (this.roleTitle) {
            const displayName = this.formatRoleNameForDisplay(this.selectedRole);
            this.roleTitle.textContent = displayName;
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
