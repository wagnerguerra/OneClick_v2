-- Tabelas do cadastro de clientes (abas Legalização, Protocolos, Reclamações,
-- DT-e, CNAEs) acessadas via SQL raw e que faltavam no banco. Idempotente.

CREATE TABLE IF NOT EXISTS cliente_vencimentos (
  id              text PRIMARY KEY,
  cliente_id      text NOT NULL,
  descricao       text NOT NULL,
  data_vencimento timestamp(3),
  alerta_dias     integer DEFAULT 0,
  observacoes     text,
  concluido       boolean NOT NULL DEFAULT false,
  created_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cliente_vencimentos_cliente_idx ON cliente_vencimentos (cliente_id);

CREATE TABLE IF NOT EXISTS cliente_andamentos (
  id              text PRIMARY KEY,
  cliente_id      text NOT NULL,
  descricao       text NOT NULL,
  tipo            text,
  status          text,
  data_inicio     timestamp(3),
  data_conclusao  timestamp(3),
  observacoes     text,
  usuario_id      text,
  created_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cliente_andamentos_cliente_idx ON cliente_andamentos (cliente_id);

CREATE TABLE IF NOT EXISTS cliente_cnaes (
  id          text PRIMARY KEY,
  cliente_id  text NOT NULL,
  codigo      text NOT NULL,
  descricao   text,
  principal   boolean NOT NULL DEFAULT false,
  created_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cliente_cnaes_cliente_idx ON cliente_cnaes (cliente_id);

CREATE TABLE IF NOT EXISTS cliente_protocolos (
  id           text PRIMARY KEY,
  cliente_id   text NOT NULL,
  orgao        text,
  tipo         text,
  protocolo    text,
  descricao    text,
  status       text NOT NULL DEFAULT 'pendente',
  resultado    text,
  data_retorno timestamp(3),
  usuario_id   text,
  created_at   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cliente_protocolos_cliente_idx ON cliente_protocolos (cliente_id);

CREATE TABLE IF NOT EXISTS cliente_ocorrencias (
  id             text PRIMARY KEY,
  cliente_id     text NOT NULL,
  tipo           text,
  titulo         text,
  descricao      text,
  prioridade     text,
  status         text NOT NULL DEFAULT 'aberta',
  resolucao      text,
  data_resolucao timestamp(3),
  area_id        text,
  responsavel_id text,
  usuario_id     text,
  created_at     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cliente_ocorrencias_cliente_idx ON cliente_ocorrencias (cliente_id);

CREATE TABLE IF NOT EXISTS cliente_dte_mensagens (
  id            text PRIMARY KEY,
  cliente_id    text NOT NULL,
  tipo          text,
  titulo        text,
  data_mensagem timestamp(3),
  observacao    text,
  created_at    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cliente_dte_mensagens_cliente_idx ON cliente_dte_mensagens (cliente_id);

CREATE TABLE IF NOT EXISTS cliente_particularidades_historico (
  id                         text PRIMARY KEY,
  cliente_area_contratada_id text NOT NULL,
  texto_anterior             text,
  texto_novo                 text,
  usuario_id                 text,
  created_at                 timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cliente_part_hist_cac_idx ON cliente_particularidades_historico (cliente_area_contratada_id);

-- FKs (cascade) — só cria se ainda não existir.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cliente_vencimentos_cliente_id_fkey') THEN
    ALTER TABLE cliente_vencimentos ADD CONSTRAINT cliente_vencimentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cliente_andamentos_cliente_id_fkey') THEN
    ALTER TABLE cliente_andamentos ADD CONSTRAINT cliente_andamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cliente_cnaes_cliente_id_fkey') THEN
    ALTER TABLE cliente_cnaes ADD CONSTRAINT cliente_cnaes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cliente_protocolos_cliente_id_fkey') THEN
    ALTER TABLE cliente_protocolos ADD CONSTRAINT cliente_protocolos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cliente_ocorrencias_cliente_id_fkey') THEN
    ALTER TABLE cliente_ocorrencias ADD CONSTRAINT cliente_ocorrencias_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cliente_dte_mensagens_cliente_id_fkey') THEN
    ALTER TABLE cliente_dte_mensagens ADD CONSTRAINT cliente_dte_mensagens_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cliente_part_hist_cac_id_fkey') THEN
    ALTER TABLE cliente_particularidades_historico ADD CONSTRAINT cliente_part_hist_cac_id_fkey FOREIGN KEY (cliente_area_contratada_id) REFERENCES cliente_areas_contratadas(id) ON DELETE CASCADE; END IF;
END $$;

-- Particularidades (nota por área contratada) — 1 por área (ON CONFLICT exige unique).
CREATE TABLE IF NOT EXISTS cliente_particularidades (
  id                         text PRIMARY KEY,
  cliente_area_contratada_id text NOT NULL,
  texto                      text,
  updated_by_user_id         text,
  created_at                 timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS cliente_particularidades_cac_key ON cliente_particularidades (cliente_area_contratada_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cliente_particularidades_cac_id_fkey') THEN
    ALTER TABLE cliente_particularidades ADD CONSTRAINT cliente_particularidades_cac_id_fkey FOREIGN KEY (cliente_area_contratada_id) REFERENCES cliente_areas_contratadas(id) ON DELETE CASCADE; END IF;
END $$;
