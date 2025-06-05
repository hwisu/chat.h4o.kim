// 이 파일은 기존 코드와의 호환성을 위해 유지됩니다.
// 새로운 TypeScript 스토어들로 포워딩합니다.

// 새로운 TypeScript 스토어들에서 가져오기
export {
  authStore,
  modelsStore,
  messagesStore,
  uiStore,
  rolesStore,
  contextStore,
  updateAuth,
  updateModels,
  updateRoles,
  updateContext,
  addMessage,
  clearMessages,
  setError,
  clearError,
  setLoading
} from './stores/index.js';

// 기존 코드에서 사용하던 방식으로도 접근 가능하도록 유지
console.warn('Warning: stores.js is deprecated. Please use individual store imports from ./stores/ directory.'); 
