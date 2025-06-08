/**
 * Storage Warning Service
 * Warns users about API key storage risks and manages consent
 */

import { secureStorage } from './secureStorage';

const STORAGE_WARNING_KEY = 'storage_warning_acknowledged';
const WARNING_VERSION = '1.0'; // Update this to show warning again after changes

export interface StorageWarning {
  acknowledged: boolean;
  version: string;
  timestamp: number;
}

/**
 * Check if user has acknowledged storage warnings
 */
export async function hasAcknowledgedStorageWarning(): Promise<boolean> {
  try {
    const warning = await secureStorage.getItem(STORAGE_WARNING_KEY);
    if (!warning) return false;
    
    const parsed: StorageWarning = JSON.parse(warning);
    
    // Check if it's the current version and not too old (30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    return parsed.acknowledged && 
           parsed.version === WARNING_VERSION && 
           parsed.timestamp > thirtyDaysAgo;
  } catch {
    return false;
  }
}

/**
 * Mark storage warning as acknowledged
 */
export async function acknowledgeStorageWarning(): Promise<void> {
  const warning: StorageWarning = {
    acknowledged: true,
    version: WARNING_VERSION,
    timestamp: Date.now()
  };
  
  await secureStorage.setItem(STORAGE_WARNING_KEY, JSON.stringify(warning));
}

/**
 * Get storage warning text
 */
export function getStorageWarningText(): string {
  return `
⚠️ **API Key Storage Security Notice**

Your OpenRouter API key will be stored locally in your browser for convenience. Please understand:

**Security Measures:**
• ✅ Encrypted using AES-GCM before storage
• ✅ Automatic expiration after 24 hours
• ✅ Session-specific encryption key

**Remaining Risks:**
• 🔍 Sophisticated XSS attacks could potentially access stored keys
• 💻 Malware with browser access could compromise stored data
• 🌐 Shared/public computers pose additional risks

**Recommendations:**
• 🏠 Only use this feature on trusted, personal devices
• 🔒 Consider using server authentication instead for sensitive work
• 🚫 Avoid on public/shared computers
• 🔄 Regularly rotate your API keys

**Alternatives:**
• Use server authentication with a secure password
• Manually enter API key for each session (no storage)

Do you understand and accept these risks?
  `.trim();
}

/**
 * Clear storage warning acknowledgment (for testing)
 */
export async function clearStorageWarning(): Promise<void> {
  secureStorage.removeItem(STORAGE_WARNING_KEY);
} 
