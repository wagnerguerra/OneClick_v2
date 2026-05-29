-- ============================================================
-- Migration cirúrgica: tracking de atividade do User
-- Usado pelo painel "Usuários online" no Service Manager (via SSE)
-- ============================================================

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_activity_at"   TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_activity_path" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_activity_ip"   TEXT;

-- Index pra query de "quem está online" (filter por last_activity_at > now-Xmin)
CREATE INDEX IF NOT EXISTS "users_last_activity_at_idx"
  ON "users"("last_activity_at" DESC);
