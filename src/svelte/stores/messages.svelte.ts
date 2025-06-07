// Svelte 5 runes는 전역적으로 사용 가능

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens?: number;
  model?: string;
  tokenUsage?: { 
    input?: number; 
    output?: number; 
    prompt_tokens?: number; 
    completion_tokens?: number; 
    total_tokens?: number; 
  };
  type?: string;
}

// Svelte 5 runes 사용
export const messagesState = $state<ChatMessage[]>([]);

// 메시지 관련 헬퍼 함수들
export function addMessage(message: ChatMessage) {
  messagesState.push(message);
}

export function updateLastMessage(updates: Partial<ChatMessage>) {
  if (messagesState.length === 0) return;
  
  const lastIndex = messagesState.length - 1;
  Object.assign(messagesState[lastIndex], updates);
}

export function clearMessages() {
  messagesState.length = 0;
}

export function removeMessage(messageId: string) {
  const index = messagesState.findIndex((msg: ChatMessage) => msg.id === messageId);
  if (index > -1) {
    messagesState.splice(index, 1);
  }
}

export function getMessageCount() {
  return messagesState.length;
} 
