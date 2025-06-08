/**
 * Secure Storage Service
 * Encrypts sensitive data before storing in localStorage
 */

export class SecureStorage {
  private readonly keyPrefix = 'chat_h4o_';
  private readonly algorithm = 'AES-GCM';
  
  /**
   * Generate a simple encryption key from browser fingerprint
   * This is not perfect security but better than plain text
   */
  private async generateKey(): Promise<CryptoKey> {
    // Use browser/session specific data for key generation
    const data = JSON.stringify({
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`,
      timestamp: Math.floor(Date.now() / (1000 * 60 * 60)) // Changes every hour
    });
    
    const encoder = new TextEncoder();
    const keyData = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    
    return crypto.subtle.importKey(
      'raw',
      keyData,
      { name: this.algorithm },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt and store data
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      const cryptoKey = await this.generateKey();
      const encoder = new TextEncoder();
      const data = encoder.encode(value);
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: this.algorithm, iv },
        cryptoKey,
        data
      );
      
      const encryptedData = {
        data: Array.from(new Uint8Array(encrypted)),
        iv: Array.from(iv),
        timestamp: Date.now()
      };
      
      localStorage.setItem(
        this.keyPrefix + key, 
        JSON.stringify(encryptedData)
      );
    } catch (error) {
      console.error('Encryption failed, storing unencrypted:', error);
      // Fallback to unencrypted storage if encryption fails
      localStorage.setItem(this.keyPrefix + key, value);
    }
  }

  /**
   * Retrieve and decrypt data
   */
  async getItem(key: string): Promise<string | null> {
    try {
      const stored = localStorage.getItem(this.keyPrefix + key);
      if (!stored) return null;
      
      // Try to parse as encrypted data
      let encryptedData;
      try {
        encryptedData = JSON.parse(stored);
      } catch {
        // If parsing fails, assume it's unencrypted legacy data
        return stored;
      }
      
      // Check if it has encryption structure
      if (!encryptedData.data || !encryptedData.iv) {
        // Legacy unencrypted data
        return stored;
      }
      
      // Check if data is too old (24 hours)
      if (Date.now() - encryptedData.timestamp > 24 * 60 * 60 * 1000) {
        this.removeItem(key);
        return null;
      }
      
      const cryptoKey = await this.generateKey();
      const iv = new Uint8Array(encryptedData.iv);
      const data = new Uint8Array(encryptedData.data);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: this.algorithm, iv },
        cryptoKey,
        data
      );
      
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
      
    } catch (error) {
      console.error('Decryption failed:', error);
      // Remove corrupted data
      this.removeItem(key);
      return null;
    }
  }

  /**
   * Remove stored data
   */
  removeItem(key: string): void {
    localStorage.removeItem(this.keyPrefix + key);
  }

  /**
   * Check if key exists
   */
  hasItem(key: string): boolean {
    return localStorage.getItem(this.keyPrefix + key) !== null;
  }

  /**
   * Clear all secure storage
   */
  clear(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.keyPrefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }
}

export const secureStorage = new SecureStorage(); 
