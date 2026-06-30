-- Isolamento multi-tenant do disparo diário da agenda. Idempotente.
-- A config era única/global (single-tenant); com múltiplos tenants, os
-- destinatários de "enviar para todos" vazavam entre empresas.
-- Backfill: a config existente passa a pertencer à empresa mais antiga
-- (a org original da plataforma), preservando o disparo atual.

ALTER TABLE "agenda_disparo_config" ADD COLUMN IF NOT EXISTS "empresa_id" TEXT;

UPDATE "agenda_disparo_config"
SET "empresa_id" = (SELECT "id" FROM "empresas" ORDER BY "created_at" ASC LIMIT 1)
WHERE "empresa_id" IS NULL;
