-- ============================================================
-- Roteador de trilhas no funil de leads (chat IA do site).
--   roteador             = marca a config-hub de "Recepção" (a IA triágil e encaminha)
--   descricao_roteamento = frase-gatilho de cada trilha ("quando encaminhar pra cá")
-- Idempotente.
-- ============================================================
ALTER TABLE lead_funil_config
  ADD COLUMN IF NOT EXISTS roteador boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descricao_roteamento text;
