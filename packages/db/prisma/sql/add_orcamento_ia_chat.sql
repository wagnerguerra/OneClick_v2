-- Histórico do chat do Assistente de IA dentro do orçamento. Idempotente.
-- Escopo por (orcamento_id, user_id): cada usuário tem sua própria conversa
-- por orçamento; persiste entre reloads/visitas.
CREATE TABLE IF NOT EXISTS orcamento_ia_mensagem (
  id           text PRIMARY KEY,
  orcamento_id text NOT NULL,
  user_id      text,
  role         text NOT NULL, -- 'user' | 'assistant'
  conteudo     text NOT NULL,
  created_at   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS orcamento_ia_mensagem_orc_user_idx ON orcamento_ia_mensagem (orcamento_id, user_id, created_at);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_ia_mensagem_orc_fkey') THEN
    ALTER TABLE orcamento_ia_mensagem ADD CONSTRAINT orcamento_ia_mensagem_orc_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE;
  END IF;
END $$;
