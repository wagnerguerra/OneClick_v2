-- Campos extras de exibição dos planos na pricing. Idempotente.

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "highlight" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "display_order" INTEGER NOT NULL DEFAULT 0;
