-- ============================================================
-- Mensagens de orçamento por e-mail (envio pelo detalhe + captura da resposta).
--   via_email      = mensagem originada/enviada por e-mail (mostra ícone)
--   autor_externo  = nome/e-mail do remetente quando a msg veio do cliente (user_id NULL)
-- Idempotente.
-- ============================================================
ALTER TABLE orcamento_mensagens
  ADD COLUMN IF NOT EXISTS via_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autor_externo text;
