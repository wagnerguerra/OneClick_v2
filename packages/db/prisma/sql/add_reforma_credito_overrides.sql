-- ============================================================
-- Reforma Tributaria — overrides de classificacao de credito
-- Permite o usuario reclassificar contas (CREDITAVEL/NAO/REVISAR) e persistir,
-- elevando a confiabilidade do parecer ao longo do tempo. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS reforma_credito_overrides (
  id          text PRIMARY KEY,
  empresa_id  text,
  cliente_id  text NOT NULL,
  conta       text NOT NULL,
  categoria   text NOT NULL,            -- CREDITAVEL | NAO_CREDITAVEL | REVISAR
  updated_by  text,
  created_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (cliente_id, conta)
);

CREATE INDEX IF NOT EXISTS reforma_credito_overrides_cliente_idx
  ON reforma_credito_overrides (cliente_id);

-- FK resiliente ao deploy (mesma blindagem de add_notas.sql): usa lock_timeout
-- curto e, se o lock em `clientes` nao vier, pula sem abortar a pipeline.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reforma_credito_overrides_cliente_id_fkey') THEN
    PERFORM set_config('lock_timeout', '4s', true);
    ALTER TABLE reforma_credito_overrides
      ADD CONSTRAINT reforma_credito_overrides_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION
  WHEN lock_not_available THEN
    RAISE NOTICE 'reforma_credito_overrides FK adiada: lock em clientes indisponivel neste deploy';
END $$;
