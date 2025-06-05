import { apiClient } from './api.js';
import { addMessage } from '../stores/messages.svelte';
import { setLoading } from '../stores/ui.svelte';
import { initializeApp } from './app.js';
import type { ChatMessage } from '../stores/messages.svelte';

export class ChatService {
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
      if (content.startsWith('/login ')) {
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
      id: this.generateMessageId(),
      role: 'user',
      content: content,
      timestamp: new Date()
    };
    addMessage(message);
  }

  /**
   * 시스템 메시지 추가
   */
  private addSystemMessage(content: string, type: 'success' | 'error' = 'error'): void {
    const message: ChatMessage = {
      id: this.generateMessageId(),
      role: 'system',
      content: content,
      timestamp: new Date(),
      // 타입은 추가 메타데이터로 처리
    };
    addMessage(message);
  }

  /**
   * AI 응답 메시지 추가
   */
  private addAssistantMessage(content: string, model?: string, tokenUsage?: any): void {
    const message: ChatMessage = {
      id: this.generateMessageId(),
      role: 'assistant',
      content: content,
      timestamp: new Date(),
      tokens: tokenUsage?.total_tokens
    };
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
        result.data.message || 'Login successful',
        'success'
      );
      
      // 인증 상태 업데이트
      await initializeApp();
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

    if (result.success && result.data) {
      if (result.data.response) {
        // console.log('Token usage from API:', result.data.usage); // 채팅마다 출력되는 로그 제거
        this.addAssistantMessage(
          result.data.response,
          result.data.model,
          result.data.usage
        );
      }
    } else {
      this.addSystemMessage(
        result.error || 'Failed to send message',
        'error'
      );
    }
  }

  /**
   * 메시지 ID 생성
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 싱글톤 인스턴스
export const chatService = new ChatService(); 
