-- ============================================================
-- Migração: eventos do tipo "Tarefa" → tarefas simples (AgendaTarefa)
-- + backfill de membros nas tarefas existentes + desativar o tipo "Tarefa".
-- Idempotente: o backfill usa ON CONFLICT; o port consome os eventos
-- (is_active=false), então re-rodar não duplica.
-- Pré-requisito: tabela agenda_tarefa_participantes já criada
-- (add_agenda_tarefa_participantes.sql).
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Backfill: criador vira membro de TODA tarefa existente.
--    Tarefa já concluída → criador já "ciente" (ciente_em = concluida_em).
INSERT INTO agenda_tarefa_participantes (id, tarefa_id, usuario_id, ciente_em)
SELECT gen_random_uuid()::text, t.id, t.criador_id,
       CASE WHEN t.concluida THEN COALESCE(t.concluida_em, CURRENT_TIMESTAMP) ELSE NULL END
FROM agenda_tarefas t
ON CONFLICT (tarefa_id, usuario_id) DO NOTHING;

-- 2) Portar cada evento tipo "Tarefa" (ativo) → uma tarefa + membros; desativa o evento.
DO $$
DECLARE e record; new_id text;
BEGIN
  FOR e IN (
    SELECT ev.* FROM agenda_eventos ev JOIN agenda_tipos t ON t.id = ev.tipo_id
    WHERE lower(t.nome) LIKE '%tarefa%' AND ev.is_active = true
  ) LOOP
    new_id := gen_random_uuid()::text;
    INSERT INTO agenda_tarefas (id, titulo, descricao, prazo, hora_prazo, prioridade, concluida, criador_id, empresa_id, created_at, updated_at)
    VALUES (new_id, e.titulo, e.descricao, COALESCE(e.data_fim, e.data), e.hora_inicio, 'NORMAL', false, e.criador_id, e.empresa_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    -- membros: criador
    INSERT INTO agenda_tarefa_participantes (id, tarefa_id, usuario_id)
    VALUES (gen_random_uuid()::text, new_id, e.criador_id)
    ON CONFLICT (tarefa_id, usuario_id) DO NOTHING;

    -- membros: participantes do evento
    INSERT INTO agenda_tarefa_participantes (id, tarefa_id, usuario_id)
    SELECT gen_random_uuid()::text, new_id, p.usuario_id
    FROM agenda_participantes p
    WHERE p.evento_id = e.id AND p.usuario_id IS NOT NULL AND p.is_active = true
    ON CONFLICT (tarefa_id, usuario_id) DO NOTHING;

    -- consome o evento (não vaza mais; torna o port idempotente)
    UPDATE agenda_eventos SET is_active = false WHERE id = e.id;
  END LOOP;
END $$;

-- 3) Desativar o tipo de evento "Tarefa" (some do seletor de tipos; FK preservada).
UPDATE agenda_tipos SET is_active = false WHERE lower(nome) LIKE '%tarefa%';
