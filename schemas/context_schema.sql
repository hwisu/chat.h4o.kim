-- 사용자 컨텍스트 테이블 (대화 내역을 JSON으로 저장)
DROP TABLE IF EXISTS user_contexts;
CREATE TABLE IF NOT EXISTS user_contexts (
  user_id TEXT PRIMARY KEY,
  summary TEXT,
  conversation_history TEXT, -- JSON 형태로 저장된 대화 내역
  token_usage INTEGER DEFAULT 0,
  last_activity INTEGER,
  created_at INTEGER
);

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_user_contexts_last_activity ON user_contexts(last_activity);
