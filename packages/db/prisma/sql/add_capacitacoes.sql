-- Migração manual: módulo Capacitações da Qualidade (port v1 sgq_capacitacoes).
-- Idempotente e SÓ ADITIVA — 5 tabelas, nenhum enum novo.
-- Levantamento do legado: docs/migracao-capacitacoes-v1.md
--
-- Mora em packages/db/prisma/sql/ porque e ESTA a pasta que o Service Manager
-- aplica no deploy (stage 4.5, em ordem alfabetica). A packages/db/migrations/
-- nao e lida por ninguem — SQL colocado la simplesmente nao roda em producao.

BEGIN;

-- ── Métodos (o sgq_cap_tip do v1) ───────────────────────────
CREATE TABLE IF NOT EXISTS "capacitacao_metodos" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id" TEXT,
  "legacy_id"  INTEGER,
  "nome"       TEXT NOT NULL,
  "ordem"      INTEGER NOT NULL DEFAULT 0,
  "ativo"      BOOLEAN NOT NULL DEFAULT true,
  "criado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "capacitacao_metodos_empresa_id_ativo_idx" ON "capacitacao_metodos" ("empresa_id", "ativo");
CREATE INDEX IF NOT EXISTS "capacitacao_metodos_legacy_id_idx"        ON "capacitacao_metodos" ("legacy_id");

