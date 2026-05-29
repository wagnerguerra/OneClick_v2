-- ============================================================
-- Migration cirúrgica: DashboardLayoutUser (personalização por usuário)
-- Permite cada user ter seu layout próprio do /dashboard,
-- persistente entre máquinas (login em qualquer device traz o mesmo layout).
-- ============================================================

CREATE TABLE IF NOT EXISTS "dashboard_layouts_user" (
  "id"          TEXT PRIMARY KEY,
  "user_id"     TEXT NOT NULL,
  "empresa_id"  TEXT,
  "layout"      JSONB NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_layouts_user_user_id_key"
  ON "dashboard_layouts_user"("user_id");

CREATE INDEX IF NOT EXISTS "dashboard_layouts_user_user_id_idx"
  ON "dashboard_layouts_user"("user_id");
