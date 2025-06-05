// Message utilities for terminal chat
// Handles message formatting, rendering, and display

import { escapeHtml, contentLikelyHasCodeBlock, formatTokenCount } from './format.utils.js';
import { scrollToBottom } from './ui.utils.js';

// Message renderer class - manages message content parsing and rendering
export class MessageRenderer {
    constructor(markdownParser) {
        this.markdownParser = markdownParser;
    }

    // Add a message to the output container
    addMessage(content, role, model = null, outputElement, lastUsage = null) {
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
                const shortenModelName = (modelName) => {
                    // This is a simplified version - import the actual function if available
                    return modelName.split('/').pop() || modelName;
                };
                header += ` - ${shortenModelName(model)}`;
            }
        } else if (role === 'system') {
            header = `[SYSTEM] ${timestamp}`;
        } else if (role === 'error') {
            header = `[ERROR] ${timestamp}`;
        }

        // Apply markdown rendering to both user and assistant messages, but not system or error messages
        const shouldRenderMarkdown = role === 'assistant' || role === 'user';

        // Create the message content first
        const messageContent = shouldRenderMarkdown && this.markdownParser ?
            this.markdownParser.renderContent(content) :
            escapeHtml(content);

        // Add copy button for both user and assistant messages (if they contain code blocks)
        let copyButton = '';
        if (shouldRenderMarkdown) {
            // Check if content likely contains a code block
            const hasCodeBlock = contentLikelyHasCodeBlock(content);

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
        if (role === 'assistant' && lastUsage) {
            // 토큰 사용량 정보가 있으면 footer에 표시
            if (lastUsage.prompt_tokens || lastUsage.completion_tokens) {
                const promptTokens = formatTokenCount(lastUsage.prompt_tokens || 0);
                const completionTokens = formatTokenCount(lastUsage.completion_tokens || 0);

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
            }
        }

        outputElement.appendChild(messageDiv);
        scrollToBottom(outputElement);

        // Syntax highlighting for code blocks for both user and assistant messages
        if (shouldRenderMarkdown && typeof hljs !== 'undefined') {
            messageDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }

        return messageId; // Return the ID of the created message
    }

    // Add a system message with optional class
    addSystemMessage(content, outputElement, className = '') {
        const messageId = this.addMessage(content, 'system', null, outputElement);
        if (className) {
            const lastMessage = outputElement.lastElementChild;
            if (lastMessage) {
                lastMessage.classList.add(className);
            }
        }
        return messageId;
    }
}
