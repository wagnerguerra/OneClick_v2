-- Flag de "sincronização solicitada manualmente pela UI" — daemon pega no próximo poll.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS local_sync_requested_at TIMESTAMP(3);
