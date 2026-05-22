-- Progresso em tempo real das syncs NFe/NFS-e (polling pela UI).
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS nfe_dist_progresso  JSONB,
  ADD COLUMN IF NOT EXISTS nfse_dist_progresso JSONB;
