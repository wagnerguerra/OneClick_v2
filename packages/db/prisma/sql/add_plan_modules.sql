-- Módulos liberados por plano (slugs). Idempotente.
-- [] = nenhum módulo liberado ainda (o master configura via /admin/planos).

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "modules" JSONB NOT NULL DEFAULT '[]'::jsonb;
