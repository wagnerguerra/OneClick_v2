-- Migração manual: módulo Documentos Externos (port v1 sgq_externos).
-- Idempotente e SÓ ADITIVA — 2 tabelas, sem enum. Depende de
-- documento_processos (mapa compartilhado) — a ordem alfabética garante:
-- add_documentos_internos.sql roda antes.
-- Levantamento: docs/migracao-documentos-externos-v1.md
--
-- Mora em packages/db/prisma/sql/ porque e ESTA a pasta que o Service Manager
-- aplica no deploy (stage 4.5).

BEGIN;

CREATE TABLE IF NOT EXISTS "documentos_externos" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id"      TEXT,
  "legacy_id"       INTEGER,
  "nome"            TEXT NOT NULL,
  "processo_id"     TEXT,
  "versao_atual_id" TEXT,
  "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "documentos_externos_versao_atual_id_key" ON "documentos_externos" ("versao_atual_id");
CREATE INDEX IF NOT EXISTS "documentos_externos_empresa_id_idx"  ON "documentos_externos" ("empresa_id");
CREATE INDEX IF NOT EXISTS "documentos_externos_processo_id_idx" ON "documentos_externos" ("processo_id");
CREATE INDEX IF NOT EXISTS "documentos_externos_legacy_id_idx"   ON "documentos_externos" ("legacy_id");

CREATE TABLE IF NOT EXISTS "documento_externo_versoes" (
  "id"                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "documento_id"        TEXT NOT NULL,
  "legacy_id"           INTEGER,
  "revisao"             INTEGER NOT NULL DEFAULT 0,
  "data_registro"       DATE NOT NULL,
  "emissor"             TEXT,
  "local"               TEXT,
  "link"                TEXT,
  "observacao"          TEXT,
  "registrado_por_id"   TEXT,
  "registrado_por_nome" TEXT,
  "responsavel_id"      TEXT,
  "responsavel_nome"    TEXT,
  "criado_em"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "documento_externo_versoes_documento_id_revisao_idx" ON "documento_externo_versoes" ("documento_id", "revisao");
CREATE INDEX IF NOT EXISTS "documento_externo_versoes_legacy_id_idx"            ON "documento_externo_versoes" ("legacy_id");

DO $$ BEGIN
  ALTER TABLE "documentos_externos" ADD CONSTRAINT "documentos_externos_processo_id_fkey"
    FOREIGN KEY ("processo_id") REFERENCES "documento_processos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "documento_externo_versoes" ADD CONSTRAINT "documento_externo_versoes_documento_id_fkey"
    FOREIGN KEY ("documento_id") REFERENCES "documentos_externos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- SET NULL, e nao CASCADE: apagar a versao vigente nao pode levar o registro
-- inteiro com o historico.
DO $$ BEGIN
  ALTER TABLE "documentos_externos" ADD CONSTRAINT "documentos_externos_versao_atual_id_fkey"
    FOREIGN KEY ("versao_atual_id") REFERENCES "documento_externo_versoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Default de atualizado_em (lição de 18/08: o @updatedAt é do cliente, e a
-- tabela nascida do db push vem sem default — INSERT cru quebraria).
ALTER TABLE "documentos_externos"        ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "documento_externo_versoes"  ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;

COMMIT;
