-- Create table for storing encrypted API keys
CREATE TABLE IF NOT EXISTS encrypted_api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'RSA-OAEP-SHA256',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient user lookups
CREATE INDEX IF NOT EXISTS idx_encrypted_api_keys_user_id ON encrypted_api_keys(user_id);

-- Create index for timestamp-based cleanup
CREATE INDEX IF NOT EXISTS idx_encrypted_api_keys_timestamp ON encrypted_api_keys(timestamp);

-- Create composite index for user + timestamp queries
CREATE INDEX IF NOT EXISTS idx_encrypted_api_keys_user_timestamp ON encrypted_api_keys(user_id, timestamp DESC);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_encrypted_api_keys_timestamp 
    AFTER UPDATE ON encrypted_api_keys
    FOR EACH ROW
BEGIN
    UPDATE encrypted_api_keys 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
END; 
