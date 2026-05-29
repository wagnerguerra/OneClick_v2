-- ============================================================
-- Migration cirúrgica: chat v2 (status manual + delete + reactions)
-- ============================================================

-- 1. Status manual do chat no user (override do auto)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "chat_status" TEXT;

-- 2. Soft delete em mensagens
ALTER TABLE "chat_mensagens" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- 3. Tabela de reactions
CREATE TABLE IF NOT EXISTS "chat_reactions" (
  "id"          TEXT PRIMARY KEY,
  "mensagem_id" TEXT NOT NULL,
  "usuario_id"  TEXT NOT NULL,
  "emoji"       TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "chat_reactions_mensagem_id_usuario_id_emoji_key"
  ON "chat_reactions"("mensagem_id", "usuario_id", "emoji");
CREATE INDEX IF NOT EXISTS "chat_reactions_mensagem_id_idx"
  ON "chat_reactions"("mensagem_id");

DO $$ BEGIN
  ALTER TABLE "chat_reactions"
    ADD CONSTRAINT "chat_reactions_mensagem_id_fkey"
    FOREIGN KEY ("mensagem_id") REFERENCES "chat_mensagens"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
