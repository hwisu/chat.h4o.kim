// 서비스 공통 유틸리티 함수들

import type { ServiceApiResponse } from './types';
import { DEFAULT_VALUES } from './constants';

/**
 * 메시지 ID 생성
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 환영 메시지 생성
 */
export function getWelcomeMessage(): string {
  return `🌟 Welcome to Chat.h4o!

🔐 To get started, click on the Model button to authenticate
🎭 After authentication, you can select your preferred AI model and role

💡 Authentication required to access AI models and chat features`;
}

/**
 * 컨텍스트 사용률 계산
 */
export function calculateContextPercentage(currentSize: number, maxSize: number): number {
  if (!currentSize || !maxSize) return 0;
  return (currentSize / maxSize) * 100;
}

/**
 * API 응답 형식 표준화
 */
export function createApiResponse<T>(
  success: boolean,
  data?: T,
  error?: string,
  status?: number
): ServiceApiResponse<T> {
  return {
    success,
    data,
    error,
    status
  };
}

/**
 * 에러 메시지 추출
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}

/**
 * 디폴트 모델 정보 생성
 */
export function createDefaultModelInfo() {
  return {
    name: DEFAULT_VALUES.MODEL_NAME,
    provider: '',
    contextSize: DEFAULT_VALUES.CONTEXT_SIZE
  };
}

/**
 * 디폴트 역할 정보 생성
 */
export function createDefaultRoleInfo() {
  return {
    name: DEFAULT_VALUES.ROLE_NAME,
    description: DEFAULT_VALUES.ROLE_DESCRIPTION
  };
}

/**
 * 배열 안전성 검사 및 기본값 반환
 */
export function ensureArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

/**
 * 안전한 배열 길이 반환
 */
export function safeArrayLength(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  return 0;
}

/**
 * 배열이 비어있지 않은지 확인
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * 안전한 배열 접근
 */
export function safeArrayAccess<T>(array: unknown, index: number): T | undefined {
  if (Array.isArray(array) && index >= 0 && index < array.length) {
    return array[index];
  }
  return undefined;
} 
