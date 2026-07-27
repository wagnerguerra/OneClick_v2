-- #HLP0139 — "mover_kanban" e "nota_interna" foram embutidas em "atuar como
-- agente" (atuar_agente) e removidas do catálogo de permissões do HelpDesk.
-- Este script apenas limpa as chaves órfãs dos registros existentes; não muda
-- comportamento (as duas nunca eram checadas — o gate real sempre foi o
-- canAtuarAgente). Idempotente.
UPDATE user_permissions
SET sub_permissions = sub_permissions - 'mover_kanban' - 'nota_interna'
WHERE module_slug = 'helpdesk'
  AND (sub_permissions ? 'mover_kanban' OR sub_permissions ? 'nota_interna');
