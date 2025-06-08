import { Hono } from 'hono';
import { extractUserIdFromJWT } from '../services/auth';
import { cryptoService } from '../services/crypto';
import { validateApiKey } from '../services/validation';
import type { Env } from '../types';
import { HttpStatus } from './constants';
import { asyncHandler, errorResponse, parseJsonBody, successResponse } from './utils';

const cryptoAuth = new Hono<{ Bindings: Env }>();

interface SetEncryptedApiKeyRequest extends Record<string, unknown> {
  encryptedApiKey: string;
}

interface PublicKeyRequest {
  sessionToken?: string;
}

/**
 * Get public key for client-side encryption
 */
cryptoAuth.post('/get-public-key', asyncHandler(async (c) => {
  const sessionToken = c.req.header('X-Session-Token');
  const jwtSecret = c.env.JWT_SECRET;

  if (!jwtSecret) {
    return errorResponse(c, 'Server configuration error', HttpStatus.INTERNAL_ERROR);
  }

  if (!sessionToken) {
    return errorResponse(c, 'Session token required', HttpStatus.UNAUTHORIZED);
  }

  // Extract user ID from JWT token
  const userId = await extractUserIdFromJWT(sessionToken, jwtSecret);
  if (!userId) {
    return errorResponse(c, 'Invalid session token', HttpStatus.UNAUTHORIZED);
  }

  // Generate or get existing key pair
  const keyPair = cryptoService.generateKeyPair(userId);

  return successResponse(c, {
    publicKey: keyPair.publicKey,
    algorithm: 'RSA-OAEP-SHA256',
    keySize: 2048
  }, 'Public key generated successfully');
}));

/**
 * Store encrypted API key (encrypted by client using public key)
 */
cryptoAuth.post('/set-encrypted-api-key', asyncHandler(async (c) => {
  const { encryptedApiKey } = await parseJsonBody<SetEncryptedApiKeyRequest>(c, ['encryptedApiKey']);
  const sessionToken = c.req.header('X-Session-Token');
  const jwtSecret = c.env.JWT_SECRET;

  if (!jwtSecret) {
    return errorResponse(c, 'Server configuration error', HttpStatus.INTERNAL_ERROR);
  }

  if (!sessionToken) {
    return errorResponse(c, 'Session token required', HttpStatus.UNAUTHORIZED);
  }

  // Extract user ID from JWT token
  const userId = await extractUserIdFromJWT(sessionToken, jwtSecret);
  if (!userId) {
    return errorResponse(c, 'Invalid session token', HttpStatus.UNAUTHORIZED);
  }

  try {
    // Decrypt the API key to validate it
    const decryptedApiKey = cryptoService.decryptApiKey(userId, {
      encryptedKey: encryptedApiKey,
      userId,
      timestamp: Date.now(),
      algorithm: 'RSA-OAEP-SHA256'
    });

    if (!decryptedApiKey) {
      return errorResponse(c, 'Failed to decrypt API key', HttpStatus.BAD_REQUEST);
    }

    // Validate the decrypted API key format
    const validation = validateApiKey(decryptedApiKey);
    if (!validation.isValid) {
      return errorResponse(c, validation.errors.join(', '), HttpStatus.BAD_REQUEST);
    }

    // Re-encrypt for storage (server-side encryption)
    const encryptedData = cryptoService.encryptApiKey(userId, decryptedApiKey);
    if (!encryptedData) {
      return errorResponse(c, 'Failed to encrypt API key for storage', HttpStatus.INTERNAL_ERROR);
    }

    // Store in database
    const stored = await cryptoService.storeEncryptedApiKey(c.env, userId, encryptedData);
    if (!stored) {
      return errorResponse(c, 'Failed to store encrypted API key', HttpStatus.INTERNAL_ERROR);
    }

    return successResponse(c, {
      encrypted: true,
      // 🔒 보안 개선: 응답에서 사용자 ID 제거
      algorithm: encryptedData.algorithm,
      timestamp: encryptedData.timestamp
    }, 'API key encrypted and stored successfully');

  } catch (error) {
    // 🔒 보안 개선: 운영 환경에서는 에러 상세 정보 로깅 방지
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      console.error('Encrypted API key processing error:', error);
    }
    return errorResponse(c, 'Invalid encrypted API key', HttpStatus.BAD_REQUEST);
  }
}));

/**
 * Verify encrypted API key status
 */
cryptoAuth.get('/verify-encrypted-key', asyncHandler(async (c) => {
  const sessionToken = c.req.header('X-Session-Token');
  const jwtSecret = c.env.JWT_SECRET;

  if (!jwtSecret) {
    return errorResponse(c, 'Server configuration error', HttpStatus.INTERNAL_ERROR);
  }

  if (!sessionToken) {
    return errorResponse(c, 'Session token required', HttpStatus.UNAUTHORIZED);
  }

  // Extract user ID from JWT token
  const userId = await extractUserIdFromJWT(sessionToken, jwtSecret);
  if (!userId) {
    return errorResponse(c, 'Invalid session token', HttpStatus.UNAUTHORIZED);
  }

  // Check if encrypted API key exists and is valid
  const encryptedData = await cryptoService.getEncryptedApiKey(c.env, userId);
  
  if (!encryptedData) {
    return successResponse(c, {
      hasEncryptedKey: false,
      message: 'No encrypted API key found'
    });
  }

  // Verify we can decrypt it (but don't return the decrypted key)
  const decryptedKey = cryptoService.decryptApiKey(userId, encryptedData);
  
  return successResponse(c, {
    hasEncryptedKey: !!decryptedKey,
    algorithm: encryptedData.algorithm,
    timestamp: encryptedData.timestamp,
    isExpired: Date.now() - encryptedData.timestamp > (24 * 60 * 60 * 1000),
    message: decryptedKey ? 'Valid encrypted API key found' : 'Encrypted API key is invalid or expired'
  });
}));

/**
 * Remove encrypted API key
 */
cryptoAuth.delete('/remove-encrypted-key', asyncHandler(async (c) => {
  const sessionToken = c.req.header('X-Session-Token');
  const jwtSecret = c.env.JWT_SECRET;

  if (!jwtSecret) {
    return errorResponse(c, 'Server configuration error', HttpStatus.INTERNAL_ERROR);
  }

  if (!sessionToken) {
    return errorResponse(c, 'Session token required', HttpStatus.UNAUTHORIZED);
  }

  // Extract user ID from JWT token
  const userId = await extractUserIdFromJWT(sessionToken, jwtSecret);
  if (!userId) {
    return errorResponse(c, 'Invalid session token', HttpStatus.UNAUTHORIZED);
  }

  try {
    // Remove from database
    const stmt = c.env.DB.prepare(`
      DELETE FROM encrypted_api_keys 
      WHERE user_id = ?
    `);
    
    await stmt.bind(userId).run();

    return successResponse(c, {
      removed: true
      // 🔒 보안 개선: 응답에서 사용자 ID 제거
    }, 'Encrypted API key removed successfully');

  } catch (error) {
    // 🔒 보안 개선: 운영 환경에서는 에러 상세 정보 로깅 방지
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      console.error('Failed to remove encrypted API key:', error);
    }
    return errorResponse(c, 'Failed to remove encrypted API key', HttpStatus.INTERNAL_ERROR);
  }
}));

export default cryptoAuth; 
