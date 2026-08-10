-- Frente 2.5 (passo final) — dropa a coluna-ponte categoria_obrigacao.
--
-- A área das obrigações acessórias passou a ser a relação real Servico.areaId → Area.
-- Todos os leitores foram migrados (display por area.name; autorização e claim-first
-- por areaId) e o backfill (backfill_obrigacao_area_id.sql) já preencheu o areaId.
--
-- Roda SOMENTE depois do backfill e de conferir que nenhuma obrigação ficou sem área:
--   SELECT count(*) FROM servicos
--   WHERE eh_obrigacao_acessoria AND area_id IS NULL
--     AND categoria_obrigacao IS NOT NULL AND btrim(categoria_obrigacao) <> '';
-- Em prod esse count é 0 (48/48 casaram — conferido read-only).
--
-- Destrutivo e irreversível. Idempotente (IF EXISTS): rodar de novo não faz nada.

ALTER TABLE servicos DROP COLUMN IF EXISTS categoria_obrigacao;
