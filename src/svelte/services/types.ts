// 공통 타입 정의 - src/types.ts에서 import
export type {
    ApiResponse, AuthStatusData, ChatResponseData, ContextData,
    HelpResponseData, LoginRequest,
    LoginResponseData, ModelInfo,
    RoleInfo, SetApiKeyRequest,
    SetApiKeyResponseData, Usage
} from '../../types';

// 서비스 레이어 전용 타입들
export interface AuthInfo {
  userApiKey: string | null;
  sessionToken: string | null;
}

export interface ModalState {
  showAuthModal: boolean;
  showModelModal: boolean;
  showRoleModal: boolean;
}

export interface ServiceApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
} 
