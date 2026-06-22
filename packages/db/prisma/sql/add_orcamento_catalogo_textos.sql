-- ============================================================
-- Múltiplos textos por item do catálogo de orçamentos
-- (título + descrição + valor) + vínculo do texto escolhido no item
-- Aplicada via `psql` / `prisma db execute` (idempotente) — nunca `db push`,
-- pra não dropar tabelas legadas.
-- ============================================================

-- Tabela de textos do registro do catálogo (servicos_catalogo)
CREATE TABLE IF NOT EXISTS "orcamento_catalogo_textos" (
  "id"          TEXT PRIMARY KEY,
  "catalogo_id" TEXT NOT NULL,
  "titulo"      TEXT NOT NULL,
  "descricao"   TEXT,
  "valor"       DECIMAL(12,2),
  "ordem"       INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A FK para servicos_catalogo foi REMOVIDA: textos pertencem a QUALQUER item do
-- catálogo (Serviço, Taxa ou Despesa). O catalogo_id é referência "soft" — pode
-- apontar para `servicos` (módulo Serviços) OU `servicos_catalogo`. A limpeza ao
-- excluir o item é feita na aplicação (deleteCatalogo).
ALTER TABLE "orcamento_catalogo_textos"
  DROP CONSTRAINT IF EXISTS "orcamento_catalogo_textos_catalogo_id_fkey";

CREATE INDEX IF NOT EXISTS "orcamento_catalogo_textos_catalogo_id_idx"
  ON "orcamento_catalogo_textos"("catalogo_id");

-- Coluna no item do orçamento: qual texto do catálogo foi escolhido
ALTER TABLE "orcamento_itens"
  ADD COLUMN IF NOT EXISTS "catalogo_texto_id" TEXT;

-- FK: item → texto escolhido (SetNull se o texto for excluído)
DO $$ BEGIN
  ALTER TABLE "orcamento_itens"
    ADD CONSTRAINT "orcamento_itens_catalogo_texto_id_fkey"
    FOREIGN KEY ("catalogo_texto_id") REFERENCES "orcamento_catalogo_textos"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
