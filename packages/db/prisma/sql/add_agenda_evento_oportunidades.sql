-- Junção N:N evento da agenda ↔ card do CRM (vários cards por evento).
-- O model (AgendaEventoOportunidade) existe no schema.prisma; o prisma db push cria
-- a tabela. Este SQL é defensivo (CREATE ... IF NOT EXISTS) + faz o BACKFILL: cada
-- vínculo único existente (agenda_eventos.oportunidade_id) vira o card PRINCIPAL
-- (ordem 0). Idempotente: ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS agenda_evento_oportunidades (
  id              text PRIMARY KEY,
  evento_id       text NOT NULL,
  oportunidade_id text NOT NULL,
  ordem           integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agenda_evento_oportunidades_evento_id_oportunidade_id_key
  ON agenda_evento_oportunidades (evento_id, oportunidade_id);
CREATE INDEX IF NOT EXISTS agenda_evento_oportunidades_evento_id_idx
  ON agenda_evento_oportunidades (evento_id);
CREATE INDEX IF NOT EXISTS agenda_evento_oportunidades_oportunidade_id_idx
  ON agenda_evento_oportunidades (oportunidade_id);

INSERT INTO agenda_evento_oportunidades (id, evento_id, oportunidade_id, ordem, created_at)
SELECT gen_random_uuid()::text, e.id, e.oportunidade_id, 0, now()
FROM agenda_eventos e
WHERE e.oportunidade_id IS NOT NULL
ON CONFLICT (evento_id, oportunidade_id) DO NOTHING;
