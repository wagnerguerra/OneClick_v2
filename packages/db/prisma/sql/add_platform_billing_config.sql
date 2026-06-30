-- Configuração global de billing/trial (single-row). Idempotente.
-- Semeia a linha id=1 com trial_days=7 se ainda não existir.

CREATE TABLE IF NOT EXISTS "platform_billing_config" (
  "id"         INTEGER NOT NULL DEFAULT 1,
  "trial_days" INTEGER NOT NULL DEFAULT 7,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT,
  CONSTRAINT "platform_billing_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform_billing_config" ("id", "trial_days", "updated_at")
VALUES (1, 7, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
