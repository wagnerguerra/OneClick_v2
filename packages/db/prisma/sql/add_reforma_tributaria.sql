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

-- Base inicial global de premissas setoriais. Estes registros sao premissas
-- operacionais para triagem e devem ser validados pelo responsavel tecnico
-- antes do parecer final.
INSERT INTO reforma_tributaria_premissas
  (id, empresa_id, nome, ano, setor, cnae_prefix, aliquota_cbs, aliquota_ibs,
   aliquota_simples_ibs_cbs, percentual_vendas_b2b, percentual_compras_creditaveis,
   peso_credito_cliente, reducao_setorial, observacoes, ativo, created_at, updated_at)
VALUES
  ('rt-seed-geral', NULL, 'Geral - IBS/CBS padrao', 2027, 'Geral', NULL, 0.088, 0.177, 0.04, 0.55, 0.35, 0.35, 0, 'Premissa operacional inicial. Validar aliquotas, regras legais e perfil do cliente antes do parecer.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-agro-01', NULL, 'Agropecuaria - CNAE 01', 2027, 'Agropecuaria', '01', 0.088, 0.177, 0.04, 0.75, 0.45, 0.35, 0.6, 'Premissa inicial para produtor/atividade agropecuaria. Confirmar enquadramento e reducao aplicavel.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-industria-10', NULL, 'Industria de alimentos - CNAE 10', 2027, 'Industria', '10', 0.088, 0.177, 0.04, 0.7, 0.55, 0.35, 0, 'Premissa inicial para industria de alimentos. Revisar cesta basica, regimes especificos e imposto seletivo quando aplicavel.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-industria-14', NULL, 'Industria textil/confeccao - CNAE 14', 2027, 'Industria', '14', 0.088, 0.177, 0.04, 0.65, 0.5, 0.35, 0, 'Premissa inicial para industria de confeccao. Validar cadeia de creditos e perfil B2B.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-industria-25', NULL, 'Industria metal/mecanica - CNAE 25', 2027, 'Industria', '25', 0.088, 0.177, 0.04, 0.8, 0.6, 0.35, 0, 'Premissa inicial para industria metal/mecanica. Validar insumos creditaveis e destino das vendas.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-construcao-41', NULL, 'Construcao civil - CNAE 41', 2027, 'Construcao', '41', 0.088, 0.177, 0.04, 0.55, 0.4, 0.35, 0, 'Premissa inicial para construcao. Confirmar regime especifico de operacoes imobiliarias e composicao de insumos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-construcao-43', NULL, 'Servicos especializados construcao - CNAE 43', 2027, 'Construcao', '43', 0.088, 0.177, 0.04, 0.65, 0.35, 0.35, 0, 'Premissa inicial para servicos especializados de construcao. Validar contratos e materiais aplicados.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-comercio-45', NULL, 'Comercio/servicos veiculos - CNAE 45', 2027, 'Comercio', '45', 0.088, 0.177, 0.04, 0.45, 0.55, 0.35, 0, 'Premissa inicial para comercio e manutencao de veiculos. Validar margem e natureza das receitas.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-comercio-46', NULL, 'Comercio atacadista - CNAE 46', 2027, 'Comercio', '46', 0.088, 0.177, 0.04, 0.85, 0.7, 0.35, 0, 'Premissa inicial para atacado com maior peso B2B e creditos de mercadorias.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-comercio-47', NULL, 'Comercio varejista - CNAE 47', 2027, 'Comercio', '47', 0.088, 0.177, 0.04, 0.25, 0.55, 0.35, 0, 'Premissa inicial para varejo. Validar composicao B2C/B2B e margem por produto.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-transporte-49', NULL, 'Transporte terrestre - CNAE 49', 2027, 'Transporte', '49', 0.088, 0.177, 0.04, 0.7, 0.35, 0.35, 0.6, 'Premissa inicial para transporte. Confirmar se a operacao tem reducao/tratamento especifico aplicavel.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-alimentacao-56', NULL, 'Alimentacao/restaurantes - CNAE 56', 2027, 'Alimentacao', '56', 0.088, 0.177, 0.04, 0.2, 0.45, 0.35, 0, 'Premissa inicial para alimentacao. Validar cesta basica, insumos e perfil de consumidor final.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-tecnologia-62', NULL, 'Tecnologia/software - CNAE 62', 2027, 'Tecnologia', '62', 0.088, 0.177, 0.04, 0.8, 0.2, 0.35, 0, 'Premissa inicial para tecnologia e software. Validar receita recorrente, exportacao e servicos tomados.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-consultoria-69', NULL, 'Juridico/contabil/consultoria - CNAE 69', 2027, 'Servicos profissionais', '69', 0.088, 0.177, 0.04, 0.75, 0.18, 0.35, 0, 'Premissa inicial para servicos profissionais. Validar folha, subcontratacoes e baixo credito de insumos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-engenharia-71', NULL, 'Engenharia/arquitetura - CNAE 71', 2027, 'Servicos profissionais', '71', 0.088, 0.177, 0.04, 0.7, 0.25, 0.35, 0, 'Premissa inicial para engenharia/arquitetura. Validar contratos, terceiros e materiais.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-publicidade-73', NULL, 'Publicidade/marketing - CNAE 73', 2027, 'Servicos profissionais', '73', 0.088, 0.177, 0.04, 0.8, 0.3, 0.35, 0, 'Premissa inicial para publicidade. Validar repasses de midia, subcontratacoes e creditos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-educacao-85', NULL, 'Educacao - CNAE 85', 2027, 'Educacao', '85', 0.088, 0.177, 0.04, 0.15, 0.2, 0.35, 0.6, 'Premissa inicial para educacao. Confirmar requisitos legais e tipo de servico educacional.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-saude-86', NULL, 'Saude - CNAE 86', 2027, 'Saude', '86', 0.088, 0.177, 0.04, 0.35, 0.3, 0.35, 0.6, 'Premissa inicial para saude. Confirmar enquadramento do servico e reducao aplicavel.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rt-seed-servicos-96', NULL, 'Servicos pessoais - CNAE 96', 2027, 'Servicos pessoais', '96', 0.088, 0.177, 0.04, 0.15, 0.2, 0.35, 0, 'Premissa inicial para servicos pessoais, tipicamente B2C e com menor base creditavel.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
