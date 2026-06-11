-- Orçamentos multiárea: detalhamento por área (Fase 1-3). Idempotente.

CREATE TABLE IF NOT EXISTS "orcamento_config" (
  "id"                      TEXT NOT NULL,
  "empresa_id"              TEXT,
  "prazo_resposta_dias"     INTEGER NOT NULL DEFAULT 2,
  "prazo_em_dias_uteis"     BOOLEAN NOT NULL DEFAULT true,
  "canais"                  JSONB,
  "avisar_comercial_atraso" BOOLEAN NOT NULL DEFAULT true,
  "area_comercial_id"       TEXT,
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orcamento_config_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "orcamento_config_empresa_id_key" ON "orcamento_config"("empresa_id");

CREATE TABLE IF NOT EXISTS "orcamento_areas_habilitadas" (
  "id"            TEXT NOT NULL,
  "empresa_id"    TEXT,
  "area_id"       TEXT NOT NULL,
  "substituto_id" TEXT,
  "ordem"         INTEGER NOT NULL DEFAULT 0,
  "ativo"         BOOLEAN NOT NULL DEFAULT true,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orcamento_areas_habilitadas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "orcamento_areas_habilitadas_empresa_area_key" ON "orcamento_areas_habilitadas"("empresa_id","area_id");
CREATE INDEX IF NOT EXISTS "orcamento_areas_habilitadas_area_id_idx" ON "orcamento_areas_habilitadas"("area_id");

CREATE TABLE IF NOT EXISTS "orcamento_areas" (
  "id"                        TEXT NOT NULL,
  "orcamento_id"              TEXT NOT NULL,
  "area_id"                   TEXT NOT NULL,
  "responsavel_id"            TEXT,
  "substituto_id"             TEXT,
  "status"                    TEXT NOT NULL DEFAULT 'PENDENTE',
  "prazo_original"            TIMESTAMP(3) NOT NULL,
  "prazo"                     TIMESTAMP(3) NOT NULL,
  "prorrogado"                BOOLEAN NOT NULL DEFAULT false,
  "prorrogado_em"             TIMESTAMP(3),
  "justificativa_prorrogacao" TEXT,
  "detalhe"                   TEXT,
  "valor"                     DECIMAL(12,2),
  "respondido_por"            TEXT,
  "respondido_em"             TIMESTAMP(3),
  "notificado_em"             TIMESTAMP(3),
  "notificado_atraso_em"      TIMESTAMP(3),
  "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orcamento_areas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "orcamento_areas_orcamento_area_key" ON "orcamento_areas"("orcamento_id","area_id");
CREATE INDEX IF NOT EXISTS "orcamento_areas_orcamento_id_idx" ON "orcamento_areas"("orcamento_id");
CREATE INDEX IF NOT EXISTS "orcamento_areas_status_idx" ON "orcamento_areas"("status");

-- FKs (guardadas)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orcamento_areas_orcamento_id_fkey') THEN
    ALTER TABLE "orcamento_areas" ADD CONSTRAINT "orcamento_areas_orcamento_id_fkey"
      FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orcamento_areas_area_id_fkey') THEN
    ALTER TABLE "orcamento_areas" ADD CONSTRAINT "orcamento_areas_area_id_fkey"
      FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orcamento_areas_habilitadas_area_id_fkey') THEN
    ALTER TABLE "orcamento_areas_habilitadas" ADD CONSTRAINT "orcamento_areas_habilitadas_area_id_fkey"
      FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
