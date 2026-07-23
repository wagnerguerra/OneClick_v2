-- Desconto POR ITEM nos itens de orçamento (#HLP0302). Idempotente.
-- Só se aplica a itens de serviço; % e valor fixo somam. NULL = sem desconto.

ALTER TABLE "orcamento_itens" ADD COLUMN IF NOT EXISTS "desconto_pct"   NUMERIC(5, 2);
ALTER TABLE "orcamento_itens" ADD COLUMN IF NOT EXISTS "desconto_valor" NUMERIC(12, 2);
