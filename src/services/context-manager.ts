import { D1Database } from '@cloudflare/workers-types';
import { ChatMessage } from '../types';

// 사용자 컨텍스트 인터페이스
export interface UserContext {
  userId: string;
  conversationHistory: ChatMessage[];
  summary: string | null;
  lastActivity: number;
  tokenUsage: number;
  createdAt: number;
}

// D1 기반 컨텍스트 관리 클래스
class ContextManager {
  private db: D1Database | null = null;
  private maxContextAge = 24 * 60 * 60 * 1000; // 24시간
  private lastCleanup = Date.now();
  private cleanupIntervalMs = 30 * 60 * 1000; // 30분
  private memoryCache: Map<string, UserContext> = new Map(); // 임시 캐시

  // D1 데이터베이스 설정
  setDatabase(db: D1Database): void {
    this.db = db;
  }

  // 사용자 ID 생성 (sessionToken 또는 userApiKey 해시)
  getUserId(sessionToken?: string, userApiKey?: string): string {
    if (sessionToken) {
      return `session-${this.simpleHash(sessionToken)}`;
    }
    if (userApiKey) {
      // API 키의 해시를 사용하여 개인정보 보호 (간단한 해시)
      let hash = 0;
      for (let i = 0; i < userApiKey.length; i++) {
        const char = userApiKey.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 32-bit integer로 변환
      }
      return `key-${Math.abs(hash).toString(36)}`;
    }
    return 'anonymous';
  }

  // 데이터베이스가 설정되었는지 확인
  private ensureDatabase(): D1Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  // 컨텍스트 가져오기/생성
  async getOrCreateContext(userId: string): Promise<UserContext> {
    await this.maybeCleanupExpiredContexts();

    if (this.memoryCache.has(userId)) {
      const cachedContext = this.memoryCache.get(userId)!;
      cachedContext.lastActivity = Date.now();
      return cachedContext;
    }

    const db = this.ensureDatabase();

    const result = await db.prepare(
      'SELECT * FROM user_contexts WHERE user_id = ?'
    ).bind(userId).first();

    if (!result) {
      const newContext: UserContext = {
        userId,
        conversationHistory: [],
        summary: null,
        lastActivity: Date.now(),
        tokenUsage: 0,
        createdAt: Date.now()
      };

      await db.prepare(
        'INSERT INTO user_contexts (user_id, conversation_history, summary, last_activity, token_usage, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        userId,
        JSON.stringify([]),
        null,
        Date.now(),
        0,
        Date.now()
      ).run();

      this.memoryCache.set(userId, newContext);
      return newContext;
    }

    let conversationHistory: ChatMessage[] = [];
    try {
      conversationHistory = JSON.parse(result.conversation_history as string);
    } catch (e) {
      conversationHistory = [];
    }

    const context: UserContext = {
      userId: result.user_id as string,
      conversationHistory,
      summary: result.summary as string | null,
      lastActivity: result.last_activity as number,
      tokenUsage: result.token_usage as number,
      createdAt: result.created_at as number
    };

    this.memoryCache.set(userId, context);
    return context;
  }

  // 컨텍스트 업데이트
  async updateContext(userId: string, updates: Partial<UserContext>): Promise<void> {
    if (this.memoryCache.has(userId)) {
      const cachedContext = this.memoryCache.get(userId)!;
      Object.assign(cachedContext, updates);
    }

    const db = this.ensureDatabase();

    const setClause: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'userId') continue;

