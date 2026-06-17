-- Helpdesk: responder a uma mensagem específica (citar). Idempotente.
ALTER TABLE helpdesk_mensagens ADD COLUMN IF NOT EXISTS resposta_para_id text;
CREATE INDEX IF NOT EXISTS helpdesk_mensagens_resposta_para_idx ON helpdesk_mensagens (resposta_para_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'helpdesk_mensagens_resposta_para_id_fkey') THEN
    ALTER TABLE helpdesk_mensagens ADD CONSTRAINT helpdesk_mensagens_resposta_para_id_fkey
      FOREIGN KEY (resposta_para_id) REFERENCES helpdesk_mensagens(id) ON DELETE SET NULL;
  END IF;
END $$;
