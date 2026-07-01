-- ============================================================
-- Painel de TV "Portas VPS" (status do servidor) — layout organizado.
-- Idempotente + reorganização ONE-TIME:
--   1) Localiza o painel do usuário (nome/slug com "vps"); se não existir, cria.
--   2) Se AINDA NÃO tem o layout novo (sentinela = folha 'Recursos do servidor'),
--      ZERA as folhas do painel e reconstrói organizado. Depois disso, re-deploys
--      são no-op (não sobrescrevem edições que você fizer, desde que a folha
--      'Recursos do servidor' continue existindo).
--
-- Layout (2 folhas que giram na TV):
--   Folha 1 "Recursos do servidor": CPU/Memória/Disco/Uptime (KPIs) + tabela de
--     Portas (alta, à esquerda) + donuts de Memória e Disco (à direita).
--   Folha 2 "Containers Docker": KPI "Containers no ar" + Load + tabela de
--     containers (larga, todos os containers).
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  pid text;
  f text;
BEGIN
  -- 1) Painel existente (mais antigo que casar com "vps"); senão cria.
  SELECT id INTO pid
  FROM tv_painel
  WHERE nome ILIKE '%vps%' OR slug ILIKE '%vps%'
  ORDER BY created_at ASC
  LIMIT 1;

  IF pid IS NULL THEN
    pid := gen_random_uuid()::text;
    INSERT INTO tv_painel (id, slug, nome, accent, icon, slide_ms, periodo_dias, ordem, updated_at)
    VALUES (pid, 'vps-status', 'Portas VPS', '#22d3ee', 'Server', 15000, 30, 99, now());
  END IF;

  -- 2) Reorganiza uma vez (sentinela = folha 'Recursos do servidor').
  IF NOT EXISTS (SELECT 1 FROM tv_folha WHERE painel_id = pid AND titulo = 'Recursos do servidor') THEN
    DELETE FROM tv_folha WHERE painel_id = pid;  -- blocos caem por ON DELETE CASCADE

    -- ── Folha 1: Recursos do servidor ──────────────────────────
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at)
    VALUES (f, pid, 'Recursos do servidor', 0, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'kpi',   'vps.cpu',         '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 1, 'kpi',   'vps.memoria',     '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 2, 'kpi',   'vps.disco',       '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 3, 'kpi',   'vps.uptime',      '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 4, 'table', 'vps.portas',      '{"colSpan":6,"rowSpan":2}'::jsonb, now()),
      (gen_random_uuid()::text, f, 5, 'donut', 'vps.memoriaDist', '{"colSpan":6}'::jsonb, now()),
      (gen_random_uuid()::text, f, 6, 'donut', 'vps.discoDist',   '{"colSpan":6}'::jsonb, now());

    -- ── Folha 2: Containers Docker ─────────────────────────────
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at)
    VALUES (f, pid, 'Containers Docker', 1, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'kpi',   'vps.dockerUp', '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 1, 'table', 'vps.docker',   '{"colSpan":9,"rowSpan":2,"limite":12}'::jsonb, now()),
      (gen_random_uuid()::text, f, 2, 'kpi',   'vps.load',     '{"colSpan":3}'::jsonb, now());
  END IF;
END $$;
