-- Metadata do contrato do cliente (Gestão de Contratos — Fase 2).
-- Estende a baseline (cliente_contrato_params) com o vínculo/vigência do
-- contrato: número, tipo, vigência (início/fim), flag permanente, janela de
-- alerta de renovação, responsável e flag para ignorar no painel de gestão.
-- Todas NULLABLE / com default seguro — nenhuma linha existente é reescrita.
-- Idempotente (IF NOT EXISTS).

ALTER TABLE "cliente_contrato_params" ADD COLUMN IF NOT EXISTS "numero" TEXT;
ALTER TABLE "cliente_contrato_params" ADD COLUMN IF NOT EXISTS "tipo" TEXT;
ALTER TABLE "cliente_contrato_params" ADD COLUMN IF NOT EXISTS "data_inicio" TIMESTAMP(3);
ALTER TABLE "cliente_contrato_params" ADD COLUMN IF NOT EXISTS "data_fim" TIMESTAMP(3);
ALTER TABLE "cliente_contrato_params" ADD COLUMN IF NOT EXISTS "permanente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cliente_contrato_params" ADD COLUMN IF NOT EXISTS "dias_alerta_renovacao" INTEGER;
ALTER TABLE "cliente_contrato_params" ADD COLUMN IF NOT EXISTS "responsavel_id" TEXT;
ALTER TABLE "cliente_contrato_params" ADD COLUMN IF NOT EXISTS "gestao_ignorar" BOOLEAN NOT NULL DEFAULT false;
