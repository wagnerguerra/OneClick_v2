-- Anexo do orçamento visível na proposta pública (link do cliente). Idempotente.
ALTER TABLE orcamento_arquivos
  ADD COLUMN IF NOT EXISTS publico boolean NOT NULL DEFAULT false;
