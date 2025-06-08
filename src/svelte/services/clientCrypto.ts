/**
 * Client-side Cryptographic Service
 * Handles RSA encryption using Web Crypto API
 */

export interface PublicKeyData {
  publicKey: string;
  userId: string;
  algorithm: string;
  keySize: number;
}

export class ClientCrypto {
  
  /**
   * Import PEM public key for encryption
   */
  private async importPublicKey(pemKey: string): Promise<CryptoKey> {
    // Remove PEM headers and footers
    const pemContents = pemKey
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s/g, '');
    
    // Convert base64 to ArrayBuffer
    const binaryDer = atob(pemContents);
    const bytes = new Uint8Array(binaryDer.length);
    for (let i = 0; i < binaryDer.length; i++) {
      bytes[i] = binaryDer.charCodeAt(i);
    }
    
    // Import the key
    return await crypto.subtle.importKey(
      'spki',
      bytes.buffer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      false,
      ['encrypt']
    );
  }

  /**
   * Encrypt API key using server's public key
   */
  async encryptApiKey(apiKey: string, publicKeyPem: string): Promise<string> {
    try {
      const publicKey = await this.importPublicKey(publicKeyPem);
      
      const encoder = new TextEncoder();
      const data = encoder.encode(apiKey);
      
      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'RSA-OAEP'
        },
        publicKey,
        data
      );
      
      // Convert to base64
      const encryptedArray = new Uint8Array(encrypted);
      return btoa(String.fromCharCode(...encryptedArray));
      
    } catch (error) {
      console.error('Client-side encryption failed:', error);
      throw new Error('Failed to encrypt API key');
    }
  }

  /**
   * Get public key from server
   */
  async getPublicKey(sessionToken: string): Promise<PublicKeyData> {
    const response = await fetch('/api/get-public-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionToken
      }
    });

    if (!response.ok) {
      throw new Error('Failed to get public key from server');
    }

    const data = await response.json() as any;
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to get public key');
    }

    return data.data;
  }

  /**
   * Send encrypted API key to server
   */
  async sendEncryptedApiKey(encryptedApiKey: string, sessionToken: string): Promise<boolean> {
    const response = await fetch('/api/set-encrypted-api-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionToken
      },
      body: JSON.stringify({
        encryptedApiKey
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send encrypted API key to server');
    }

    const data = await response.json() as any;
    return data.success;
  }

  /**
   * Complete secure API key setup process
   */
  async setupSecureApiKey(apiKey: string, sessionToken: string): Promise<boolean> {
    try {
      // 1. Get public key from server
      const publicKeyData = await this.getPublicKey(sessionToken);
      
      // 2. Encrypt API key with public key
      const encryptedApiKey = await this.encryptApiKey(apiKey, publicKeyData.publicKey);
      
      // 3. Send encrypted key to server
      const success = await this.sendEncryptedApiKey(encryptedApiKey, sessionToken);
      
      return success;
      
    } catch (error) {
      console.error('Secure API key setup failed:', error);
      throw error;
    }
  }

  /**
   * Check if encrypted API key exists on server
   */
  async hasEncryptedApiKey(sessionToken: string): Promise<boolean> {
    try {
      const response = await fetch('/api/verify-encrypted-key', {
        method: 'GET',
        headers: {
          'X-Session-Token': sessionToken
        }
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as any;
      return data.success && data.data.hasEncryptedKey && !data.data.isExpired;
      
    } catch (error) {
      console.error('Failed to check encrypted API key:', error);
      return false;
    }
  }

  /**
   * Remove encrypted API key from server
   */
  async removeEncryptedApiKey(sessionToken: string): Promise<boolean> {
    try {
      const response = await fetch('/api/remove-encrypted-key', {
        method: 'DELETE',
        headers: {
          'X-Session-Token': sessionToken
        }
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as any;
      return data.success;
      
    } catch (error) {
      console.error('Failed to remove encrypted API key:', error);
      return false;
    }
  }
}

export const clientCrypto = new ClientCrypto(); 
