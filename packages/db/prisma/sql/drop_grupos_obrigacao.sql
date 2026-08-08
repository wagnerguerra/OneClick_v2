-- Frente 3.5 (parte 3/3) — dropa o sistema de template legado GrupoObrigacao.
--
-- Roda SOMENTE depois de:
--   1. migrate_grupo_obrigacao_to_servico_grupo.sql (os templates já viraram
--      ServicoGrupo tipo=OBRIGACOES), e
--   2. drop_cliente_obrigacao_vindo_de_template.sql — OBRIGATÓRIO antes daqui:
--      cliente_obrigacoes.vindo_de_template_id é FK pra grupos_obrigacao; sem
--      remover essa coluna primeiro, o DROP TABLE abaixo falha por dependência.
-- (nada mais lê essas tabelas depois do refocus do módulo cliente-obrigacao.)
--
-- Destrutivo e irreversível. Idempotente (IF EXISTS): rodar de novo não faz nada.
-- Ordem interna: a pivô (com FK) antes do pai.

DROP TABLE IF EXISTS grupos_obrigacao_itens;
DROP TABLE IF EXISTS grupos_obrigacao;
