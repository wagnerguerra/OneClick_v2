-- Migração manual: tabelas raw das famílias CND + DT-e (bloco Fiscal).
-- Aplicada em 2026-06-26. Idempotente. NÃO toca em drift histórico de outras tabelas.
--
-- Motivo (R2-002, sweep): cada service criava sua tabela via $executeRawUnsafe()
-- dentro de ensureTable(), chamado de totalizadores()/list() (CAMINHO DE READ).
-- Sob concorrência, duas requests passavam pelo check de pg_tables e ambas
-- tentavam o CREATE TABLE; o row-type implícito da tabela colidia em pg_type
-- (23505 duplicate typname) → HTTP 500. DDL agora vive aqui; o request só LÊ.

-- ── certidoes_cnd (CND Federal) + log de execução ────────────
CREATE TABLE IF NOT EXISTS certidoes_cnd (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  documento TEXT NOT NULL,
  tipo_documento INT NOT NULL DEFAULT 2,
  razao_social TEXT,
  etapa TEXT NOT NULL DEFAULT 'pendente',
  tipo_certidao TEXT,
  codigo_controle TEXT,
  data_emissao TIMESTAMPTZ,
  data_validade TIMESTAMPTZ,
  pdf_base64 TEXT,
  status_api INT,
  mensagem_api TEXT,
  resposta_completa JSONB,
  sucesso BOOLEAN NOT NULL DEFAULT false,
  erro TEXT,
  cliente_id TEXT,
  empresa_id TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cnd_documento ON certidoes_cnd (documento);
CREATE INDEX IF NOT EXISTS idx_cnd_cliente_id ON certidoes_cnd (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cnd_created ON certidoes_cnd (created_at DESC);

CREATE TABLE IF NOT EXISTS cnd_exec_log (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'manual',
  iniciado_por TEXT,
  nome_usuario TEXT,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,
  total INT NOT NULL DEFAULT 0,
  sucesso INT NOT NULL DEFAULT 0,
  falhas INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  itens JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── certidoes_cnd_municipal (CND Municipal) ──────────────────
CREATE TABLE IF NOT EXISTS certidoes_cnd_municipal (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  documento TEXT NOT NULL,
  razao_social TEXT,
  municipio TEXT NOT NULL,
  sucesso BOOLEAN NOT NULL DEFAULT false,
  tipo_certidao TEXT,
  mensagem TEXT,
  conteudo_html TEXT,
  debitos JSONB DEFAULT '[]',
  pdf_base64 TEXT,
  data_validade DATE,
  cliente_id TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Colunas adicionadas lazy em tabelas legadas:
ALTER TABLE certidoes_cnd_municipal ADD COLUMN IF NOT EXISTS debitos JSONB DEFAULT '[]';
ALTER TABLE certidoes_cnd_municipal ADD COLUMN IF NOT EXISTS pdf_base64 TEXT;
ALTER TABLE certidoes_cnd_municipal ADD COLUMN IF NOT EXISTS data_validade DATE;
CREATE INDEX IF NOT EXISTS idx_cnd_mun_doc ON certidoes_cnd_municipal (documento);
CREATE INDEX IF NOT EXISTS idx_cnd_mun_mun ON certidoes_cnd_municipal (municipio);

-- ── certidoes_cnd_estadual (CND Estadual / SEFAZ) ────────────
CREATE TABLE IF NOT EXISTS certidoes_cnd_estadual (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  documento TEXT NOT NULL,
  razao_social TEXT,
  uf TEXT NOT NULL DEFAULT 'ES',
  sucesso BOOLEAN NOT NULL DEFAULT false,
  mensagem TEXT,
  pdf_base64 TEXT,
  cliente_id TEXT,
  empresa_id TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cnd_est_documento ON certidoes_cnd_estadual (documento);
CREATE INDEX IF NOT EXISTS idx_cnd_est_created ON certidoes_cnd_estadual (created_at DESC);

-- ── certidoes_cndt (CNDT Trabalhista) ────────────────────────
CREATE TABLE IF NOT EXISTS certidoes_cndt (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  documento TEXT NOT NULL,
  razao_social TEXT,
  sucesso BOOLEAN NOT NULL DEFAULT false,
  tipo_certidao TEXT,
  mensagem TEXT,
  numero_certidao TEXT,
  data_validade DATE,
  pdf_base64 TEXT,
  cliente_id TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cndt_doc ON certidoes_cndt (documento);

-- ── certidoes_crf_fgts (CRF/FGTS Caixa) ──────────────────────
CREATE TABLE IF NOT EXISTS certidoes_crf_fgts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  documento TEXT NOT NULL,
  razao_social TEXT,
  sucesso BOOLEAN NOT NULL DEFAULT false,
  tipo_certidao TEXT,
  mensagem TEXT,
  numero_certificado TEXT,
  data_validade DATE,
  pdf_base64 TEXT,
  cliente_id TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crf_doc ON certidoes_crf_fgts (documento);

-- ── certidoes_cgu (CGU / CEIS) ───────────────────────────────
CREATE TABLE IF NOT EXISTS certidoes_cgu (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  documento TEXT NOT NULL,
  razao_social TEXT,
  sucesso BOOLEAN NOT NULL DEFAULT false,
  tipo_certidao TEXT,
  mensagem TEXT,
  situacao TEXT,
  data_consulta TIMESTAMPTZ,
  pdf_base64 TEXT,
  cliente_id TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cgu_doc ON certidoes_cgu (documento);

-- ── alvaras_bombeiros (CBMES) ────────────────────────────────
CREATE TABLE IF NOT EXISTS alvaras_bombeiros (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  alvara_id INT,
  documento TEXT,
  razao_social TEXT,
  nome_fantasia TEXT,
  endereco TEXT,
  municipio TEXT,
  bairro TEXT,
  status TEXT,
  codigo_validacao TEXT,
  data_inicio_validade TEXT,
  data_fim_validade TEXT,
  ocupacao TEXT,
  cliente_id TEXT,
  user_id TEXT,
  pdf_base64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE alvaras_bombeiros ADD COLUMN IF NOT EXISTS pdf_base64 TEXT;
CREATE INDEX IF NOT EXISTS idx_alv_documento ON alvaras_bombeiros (documento);
CREATE INDEX IF NOT EXISTS idx_alv_cliente ON alvaras_bombeiros (cliente_id);

-- ── alvaras_funcionamento (prefeituras) ──────────────────────
CREATE TABLE IF NOT EXISTS alvaras_funcionamento (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  documento TEXT NOT NULL,
  razao_social TEXT,
  municipio TEXT NOT NULL,
  sucesso BOOLEAN NOT NULL DEFAULT false,
  mensagem TEXT,
  pdf_base64 TEXT,
  cliente_id TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alv_func_doc ON alvaras_funcionamento (documento);
CREATE INDEX IF NOT EXISTS idx_alv_func_mun ON alvaras_funcionamento (municipio);

-- ── dte_mensagens (DT-e ES) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS dte_mensagens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cliente_id TEXT,
  documento TEXT NOT NULL,
  razao_social TEXT,
  tipo TEXT,
  titulo TEXT,
  data_mensagem TEXT,
  status TEXT DEFAULT 'nao_lida',
  observacao TEXT,
  hash TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dte_msg_doc ON dte_mensagens (documento);
CREATE INDEX IF NOT EXISTS idx_dte_msg_cli ON dte_mensagens (cliente_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dte_msg_hash ON dte_mensagens (hash);
