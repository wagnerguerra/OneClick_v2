-- ============================================================
-- Reforma Tributaria
-- Historico de simulacoes e pareceres do comparativo IBS/CBS.
-- Idempotente para execucao manual na VPS.
-- ============================================================

CREATE TABLE IF NOT EXISTS reforma_tributaria_simulacoes (
  id                text PRIMARY KEY,
  empresa_id        text,
  cliente_id        text NOT NULL,
  user_id           text,
  premissas         jsonb NOT NULL,
  diagnostico       jsonb NOT NULL,
  cenarios          jsonb NOT NULL,
  recomendacao      text NOT NULL,
  resumo            jsonb NOT NULL,
  parecer           text NOT NULL,
  qualidade_score   integer NOT NULL DEFAULT 0,
  faturamento_12m   numeric(14, 2) NOT NULL DEFAULT 0,
  created_at        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS reforma_tributaria_simulacoes_cliente_created_idx
  ON reforma_tributaria_simulacoes (cliente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reforma_tributaria_simulacoes_empresa_created_idx
  ON reforma_tributaria_simulacoes (empresa_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reforma_tributaria_simulacoes_cliente_id_fkey') THEN
    ALTER TABLE reforma_tributaria_simulacoes
      ADD CONSTRAINT reforma_tributaria_simulacoes_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reforma_tributaria_simulacoes_user_id_fkey') THEN
    ALTER TABLE reforma_tributaria_simulacoes
      ADD CONSTRAINT reforma_tributaria_simulacoes_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
