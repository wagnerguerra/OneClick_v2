-- Frente 3.5 (parte 3/3) — dropa o sistema de template legado GrupoObrigacao.
--
-- Roda SOMENTE depois de migrate_grupo_obrigacao_to_servico_grupo.sql (os templates
-- já viraram ServicoGrupo tipo=OBRIGACOES) e do refocus do módulo cliente-obrigacao
-- (nada mais lê essas tabelas).
--
-- Destrutivo e irreversível. Idempotente (IF EXISTS): rodar de novo não faz nada.
-- Ordem: a pivô (com FK) antes do pai.

DROP TABLE IF EXISTS grupos_obrigacao_itens;
DROP TABLE IF EXISTS grupos_obrigacao;
