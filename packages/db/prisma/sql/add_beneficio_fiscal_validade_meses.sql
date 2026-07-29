-- Validade (meses) do benefício fiscal no catálogo — usada pra calcular o novo
-- vencimento quando o orçamento de renovação é FINALIZADO.
-- Idempotente: o `prisma db push` já cria a coluna a partir do schema; este SQL é a
-- rede de segurança (e roda antes/depois sem efeito colateral).
ALTER TABLE "beneficio_fiscal_catalogo" ADD COLUMN IF NOT EXISTS "validade_meses" INTEGER;