      if (key === 'conversationHistory') {
        setClause.push('conversation_history = ?');
        params.push(JSON.stringify(value));
      } else if (key === 'lastActivity') {
        setClause.push('last_activity = ?');
        params.push(value);
      } else if (key === 'tokenUsage') {
        setClause.push('token_usage = ?');
        params.push(value);
      } else if (key === 'createdAt') {
        setClause.push('created_at = ?');
        params.push(value);
      } else {
        setClause.push(`${this.camelToSnake(key)} = ?`);
        params.push(value);
      }
    }

    setClause.push('last_activity = ?');
    params.push(Date.now());

    params.push(userId);

    await db.prepare(
      `UPDATE user_contexts SET ${setClause.join(', ')} WHERE user_id = ?`
    ).bind(...params).run();
  }

  // camelCase를 snake_case로 변환하는 유틸리티 함수
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  // 메시지 추가
  async addMessage(userId: string, role: ChatMessage['role'], content: string): Promise<void> {
    const newMessage: ChatMessage = {
      role,
      content,
      timestamp: Date.now()
    };

    if (this.memoryCache.has(userId)) {
      const cachedContext = this.memoryCache.get(userId)!;
      cachedContext.conversationHistory.push(newMessage);
      cachedContext.lastActivity = Date.now();

      await this.updateContext(userId, {
        conversationHistory: cachedContext.conversationHistory
      });
      return;
    }

    const db = this.ensureDatabase();

    const result = await db.prepare(
      'SELECT conversation_history FROM user_contexts WHERE user_id = ?'
    ).bind(userId).first();

    if (!result) {
      await this.getOrCreateContext(userId);
      await this.addMessage(userId, role, content);
      return;
    }

    let conversationHistory: ChatMessage[] = [];
    try {
      conversationHistory = JSON.parse(result.conversation_history as string);
    } catch (e) {
      conversationHistory = [];
    }

    conversationHistory.push(newMessage);

    await db.prepare(
      'UPDATE user_contexts SET conversation_history = ?, last_activity = ? WHERE user_id = ?'
    ).bind(JSON.stringify(conversationHistory), Date.now(), userId).run();
  }

  // 컨텍스트 클리어
  async clearContext(userId: string): Promise<void> {
    if (this.memoryCache.has(userId)) {
      const cachedContext = this.memoryCache.get(userId)!;
      cachedContext.conversationHistory = [];
      cachedContext.summary = null;
      cachedContext.tokenUsage = 0;
      cachedContext.lastActivity = Date.now();
    }

    const db = this.ensureDatabase();

    await db.prepare(
      'UPDATE user_contexts SET conversation_history = ?, summary = ?, token_usage = ?, last_activity = ? WHERE user_id = ?'
    ).bind(JSON.stringify([]), null, 0, Date.now(), userId).run();
  }

  // 컨텍스트 삭제
  async deleteContext(userId: string): Promise<boolean> {
    this.memoryCache.delete(userId);

    const db = this.ensureDatabase();

    const result = await db.prepare(
      'DELETE FROM user_contexts WHERE user_id = ?'
    ).bind(userId).run();

    return result.meta.changes > 0;
  }

  // 컨텍스트 존재 여부 확인
  async hasContext(userId: string): Promise<boolean> {
    if (this.memoryCache.has(userId)) {
      return true;
    }

    const db = this.ensureDatabase();

    const result = await db.prepare(
      'SELECT 1 FROM user_contexts WHERE user_id = ?'
    ).bind(userId).first();

    return !!result;
  }

  // 컨텍스트 통계 조회
  async getStats(): Promise<{ totalContexts: number; activeContexts: number; oldestContext: number | null }> {
    const db = this.ensureDatabase();

    const totalResult = await db.prepare(
      'SELECT COUNT(*) as count FROM user_contexts'
    ).first();

    const activeResult = await db.prepare(
      'SELECT COUNT(*) as count FROM user_contexts WHERE last_activity > ?'
    ).bind(Date.now() - 86400000).first();

    const oldestResult = await db.prepare(
      'SELECT MIN(created_at) as oldestCreatedAt FROM user_contexts'
    ).first();

    return {
      totalContexts: totalResult?.count as number || 0,
      activeContexts: activeResult?.count as number || 0,
      oldestContext: oldestResult?.oldestCreatedAt as number || null
    };
  }

  // 필요시 만료된 컨텍스트 정리 (요청마다 체크)
  private async maybeCleanupExpiredContexts(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCleanup > this.cleanupIntervalMs) {
      this.lastCleanup = now;
      await this.cleanupExpiredContexts();
    }
  }

  // 만료된 컨텍스트 정리
  async cleanupExpiredContexts(): Promise<void> {
    const db = this.ensureDatabase();

    for (const [userId, context] of this.memoryCache.entries()) {
      if (Date.now() - context.lastActivity > this.maxContextAge) {
        this.memoryCache.delete(userId);
      }
    }

    const result = await db.prepare(
      'DELETE FROM user_contexts WHERE last_activity < ?'
    ).bind(Date.now() - this.maxContextAge).run();
  }

  // 강제 정리 (메모리 압박시 사용)
  async forceCleanup(maxContexts: number = 100): Promise<void> {
    const db = this.ensureDatabase();

    const countResult = await db.prepare(
      'SELECT COUNT(*) as count FROM user_contexts'
    ).first();

    const currentCount = countResult?.count as number || 0;

    if (currentCount > maxContexts) {
      const excessCount = currentCount - maxContexts;

      const result = await db.prepare(
        'DELETE FROM user_contexts WHERE user_id IN (SELECT user_id FROM user_contexts ORDER BY last_activity ASC LIMIT ?)'
      ).bind(excessCount).run();

      this.memoryCache.clear();
    }
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
export const contextManager = new ContextManager();
