-- ============================================================
-- Migration cirúrgica: AgendaConfig + AgendaSala + agenda_eventos.sala_id
-- Aplicada via `psql` ou `prisma db execute` em vez de `db push`
-- pra não dropar tabelas legadas (caixa_postal_exec_log etc.)
-- ============================================================

-- Enum de modo de conflito
DO $$ BEGIN
  CREATE TYPE "AgendaConflitoModo" AS ENUM ('DESLIGADO', 'AVISAR', 'BLOQUEAR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tabela de configuração (singleton)
CREATE TABLE IF NOT EXISTS "agenda_config" (
  "id"                    TEXT PRIMARY KEY,
  "conflito_participante" "AgendaConflitoModo" NOT NULL DEFAULT 'AVISAR',
  "conflito_sala"         "AgendaConflitoModo" NOT NULL DEFAULT 'AVISAR',
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL
);

-- Tabela de salas
CREATE TABLE IF NOT EXISTS "agenda_salas" (
  "id"           TEXT PRIMARY KEY,
  "nome"         TEXT NOT NULL,
  "capacidade"   INTEGER,
  "equipamentos" TEXT,
  "ativo"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL
);

-- FK em agenda_eventos.sala_id
ALTER TABLE "agenda_eventos" ADD COLUMN IF NOT EXISTS "sala_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "agenda_eventos"
    ADD CONSTRAINT "agenda_eventos_sala_id_fkey"
    FOREIGN KEY ("sala_id") REFERENCES "agenda_salas"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "agenda_eventos_sala_id_idx" ON "agenda_eventos"("sala_id");

-- Seeds: 2 salas padrão (idempotente — só insere se ainda não existe pelo nome)
INSERT INTO "agenda_salas" ("id", "nome", "capacidade", "equipamentos", "ativo", "created_at", "updated_at")
SELECT 'seed_sala_reunioes', 'Sala de reuniões', 8, 'TV, projetor', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "agenda_salas" WHERE "nome" = 'Sala de reuniões');

INSERT INTO "agenda_salas" ("id", "nome", "capacidade", "equipamentos", "ativo", "created_at", "updated_at")
SELECT 'seed_sala_inovacao', 'Sala de inovação', 6, 'Lousa, monitor', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "agenda_salas" WHERE "nome" = 'Sala de inovação');
