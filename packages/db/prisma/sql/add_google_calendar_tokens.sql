-- ============================================================
-- Tokens OAuth do Google Calendar (vínculo por usuário) — [QA #8]
-- Antes era criada em RUNTIME (CREATE TABLE dentro do callback OAuth e do
-- getConnectionStatus); schema deve nascer no deploy. Idempotente.
-- ============================================================
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
