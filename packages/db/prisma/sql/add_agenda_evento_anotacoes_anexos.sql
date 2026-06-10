-- Anotações e anexos próprios de eventos da agenda (usados quando o evento NÃO
-- está vinculado a um card do CRM). Ao vincular, são migrados pra oportunidade.
-- Idempotente: seguro rodar múltiplas vezes (local e VPS).

CREATE TABLE IF NOT EXISTS "agenda_evento_anotacoes" (
  "id"         TEXT NOT NULL,
  "evento_id"  TEXT NOT NULL,
  "user_id"    TEXT,
  "texto"      TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agenda_evento_anotacoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agenda_evento_anexos" (
  "id"         TEXT NOT NULL,
  "evento_id"  TEXT NOT NULL,
  "file_name"  TEXT NOT NULL,
  "file_url"   TEXT NOT NULL,
  "file_size"  INTEGER,
  "mime_type"  TEXT,
  "user_id"    TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agenda_evento_anexos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agenda_evento_anotacoes_evento_id_idx" ON "agenda_evento_anotacoes"("evento_id");
CREATE INDEX IF NOT EXISTS "agenda_evento_anexos_evento_id_idx"    ON "agenda_evento_anexos"("evento_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agenda_evento_anotacoes_evento_id_fkey') THEN
    ALTER TABLE "agenda_evento_anotacoes"
      ADD CONSTRAINT "agenda_evento_anotacoes_evento_id_fkey"
      FOREIGN KEY ("evento_id") REFERENCES "agenda_eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agenda_evento_anexos_evento_id_fkey') THEN
    ALTER TABLE "agenda_evento_anexos"
      ADD CONSTRAINT "agenda_evento_anexos_evento_id_fkey"
      FOREIGN KEY ("evento_id") REFERENCES "agenda_eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
