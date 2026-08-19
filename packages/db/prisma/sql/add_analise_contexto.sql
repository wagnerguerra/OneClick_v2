-- Migração manual: módulo Análise de Contexto (port v1 sgq_contexto).
-- Idempotente e SÓ ADITIVA — 2 tabelas, sem enum e sem dependências.
-- Levantamento do legado: docs/migracao-analise-contexto-v1.md
--
-- Mora em packages/db/prisma/sql/ porque e ESTA a pasta que o Service Manager
-- aplica no deploy (stage 4.5).

BEGIN;

CREATE TABLE IF NOT EXISTS "analises_contexto" (
  "id"                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id"         TEXT,
  "legacy_id"          INTEGER,
  "analise"            TEXT NOT NULL,
  "tipo"               TEXT NOT NULL,
  "identificacao"      TEXT NOT NULL,
  "processo"           TEXT,
  "parte_interessada"  TEXT,
  "gravidade"          INTEGER,
  "probabilidade"      INTEGER,
  "responsavel_id"     TEXT,
  "responsavel_nome"   TEXT,
  "prazo"              DATE,
  "avaliado_por_id"    TEXT,
  "avaliado_por_nome"  TEXT,
  "avaliado_em"        DATE,
  "avaliacao"          TEXT,
  "eficaz"             BOOLEAN,
  "ativo"              BOOLEAN NOT NULL DEFAULT true,
  "criado_em"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "analises_contexto_empresa_id_idx"  ON "analises_contexto" ("empresa_id");
CREATE INDEX IF NOT EXISTS "analises_contexto_analise_tipo_idx" ON "analises_contexto" ("analise", "tipo");
CREATE INDEX IF NOT EXISTS "analises_contexto_legacy_id_idx"   ON "analises_contexto" ("legacy_id");

CREATE TABLE IF NOT EXISTS "analise_contexto_acoes" (
  "id"                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "analise_id"         TEXT NOT NULL,
  "legacy_id"          INTEGER,
  "tipo"               TEXT NOT NULL,
  "descricao"          TEXT NOT NULL,
  "responsavel_id"     TEXT,
  "responsavel_nome"   TEXT,
  "prazo"              DATE,
  "concluida"          BOOLEAN NOT NULL DEFAULT false,
  "finalizado_em"      DATE,
  "finalizado_por_id"  TEXT,
  "observacao"         TEXT,
  "criado_em"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "analise_contexto_acoes_analise_id_idx" ON "analise_contexto_acoes" ("analise_id");
CREATE INDEX IF NOT EXISTS "analise_contexto_acoes_legacy_id_idx"  ON "analise_contexto_acoes" ("legacy_id");

DO $$ BEGIN
  ALTER TABLE "analise_contexto_acoes" ADD CONSTRAINT "analise_contexto_acoes_analise_id_fkey"
    FOREIGN KEY ("analise_id") REFERENCES "analises_contexto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Default de atualizado_em (lição de 18/08: o @updatedAt é do cliente, e a
-- tabela nascida do db push vem sem default — INSERT cru quebraria).
ALTER TABLE "analises_contexto"       ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "analise_contexto_acoes"  ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;

COMMIT;
