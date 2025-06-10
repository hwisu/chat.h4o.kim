/**
 * Common utilities, constants, and interfaces for tools
 */

// 보안 상수 정의
export const SECURITY_CONFIG = {
  MAX_QUERY_LENGTH: 500,
  MAX_RESULTS_LIMIT: 10,
  ALLOWED_DOMAINS: [
    'api.search.brave.com',
    'openrouter.ai'
  ],
  REQUEST_TIMEOUT: 10000,
  SUMMARIZER_TIMEOUT: 15000
};

// 입력 검증 및 새니타이징 함수
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input: must be a non-empty string');
  }

  // 길이 제한
  if (input.length > SECURITY_CONFIG.MAX_QUERY_LENGTH) {
    throw new Error(`Input too long: maximum ${SECURITY_CONFIG.MAX_QUERY_LENGTH} characters allowed`);
  }

  // 기본 새니타이징: 위험한 문자 제거
  const sanitized = input
    .trim()
    .replace(/[<>\"'&]/g, '') // XSS 방지를 위한 기본 문자 제거
    .replace(/javascript:/gi, '') // javascript: 프로토콜 제거
    .replace(/data:/gi, '') // data: 프로토콜 제거
    .replace(/vbscript:/gi, ''); // vbscript: 프로토콜 제거

  if (!sanitized) {
    throw new Error('Invalid input: contains only forbidden characters');
  }

  return sanitized;
}

// HTML/XSS 방지를 위한 출력 새니타이징
export function sanitizeOutput(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// URL 검증 함수
export function isValidApiUrl(url: string, allowedDomains: string[]): boolean {
  try {
    const parsedUrl = new URL(url);
    return allowedDomains.includes(parsedUrl.hostname) &&
           (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:');
  } catch {
    return false;
  }
}

// Rate limiting을 위한 간단한 캐시 (실제 환경에서는 Redis 등 사용 권장)
export const rateLimitCache = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(identifier: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const cached = rateLimitCache.get(identifier);

  if (!cached || now > cached.resetTime) {
    rateLimitCache.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (cached.count >= maxRequests) {
    return false;
  }

  cached.count++;
  return true;
}

// 보안 로깅 함수 (민감한 정보 마스킹)
export function secureLog(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
  // 프로덕션 환경에서는 로깅 레벨 제한
  if (process.env.NODE_ENV === 'production' && level === 'info') {
    return;
  }

  // 민감한 정보 마스킹
  const maskedData = data ? JSON.stringify(data).replace(/api[_-]?key[\"']?\s*:\s*[\"']?[^\"',\s]+/gi, 'api_key: "***"') : '';

  console[level](`[SECURITY] ${message}`, maskedData ? ` | Data: ${maskedData}` : '');
}

export interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  displayValue?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  published?: string;
  source?: string;
  relevanceScore?: number;
  domain?: string;
}

export interface SummaryResult {
  summary: string;
  sources: string[];
  query: string;
  timestamp: string;
  source: string;
}
