-- Empresa ATIVA server-authoritative (multi-empresa do master). Idempotente.
-- NULL = usa a empresa home (users.empresa_id). Não-master é sempre forçado à home. F-012.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "active_empresa_id" TEXT;
