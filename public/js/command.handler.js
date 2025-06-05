// Command handling functionality
import { formatContextLength } from './format.utils.js';

/**
 * 명령어를 처리하는 메인 함수
 * @param {Object} dependencies - 필요한 의존성 객체
 * @param {string} message - 처리할 명령어 메시지
 * @returns {Promise<Object>} - 처리 결과
 */
export async function handleCommand(dependencies, message) {
    const {
        output,
        messageRenderer,
        apiClient,
        updateApiCredentials,
        updateAuthenticationInfo,
        initializeModelsBackground,
        initializeRolesBackground,
        updateWelcomeMessage,
        setModel,
        setUserApiKey,
        removeUserApiKey,
        showApiKeyStatus,
        roleManager,
        isAuthenticated,
        userApiKey
    } = dependencies;

    // Parse command and arguments
    const parts = message.substring(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
        let success = false;
        let data = null;

        switch (command) {
            case 'login':
                if (args.length === 0) {
                    messageRenderer.addMessage('❌ Password required.\n\nUsage: /login <password>', 'error', null, output);
                    break;
                }

                const password = args.join(' ');
                const loginResult = await apiClient.login(password);

                if (loginResult.success) {
                    // Clear old cached data to force fresh loading after login
                    localStorage.removeItem('cached-models');

                    // 세션 토큰 데이터 반환을 위한 준비
                    data = {
                        loginData: loginResult.data,
                        sessionToken: loginResult.data.session_token,
                        needsAuthUpdate: true  // 인증 상태 업데이트 필요 플래그 추가
                    };

                    // 인증 관련 UI 업데이트를 위해 인증 정보 갱신
                    // 중요: 토큰을 먼저 설정해야 인증 정보가 제대로 갱신됨
                    apiClient.setCredentials(userApiKey, loginResult.data.session_token);
                    await updateAuthenticationInfo();

                    await initializeModelsBackground();
                    await initializeRolesBackground();
                    updateWelcomeMessage();

                    success = true;

                    // 메시지 표시
                    messageRenderer.addMessage(loginResult.data.response, 'system', null, output);
                } else {
                    messageRenderer.addMessage(loginResult.data.response || '❌ Authentication failed.', 'error', null, output);
                }
                break;

            case 'clear':
                try {
                    updateApiCredentials();
                    const result = await apiClient.clearContext();

                    if (result.success) {
                        // 클라이언트 상태 초기화는 외부에서 처리하도록 데이터 리턴
                        success = true;
                        data = { clearContext: true };

                        // 출력 영역 초기화 (메시지는 외부에서 처리)
                        output.innerHTML = '';

                        // 시스템 메시지 표시
                        messageRenderer.addSystemMessage('🔄 Chat cleared. How can I help you?', output);
                    } else {
                        // 서버 오류 메시지 표시 (테이블 없음 오류 처리)
                        if (result.error && result.error.includes('no such table: contexts')) {
                            messageRenderer.addMessage(`⚠️ 서버가 초기화 중입니다. 잠시 후 다시 시도해주세요.`, 'error', null, output);
                        } else {
                            messageRenderer.addMessage(`❌ Failed to clear context: ${result.error}`, 'error', null, output);
                        }
                    }
                } catch (error) {
                    console.error('Clear context error:', error);

                    // 특정 오류 메시지 처리 (테이블 없음 오류)
                    if (error.message && error.message.includes('no such table: contexts')) {
                        messageRenderer.addMessage(`⚠️ 서버가 초기화 중입니다. 잠시 후 다시 시도해주세요.`, 'error', null, output);
                    } else {
                        messageRenderer.addMessage(`❌ Error clearing context: ${error.message}`, 'error', null, output);
                    }
                }
                break;

            case 'help':
                const helpResult = await apiClient.getHelp();
                if (helpResult.success) {
                    messageRenderer.addMessage(helpResult.response, 'system', null, output);
                } else {
                    messageRenderer.addMessage('❌ Failed to get help', 'error', null, output);
                }
                success = true;
                break;

            case 'models':
                const filterArg = args.length > 0 ? args.join(' ') : null;
                await handleModelsCommand({
                    output,
                    messageRenderer,
                    apiClient,
                    updateApiCredentials,
                    isAuthenticated,
                    userApiKey
                }, filterArg);
                success = true;
                break;

            case 'set-model':
                if (args.length === 0) {
                    messageRenderer.addMessage('❌ Model ID required.\n\nUsage: /set-model <model-id> or /set-model auto', 'error', null, output);
                    break;
                }

                const modelId = args.join(' ');
                await setModel(modelId);
                success = true;
                break;

            case 'set-api-key':
                if (args.length === 0) {
                    messageRenderer.addMessage('❌ API key required.\n\nUsage: /set-api-key <your-openrouter-key>\n\nGet your key: https://openrouter.ai/settings/keys', 'error', null, output);
                    break;
                }

                const apiKey = args.join(' ');
                await setUserApiKey(apiKey);

                // API 키 설정 함수가 내부적으로 필요한 초기화 함수들을 호출함
                success = true;
                break;

            case 'remove-api-key':
                removeUserApiKey();

                // removeUserApiKey 함수가 내부적으로 필요한 업데이트 함수를 호출함
                success = true;
                break;

            case 'api-key-status':
                showApiKeyStatus();
                success = true;
                break;

            case 'roles':
                await roleManager.handleRolesCommand(isAuthenticated);
                success = true;
                break;

            case 'set-role':
                if (args.length === 0) {
                    messageRenderer.addMessage('❌ Role ID required.\n\nUsage: /set-role <role-id>\n\nUse /roles to see available roles', 'error', null, output);
                    break;
                }

                // API 클라이언트 인증 정보 업데이트
                updateApiCredentials();

                const roleId = args.join(' ');
                const result = await roleManager.setRole(roleId);
                if (result.success) {
                    data = { newRole: roleManager.selectedRole };
                }
                success = true;
                break;

            default:
                messageRenderer.addMessage(`❌ Unknown command: /${command}\n\nType /help for available commands.`, 'error', null, output);
                break;
        }

        return { success, data };
    } catch (error) {
        console.error('Command error:', error);
        messageRenderer.addMessage(`❌ Error executing command: ${error.message}`, 'error', null, output);
        return { success: false, data: null };
    }
}

/**
 * 모델 관련 명령어를 처리하는 함수
 * @param {Object} dependencies - 필요한 의존성 객체
 * @param {string|null} filterArg - 필터링할 문자열
 */
export async function handleModelsCommand(dependencies, filterArg = null) {
    const {
        output,
        messageRenderer,
        apiClient,
        updateApiCredentials,
        isAuthenticated,
        userApiKey
    } = dependencies;

    if (!isAuthenticated && !userApiKey) {
        messageRenderer.addMessage('❌ Authentication required.\n\nUse /login <password> or /set-api-key <key> first.', 'error', null, output);
        return;
    }

    try {
        updateApiCredentials();
        const modelsResult = await apiClient.getModels();

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
                messageRenderer.addMessage(`❌ No models found${filterMessage}.`, 'error', null, output);
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

            messageRenderer.addMessage(modelList, 'system', null, output);
        } else {
            messageRenderer.addMessage('❌ No models available.', 'error', null, output);
        }
    } catch (error) {
        console.error('Models fetch error:', error);
        messageRenderer.addMessage(`❌ Error fetching models: ${error.message}`, 'error', null, output);
    }
}
