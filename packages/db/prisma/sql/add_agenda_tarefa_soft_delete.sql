-- ============================================================
-- Soft-delete de tarefas da agenda (paridade com eventos). [QA #12]
-- Antes o delete era hard (perdia histórico). Idempotente.
-- ============================================================
ALTER TABLE agenda_tarefas ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS agenda_tarefas_is_active_idx ON agenda_tarefas (is_active);
