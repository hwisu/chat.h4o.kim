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
      return `session:${sessionToken.substring(0, 16)}`;
    }
    if (userApiKey) {
      // API 키의 해시를 사용하여 개인정보 보호 (간단한 해시)
      let hash = 0;
      for (let i = 0; i < userApiKey.length; i++) {
        const char = userApiKey.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 32-bit integer로 변환
      }
      return `apikey:${Math.abs(hash).toString(16).substring(0, 16)}`;
    }
    return 'anonymous';
  }

  // 데이터베이스가 설정되었는지 확인
  private ensureDatabase(): D1Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call setDatabase first.');
    }
    return this.db;
  }

  // 컨텍스트 가져오기/생성
  async getOrCreateContext(userId: string): Promise<UserContext> {
    // 요청마다 필요시 정리 수행
    await this.maybeCleanupExpiredContexts();

    // 메모리 캐시 확인
    const cachedContext = this.memoryCache.get(userId);
    if (cachedContext) {
      // 마지막 활동 시간 업데이트
      cachedContext.lastActivity = Date.now();
      this.memoryCache.set(userId, cachedContext);
      return cachedContext;
    }

    const db = this.ensureDatabase();

    // 데이터베이스에서 사용자 컨텍스트 조회
    const userContextResult = await db
      .prepare('SELECT * FROM user_contexts WHERE user_id = ?')
      .bind(userId)
      .first();

    if (!userContextResult) {
      // 새 컨텍스트 생성
      const now = Date.now();
      const newContext: UserContext = {
        userId,
        conversationHistory: [],
        summary: null,
        lastActivity: now,
        tokenUsage: 0,
        createdAt: now
      };

      // 데이터베이스에 저장 (대화 내역은 빈 배열을 JSON으로 저장)
      await db
        .prepare('INSERT INTO user_contexts (user_id, summary, conversation_history, token_usage, last_activity, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(userId, null, JSON.stringify([]), 0, now, now)
        .run();

      // 메모리 캐시에 저장
      this.memoryCache.set(userId, newContext);
      return newContext;
    }

    // 기존 컨텍스트가 있으면 업데이트
    await db
      .prepare('UPDATE user_contexts SET last_activity = ? WHERE user_id = ?')
      .bind(Date.now(), userId)
      .run();

    // 컨텍스트 구성 (대화 내역 JSON 파싱)
    let messages: ChatMessage[] = [];
    try {
      if (userContextResult.conversation_history) {
        messages = JSON.parse(userContextResult.conversation_history as string);
      }
    } catch (e) {
      console.error('Failed to parse conversation history:', e);
      // 파싱 실패시 빈 배열로 초기화
      messages = [];
    }

    const userContext: UserContext = {
      userId,
      conversationHistory: messages,
      summary: userContextResult.summary as string | null,
      lastActivity: Date.now(),
      tokenUsage: userContextResult.token_usage as number,
      createdAt: userContextResult.created_at as number
    };

    // 메모리 캐시에 저장
    this.memoryCache.set(userId, userContext);
    return userContext;
  }

  // 컨텍스트 업데이트
  async updateContext(userId: string, updates: Partial<UserContext>): Promise<void> {
    // 메모리 캐시 업데이트
    const cachedContext = this.memoryCache.get(userId);
    if (cachedContext) {
      Object.assign(cachedContext, updates, { lastActivity: Date.now() });
      this.memoryCache.set(userId, cachedContext);
    }

    // 데이터베이스 업데이트
    const db = this.ensureDatabase();
    const updateFields: string[] = [];
    const values: any[] = [];

    // 업데이트할 필드 및 값 설정
    if (updates.summary !== undefined) {
      updateFields.push('summary = ?');
      values.push(updates.summary);
    }
    if (updates.tokenUsage !== undefined) {
      updateFields.push('token_usage = ?');
      values.push(updates.tokenUsage);
    }
    if (updates.conversationHistory !== undefined) {
      updateFields.push('conversation_history = ?');
      values.push(JSON.stringify(updates.conversationHistory));
    }

    // 마지막 활동 시간 항상 업데이트
    updateFields.push('last_activity = ?');
    values.push(Date.now());

    // userId 값 추가
    values.push(userId);

    if (updateFields.length > 0) {
      const query = `UPDATE user_contexts SET ${updateFields.join(', ')} WHERE user_id = ?`;
      await db.prepare(query).bind(...values).run();
    }
  }

  // 메시지 추가
  async addMessage(userId: string, role: ChatMessage['role'], content: string): Promise<void> {
    const now = Date.now();
    const db = this.ensureDatabase();

    // 메모리 캐시 업데이트
    const cachedContext = this.memoryCache.get(userId);
    let conversationHistory: ChatMessage[] = [];

    if (cachedContext) {
      // 메모리 캐시에 있으면 바로 추가
      cachedContext.conversationHistory.push({
        role,
        content,
        timestamp: now
      });
      cachedContext.lastActivity = now;
      conversationHistory = cachedContext.conversationHistory;
      this.memoryCache.set(userId, cachedContext);
    } else {
      // 캐시에 없으면 DB에서 현재 대화 내역 조회
      const contextResult = await db
        .prepare('SELECT conversation_history FROM user_contexts WHERE user_id = ?')
        .bind(userId)
        .first();

      if (contextResult && contextResult.conversation_history) {
        try {
          conversationHistory = JSON.parse(contextResult.conversation_history as string);
        } catch (e) {
          console.error('Failed to parse conversation history:', e);
          conversationHistory = [];
        }
      }

      // 새 메시지 추가
      conversationHistory.push({
        role,
        content,
        timestamp: now
      });
    }

    // 데이터베이스 업데이트
    await db
      .prepare('UPDATE user_contexts SET conversation_history = ?, last_activity = ? WHERE user_id = ?')
      .bind(JSON.stringify(conversationHistory), now, userId)
      .run();
  }

  // 컨텍스트 클리어
  async clearContext(userId: string): Promise<void> {
    const now = Date.now();

    // 메모리 캐시 업데이트
    const cachedContext = this.memoryCache.get(userId);
    if (cachedContext) {
      cachedContext.conversationHistory = [];
      cachedContext.summary = null;
      cachedContext.tokenUsage = 0;
      cachedContext.lastActivity = now;
      this.memoryCache.set(userId, cachedContext);
    }

    // 데이터베이스 업데이트
    const db = this.ensureDatabase();
    await db
      .prepare('UPDATE user_contexts SET conversation_history = ?, summary = NULL, token_usage = 0, last_activity = ? WHERE user_id = ?')
      .bind(JSON.stringify([]), now, userId)
      .run();
  }

  // 컨텍스트 삭제
  async deleteContext(userId: string): Promise<boolean> {
    // 메모리 캐시에서 삭제
    this.memoryCache.delete(userId);

    // 데이터베이스에서 삭제
    const db = this.ensureDatabase();
    const result = await db
      .prepare('DELETE FROM user_contexts WHERE user_id = ?')
      .bind(userId)
      .run();

    return result.meta.changes > 0;
  }

  // 컨텍스트 존재 여부 확인
  async hasContext(userId: string): Promise<boolean> {
    // 메모리 캐시 확인
    if (this.memoryCache.has(userId)) {
      return true;
    }

    // 데이터베이스 확인
    const db = this.ensureDatabase();
    const result = await db
      .prepare('SELECT 1 FROM user_contexts WHERE user_id = ?')
      .bind(userId)
      .first();

    return result !== null;
  }

  // 컨텍스트 통계 조회
  async getStats(): Promise<{ totalContexts: number; activeContexts: number; oldestContext: number | null }> {
    const db = this.ensureDatabase();
    const now = Date.now();

    // 전체 컨텍스트 수
    const totalResult = await db
      .prepare('SELECT COUNT(*) as count FROM user_contexts')
      .first();
    const totalContexts = totalResult?.count as number || 0;

    // 활성 컨텍스트 수
    const activeResult = await db
      .prepare('SELECT COUNT(*) as count FROM user_contexts WHERE ? - last_activity < ?')
      .bind(now, this.maxContextAge)
      .first();
    const activeContexts = activeResult?.count as number || 0;

    // 가장 오래된 컨텍스트
    const oldestResult = await db
      .prepare('SELECT MIN(created_at) as oldest FROM user_contexts')
      .first();
    const oldestContext = oldestResult?.oldest as number || null;

    return {
      totalContexts,
      activeContexts,
      oldestContext
    };
  }

  // 필요시 만료된 컨텍스트 정리 (요청마다 체크)
  private async maybeCleanupExpiredContexts(): Promise<void> {
    const now = Date.now();

    // 마지막 정리로부터 충분한 시간이 지났으면 정리 수행
    if (now - this.lastCleanup > this.cleanupIntervalMs) {
      await this.cleanupExpiredContexts();
      this.lastCleanup = now;
    }
  }

  // 만료된 컨텍스트 정리
  async cleanupExpiredContexts(): Promise<void> {
    const db = this.ensureDatabase();
    const now = Date.now();

    // 메모리 캐시에서 만료된 항목 제거
    for (const [userId, context] of this.memoryCache.entries()) {
      if (now - context.lastActivity > this.maxContextAge) {
        this.memoryCache.delete(userId);
      }
    }

    // 데이터베이스에서 만료된 컨텍스트 삭제
    const result = await db
      .prepare('DELETE FROM user_contexts WHERE ? - last_activity > ?')
      .bind(now, this.maxContextAge)
      .run();

    if (result.meta.changes > 0) {
      console.log(`Cleaned up ${result.meta.changes} expired contexts`);
    }
  }

  // 강제 정리 (메모리 압박시 사용)
  async forceCleanup(maxContexts: number = 100): Promise<void> {
    const db = this.ensureDatabase();

    // 총 컨텍스트 수 확인
    const countResult = await db
      .prepare('SELECT COUNT(*) as count FROM user_contexts')
      .first();
    const totalContexts = countResult?.count as number || 0;

    if (totalContexts <= maxContexts) return;

    // 오래된 순서로 초과분 삭제
    const toDelete = totalContexts - maxContexts;
    const result = await db
      .prepare(`
        DELETE FROM user_contexts
        WHERE user_id IN (
          SELECT user_id FROM user_contexts
          ORDER BY last_activity ASC
          LIMIT ?
        )
      `)
      .bind(toDelete)
      .run();

    // 메모리 캐시도 정리 (간단하게 전체 초기화)
    this.memoryCache.clear();

    console.log(`Force cleaned ${result.meta.changes} contexts (kept ${maxContexts} most recent)`);
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
export const contextManager = new ContextManager();
