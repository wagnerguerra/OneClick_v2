-- Migração manual: colunas legacy_id p/ o port (Fase 5).
-- Aplicada em 2026-07-28. Idempotente. Aditiva.
-- Guarda o ID do v1 (cad_for.ID / sgq_com.id) p/ mapear FKs entre as migrações
-- (compras → fornecedor pelo legacy_id, robusto inclusive p/ CNPJs duplicados).

BEGIN;

ALTER TABLE "fornecedores" ADD COLUMN IF NOT EXISTS "legacy_id" INTEGER;
CREATE INDEX IF NOT EXISTS "idx_fornecedores_legacy" ON "fornecedores" ("legacy_id");

ALTER TABLE "compras" ADD COLUMN IF NOT EXISTS "legacy_id" INTEGER;
CREATE INDEX IF NOT EXISTS "idx_compras_legacy" ON "compras" ("legacy_id");

COMMIT;
