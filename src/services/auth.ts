import jwt from 'jsonwebtoken';

// Constants
const TOKEN_EXPIRY_HOURS = 24;
const VALID_API_KEY_PREFIX = 'sk-or-v1-';
const JWT_ISSUER = 'chatty-h4o';
const NONCE_BYTES_LENGTH = 16;

export interface AuthResult {
  success: boolean;
  token?: string;
  message: string;
}

export interface AuthStatus {
  authenticated: boolean;
  auth_method: string | null;
  auth_type: string | null;
}

export interface JWTPayload {
  pwd: string;
  iat: number;
  exp: number;
  nonce: string;
  iss: string;
}

export class AuthError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * 암호화학적으로 안전한 논스 생성
 */
function generateSecureNonce(): string {
  const randomBytes = new Uint8Array(NONCE_BYTES_LENGTH);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * JWT를 사용한 비밀번호 암호화
 */
export async function encryptPassword(password: string, secret: string): Promise<string> {
  if (!password || !secret) {
    throw new AuthError('Password and secret are required', 'MISSING_CREDENTIALS');
  }

  const expiresIn = TOKEN_EXPIRY_HOURS * 60 * 60; // 초 단위
  const now = Math.floor(Date.now() / 1000);

  const payload: JWTPayload = {
    pwd: password,
    iat: now,
    exp: now + expiresIn,
    nonce: generateSecureNonce(),
    iss: JWT_ISSUER
  };

  try {
    return jwt.sign(payload, secret);
  } catch (error) {
    throw new AuthError('Failed to create session token', 'TOKEN_CREATION_FAILED');
  }
}

/**
 * JWT 토큰 검증
 */
function verifyJWTToken(token: string, secret: string): boolean {
  try {
    const decoded = jwt.verify(token, secret) as JWTPayload;
    
    // 추가 검증
    if (decoded.iss !== JWT_ISSUER) {
      console.warn('Invalid JWT issuer');
      return false;
    }
    
    return true;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.warn('Session token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.warn('Invalid session token format');
    } else {
      console.warn('JWT verification failed:', error instanceof Error ? error.message : String(error));
    }
    return false;
  }
}

/**
 * API 키 유효성 검증
 */
function isValidApiKey(apiKey?: string): boolean {
  return Boolean(apiKey && apiKey.startsWith(VALID_API_KEY_PREFIX));
}

/**
 * 사용자 인증 확인 (세션 토큰 또는 사용자 API 키)
 */
export async function checkAuthenticationOrUserKey(
  sessionToken?: string,
  userApiKey?: string,
  jwtSecret?: string
): Promise<boolean> {
  // 사용자 API 키 확인 (우선순위)
  if (isValidApiKey(userApiKey)) {
    return true;
  }

  // 세션 토큰 확인
  if (sessionToken && jwtSecret) {
    return verifyJWTToken(sessionToken, jwtSecret);
  }

  return false;
}

/**
 * 사용자 인증 처리
 */
export async function authenticateUser(
  password: string,
  accessPassword: string,
  jwtSecret: string
): Promise<AuthResult> {
  if (!password) {
    return {
      success: false,
      message: `Password is required`
    };
  }

  if (!accessPassword || !jwtSecret) {
    throw new AuthError('Server configuration error', 'MISSING_CONFIG');
  }

  if (password === accessPassword) {
    try {
      const encryptedToken = await encryptPassword(password, jwtSecret);

      return {
        success: true,
        token: encryptedToken,
        message: `✅ Server login successful!\n\n📡 Using server API key\n\n💬 Available Commands:\n• /help - Show all commands\n\n🔄 Session expires when tab closes`
      };
    } catch (error) {
      console.error('Token creation failed:', error);
      return {
        success: false,
        message: `Authentication system error. Please try again.`
      };
    }
  } else {
    return {
      success: false,
      message: `Invalid password`
    };
  }
}

/**
 * 인증 상태 확인
 */
export async function getAuthStatus(
  sessionToken?: string,
  userApiKey?: string,
  jwtSecret?: string
): Promise<AuthStatus> {
  // 사용자 API 키 확인
  if (isValidApiKey(userApiKey)) {
    return {
      authenticated: true,
      auth_method: 'user_api_key',
      auth_type: 'Personal API Key'
    };
  }

  // 서버 인증 확인
  const isServerAuth = await checkAuthenticationOrUserKey(sessionToken, userApiKey, jwtSecret);
  
  if (isServerAuth) {
    return {
      authenticated: true,
      auth_method: 'server_password',
      auth_type: 'Server Password'
    };
  }

  return {
    authenticated: false,
    auth_method: null,
    auth_type: null
  };
}

/**
 * JWT 토큰에서 논스 추출
 */
function extractNonceFromToken(token: string): string {
  try {
    const decoded = jwt.decode(token) as JWTPayload | null;
    return decoded?.nonce || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 사용자 ID 생성 헬퍼
 */
export function getUserId(sessionToken?: string, userApiKey?: string): string {
  if (sessionToken) {
    const nonce = extractNonceFromToken(sessionToken);
    return `session_${nonce}`;
  }
  
  if (userApiKey) {
    // API 키의 마지막 8자리를 사용해 사용자 식별
    const keyIdentifier = userApiKey.slice(-8);
    return `apikey_${keyIdentifier}`;
  }
  
  return 'anonymous';
} 
