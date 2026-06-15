-- ============================================================
-- Participantes/membros das tarefas da agenda (+ ciência).
-- Membro = criador + participantes. Cada um dá ciência (ciente_em);
-- quando todos estão cientes, a tarefa é considerada concluída
-- (recalculado no service). Aplicar via psql/prisma db execute.
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS "agenda_tarefa_participantes" (
  "id"         TEXT PRIMARY KEY,
  "tarefa_id"  TEXT NOT NULL REFERENCES "agenda_tarefas"("id") ON DELETE CASCADE,
  "usuario_id" TEXT NOT NULL REFERENCES "users"("id"),
  "ciente_em"  TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agenda_tarefa_participantes_tarefa_usuario_key" UNIQUE ("tarefa_id", "usuario_id")
);
CREATE INDEX IF NOT EXISTS "agenda_tarefa_participantes_usuario_idx" ON "agenda_tarefa_participantes" ("usuario_id");
CREATE INDEX IF NOT EXISTS "agenda_tarefa_participantes_tarefa_idx" ON "agenda_tarefa_participantes" ("tarefa_id");
