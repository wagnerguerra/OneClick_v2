-- Vínculo opcional AgendaTarefa -> Oportunidade: a "tarefa do CRM" passa a ser
-- uma AgendaTarefa com oportunidade_id preenchido (integra à lista de tarefas do
-- usuário e herda lembretes/scheduler da agenda). SetNull: excluir a oportunidade
-- apenas desvincula a tarefa, sem apagá-la.
ALTER TABLE "agenda_tarefas" ADD COLUMN "oportunidade_id" TEXT;
CREATE INDEX "agenda_tarefas_oportunidade_id_idx" ON "agenda_tarefas"("oportunidade_id");
ALTER TABLE "agenda_tarefas"
  ADD CONSTRAINT "agenda_tarefas_oportunidade_id_fkey"
  FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Migração das tarefas legadas do CRM (oportunidade_tarefas) para agenda_tarefas.
-- criador = responsável da tarefa OU, na falta, responsável da oportunidade.
-- prazo = prazo da tarefa OU, na falta, a data de criação (AgendaTarefa.prazo é NOT NULL).
INSERT INTO "agenda_tarefas"
  (id, titulo, descricao, prazo, hora_prazo, concluida, concluida_em,
   prioridade, is_active, criador_id, empresa_id, oportunidade_id, created_at, updated_at)
SELECT
  t.id,
  t.titulo,
  NULL,
  COALESCE(t.prazo::date, t.created_at::date),
  NULL,
  t.concluida,
  CASE WHEN t.concluida THEN t.created_at ELSE NULL END,
  'NORMAL',
  true,
  COALESCE(t.responsavel_id, o.responsavel_id),
  o.empresa_id,
  t.oportunidade_id,
  t.created_at,
  t.created_at
FROM "oportunidade_tarefas" t
JOIN "oportunidades" o ON o.id = t.oportunidade_id
WHERE COALESCE(t.responsavel_id, o.responsavel_id) IS NOT NULL;

-- Cada tarefa precisa do criador como membro (paridade com setMembros do service:
-- a lista e o "dar ciência" dependem da linha de participante do criador).
INSERT INTO "agenda_tarefa_participantes" (id, tarefa_id, usuario_id, created_at)
SELECT 'mig_' || at.id, at.id, at.criador_id, at.created_at
FROM "agenda_tarefas" at
WHERE at.oportunidade_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "agenda_tarefa_participantes" p
    WHERE p.tarefa_id = at.id AND p.usuario_id = at.criador_id
  );

-- Aposenta a tabela antiga de tarefas do CRM (cutover concluído).
DROP TABLE "oportunidade_tarefas";
