-- Isolamento multi-tenant da agenda (F-013). Idempotente.
-- Eventos/tarefas legados sem empresa_id são atribuídos à empresa do CRIADOR
-- (cada usuário pertence a um tenant). Sem isto, a listagem passa a filtrar por
-- empresa e os eventos com empresa_id NULL sumiriam até para o tenant dono.

UPDATE public.agenda_eventos e
SET empresa_id = u.empresa_id
FROM public.users u
WHERE e.criador_id = u.id
  AND e.empresa_id IS NULL
  AND u.empresa_id IS NOT NULL;

UPDATE public.agenda_tarefas t
SET empresa_id = u.empresa_id
FROM public.users u
WHERE t.criador_id = u.id
  AND t.empresa_id IS NULL
  AND u.empresa_id IS NOT NULL;
