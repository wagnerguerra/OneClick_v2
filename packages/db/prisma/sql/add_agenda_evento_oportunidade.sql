-- ============================================================
-- Migration cirúrgica: vínculo AgendaEvento ↔ Oportunidade (CRM)
-- Adiciona agenda_eventos.oportunidade_id (FK opcional, ON DELETE SET NULL)
-- Idempotente: pode rodar várias vezes sem efeito colateral.
-- ============================================================

-- 1. Coluna (nullable, sem default)
ALTER TABLE "agenda_eventos"
  ADD COLUMN IF NOT EXISTS "oportunidade_id" TEXT;

-- 2. Foreign key — em bloco DO pra ignorar se já existir (duplicate_object)
DO $$
BEGIN
  ALTER TABLE "agenda_eventos"
    ADD CONSTRAINT "agenda_eventos_oportunidade_id_fkey"
    FOREIGN KEY ("oportunidade_id")
    REFERENCES "oportunidades"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Índice de busca
CREATE INDEX IF NOT EXISTS "agenda_eventos_oportunidade_id_idx"
  ON "agenda_eventos" ("oportunidade_id");
