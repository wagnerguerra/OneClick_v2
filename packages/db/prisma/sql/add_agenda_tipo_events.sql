-- Auditoria das ações nos tipos de evento da agenda. Idempotente.

CREATE TABLE IF NOT EXISTS "agenda_tipo_events" (
  "id"         TEXT NOT NULL,
  "tipo_id"    TEXT,
  "tipo_nome"  TEXT NOT NULL,
  "usuario_id" TEXT NOT NULL,
  "acao"       TEXT NOT NULL,
  "detalhes"   TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agenda_tipo_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "agenda_tipo_events_tipo_id_idx" ON "agenda_tipo_events"("tipo_id");
CREATE INDEX IF NOT EXISTS "agenda_tipo_events_created_at_idx" ON "agenda_tipo_events"("created_at");
