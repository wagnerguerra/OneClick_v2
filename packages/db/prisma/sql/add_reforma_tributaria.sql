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

-- Premissas parametrizaveis por ano/setor/CNAE. O service tambem cria esta
-- tabela de forma idempotente para proteger ambientes onde o SQL ainda nao foi
-- aplicado manualmente.
CREATE TABLE IF NOT EXISTS reforma_tributaria_premissas (
  id                             text PRIMARY KEY,
  empresa_id                     text,
  nome                           text NOT NULL,
  ano                            integer NOT NULL DEFAULT 2027,
  setor                          text,
  cnae_prefix                    text,
  aliquota_cbs                   numeric(7, 6) NOT NULL DEFAULT 0.088,
  aliquota_ibs                   numeric(7, 6) NOT NULL DEFAULT 0.177,
  aliquota_simples_ibs_cbs       numeric(7, 6) NOT NULL DEFAULT 0.04,
  percentual_vendas_b2b          numeric(7, 6) NOT NULL DEFAULT 0.55,
  percentual_compras_creditaveis numeric(7, 6) NOT NULL DEFAULT 0.35,
  peso_credito_cliente           numeric(7, 6) NOT NULL DEFAULT 0.35,
  reducao_setorial               numeric(7, 6) NOT NULL DEFAULT 0,
  observacoes                    text,
  ativo                          boolean NOT NULL DEFAULT true,
  created_at                     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS reforma_tributaria_premissas_empresa_ativo_idx
  ON reforma_tributaria_premissas (empresa_id, ativo);

CREATE INDEX IF NOT EXISTS reforma_tributaria_premissas_ano_setor_idx
  ON reforma_tributaria_premissas (ano, setor);
