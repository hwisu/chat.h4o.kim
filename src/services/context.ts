import { ChatMessage, Env } from '../types';

// Constants
const DEFAULT_MAX_TOKENS = 100000;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24시간
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1시간

export interface ConversationContext {
  id: string;
  conversationHistory: ChatMessage[];
  summary: string | null;
  tokenUsage: number;
  updatedAt: number;
  maxTokens: number;
  maxAge: number;
}

export interface ContextConfig {
  maxTokens?: number;
  maxAge?: number;
  cleanupInterval?: number;
}

export interface ContextStats {
  totalContexts: number;
  cacheSize: number;
  oldestContext?: number;
  newestContext?: number;
}

export class ContextError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ContextError';
  }
}

export class ContextManager {
  private cache = new Map<string, ConversationContext>();
  private env: Env | null = null;
  private config: Required<ContextConfig>;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: ContextConfig = {}) {
    this.config = {
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      maxAge: config.maxAge ?? DEFAULT_MAX_AGE_MS,
      cleanupInterval: config.cleanupInterval ?? DEFAULT_CLEANUP_INTERVAL_MS
    };
  }

  initialize(env: Env): void {
    this.env = env;
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredContexts();
    }, this.config.cleanupInterval);
  }

  private cleanupExpiredContexts(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, context] of this.cache.entries()) {
      if (now - context.updatedAt > this.config.maxAge) {
        this.cache.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired contexts`);
    }
  }

  /**
   * D1에서 컨텍스트 로드
   */
  private async loadContextFromD1(userId: string): Promise<ConversationContext | null> {
    if (!this.env?.DB) {
      return null;
    }

    try {
      const result = await this.env.DB.prepare(
        'SELECT * FROM user_contexts WHERE user_id = ?'
      ).bind(userId).first();

      if (!result) {
        return null;
      }

      return {
        id: userId,
        conversationHistory: JSON.parse(result.conversation_history as string),
        summary: result.summary as string | null,
        tokenUsage: result.token_usage as number,
        updatedAt: result.updated_at as number,
        maxTokens: this.config.maxTokens,
        maxAge: this.config.maxAge
      };
    } catch (error) {
      console.warn('D1 컨텍스트 로드 실패:', error);
      return null;
    }
  }

  /**
   * 새 컨텍스트 생성
   */
  private createNewContext(userId: string): ConversationContext {
    return {
      id: userId,
      conversationHistory: [],
      summary: null,
      tokenUsage: 0,
      updatedAt: Date.now(),
      maxTokens: this.config.maxTokens,
      maxAge: this.config.maxAge
    };
  }

  async getOrCreateContext(userId: string): Promise<ConversationContext> {
    // 캐시에서 먼저 확인
    let context = this.cache.get(userId);
    
    if (context) {
      return context;
    }

    // D1에서 로드 시도
    const loadedContext = await this.loadContextFromD1(userId);
    
    if (loadedContext) {
      // 캐시에 저장
      this.cache.set(userId, loadedContext);
      return loadedContext;
    }

    // 새 컨텍스트 생성
    context = this.createNewContext(userId);
    this.cache.set(userId, context);
    return context;
  }

  async addMessage(userId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    if (!content?.trim()) {
      throw new ContextError('Message content cannot be empty', 'EMPTY_CONTENT');
    }

    const context = await this.getOrCreateContext(userId);
    
    const message: ChatMessage = {
      role,
      content: content.trim(),
      timestamp: Date.now()
    };

    context.conversationHistory.push(message);
    context.updatedAt = Date.now();

    // 캐시 업데이트
    this.cache.set(userId, context);

    // D1에 저장
    await this.saveContextToD1(context);
  }

  async updateContext(userId: string, updates: Partial<ConversationContext>): Promise<void> {
    const context = await this.getOrCreateContext(userId);
    
    // updatedAt는 항상 현재 시간으로 설정
    const updatedContext = {
      ...context,
      ...updates,
      updatedAt: Date.now()
    };
    
    // 캐시 업데이트
    this.cache.set(userId, updatedContext);

    // D1에 저장
    await this.saveContextToD1(updatedContext);
  }

  async clearContext(userId: string): Promise<void> {
    // 캐시에서 제거
    this.cache.delete(userId);

    // D1에서도 제거
    if (this.env?.DB) {
      try {
        await this.env.DB.prepare(
          'DELETE FROM user_contexts WHERE user_id = ?'
        ).bind(userId).run();
      } catch (error) {
        console.warn('D1 컨텍스트 삭제 실패:', error);
        throw new ContextError('Failed to clear context from database', 'DATABASE_ERROR');
      }
    }
  }

  private async saveContextToD1(context: ConversationContext): Promise<void> {
    if (!this.env?.DB) {
      return;
    }

    try {
      await this.env.DB.prepare(`
        INSERT OR REPLACE INTO user_contexts 
        (user_id, conversation_history, summary, token_usage) 
        VALUES (?, ?, ?, ?)
      `).bind(
        context.id,
        JSON.stringify(context.conversationHistory),
        context.summary,
        context.tokenUsage
      ).run();
    } catch (error) {
      console.warn('D1 컨텍스트 저장 실패:', error);
      // D1 저장 실패 시에도 캐시는 유지 - 성능을 위해 예외를 던지지 않음
    }
  }

  getStats(): ContextStats {
    const contexts = Array.from(this.cache.values());
    const timestamps = contexts.map(c => c.updatedAt);
    
    return {
      totalContexts: this.cache.size,
      cacheSize: this.cache.size,
      oldestContext: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      newestContext: timestamps.length > 0 ? Math.max(...timestamps) : undefined
    };
  }

  /**
   * 정리 작업
   */
  cleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }
}

// 싱글톤 인스턴스
export const contextManager = new ContextManager(); 