-- ── Capacitação ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "capacitacoes" (
  "id"                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empresa_id"          TEXT,
  "legacy_id"           INTEGER,
  "titulo"              TEXT NOT NULL,
  -- INTERNA | EXTERNA (o campo tipo 1/2 do v1)
  "ambito"              TEXT NOT NULL DEFAULT 'INTERNA',
  "metodo_id"           TEXT,
  "instrutor"           TEXT,
  "organizacao"         TEXT,
  "local"               TEXT,
  "data_inicio"         DATE NOT NULL,
  "data_fim"            DATE,
  "hora_inicio"         TEXT,
  "hora_fim"            TEXT,
  "carga_horaria"       DECIMAL(8,2),
  "custo"               DECIMAL(14,2),
  "descricao"           TEXT,
  -- SOLICITADA | AGUARDANDO_AUTORIZACAO | AUTORIZADA | AVALIADA | FINALIZADA | CANCELADA
  "status"              TEXT NOT NULL DEFAULT 'SOLICITADA',
  "solicitante_id"      TEXT,
  "solicitada_em"       DATE,
  "autorizada_em"       DATE,
  "autorizada_por_id"   TEXT,
  "prazo_avaliacao"     DATE,
  "avaliada_em"         DATE,
  "avaliador_id"        TEXT,
  "avaliacao_forma"     TEXT,
  "avaliacao_evidencia" TEXT,
  "avaliacao_acoes"     TEXT,
  "objetivos_atingidos" BOOLEAN,
  "criado_em"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "capacitacoes_empresa_id_status_idx"      ON "capacitacoes" ("empresa_id", "status");
CREATE INDEX IF NOT EXISTS "capacitacoes_empresa_id_data_inicio_idx" ON "capacitacoes" ("empresa_id", "data_inicio");
CREATE INDEX IF NOT EXISTS "capacitacoes_metodo_id_idx"              ON "capacitacoes" ("metodo_id");
CREATE INDEX IF NOT EXISTS "capacitacoes_legacy_id_idx"              ON "capacitacoes" ("legacy_id");

-- ── Participantes ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "capacitacao_participantes" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "capacitacao_id" TEXT NOT NULL,
  -- Opcional de proposito: 117 dos 150 participantes do v1 nao tem mais
  -- usuario no v2 (102 deles ja estavam inativos la) — sao ex-colaboradores,
  -- e o historico de treinamento deles e o que a auditoria pede.
  "usuario_id"     TEXT,
  "nome"           TEXT,
  "confirmado"     BOOLEAN NOT NULL DEFAULT false,
  "confirmado_em"  DATE,
  "criado_em"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "capacitacao_participantes_capacitacao_id_usuario_id_key" ON "capacitacao_participantes" ("capacitacao_id", "usuario_id");
CREATE INDEX IF NOT EXISTS "capacitacao_participantes_usuario_id_confirmado_idx" ON "capacitacao_participantes" ("usuario_id", "confirmado");

-- ── Anexos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "capacitacao_anexos" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "capacitacao_id" TEXT NOT NULL,
  "autor_id"       TEXT,
  "descricao"      TEXT,
  "arquivo_path"   TEXT NOT NULL,
  "arquivo_nome"   TEXT,
  "mime"           TEXT,
  "bytes"          INTEGER,
  "criado_em"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "capacitacao_anexos_capacitacao_id_idx" ON "capacitacao_anexos" ("capacitacao_id");

-- ── Mensagens ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "capacitacao_mensagens" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "capacitacao_id" TEXT NOT NULL,
  "autor_id"       TEXT,
  "texto"          TEXT NOT NULL,
  "criado_em"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "capacitacao_mensagens_capacitacao_id_idx" ON "capacitacao_mensagens" ("capacitacao_id");

-- ── Trilha de auditoria ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "capacitacao_logs" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "capacitacao_id" TEXT NOT NULL,
  "usuario_id"     TEXT,
  "evento"         TEXT NOT NULL,
  "detalhe"        TEXT,
  "criado_em"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "capacitacao_logs_capacitacao_id_idx" ON "capacitacao_logs" ("capacitacao_id");

-- ── Chaves estrangeiras ─────────────────────────────────────
-- Em bloco DO por causa do IF NOT EXISTS: o Postgres nao aceita esse
-- modificador em ADD CONSTRAINT, e sem ele reaplicar o script quebraria.
DO $$ BEGIN
  ALTER TABLE "capacitacoes" ADD CONSTRAINT "capacitacoes_metodo_id_fkey"
    FOREIGN KEY ("metodo_id") REFERENCES "capacitacao_metodos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "capacitacao_participantes" ADD CONSTRAINT "capacitacao_participantes_capacitacao_id_fkey"
    FOREIGN KEY ("capacitacao_id") REFERENCES "capacitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "capacitacao_anexos" ADD CONSTRAINT "capacitacao_anexos_capacitacao_id_fkey"
    FOREIGN KEY ("capacitacao_id") REFERENCES "capacitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "capacitacao_mensagens" ADD CONSTRAINT "capacitacao_mensagens_capacitacao_id_fkey"
    FOREIGN KEY ("capacitacao_id") REFERENCES "capacitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "capacitacao_logs" ADD CONSTRAINT "capacitacao_logs_capacitacao_id_fkey"
    FOREIGN KEY ("capacitacao_id") REFERENCES "capacitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Default de atualizado_em ────────────────────────────────
-- O @updatedAt do Prisma e aplicado pelo CLIENTE, nao pelo banco: quando a
-- tabela nasce do prisma db push (o que acontece no deploy, ANTES deste SQL),
-- a coluna vem NOT NULL e SEM default, e o CREATE TABLE IF NOT EXISTS acima
-- vira no-op. Qualquer INSERT cru quebraria — foi o que derrubou a carga dos
-- documentos internos em 18/08/2026.
ALTER TABLE "capacitacoes" ALTER COLUMN "atualizado_em" SET DEFAULT CURRENT_TIMESTAMP;

-- Convergencia p/ ambiente que rodou a versao anterior deste script, quando
-- usuario_id era NOT NULL e nao havia coluna de nome.
ALTER TABLE "capacitacao_participantes" ADD COLUMN IF NOT EXISTS "nome" TEXT;
ALTER TABLE "capacitacao_participantes" ALTER COLUMN "usuario_id" DROP NOT NULL;

COMMIT;
