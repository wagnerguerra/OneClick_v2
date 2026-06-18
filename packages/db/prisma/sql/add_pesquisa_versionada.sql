-- Pesquisa de satisfação configurável e versionada. Idempotente.
-- pesquisa_modelo (versão) → pesquisa_pergunta (N) ; pesquisa_envio (por orçamento)
-- → pesquisa_resposta_item (resposta por pergunta).
CREATE TABLE IF NOT EXISTS pesquisa_modelo (
  id          text PRIMARY KEY,
  titulo      text NOT NULL,
  versao      integer NOT NULL DEFAULT 1,
  ativo       boolean NOT NULL DEFAULT true,
  empresa_id  text,
  created_by  text,
  created_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS pesquisa_modelo_emp_idx ON pesquisa_modelo (empresa_id, ativo);

CREATE TABLE IF NOT EXISTS pesquisa_pergunta (
  id          text PRIMARY KEY,
  modelo_id   text NOT NULL,
  ordem       integer NOT NULL DEFAULT 0,
  tipo        text NOT NULL, -- ESTRELAS | NPS | SIM_NAO | TEXTO
  enunciado   text NOT NULL,
  obrigatoria boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS pesquisa_pergunta_modelo_idx ON pesquisa_pergunta (modelo_id, ordem);

CREATE TABLE IF NOT EXISTS pesquisa_envio (
  id                text PRIMARY KEY,
  token             text NOT NULL,
  modelo_id         text NOT NULL,
  orcamento_id      text,
  cliente_id        text,
  empresa_id        text,
  enviada_em        timestamp(3),
  enviada_por       text,
  respondida_em     timestamp(3),
  respondente_nome  text,
  respondente_email text,
  notificado_em     timestamp(3),
  created_at        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS pesquisa_envio_token_key ON pesquisa_envio (token);
CREATE INDEX IF NOT EXISTS pesquisa_envio_orc_idx ON pesquisa_envio (orcamento_id);
CREATE INDEX IF NOT EXISTS pesquisa_envio_emp_resp_idx ON pesquisa_envio (empresa_id, respondida_em);

CREATE TABLE IF NOT EXISTS pesquisa_resposta_item (
  id             text PRIMARY KEY,
  envio_id       text NOT NULL,
  pergunta_id    text NOT NULL,
  valor_numero   integer,
  valor_booleano boolean,
  valor_texto    text
);
CREATE INDEX IF NOT EXISTS pesquisa_resposta_item_envio_idx ON pesquisa_resposta_item (envio_id);

-- FKs idempotentes (modelos nunca são excluídos; perguntas caem junto se um
-- modelo for removido; itens de resposta caem junto se o envio for removido).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pesquisa_pergunta_modelo_fkey') THEN
    ALTER TABLE pesquisa_pergunta ADD CONSTRAINT pesquisa_pergunta_modelo_fkey FOREIGN KEY (modelo_id) REFERENCES pesquisa_modelo(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pesquisa_resposta_item_envio_fkey') THEN
    ALTER TABLE pesquisa_resposta_item ADD CONSTRAINT pesquisa_resposta_item_envio_fkey FOREIGN KEY (envio_id) REFERENCES pesquisa_envio(id) ON DELETE CASCADE;
  END IF;
END $$;
