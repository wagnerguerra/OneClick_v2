-- Migração manual: módulo Controle de Férias (port v1 crp_ferias).
-- Idempotente e SÓ ADITIVA — 3 tabelas, sem enum e sem dependências.
-- Levantamento do legado: docs/migracao-controle-ferias-v1.md
--
-- Mora em packages/db/prisma/sql/ porque e ESTA a pasta que o Service Manager
-- aplica no deploy (stage 4.5).

BEGIN;

CREATE TABLE IF NOT EXISTS "ferias_periodos" (
  "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id"        TEXT,
  "legacy_id"         INTEGER,
  "colaborador_id"    TEXT,
  "colaborador_nome"  TEXT,
  "periodo_inicial"   INTEGER NOT NULL,
  "periodo_final"     INTEGER NOT NULL,
  "descricao"         TEXT,
  "saldo_anterior"    INTEGER NOT NULL DEFAULT 0,
  "dias"              INTEGER NOT NULL DEFAULT 30,
  "previsao"          DATE,
  "pagamento_1"       DATE,
  "pagamento_2"       DATE,
  "pagamento_3"       DATE,
  "pago"              BOOLEAN NOT NULL DEFAULT false,
  "historico"         BOOLEAN NOT NULL DEFAULT false,
  "registrado_por_id" TEXT,
  "registrado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "criado_em"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ferias_periodos_empresa_id_idx"     ON "ferias_periodos" ("empresa_id");
CREATE INDEX IF NOT EXISTS "ferias_periodos_colaborador_id_idx" ON "ferias_periodos" ("colaborador_id");
CREATE INDEX IF NOT EXISTS "ferias_periodos_legacy_id_idx"      ON "ferias_periodos" ("legacy_id");

CREATE TABLE IF NOT EXISTS "ferias_eventos" (
  "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "periodo_id"        TEXT NOT NULL,
  "legacy_id"         INTEGER,
  "ordem"             INTEGER NOT NULL DEFAULT 1,
  "data_inicio"       DATE NOT NULL,
  "data_fim"          DATE NOT NULL,
  "descricao"         TEXT,
  "registrado_por_id" TEXT,
  "registrado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ferias_eventos_periodo_id_idx" ON "ferias_eventos" ("periodo_id");
CREATE INDEX IF NOT EXISTS "ferias_eventos_legacy_id_idx"  ON "ferias_eventos" ("legacy_id");

CREATE TABLE IF NOT EXISTS "ferias_arquivos" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "periodo_id" TEXT NOT NULL,
  "legacy_id"  INTEGER,
  "nome"       TEXT NOT NULL,
  "path"       TEXT NOT NULL,
  "autor_id"   TEXT,
  "criado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ferias_arquivos_periodo_id_idx" ON "ferias_arquivos" ("periodo_id");

DO $$ BEGIN
  ALTER TABLE "ferias_eventos" ADD CONSTRAINT "ferias_eventos_periodo_id_fkey"
    FOREIGN KEY ("periodo_id") REFERENCES "ferias_periodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ferias_arquivos" ADD CONSTRAINT "ferias_arquivos_periodo_id_fkey"
    FOREIGN KEY ("periodo_id") REFERENCES "ferias_periodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Default de atualizado_em (lição de 18/08: o @updatedAt é do cliente, e a
-- tabela nascida do db push vem sem default — INSERT cru quebraria).
ALTER TABLE "ferias_periodos" ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;

COMMIT;
