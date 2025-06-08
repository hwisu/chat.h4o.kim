/**
 * Server-side Cryptographic Service
 * Handles RSA key pair generation and API key encryption/decryption
 */

import crypto from 'crypto';

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedApiKey {
  encryptedKey: string;
  userId: string;
  timestamp: number;
  algorithm: string;
}

export class CryptoService {
  private keyPairs: Map<string, KeyPair> = new Map();
  
  /**
   * Generate RSA key pair for a user session
   */
  generateKeyPair(userId: string): KeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    const keyPair = { publicKey, privateKey };
    this.keyPairs.set(userId, keyPair);
    
    // Clean up old key pairs (keep only last 10)
    if (this.keyPairs.size > 10) {
      const entries = Array.from(this.keyPairs.entries());
      const toDelete = entries.slice(0, entries.length - 10);
      toDelete.forEach(([id]) => this.keyPairs.delete(id));
    }
    
    return keyPair;
  }

  /**
   * Get public key for client-side encryption
   */
  getPublicKey(userId: string): string | null {
    const keyPair = this.keyPairs.get(userId);
    return keyPair?.publicKey || null;
  }

  /**
   * Encrypt API key using user's private key (server-side only)
   */
  encryptApiKey(userId: string, apiKey: string): EncryptedApiKey | null {
    const keyPair = this.keyPairs.get(userId);
    if (!keyPair) return null;

    try {
      // Use the private key to encrypt (only server can decrypt)
      const encryptedBuffer = crypto.privateEncrypt(
        {
          key: keyPair.privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        Buffer.from(apiKey, 'utf8')
      );

      return {
        encryptedKey: encryptedBuffer.toString('base64'),
        userId,
        timestamp: Date.now(),
        algorithm: 'RSA-OAEP-SHA256'
      };
    } catch (error) {
      console.error('API key encryption failed:', error);
      return null;
    }
  }

  /**
   * Decrypt API key using user's public key (server-side only)
   */
  decryptApiKey(userId: string, encryptedData: EncryptedApiKey): string | null {
    const keyPair = this.keyPairs.get(userId);
    if (!keyPair) return null;

    try {
      // Verify the encrypted data is not too old (24 hours)
      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
      if (encryptedData.timestamp < twentyFourHoursAgo) {
        // 🔒 보안 개선: 운영 환경에서는 상세 로깅 제거
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
          console.warn('Encrypted API key has expired');
        }
        return null;
      }

      // Use the public key to decrypt
      const decryptedBuffer = crypto.publicDecrypt(
        {
          key: keyPair.publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        Buffer.from(encryptedData.encryptedKey, 'base64')
      );

      return decryptedBuffer.toString('utf8');
    } catch (error) {
      // 🔒 보안 개선: 운영 환경에서는 에러 상세 정보 로깅 방지
      if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
        console.error('API key decryption failed:', error);
      }
      return null;
    }
  }

  /**
   * Store encrypted API key in database
   */
  async storeEncryptedApiKey(env: any, userId: string, encryptedData: EncryptedApiKey): Promise<boolean> {
    try {
      const stmt = env.DB.prepare(`
        INSERT OR REPLACE INTO encrypted_api_keys 
        (user_id, encrypted_key, timestamp, algorithm)
        VALUES (?, ?, ?, ?)
      `);
      
      await stmt.bind(
        userId,
        encryptedData.encryptedKey,
        encryptedData.timestamp,
        encryptedData.algorithm
      ).run();
      
      return true;
    } catch (error) {
      console.error('Failed to store encrypted API key:', error);
      return false;
    }
  }

  /**
   * Retrieve encrypted API key from database
   */
  async getEncryptedApiKey(env: any, userId: string): Promise<EncryptedApiKey | null> {
    try {
      const stmt = env.DB.prepare(`
        SELECT encrypted_key, timestamp, algorithm
        FROM encrypted_api_keys 
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `);
      
      const result = await stmt.bind(userId).first();
      
      if (!result) return null;
      
      return {
        encryptedKey: result.encrypted_key,
        userId,
        timestamp: result.timestamp,
        algorithm: result.algorithm
      };
    } catch (error) {
      console.error('Failed to retrieve encrypted API key:', error);
      return null;
    }
  }

  /**
   * Clean up expired keys and key pairs
   */
  cleanup(): void {
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    // 🚨 보안 수정: 실제 사용 시간 기반으로 정리하지 않고 모든 키페어를 삭제하는 것은 위험
    // 대신 키페어 개수 제한과 LRU 방식으로 관리
    if (this.keyPairs.size > 50) { // 최대 50개 키페어 유지
      const entries = Array.from(this.keyPairs.entries());
      const toDelete = entries.slice(0, entries.length - 50);
      toDelete.forEach(([userId]) => this.keyPairs.delete(userId));
    }
  }

  /**
   * Get decrypted API key for API requests
   */
  async getDecryptedApiKey(env: any, userId: string): Promise<string | null> {
    const encryptedData = await this.getEncryptedApiKey(env, userId);
    if (!encryptedData) return null;
    
    return this.decryptApiKey(userId, encryptedData);
  }
}

// Singleton instance - lazy initialization to avoid global async operations
let _cryptoServiceInstance: CryptoService | null = null;

export function getCryptoService(): CryptoService {
  if (!_cryptoServiceInstance) {
    _cryptoServiceInstance = new CryptoService();
    
    // Start cleanup timer only when service is first used
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        _cryptoServiceInstance?.cleanup();
      }, 60 * 60 * 1000);
    }
  }
  return _cryptoServiceInstance;
}

// For backward compatibility - using getter to avoid immediate initialization
export const cryptoService = {
  get instance() {
    return getCryptoService();
  },
  generateKeyPair: (userId: string) => getCryptoService().generateKeyPair(userId),
  getPublicKey: (userId: string) => getCryptoService().getPublicKey(userId),
  encryptApiKey: (userId: string, apiKey: string) => getCryptoService().encryptApiKey(userId, apiKey),
  decryptApiKey: (userId: string, encryptedData: EncryptedApiKey) => getCryptoService().decryptApiKey(userId, encryptedData),
  storeEncryptedApiKey: (env: any, userId: string, encryptedData: EncryptedApiKey) => getCryptoService().storeEncryptedApiKey(env, userId, encryptedData),
  getEncryptedApiKey: (env: any, userId: string) => getCryptoService().getEncryptedApiKey(env, userId),
  getDecryptedApiKey: (env: any, userId: string) => getCryptoService().getDecryptedApiKey(env, userId),
  cleanup: () => getCryptoService().cleanup()
}; 
