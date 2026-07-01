-- ============================================================
-- Seed do painel de TV "Portas VPS" (status do servidor).
-- Idempotente e não-destrutivo:
--   1) Localiza o painel do usuário (nome/slug contendo "vps"); se não existir,
--      cria um novo ('vps-status').
--   2) Só popula as folhas/blocos se o painel AINDA NÃO tiver nenhuma folha
--      (não sobrescreve edições feitas pelo master depois nem duplica no re-deploy).
-- Métricas: grupo "VPS / Servidor" (fonte `vps` — lida na própria VPS).
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  pid text;
  f text;
  tem_folhas boolean;
BEGIN
  -- 1) Acha o painel existente do usuário (mais antigo que casar com "vps").
  SELECT id INTO pid
  FROM tv_painel
  WHERE nome ILIKE '%vps%' OR slug ILIKE '%vps%'
  ORDER BY created_at ASC
  LIMIT 1;

  -- Fallback: cria um painel dedicado se nenhum for encontrado.
  IF pid IS NULL THEN
    pid := gen_random_uuid()::text;
    INSERT INTO tv_painel (id, slug, nome, accent, icon, slide_ms, periodo_dias, ordem, updated_at)
    VALUES (pid, 'vps-status', 'Portas VPS', '#22d3ee', 'Server', 15000, 30, 99, now());
  END IF;

  -- 2) Só monta se estiver vazio.
  SELECT EXISTS (SELECT 1 FROM tv_folha WHERE painel_id = pid) INTO tem_folhas;
  IF NOT tem_folhas THEN

    -- ── Folha 1: Recursos do servidor ──────────────────────────
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at)
    VALUES (f, pid, 'Recursos do servidor', 0, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'kpi',   'vps.cpu',         '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 1, 'kpi',   'vps.memoria',     '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 2, 'kpi',   'vps.disco',       '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 3, 'kpi',   'vps.uptime',      '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 4, 'donut', 'vps.memoriaDist', '{"colSpan":6}'::jsonb, now()),
      (gen_random_uuid()::text, f, 5, 'donut', 'vps.discoDist',   '{"colSpan":6}'::jsonb, now());

    -- ── Folha 2: Portas & status ───────────────────────────────
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at)
    VALUES (f, pid, 'Portas & status', 1, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'table', 'vps.portas',   '{"colSpan":7}'::jsonb, now()),
      (gen_random_uuid()::text, f, 1, 'table', 'vps.recursos', '{"colSpan":5}'::jsonb, now());

  END IF;
END $$;
