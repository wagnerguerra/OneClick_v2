-- Orçamentos do legado (v4/db_intranet com_orc*) — tabelas auxiliares de histórico. Idempotente.
CREATE TABLE IF NOT EXISTS orcamento_legado (
  id              text PRIMARY KEY,
  legacy_id       integer NOT NULL,
  numero          integer NOT NULL,
  cliente_id      text,
  cnpj            text,
  razao_social    text,
  status          text,
  tipo            text,
  contato         text,
  contato_email   text,
  validade_dias   integer,
  desconto        text,
  valor_desconto  text,
  valor_total     numeric(15,2),
  descricao       text,
  decisao_tipo    text,
  decisao_nome    text,
  decisao_cpf     text,
  decisao_obs     text,
  decisao_em      timestamp(3),
  csat_nota       integer,
  csat_obs        text,
  dt_novo         timestamp(3),
  dt_enviado      timestamp(3),
  dt_aprovado     timestamp(3),
  dt_liberado     timestamp(3),
  dt_finalizado   timestamp(3),
  dt_encerrado    timestamp(3),
  dt_cancelado    timestamp(3),
  importado_em    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS orcamento_legado_legacy_id_key ON orcamento_legado (legacy_id);
CREATE INDEX IF NOT EXISTS orcamento_legado_cliente_idx ON orcamento_legado (cliente_id);
CREATE INDEX IF NOT EXISTS orcamento_legado_cnpj_idx ON orcamento_legado (cnpj);

CREATE TABLE IF NOT EXISTS orcamento_legado_item (
  id             text PRIMARY KEY,
  orcamento_id   text NOT NULL,
  descricao      text,
  tipo           text,
  quantidade     numeric(15,4),
  valor_unitario numeric(15,2),
  ordem          integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS orcamento_legado_item_orc_idx ON orcamento_legado_item (orcamento_id);

CREATE TABLE IF NOT EXISTS orcamento_legado_mensagem (
  id           text PRIMARY KEY,
  orcamento_id text NOT NULL,
  autor_nome   text,
  conteudo     text NOT NULL,
  data         timestamp(3)
);
CREATE INDEX IF NOT EXISTS orcamento_legado_mensagem_orc_idx ON orcamento_legado_mensagem (orcamento_id);

CREATE TABLE IF NOT EXISTS orcamento_legado_evento (
  id           text PRIMARY KEY,
  orcamento_id text NOT NULL,
  autor_nome   text,
  evento       text NOT NULL,
  data         timestamp(3)
);
CREATE INDEX IF NOT EXISTS orcamento_legado_evento_orc_idx ON orcamento_legado_evento (orcamento_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_legado_item_orc_fkey') THEN
    ALTER TABLE orcamento_legado_item ADD CONSTRAINT orcamento_legado_item_orc_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamento_legado(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_legado_mensagem_orc_fkey') THEN
    ALTER TABLE orcamento_legado_mensagem ADD CONSTRAINT orcamento_legado_mensagem_orc_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamento_legado(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_legado_evento_orc_fkey') THEN
    ALTER TABLE orcamento_legado_evento ADD CONSTRAINT orcamento_legado_evento_orc_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamento_legado(id) ON DELETE CASCADE;
  END IF;
END $$;
