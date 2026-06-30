-- Flag "arrumar a sala" no evento da agenda (preparar a sala antes). Idempotente.

ALTER TABLE "agenda_eventos" ADD COLUMN IF NOT EXISTS "arrumar_sala" BOOLEAN NOT NULL DEFAULT false;
