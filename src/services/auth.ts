import jwt from 'jsonwebtoken';
import { AuthConfig, MODEL_CONFIG } from '../routes/constants';

export type AuthResult = {
  success: boolean;
  token?: string;
  message: string;
}

export type AuthStatus = {
  authenticated: boolean;
  auth_method: string | null;
  auth_type: string | null;
}

type JWTPayload = {
  pwd: string;
  iat: number;
  exp: number;
  nonce: string;
  iss: string;
  sub: string;
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
 * Authenticate user with password - Enhanced security
 */
export async function authenticateUser(password: string, accessPassword: string, jwtSecret: string): Promise<AuthResult> {
  try {
    if (!password?.trim()) {
      return { success: false, message: 'Password is required' };
    }

    // Enhanced validation
    if (!jwtSecret || jwtSecret.length < 32) {
      console.error('Invalid JWT secret configuration');
      return { success: false, message: 'Server configuration error' };
    }

    if (!accessPassword) {
      console.error('ACCESS_PASSWORD not configured');
      return { success: false, message: 'Server configuration error' };
    }

    if (password !== accessPassword) {
      return { success: false, message: 'Invalid password' };
    }

    const nonce = generateSecureNonce();
    const expiresIn = AuthConfig.JWT_EXPIRY_HOURS * 60 * 60;

    const payload = {
      pwd: password,
      nonce,
      iss: AuthConfig.JWT_ISSUER,
      // Add additional claims for enhanced security
      iat: Math.floor(Date.now() / 1000),
      sub: 'user-session'
    };

    const token = jwt.sign(payload, jwtSecret, {
      expiresIn,
      algorithm: AuthConfig.JWT_ALGORITHM // Explicitly specify algorithm
    });

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
 * Enhanced token verification with additional security checks
 */
export async function verifyToken(token: string, jwtSecret: string): Promise<boolean> {
  try {
    if (!token?.trim() || !jwtSecret) return false;

    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: [AuthConfig.JWT_ALGORITHM], // Restrict to specific algorithm
      issuer: AuthConfig.JWT_ISSUER,
      maxAge: AuthConfig.JWT_EXPIRY_HOURS * 60 * 60 // Double-check expiry
    }) as JWTPayload;

    // Enhanced validation
    return Boolean(
      decoded.pwd &&
      decoded.iat &&
      decoded.exp &&
      decoded.nonce &&
      decoded.iss === AuthConfig.JWT_ISSUER &&
      decoded.sub === 'user-session'
    );
  } catch (error) {
    console.error('Token verification failed:', error);
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
