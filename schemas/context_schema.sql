-- 사용자 컨텍스트 테이블 (대화 내역을 JSON으로 저장)
DROP TABLE IF EXISTS user_contexts;
CREATE TABLE IF NOT EXISTS user_contexts (
  user_id TEXT PRIMARY KEY,
  summary TEXT,
  conversation_history TEXT, -- JSON 형태로 저장된 대화 내역
  token_usage INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_user_contexts_updated_at ON user_contexts(updated_at);

-- 업데이트시 updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS user_contexts_updated_at_trigger;
CREATE TRIGGER user_contexts_updated_at_trigger 
  AFTER UPDATE ON user_contexts 
  FOR EACH ROW 
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE user_contexts SET updated_at = strftime('%s', 'now') WHERE user_id = NEW.user_id;
END;
