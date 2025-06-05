// Encryption utilities for terminal chat
// Simple encryption/decryption for local storage

// Simple XOR-based encryption for local storage (not cryptographically secure)
export function simpleEncrypt(text, key) {
    if (!text || !key) return text;

    let result = '';
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        result += String.fromCharCode(charCode);
    }
    return btoa(result); // Base64 encode
}

// Simple XOR-based decryption for local storage
export function simpleDecrypt(encryptedText, key) {
    if (!encryptedText || !key) return encryptedText;

    try {
        const text = atob(encryptedText); // Base64 decode
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            result += String.fromCharCode(charCode);
        }
        return result;
    } catch (error) {
        console.warn('Failed to decrypt:', error);
        return encryptedText;
    }
}
