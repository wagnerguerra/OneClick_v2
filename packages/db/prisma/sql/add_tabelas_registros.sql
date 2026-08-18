-- Migração manual: módulo Tabelas de Registros (port v1 sgq_tabelas).
-- Idempotente e SÓ ADITIVA — 2 tabelas, sem enum.
-- Levantamento do legado: docs/migracao-tabelas-registros-v1.md
--
-- Mora em packages/db/prisma/sql/ porque e ESTA a pasta que o Service Manager
-- aplica no deploy (stage 4.5). Depende de documento_processos (o mapa de
-- processos e compartilhado com Documentos Internos) — a ordem alfabetica ja
-- garante: add_documentos_internos.sql roda antes.

BEGIN;

CREATE TABLE IF NOT EXISTS "tabelas_registros" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id"      TEXT,
  "legacy_id"       INTEGER,
  "nome"            TEXT NOT NULL,
  "processo_id"     TEXT,
  "versao_atual_id" TEXT,
  "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "tabelas_registros_versao_atual_id_key" ON "tabelas_registros" ("versao_atual_id");
CREATE INDEX IF NOT EXISTS "tabelas_registros_empresa_id_idx"  ON "tabelas_registros" ("empresa_id");
CREATE INDEX IF NOT EXISTS "tabelas_registros_processo_id_idx" ON "tabelas_registros" ("processo_id");
CREATE INDEX IF NOT EXISTS "tabelas_registros_legacy_id_idx"   ON "tabelas_registros" ("legacy_id");

CREATE TABLE IF NOT EXISTS "tabela_registro_versoes" (
  "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tabela_id"         TEXT NOT NULL,
  "legacy_id"         INTEGER,
  "versao"            INTEGER NOT NULL DEFAULT 0,
  "data_versao"       DATE NOT NULL,
  "armazenamento"     TEXT,
  "protecao"          TEXT,
  "recuperacao"       TEXT,
  "retencao"          TEXT,
  "disposicao"        TEXT,
  "registrado_por_id" TEXT,
  "registrado_por_nome" TEXT,
  "criado_em"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Convergência: a tabela pode ter nascido antes desta coluna.
ALTER TABLE "tabela_registro_versoes" ADD COLUMN IF NOT EXISTS "registrado_por_nome" TEXT;

CREATE INDEX IF NOT EXISTS "tabela_registro_versoes_tabela_id_versao_idx" ON "tabela_registro_versoes" ("tabela_id", "versao");
CREATE INDEX IF NOT EXISTS "tabela_registro_versoes_legacy_id_idx"        ON "tabela_registro_versoes" ("legacy_id");

DO $$ BEGIN
  ALTER TABLE "tabelas_registros" ADD CONSTRAINT "tabelas_registros_processo_id_fkey"
    FOREIGN KEY ("processo_id") REFERENCES "documento_processos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "tabela_registro_versoes" ADD CONSTRAINT "tabela_registro_versoes_tabela_id_fkey"
    FOREIGN KEY ("tabela_id") REFERENCES "tabelas_registros"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- SET NULL, e nao CASCADE: apagar a versao vigente nao pode levar o registro
-- inteiro com o historico.
DO $$ BEGIN
  ALTER TABLE "tabelas_registros" ADD CONSTRAINT "tabelas_registros_versao_atual_id_fkey"
    FOREIGN KEY ("versao_atual_id") REFERENCES "tabela_registro_versoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Default de atualizado_em (licao de 18/08: o @updatedAt e do cliente, e a
-- tabela nascida do db push vem sem default — INSERT cru quebraria).
ALTER TABLE "tabelas_registros"       ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tabela_registro_versoes" ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;

COMMIT;
