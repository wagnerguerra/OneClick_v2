-- Campo de progresso pra UI acompanhar em tempo real (polling).
ALTER TABLE drive_sync_logs
  ADD COLUMN IF NOT EXISTS progresso JSONB;
