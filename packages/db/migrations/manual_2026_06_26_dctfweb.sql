-- Migração manual: tabelas do módulo DCTFWeb (bloco Fiscal).
-- Aplicada em 2026-06-26. Idempotente. NÃO toca em drift histórico de outras tabelas.
--
-- Motivo (R2-002): o service criava estas tabelas via $executeRawUnsafe() NO CAMINHO
-- DE REQUEST (ensureTable/ensureColumns chamados em totalizadores/list/etc.). Sob
-- concorrência, duas requests passavam pelo check de pg_tables e ambas tentavam o
-- CREATE TABLE; o row-type implícito da tabela colidia em pg_type, gerando
-- "23505 duplicate key (typname,typnamespace)=(obrigacoes_dctfweb,2200)" → HTTP 500.
-- DDL agora vive aqui; o request só LÊ.

-- ── Tabela principal ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS obrigacoes_dctfweb (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cliente_id TEXT,
  documento TEXT NOT NULL,
  razao_social TEXT,
  competencia TEXT NOT NULL,

  esocial_fechado BOOLEAN DEFAULT false,
  reinf_fechado BOOLEAN DEFAULT false,

  status_dctfweb TEXT,
  valor_debito_api DECIMAL(14,2),
  situacao_fiscal TEXT,
  id_apuracao INT,
  texto_situacao TEXT,

  status_processo TEXT DEFAULT 'aguardando_fechamento',
  divergente BOOLEAN DEFAULT false,

  darf_emitido BOOLEAN DEFAULT false,
  darf_pago BOOLEAN DEFAULT false,
  valor_darf DECIMAL(14,2),

  data_consulta_api TIMESTAMPTZ,
  data_transmissao TIMESTAMPTZ,
  data_pagamento TIMESTAMPTZ,
  data_encerramento TEXT,

  nivel_alerta TEXT DEFAULT 'verde',
  resposta_api JSONB,

  -- Colunas adicionadas depois (antes via ensureColumns):
  data_ultima_entrega TIMESTAMPTZ,
  data_ultimo_fechamento_esocial TIMESTAMPTZ,
  data_ultimo_fechamento_reinf TIMESTAMPTZ,
  data_ultima_atualizacao_mit TIMESTAMPTZ,
  retificadora_pendente BOOLEAN DEFAULT false,
  motivo_retificadora TEXT,
  status_pos_entrega TEXT DEFAULT 'sem_alteracao',
  data_vencimento DATE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabelas legadas (criadas pelo ensureTable original) não têm as colunas extras —
-- garante todas de forma idempotente.
ALTER TABLE obrigacoes_dctfweb ADD COLUMN IF NOT EXISTS data_ultima_entrega TIMESTAMPTZ;
ALTER TABLE obrigacoes_dctfweb ADD COLUMN IF NOT EXISTS data_ultimo_fechamento_esocial TIMESTAMPTZ;
ALTER TABLE obrigacoes_dctfweb ADD COLUMN IF NOT EXISTS data_ultimo_fechamento_reinf TIMESTAMPTZ;
ALTER TABLE obrigacoes_dctfweb ADD COLUMN IF NOT EXISTS data_ultima_atualizacao_mit TIMESTAMPTZ;
ALTER TABLE obrigacoes_dctfweb ADD COLUMN IF NOT EXISTS retificadora_pendente BOOLEAN DEFAULT false;
ALTER TABLE obrigacoes_dctfweb ADD COLUMN IF NOT EXISTS motivo_retificadora TEXT;
ALTER TABLE obrigacoes_dctfweb ADD COLUMN IF NOT EXISTS status_pos_entrega TEXT DEFAULT 'sem_alteracao';
ALTER TABLE obrigacoes_dctfweb ADD COLUMN IF NOT EXISTS data_vencimento DATE;

CREATE INDEX IF NOT EXISTS idx_dctf_doc ON obrigacoes_dctfweb (documento);
CREATE INDEX IF NOT EXISTS idx_dctf_comp ON obrigacoes_dctfweb (competencia);
CREATE INDEX IF NOT EXISTS idx_dctf_cliente ON obrigacoes_dctfweb (cliente_id);

-- ── Tabela de log ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS log_dctfweb (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cliente_id TEXT,
  documento TEXT,
  competencia TEXT,
  acao TEXT,
  detalhe TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
