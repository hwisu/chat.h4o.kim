// Auth utilities for terminal chat
// Handles authentication, API key management, and auth status display

import { simpleEncrypt, simpleDecrypt } from './encryption.utils.js';

/**
 * 저장된 API 키를 로컬 스토리지에서 복호화하여 가져옵니다.
 * @param {string} encryptionKey - 암호화 키
 * @returns {string|null} 복호화된 API 키 또는 null
 */
export function getStoredUserApiKey(encryptionKey) {
    try {
        const encrypted = localStorage.getItem('user-api-key');
        if (encrypted) {
            return simpleDecrypt(encrypted, encryptionKey);
        }
    } catch (error) {
    }
    return null;
}

/**
 * API 키를 암호화하여 로컬 스토리지에 저장합니다.
 * @param {string|null} apiKey - 저장할 API 키
 * @param {string} encryptionKey - 암호화 키
 */
export function setStoredUserApiKey(apiKey, encryptionKey) {
    try {
        if (apiKey) {
            const encrypted = simpleEncrypt(apiKey, encryptionKey);
            localStorage.setItem('user-api-key', encrypted);
        } else {
            localStorage.removeItem('user-api-key');
        }
    } catch (error) {
    }
}

/**
 * 인증 상태를 UI에 업데이트합니다.
 * @param {Object} elements - UI 요소 객체
 * @param {HTMLElement} elements.statusIndicator - 상태 표시 요소
 * @param {HTMLElement} elements.authStatus - 인증 상태 텍스트 요소
 * @param {boolean} isAuthenticated - 서버 인증 여부
 * @param {string|null} userApiKey - 사용자 API 키
 */
export function updateAuthStatus(elements, isAuthenticated, userApiKey) {
    const { statusIndicator, authStatus } = elements;

    if (userApiKey) {
        if (statusIndicator) {
            statusIndicator.classList.add('authenticated');
        }
        if (authStatus) {
            authStatus.textContent = '🔑 Personal API Key';
            authStatus.style.color = '#00ff00';
        }
    } else if (isAuthenticated) {
        if (statusIndicator) {
            statusIndicator.classList.add('authenticated');
        }
        if (authStatus) {
            authStatus.textContent = '📡 Server Key';
            authStatus.style.color = '#00ff00';
        }
    } else {
        if (statusIndicator) {
            statusIndicator.classList.remove('authenticated');
        }
        if (authStatus) {
            authStatus.textContent = 'Choose access method';
            authStatus.style.color = '#666';
        }
    }
}

/**
 * 서버에서 인증 정보를 가져와 상태를 업데이트합니다.
 * @param {Object} apiClient - API 클라이언트 객체
 * @param {Function} updateCredentials - API 클라이언트 자격 증명 업데이트 함수
 * @param {Object} elements - UI 요소 객체
 * @param {HTMLElement} elements.statusIndicator - 상태 표시 요소
 * @param {HTMLElement} elements.authStatus - 인증 상태 텍스트 요소
 * @param {string|null} userApiKey - 사용자 API 키
 * @returns {Promise<Object>} 인증 정보 객체
 */
export async function updateAuthenticationInfo(apiClient, updateCredentials, elements, userApiKey) {
    try {
        updateCredentials();
        const authResult = await apiClient.getAuthStatus();

        const authInfo = {
            isAuthenticated: false,
            authMethod: null,
            authType: null
        };

        if (authResult.success) {
            authInfo.isAuthenticated = authResult.authenticated;
            authInfo.authMethod = authResult.authMethod;
            authInfo.authType = authResult.authType;
        }

        updateAuthStatus(elements, authInfo.isAuthenticated, userApiKey);

        return authInfo;
    } catch (error) {
        const authInfo = {
            isAuthenticated: false,
            authMethod: null,
            authType: null
        };

        updateAuthStatus(elements, false, userApiKey);
        return authInfo;
    }
}
