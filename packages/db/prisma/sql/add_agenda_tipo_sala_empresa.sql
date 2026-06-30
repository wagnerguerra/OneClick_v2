-- Isolamento multi-tenant de tipos/salas da agenda (F-013). Idempotente.
-- empresa_id NULL = catálogo GLOBAL compartilhado (default p/ todos os tenants);
-- empresa_id set = específico do tenant. listTipos/listSalas retornam
-- (empresa_id IS NULL OR empresa_id = <empresa da sessão>).

ALTER TABLE "agenda_tipos" ADD COLUMN IF NOT EXISTS "empresa_id" TEXT;
ALTER TABLE "agenda_salas" ADD COLUMN IF NOT EXISTS "empresa_id" TEXT;

-- Tipos/salas EXISTENTES eram da org original (todos os eventos atuais usam a
-- empresa mais antiga) → atribui à empresa mais antiga. Exclui os defaults
-- globais (ids 'agtipo_g_%') para não movê-los em re-execução.
UPDATE "agenda_tipos"
SET "empresa_id" = (SELECT "id" FROM "empresas" ORDER BY "created_at" ASC LIMIT 1)
WHERE "empresa_id" IS NULL AND "id" NOT LIKE 'agtipo_g_%';

UPDATE "agenda_salas"
SET "empresa_id" = (SELECT "id" FROM "empresas" ORDER BY "created_at" ASC LIMIT 1)
WHERE "empresa_id" IS NULL;

-- Defaults GLOBAIS (empresa_id NULL) — todo tenant (inclusive novos) enxerga.
-- Genéricos, sem dados de nenhum tenant. ids fixos = idempotente via ON CONFLICT.
INSERT INTO "agenda_tipos"
  ("id","empresa_id","nome","cor","cor_borda","cor_texto","bloqueia_agenda",
   "permite_modalidade","permite_sala","permite_garagem","permite_equipamentos",
   "salas_permitidas","is_active","created_at","updated_at")
VALUES
  ('agtipo_g_reuniao',     NULL,'Reunião',     '#3b82f6','#2563eb','#ffffff', true,  true,  true,  false, true,  '{}', true, now(), now()),
  ('agtipo_g_compromisso', NULL,'Compromisso', '#8b5cf6','#7c3aed','#ffffff', true,  false, false, false, false, '{}', true, now(), now()),
  ('agtipo_g_lembrete',    NULL,'Lembrete',    '#f59e0b','#d97706','#ffffff', false, false, false, false, false, '{}', true, now(), now()),
  ('agtipo_g_ausencia',    NULL,'Ausência',    '#ef4444','#dc2626','#ffffff', true,  false, false, false, false, '{}', true, now(), now()),
  ('agtipo_g_ferias',      NULL,'Férias',      '#06b6d4','#0891b2','#ffffff', true,  false, false, false, false, '{}', true, now(), now())
ON CONFLICT ("id") DO NOTHING;
