-- Migração manual: módulo Coleta e Recebimento (port v1 crp_coleta/crpclt).
-- Idempotente e SÓ ADITIVA — 3 tabelas, sem enum e sem dependências.
-- Levantamento do legado: docs/migracao-coleta-v1.md
--
-- Mora em packages/db/prisma/sql/ porque e ESTA a pasta que o Service Manager
-- aplica no deploy (stage 4.5).

BEGIN;

CREATE TABLE IF NOT EXISTS "coleta_categorias" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id" TEXT,
  "legacy_id"  INTEGER,
  "nome"       TEXT NOT NULL,
  "area_id"    TEXT,
  "ativo"      BOOLEAN NOT NULL DEFAULT true,
  "criado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "coleta_categorias_empresa_id_idx" ON "coleta_categorias" ("empresa_id");

CREATE TABLE IF NOT EXISTS "coletas" (
  "id"               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id"       TEXT,
  "legacy_id"        INTEGER,
  "tipo"             TEXT NOT NULL,
  "situacao"         TEXT NOT NULL DEFAULT 'AGUARDANDO_ROTA',
  "categoria_id"     TEXT,
  "competencia"      TEXT,
  "prioridade"       INTEGER NOT NULL DEFAULT 0,
  "cliente_id"       TEXT,
  "cliente_nome"     TEXT,
  "contato"          TEXT,
  "solicitante_id"   TEXT,
  "solicitante_nome" TEXT,
  "descricao"        TEXT,
  "notifica"         BOOLEAN NOT NULL DEFAULT true,
  "ativo"            BOOLEAN NOT NULL DEFAULT true,
  "motivo_exclusao"  TEXT,
  "registrado_em"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "criado_em"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "coletas_empresa_id_situacao_idx" ON "coletas" ("empresa_id", "situacao");
CREATE INDEX IF NOT EXISTS "coletas_cliente_id_idx"          ON "coletas" ("cliente_id");
CREATE INDEX IF NOT EXISTS "coletas_solicitante_id_idx"      ON "coletas" ("solicitante_id");
CREATE INDEX IF NOT EXISTS "coletas_legacy_id_idx"           ON "coletas" ("legacy_id");

CREATE TABLE IF NOT EXISTS "coleta_logs" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "coleta_id"    TEXT NOT NULL,
  "legacy_id"    INTEGER,
  "situacao"     TEXT,
  "evento"       TEXT NOT NULL,
  "usuario_id"   TEXT,
  "usuario_nome" TEXT,
  "criado_em"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "coleta_logs_coleta_id_idx" ON "coleta_logs" ("coleta_id");
CREATE INDEX IF NOT EXISTS "coleta_logs_legacy_id_idx" ON "coleta_logs" ("legacy_id");

DO $$ BEGIN
  ALTER TABLE "coletas" ADD CONSTRAINT "coletas_categoria_id_fkey"
    FOREIGN KEY ("categoria_id") REFERENCES "coleta_categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "coleta_logs" ADD CONSTRAINT "coleta_logs_coleta_id_fkey"
    FOREIGN KEY ("coleta_id") REFERENCES "coletas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Default de atualizado_em (lição de 18/08: o @updatedAt é do cliente, e a
-- tabela nascida do db push vem sem default — INSERT cru quebraria).
ALTER TABLE "coletas" ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;

COMMIT;
