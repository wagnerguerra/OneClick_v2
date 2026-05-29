-- ============================================================
-- Migration cirúrgica: Chat Interno (DMs + Grupos + Anexos)
-- ============================================================

CREATE TABLE IF NOT EXISTS "chat_conversas" (
  "id"                 TEXT PRIMARY KEY,
  "nome"               TEXT,
  "is_grupo"           BOOLEAN NOT NULL DEFAULT false,
  "criador_id"         TEXT NOT NULL,
  "ultima_mensagem_em" TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "chat_conversas_ultima_mensagem_em_idx" ON "chat_conversas"("ultima_mensagem_em");

CREATE TABLE IF NOT EXISTS "chat_participantes" (
  "id"            TEXT PRIMARY KEY,
  "conversa_id"   TEXT NOT NULL,
  "usuario_id"    TEXT NOT NULL,
  "last_read_at"  TIMESTAMP(3),
  "papel"         TEXT NOT NULL DEFAULT 'membro',
  "joined_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "chat_participantes_conversa_id_usuario_id_key"
  ON "chat_participantes"("conversa_id", "usuario_id");
CREATE INDEX IF NOT EXISTS "chat_participantes_usuario_id_idx" ON "chat_participantes"("usuario_id");

DO $$ BEGIN
  ALTER TABLE "chat_participantes"
    ADD CONSTRAINT "chat_participantes_conversa_id_fkey"
    FOREIGN KEY ("conversa_id") REFERENCES "chat_conversas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "chat_mensagens" (
  "id"           TEXT PRIMARY KEY,
  "conversa_id"  TEXT NOT NULL,
  "autor_id"     TEXT NOT NULL,
  "conteudo"     TEXT NOT NULL,
  "edited_at"    TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "chat_mensagens_conversa_id_created_at_idx"
  ON "chat_mensagens"("conversa_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "chat_mensagens"
    ADD CONSTRAINT "chat_mensagens_conversa_id_fkey"
    FOREIGN KEY ("conversa_id") REFERENCES "chat_conversas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "chat_anexos" (
  "id"          TEXT PRIMARY KEY,
  "mensagem_id" TEXT NOT NULL,
  "file_name"   TEXT NOT NULL,
  "file_url"    TEXT NOT NULL,
  "mime_type"   TEXT,
  "tamanho"     INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "chat_anexos_mensagem_id_idx" ON "chat_anexos"("mensagem_id");

DO $$ BEGIN
  ALTER TABLE "chat_anexos"
    ADD CONSTRAINT "chat_anexos_mensagem_id_fkey"
    FOREIGN KEY ("mensagem_id") REFERENCES "chat_mensagens"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
