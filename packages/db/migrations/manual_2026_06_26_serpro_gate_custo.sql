-- Migração manual: registro de custo de consultas + gate de custo Serpro (CNPJ).
-- Aplicada em 2026-06-26. Idempotente. NÃO toca em drift histórico de outras tabelas.
--
-- - empresas: flag serpro_habilitado (usa API paga?) + teto mensal de gasto.
-- - api_logs: operation + custo CONGELADO por chamada (gate de custo por tenant/mês).
-- - api_pricing: preço por (source, operation); seed serpro/consulta-cnpj = 1.1717.

-- ── empresas: config Serpro por tenant ───────────────────────
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS serpro_habilitado boolean NOT NULL DEFAULT false;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS serpro_orcamento_mensal double precision;

-- Backfill UMA VEZ: empresas existentes preservam o comportamento atual (Serpro
-- ligado). Tenants novos nascem em false (só grátis até o master liberar).
-- Guardado por sentinela em system_config p/ não re-ligar quem o master desligar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM system_config WHERE key = 'MIGRATION_serpro_backfill_done') THEN
    UPDATE empresas SET serpro_habilitado = true;
    INSERT INTO system_config (id, key, value, updated_at)
      VALUES ('MIGRATION_serpro_backfill_done', 'MIGRATION_serpro_backfill_done', '1', NOW())
      ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;

-- ── api_logs: operação + custo congelado ─────────────────────
ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS operation text;
ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS custo double precision DEFAULT 0;
ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS error text;
CREATE INDEX IF NOT EXISTS api_logs_empresa_id_source_created_at_idx ON api_logs (empresa_id, source, created_at);

-- ── api_pricing: preço por (source, operation) ───────────────
ALTER TABLE api_pricing ADD COLUMN IF NOT EXISTS operation text;
ALTER TABLE api_pricing DROP CONSTRAINT IF EXISTS api_pricing_source_key;
DROP INDEX IF EXISTS api_pricing_source_key;
CREATE UNIQUE INDEX IF NOT EXISTS api_pricing_source_operation_key ON api_pricing (source, operation);

-- Seed do preço da consulta CNPJ Serpro (não sobrescreve se o master já editou).
INSERT INTO api_pricing (id, source, operation, unit_price, multiplier, currency)
  VALUES (gen_random_uuid()::text, 'serpro', 'consulta-cnpj', 1.1717, 1, 'BRL')
  ON CONFLICT (source, operation) DO NOTHING;
