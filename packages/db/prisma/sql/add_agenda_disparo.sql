-- ============================================================
-- Migration cirúrgica: AgendaDisparoConfig (singleton)
-- Disparo automático da "Agenda do Dia" via email
-- ============================================================

CREATE TABLE IF NOT EXISTS "agenda_disparo_config" (
  "id"                  TEXT PRIMARY KEY,
  "ativo"               BOOLEAN NOT NULL DEFAULT false,
  "horario"             TEXT NOT NULL DEFAULT '07:00',
  "diasSemana"          INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::INTEGER[],
  "destinatarios_ids"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ultimo_disparo_em"   TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL
);
