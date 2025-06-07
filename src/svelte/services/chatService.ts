import { apiClient } from './apiClient';
import { addMessage } from '../stores/messages.svelte';
import { setLoading } from '../stores/ui.svelte';
import { appService } from './appService';
import type { ChatMessage } from '../stores/messages.svelte';
import { COMMANDS, MESSAGE_TYPES } from './constants';
import { generateMessageId } from './utils';

export class ChatService {
  /**
   * 스크롤을 하단으로 강제 이동
   */
  private ensureScrollToBottom(): void {
    const chatContainer = document.querySelector('.chat-output');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  /**
   * 메시지 전송 처리
   */
  async sendMessage(content: string): Promise<void> {
    if (!content.trim()) return;

    try {
      // 사용자 메시지 추가
      this.addUserMessage(content);
      
      // UI 로딩 상태 설정
      setLoading(true);

      // 로그인 명령어 처리
      if (content.startsWith(COMMANDS.LOGIN_PREFIX)) {
        await this.handleLoginCommand(content);
      } else {
        // 일반 채팅 메시지 처리
        await this.handleChatMessage(content);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.addSystemMessage(
        `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    } finally {
      setLoading(false);
    }
  }

  /**
   * 사용자 메시지 추가
   */
  private addUserMessage(content: string): void {
    const message: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: content,
      timestamp: new Date()
    };
    addMessage(message);
  }

  /**
   * 시스템 메시지 추가
   */
  private addSystemMessage(content: string, type: 'success' | 'error' = MESSAGE_TYPES.ERROR): void {
    const message: ChatMessage = {
      id: generateMessageId(),
      role: 'system',
      content: content,
      timestamp: new Date(),
      type: type
    };
    addMessage(message);
    
    // 시스템 메시지는 즉시 표시되므로 스크롤 확인 (특히 /models 등 긴 응답)
    setTimeout(() => {
      this.ensureScrollToBottom();
    }, 200);
  }

  /**
   * AI 응답 메시지 추가
   */
  private addAssistantMessage(content: string, model?: string, tokenUsage?: any): void {
    console.log('[ChatService] addAssistantMessage called with:', {
      contentLength: content.length,
      model: model,
      tokenUsage: tokenUsage
    });

    const message: ChatMessage = {
      id: generateMessageId(),
      role: 'assistant',
      content: content,
      timestamp: new Date(),
      tokens: tokenUsage?.total_tokens,
      model: model,
      tokenUsage: tokenUsage
    };

    console.log('[ChatService] Final message object:', message);
    addMessage(message);
  }

  /**
   * 로그인 명령어 처리
   */
  private async handleLoginCommand(content: string): Promise<void> {
    const password = content.substring(7).trim();
    const result = await apiClient.login(password);
    
    if (result.success) {
      this.addSystemMessage(
        result.data?.message || 'Login successful',
        'success'
      );
      
      // 인증 상태 업데이트
      await appService.initialize();
    } else {
      this.addSystemMessage(
        result.error || 'Login failed',
        'error'
      );
    }
  }

  /**
   * 일반 채팅 메시지 처리
   */
  private async handleChatMessage(content: string): Promise<void> {
    const result = await apiClient.sendMessage(content);

    console.log('[ChatService] API result:', result);

    if (result.success && result.data) {
      console.log('[ChatService] Response data:', result.data);
      console.log('[ChatService] Usage field:', result.data.usage);
      console.log('[ChatService] Model field:', result.data.model);

      if (result.data.response) {
        this.addAssistantMessage(
          result.data.response,
          result.data.model || result.data.currentModel,
          result.data.usage
        );
      } else {
        console.warn('No response content in API response:', result.data);
        this.addSystemMessage(
          'Received empty response from AI',
          'error'
        );
      }
    } else {
      console.error('[ChatService] API call failed:', result.error);
      this.addSystemMessage(
        result.error || 'Failed to send message',
        'error'
      );
    }
  }


}

// 싱글톤 인스턴스
export const chatService = new ChatService(); 
