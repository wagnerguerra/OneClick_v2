-- Agenda de Contatos (port do `ger_age` do v1 — módulo crp_contatos). Idempotente.
-- Uma entrada tem nome + 1..N pessoas (o v1 tinha 3 blocos fixos cts/tel/email).
CREATE TABLE IF NOT EXISTS contatos (
  id            text PRIMARY KEY,
  empresa_id    text,
  legacy_id     integer,
  nome          text NOT NULL,
  observacoes   text,
  privado       boolean NOT NULL DEFAULT false,
  dono_id       text,
  dono_nome     text,
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em timestamp(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS contatos_empresa_ativo_idx ON contatos (empresa_id, ativo);
CREATE INDEX IF NOT EXISTS contatos_dono_idx ON contatos (dono_id);
CREATE INDEX IF NOT EXISTS contatos_legacy_idx ON contatos (legacy_id);

CREATE TABLE IF NOT EXISTS contato_pessoas (
  id         text PRIMARY KEY,
  contato_id text NOT NULL,
  nome       text,
  telefone   text,
  email      text,
  ordem      integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS contato_pessoas_contato_idx ON contato_pessoas (contato_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contato_pessoas_contato_fkey') THEN
    ALTER TABLE contato_pessoas
      ADD CONSTRAINT contato_pessoas_contato_fkey
      FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE;
  END IF;
END $$;
