-- Área do serviço: de NOME para ID — ETAPA 2 de 2 (DROP da coluna antiga).
--
-- Roda SOMENTE depois de add_servico_area_id.sql e de conferir o backfill:
--   SELECT count(*) FROM servicos
--   WHERE categoria IS NOT NULL AND btrim(categoria) <> '' AND area_id IS NULL
--     AND eh_obrigacao_acessoria = false;
-- Cada linha desse count é um serviço (não-obrigação) cuja categoria (nome) NÃO
-- tem Area na sua empresa — ao dropar, esse nome se perde. Registre a Area e
-- re-rode a etapa 1 antes, ou aceite que esses serviços fiquem "sem área".
-- (Obrigações acessórias já tiveram a categoria preservada em categoria_obrigacao.)
--
-- Destrutivo e irreversível. Idempotente (IF EXISTS): rodar de novo não faz nada.

ALTER TABLE servicos DROP COLUMN IF EXISTS categoria;
