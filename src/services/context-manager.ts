import { ChatMessage } from '../types';

// 사용자 컨텍스트 인터페이스
export interface UserContext {
  userId: string;
  conversationHistory: ChatMessage[];
  summary: string | null;
  lastActivity: number;
  tokenUsage: number;
  model: string;
  role: string;
  createdAt: number;
}

// 서버 기반 컨텍스트 관리 클래스
class ContextManager {
  private contexts: Map<string, UserContext> = new Map();
  private maxContextAge = 24 * 60 * 60 * 1000; // 24시간
  private lastCleanup = Date.now();
  private cleanupIntervalMs = 30 * 60 * 1000; // 30분

  constructor() {
    // Cloudflare Workers에서는 전역 스코프에서 setInterval 불가
    // 대신 요청마다 필요시 정리하는 방식 사용
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

  // 컨텍스트 가져오기/생성
  async getOrCreateContext(userId: string, defaultModel: string = 'auto', defaultRole: string = 'general'): Promise<UserContext> {
    // 요청마다 필요시 정리 수행
    this.maybeCleanupExpiredContexts();

    let context = this.contexts.get(userId);

    if (!context) {
      context = {
        userId,
        conversationHistory: [],
        summary: null,
        lastActivity: Date.now(),
        tokenUsage: 0,
        model: defaultModel,
        role: defaultRole,
        createdAt: Date.now()
      };
      this.contexts.set(userId, context);
    } else {
      // 기존 컨텍스트의 마지막 활동 시간 업데이트
      context.lastActivity = Date.now();
    }

    return context;
  }

  // 컨텍스트 업데이트
  async updateContext(userId: string, updates: Partial<UserContext>): Promise<void> {
    const context = this.contexts.get(userId);
    if (context) {
      Object.assign(context, updates, { lastActivity: Date.now() });
    }
  }

  // 메시지 추가
  async addMessage(userId: string, role: ChatMessage['role'], content: string): Promise<void> {
    const context = this.contexts.get(userId);
    if (context) {
      context.conversationHistory.push({
        role,
        content,
        timestamp: Date.now()
      });
      context.lastActivity = Date.now();
    }
  }

  // 컨텍스트 클리어
  async clearContext(userId: string): Promise<void> {
    const context = this.contexts.get(userId);
    if (context) {
      const previousCount = context.conversationHistory.length;
      context.conversationHistory = [];
      context.summary = null;
      context.tokenUsage = 0;
      context.lastActivity = Date.now();
    }
  }

  // 컨텍스트 삭제
  async deleteContext(userId: string): Promise<boolean> {
    const deleted = this.contexts.delete(userId);
    return deleted;
  }

  // 컨텍스트 존재 여부 확인
  hasContext(userId: string): boolean {
    return this.contexts.has(userId);
  }

  // 컨텍스트 통계 조회
  getStats(): { totalContexts: number; activeContexts: number; oldestContext: number | null } {
    const now = Date.now();
    const contexts = Array.from(this.contexts.values());

    const activeContexts = contexts.filter(ctx =>
      now - ctx.lastActivity < this.maxContextAge
    ).length;

    const oldestContext = contexts.length > 0
      ? Math.min(...contexts.map(ctx => ctx.createdAt))
      : null;

    return {
      totalContexts: contexts.length,
      activeContexts,
      oldestContext
    };
  }

  // 필요시 만료된 컨텍스트 정리 (요청마다 체크)
  private maybeCleanupExpiredContexts(): void {
    const now = Date.now();

    // 마지막 정리로부터 충분한 시간이 지났으면 정리 수행
    if (now - this.lastCleanup > this.cleanupIntervalMs) {
      this.cleanupExpiredContexts();
      this.lastCleanup = now;
    }
  }

  // 만료된 컨텍스트 정리
  cleanupExpiredContexts(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, context] of this.contexts.entries()) {
      if (now - context.lastActivity > this.maxContextAge) {
        this.contexts.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired contexts`);
    }
  }

  // 강제 정리 (메모리 압박시 사용)
  forceCleanup(maxContexts: number = 100): void {
    if (this.contexts.size <= maxContexts) return;

    // 오래된 순서로 정렬하여 제거
    const sortedContexts = Array.from(this.contexts.entries())
      .sort((a, b) => a[1].lastActivity - b[1].lastActivity);

    const toRemove = sortedContexts.slice(0, this.contexts.size - maxContexts);

    for (const [userId] of toRemove) {
      this.contexts.delete(userId);
    }

    console.log(`Force cleaned ${toRemove.length} contexts (kept ${maxContexts} most recent)`);
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
export const contextManager = new ContextManager();
