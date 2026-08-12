-- Preserva o acesso atual ao passar a exigir as sub-permissões de Elogios,
-- Sugestões e Reclamações.
--
-- O catálogo já listava `registrar`, mas o `criar` exigia apenas a escrita do
-- módulo — o interruptor aparecia na tela de permissões e não segurava nada.
-- Agora ele segura, e `excluir` passa a existir (no legado, excluir era do
-- nível de administração: `If SGQ_ELO = "3"` em sgq_elogios/details.asp).
--
-- Sem este backfill a mudança TIRARIA acesso de quem já trabalha: em produção,
-- 4 usuários têm escrita em cada um dos três módulos e apenas 1 tem `registrar`
-- marcada. Os outros 3 receberiam "Sem permissão para: Registrar
-- manifestacoes" no primeiro clique, sem nada ter mudado para eles.
--
-- A regra é conservadora e vale uma vez: quem PODIA fazer, continua podendo.
-- O ganho da mudança não é tirar acesso agora — é o controle passar a existir,
-- para que o Wagner possa tirar de quem deve, na tela de permissões.
--
-- Idempotente: só escreve onde a chave ainda não existe.

-- `registrar` para quem já tem escrita no módulo.
UPDATE user_permissions
   SET sub_permissions = COALESCE(sub_permissions, '{}'::jsonb) || '{"registrar": true}'::jsonb
 WHERE module_slug IN ('elogios', 'sugestoes', 'reclamacoes')
   AND can_write
   AND NOT (COALESCE(sub_permissions, '{}'::jsonb) ? 'registrar');

-- `excluir` para quem já tem exclusão no módulo.
UPDATE user_permissions
   SET sub_permissions = COALESCE(sub_permissions, '{}'::jsonb) || '{"excluir": true}'::jsonb
 WHERE module_slug IN ('elogios', 'sugestoes', 'reclamacoes')
   AND can_delete
   AND NOT (COALESCE(sub_permissions, '{}'::jsonb) ? 'excluir');

-- `revelar_anonima` saiu do catálogo: não era referenciada em lugar nenhum do
-- código e, por desenho, não poderia fazer nada — manifestação anônima não
-- guarda autor. Limpa a chave órfã para a tela não exibir um resto sem dono.
UPDATE user_permissions
   SET sub_permissions = sub_permissions - 'revelar_anonima'
 WHERE module_slug IN ('elogios', 'sugestoes', 'reclamacoes')
   AND sub_permissions ? 'revelar_anonima';
