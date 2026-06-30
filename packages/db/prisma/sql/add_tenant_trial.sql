-- Trial sem cartão para novos tenants. Idempotente.
-- NULL = tenant isento/grandfathered (não expira). Novos tenants recebem data.

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "trial_started_at" TIMESTAMP(3);
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP(3);
