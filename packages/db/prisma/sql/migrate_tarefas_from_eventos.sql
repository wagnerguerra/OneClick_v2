-- ============================================================
-- Migra registros legados onde agenda_eventos.is_tarefa = true
-- pra a nova tabela agenda_tarefas. Soft-deleta o evento original
-- depois de copiar. Idempotente: chave (criador_id + titulo + data).
--
-- Roda no stage SQL do Service Manager — pode rodar várias vezes
-- sem duplicar (NOT EXISTS).
-- ============================================================

-- Só roda se a tabela destino existe (em ambientes onde a migration
-- de tarefas já foi aplicada).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agenda_tarefas'
  ) THEN
    RAISE NOTICE 'agenda_tarefas ainda nao existe, pulando migracao';
    RETURN;
  END IF;

  -- Copia
  INSERT INTO agenda_tarefas (id, titulo, descricao, prazo, hora_prazo, criador_id, empresa_id, created_at, updated_at)
  SELECT
    'tk' || replace(gen_random_uuid()::text, '-', ''),
    e.titulo,
    e.descricao,
    e.data,
    e.hora_inicio,
    e.criador_id,
    e.empresa_id,
    e.created_at,
    e.updated_at
  FROM agenda_eventos e
  WHERE e.is_tarefa = true
    AND e.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM agenda_tarefas t
      WHERE t.criador_id = e.criador_id
        AND t.titulo = e.titulo
        AND t.prazo = e.data
    );

  -- Soft-delete dos eventos migrados
  UPDATE agenda_eventos e
  SET is_active = false
  WHERE e.is_tarefa = true
    AND e.is_active = true
    AND EXISTS (
      SELECT 1 FROM agenda_tarefas t
      WHERE t.criador_id = e.criador_id
        AND t.titulo = e.titulo
        AND t.prazo = e.data
    );
END $$;
