-- Banco de bugs: anotações livres por erro (knowledge base interna).
-- Permite documentar root cause, fix aplicado, commit, etc.
-- Acessível em /admin/erros-cliente ao expandir uma linha (auto-save em 800ms).

ALTER TABLE "client_error_logs" ADD COLUMN IF NOT EXISTS "notas"               TEXT;
ALTER TABLE "client_error_logs" ADD COLUMN IF NOT EXISTS "notas_updated_at"    TIMESTAMP(3);
ALTER TABLE "client_error_logs" ADD COLUMN IF NOT EXISTS "notas_updated_by_id" TEXT;
