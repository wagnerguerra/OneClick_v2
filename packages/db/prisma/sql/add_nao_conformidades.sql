-- Migração manual: módulo Não Conformidades (port v1 sgq_rnc/sgq_nc).
-- Idempotente e SÓ ADITIVA — 6 tabelas, sem enum. Depende de
-- documento_processos (o mapa de processos é o mesmo dos Documentos
-- Internos) — a ordem alfabética garante: add_documentos_internos.sql
-- roda antes. Levantamento: docs/migracao-nao-conformidades-v1.md
--
-- Mora em packages/db/prisma/sql/ porque e ESTA a pasta que o Service Manager
-- aplica no deploy (stage 4.5).

BEGIN;

CREATE TABLE IF NOT EXISTS "nao_conformidade_origens" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id" TEXT,
  "legacy_id"  INTEGER,
  "nome"       TEXT NOT NULL,
  "ordem"      INTEGER NOT NULL DEFAULT 0,
  "ativo"      BOOLEAN NOT NULL DEFAULT true,
  "criado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "nao_conformidade_origens_empresa_id_idx" ON "nao_conformidade_origens" ("empresa_id");

CREATE TABLE IF NOT EXISTS "nao_conformidades" (
  "id"                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id"              TEXT,
  "legacy_id"               INTEGER,
  "situacao"                TEXT NOT NULL DEFAULT 'AGUARDANDO_CAUSA',
  "tipo"                    TEXT NOT NULL DEFAULT 'NAO_CONFORMIDADE',
  "cliente_id"              TEXT,
  "cliente_nome"            TEXT,
  "area_id"                 TEXT,
  "area_nome"               TEXT,
  "processo_id"             TEXT,
  "origem_id"               TEXT,
  "registrado_por_id"       TEXT,
  "registrado_por_nome"     TEXT,
  "responsavel_id"          TEXT,
  "responsavel_nome"        TEXT,
  "registrado_em"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "prazo"                   DATE,
  "detalhamento"            TEXT NOT NULL,
  "nc_similar_id"           TEXT,
  "nc_similar_texto"        TEXT,
  "reincidencia"            BOOLEAN NOT NULL DEFAULT false,
  "nc_anterior_id"          TEXT,
  "causa"                   TEXT,
  "causa_em"                DATE,
  "causa_por_id"            TEXT,
  "eficacia_detalhes"       TEXT,
  "eficacia_responsavel_id" TEXT,
  "eficacia_prazo"          DATE,
  "eficacia_registrada"     BOOLEAN NOT NULL DEFAULT false,
  "avaliacao"               TEXT,
  "eficaz"                  BOOLEAN,
  "avaliado_por_id"         TEXT,
  "avaliado_por_nome"       TEXT,
  "avaliado_em"             DATE,
  "atualiza_swot"           BOOLEAN,
  "atualiza_swot_desc"      TEXT,
  "atualiza_revisao"        BOOLEAN,
  "atualiza_revisao_desc"   TEXT,
  "legacy_reclamacao_id"    INTEGER,
  "ativo"                   BOOLEAN NOT NULL DEFAULT true,
  "criado_em"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "nao_conformidades_empresa_id_idx" ON "nao_conformidades" ("empresa_id");
CREATE INDEX IF NOT EXISTS "nao_conformidades_situacao_idx"   ON "nao_conformidades" ("situacao");
CREATE INDEX IF NOT EXISTS "nao_conformidades_cliente_id_idx" ON "nao_conformidades" ("cliente_id");
CREATE INDEX IF NOT EXISTS "nao_conformidades_legacy_id_idx"  ON "nao_conformidades" ("legacy_id");

CREATE TABLE IF NOT EXISTS "nao_conformidade_acoes" (
  "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "nc_id"             TEXT NOT NULL,
  "legacy_id"         INTEGER,
  "tipo"              TEXT NOT NULL DEFAULT 'CORRETIVA',
  "descricao"         TEXT NOT NULL,
  "responsavel_id"    TEXT,
  "responsavel_nome"  TEXT,
  "prazo"             DATE,
  "concluida"         BOOLEAN NOT NULL DEFAULT false,
  "finalizado_em"     DATE,
  "finalizado_por_id" TEXT,
  "observacao"        TEXT,
  "criado_em"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "nao_conformidade_acoes_nc_id_idx"     ON "nao_conformidade_acoes" ("nc_id");
CREATE INDEX IF NOT EXISTS "nao_conformidade_acoes_legacy_id_idx" ON "nao_conformidade_acoes" ("legacy_id");

CREATE TABLE IF NOT EXISTS "nao_conformidade_mensagens" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "nc_id"      TEXT NOT NULL,
  "legacy_id"  INTEGER,
  "texto"      TEXT NOT NULL,
  "autor_id"   TEXT,
  "autor_nome" TEXT,
  "criado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "nao_conformidade_mensagens_nc_id_idx" ON "nao_conformidade_mensagens" ("nc_id");

CREATE TABLE IF NOT EXISTS "nao_conformidade_arquivos" (
  "id"        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "nc_id"     TEXT NOT NULL,
  "legacy_id" INTEGER,
  "nome"      TEXT NOT NULL,
  "path"      TEXT NOT NULL,
  "autor_id"  TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "nao_conformidade_arquivos_nc_id_idx" ON "nao_conformidade_arquivos" ("nc_id");

CREATE TABLE IF NOT EXISTS "nao_conformidade_logs" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "nc_id"        TEXT NOT NULL,
  "legacy_id"    INTEGER,
  "evento"       TEXT NOT NULL,
  "usuario_id"   TEXT,
  "usuario_nome" TEXT,
  "criado_em"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "nao_conformidade_logs_nc_id_idx" ON "nao_conformidade_logs" ("nc_id");

DO $$ BEGIN
  ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_origem_id_fkey"
    FOREIGN KEY ("origem_id") REFERENCES "nao_conformidade_origens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_nc_anterior_id_fkey"
    FOREIGN KEY ("nc_anterior_id") REFERENCES "nao_conformidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "nao_conformidade_acoes" ADD CONSTRAINT "nao_conformidade_acoes_nc_id_fkey"
    FOREIGN KEY ("nc_id") REFERENCES "nao_conformidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "nao_conformidade_mensagens" ADD CONSTRAINT "nao_conformidade_mensagens_nc_id_fkey"
    FOREIGN KEY ("nc_id") REFERENCES "nao_conformidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "nao_conformidade_arquivos" ADD CONSTRAINT "nao_conformidade_arquivos_nc_id_fkey"
    FOREIGN KEY ("nc_id") REFERENCES "nao_conformidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "nao_conformidade_logs" ADD CONSTRAINT "nao_conformidade_logs_nc_id_fkey"
    FOREIGN KEY ("nc_id") REFERENCES "nao_conformidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Seeds das origens (as 7 do v1), escopadas na empresa que o import usa.
-- Idempotente por legacy_id; a carga de dados referencia por subselect.

-- Default de atualizado_em (lição de 18/08: o @updatedAt é do cliente, e a
-- tabela nascida do db push vem sem default — INSERT cru quebraria).
ALTER TABLE "nao_conformidades"       ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "nao_conformidade_acoes"  ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;

COMMIT;
