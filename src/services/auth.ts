import jwt from 'jsonwebtoken';
import { AuthConfig, MODEL_CONFIG } from '../routes/constants';

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

interface JWTPayload {
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
 * Generate cryptographically secure nonce
 */
function generateSecureNonce(): string {
  const randomBytes = new Uint8Array(AuthConfig.NONCE_BYTES_LENGTH);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Authenticate user with password
 */
export async function authenticateUser(password: string, accessPassword: string, jwtSecret: string): Promise<AuthResult> {
  try {
    if (!password?.trim()) {
      return { success: false, message: 'Password is required' };
    }

    if (password !== accessPassword) {
      return { success: false, message: 'Invalid password' };
    }

    const nonce = generateSecureNonce();
    const expiresIn = AuthConfig.JWT_EXPIRY_HOURS * 60 * 60; // in seconds
    
    const payload = {
      pwd: password,
      nonce,
      iss: AuthConfig.JWT_ISSUER
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn });

    return {
      success: true,
      token,
      message: 'Authentication successful'
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, message: 'Authentication failed' };
  }
}

/**
 * Verify JWT token
 */
export async function verifyToken(token: string, jwtSecret: string): Promise<boolean> {
  try {
    if (!token?.trim()) return false;

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    
    // Verify token structure and issuer
    return Boolean(
      decoded.pwd &&
      decoded.iat &&
      decoded.exp &&
      decoded.nonce &&
      decoded.iss === AuthConfig.JWT_ISSUER
    );
  } catch (error) {
    return false;
  }
}

/**
 * Extract user ID (nonce) from JWT session token
 */
export async function extractUserIdFromJWT(sessionToken?: string, jwtSecret?: string): Promise<string | null> {
  if (!sessionToken || !jwtSecret) return null;

  try {
    const decoded = jwt.verify(sessionToken, jwtSecret) as JWTPayload;
    return decoded.nonce || null;
  } catch {
    return null;
  }
}

/**
 * Validate API key format
 */
export function isValidApiKey(apiKey?: string): boolean {
  if (!apiKey) return false;
  return Boolean(apiKey?.startsWith(MODEL_CONFIG.API_KEY_PREFIX));
}

/**
 * Check authentication using session token or user API key
 */
export async function checkAuthenticationOrUserKey(
  sessionToken?: string, 
  userApiKey?: string, 
  jwtSecret?: string
): Promise<boolean> {
  // First try user API key (preferred for API access)
  if (userApiKey) {
    return isValidApiKey(userApiKey);
  }
  
  // Fall back to session token
  if (sessionToken && jwtSecret) {
    return await verifyToken(sessionToken, jwtSecret);
  }
  
  return false;
}

/**
 * Get authentication status
 */
export async function getAuthStatus(
  sessionToken?: string, 
  userApiKey?: string, 
  jwtSecret?: string
): Promise<AuthStatus> {
  if (userApiKey && isValidApiKey(userApiKey)) {
    return {
      authenticated: true,
      auth_method: 'api_key',
      auth_type: 'user'
    };
  }
  
  if (sessionToken && jwtSecret && await verifyToken(sessionToken, jwtSecret)) {
    return {
      authenticated: true,
      auth_method: 'session',
      auth_type: 'password'
    };
  }
  
  return {
    authenticated: false,
    auth_method: null,
    auth_type: null
  };
} 
