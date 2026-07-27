-- #HLP0139 — Converte os antigos toggles de escopo do HelpDesk (scope_proprios /
-- scope_area / scope_todos) na escolha única `scope` ('proprios' | 'area' | 'todos').
--
-- O mais permissivo vence (preserva o que o usuário enxergava). As chaves antigas
-- são removidas. Se o registro já tiver `scope`, mantém a escolha e só limpa os
-- toggles antigos. Idempotente (só toca linhas do módulo helpdesk que ainda têm
-- alguma chave antiga).
UPDATE user_permissions
SET sub_permissions =
      (sub_permissions - 'scope_proprios' - 'scope_area' - 'scope_todos')
      || CASE
           WHEN sub_permissions ? 'scope' THEN '{}'::jsonb
           WHEN (sub_permissions->>'scope_todos')::boolean IS TRUE THEN jsonb_build_object('scope', 'todos')
           WHEN (sub_permissions->>'scope_area')::boolean IS TRUE THEN jsonb_build_object('scope', 'area')
           ELSE jsonb_build_object('scope', 'proprios')
         END
WHERE module_slug = 'helpdesk'
  AND (sub_permissions ? 'scope_proprios' OR sub_permissions ? 'scope_area' OR sub_permissions ? 'scope_todos');
