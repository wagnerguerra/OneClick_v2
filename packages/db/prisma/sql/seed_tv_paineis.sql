-- ============================================================
-- Seed dos painéis "comercial" e "helpdesk" no builder de TV.
-- Idempotente: só insere se a slug ainda não existir (não sobrescreve
-- edições feitas pelo master depois). Reproduz os painéis que eram fixos.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── COMERCIAL ───────────────────────────────────────────────────
DO $$
DECLARE pid text; f text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tv_painel WHERE slug = 'comercial') THEN
    pid := gen_random_uuid()::text;
    INSERT INTO tv_painel (id, slug, nome, accent, icon, slide_ms, periodo_dias, ordem, updated_at)
    VALUES (pid, 'comercial', 'Painel Comercial', '#fb7185', 'Gauge', 18000, 90, 0, now());

    -- Folha 1: Visão Geral (3 linhas: CRM / Orçamentos / Contratos)
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at) VALUES (f, pid, 'Visão Geral', 0, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'kpi', 'comercial.oportunidades',     '{"colSpan":4}'::jsonb, now()),
      (gen_random_uuid()::text, f, 1, 'kpi', 'comercial.pipeline',          '{"colSpan":4}'::jsonb, now()),
      (gen_random_uuid()::text, f, 2, 'kpi', 'comercial.conversao',         '{"colSpan":4}'::jsonb, now()),
      (gen_random_uuid()::text, f, 3, 'kpi', 'comercial.orcEmAberto',       '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 4, 'kpi', 'comercial.orcValorPendente',  '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 5, 'kpi', 'comercial.taxaAprovacao',     '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 6, 'kpi', 'comercial.orcAtrasados',      '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 7, 'kpi', 'comercial.mrr',               '{"colSpan":4}'::jsonb, now()),
      (gen_random_uuid()::text, f, 8, 'kpi', 'comercial.vigentes',          '{"colSpan":4}'::jsonb, now()),
      (gen_random_uuid()::text, f, 9, 'kpi', 'comercial.aVencer30',         '{"colSpan":4}'::jsonb, now());

    -- Folha 2: CRM · Funil
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at) VALUES (f, pid, 'CRM · Funil de vendas', 1, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'bar', 'comercial.funil',     '{"colSpan":8}'::jsonb, now()),
      (gen_random_uuid()::text, f, 1, 'kpi', 'comercial.conversao', '{"colSpan":4,"size":"hero"}'::jsonb, now());

    -- Folha 3: Orçamentos
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at) VALUES (f, pid, 'Orçamentos', 2, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'donut', 'comercial.orcStatus',     '{"colSpan":6}'::jsonb, now()),
      (gen_random_uuid()::text, f, 1, 'kpi',   'comercial.taxaAprovacao', '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 2, 'kpi',   'comercial.orcAtrasados',  '{"colSpan":3}'::jsonb, now());

    -- Folha 4: Contratos
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at) VALUES (f, pid, 'Contratos · Carteira', 3, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'donut', 'comercial.contratoStatus',    '{"colSpan":5}'::jsonb, now()),
      (gen_random_uuid()::text, f, 1, 'bar',   'comercial.evolucaoContratos', '{"colSpan":7}'::jsonb, now());

    -- Folha 5: Desempenho (CRM)
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at) VALUES (f, pid, 'Desempenho por responsável', 4, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'table', 'comercial.desempenho', '{"colSpan":12}'::jsonb, now());

    -- Folha 6: Contratos a vencer
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at) VALUES (f, pid, 'Contratos a vencer', 5, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'table', 'comercial.aVencer', '{"colSpan":12}'::jsonb, now());
  END IF;
END $$;

-- ── HELPDESK ────────────────────────────────────────────────────
DO $$
DECLARE pid text; f text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tv_painel WHERE slug = 'helpdesk') THEN
    pid := gen_random_uuid()::text;
    INSERT INTO tv_painel (id, slug, nome, accent, icon, slide_ms, periodo_dias, ordem, updated_at)
    VALUES (pid, 'helpdesk', 'Painel de TI · Helpdesk', '#22d3ee', 'Headphones', 18000, 30, 1, now());

    -- Folha 1: Visão Geral
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at) VALUES (f, pid, 'Visão Geral', 0, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'kpi', 'helpdesk.backlog',    '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 1, 'kpi', 'helpdesk.atrasados',  '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 2, 'kpi', 'helpdesk.criados',    '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 3, 'kpi', 'helpdesk.resolvidos', '{"colSpan":3}'::jsonb, now()),
      (gen_random_uuid()::text, f, 4, 'kpi', 'helpdesk.sla',        '{"colSpan":4}'::jsonb, now()),
      (gen_random_uuid()::text, f, 5, 'kpi', 'helpdesk.csat',       '{"colSpan":4}'::jsonb, now()),
      (gen_random_uuid()::text, f, 6, 'kpi', 'helpdesk.mttr',       '{"colSpan":4}'::jsonb, now());

    -- Folha 2: Backlog
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at) VALUES (f, pid, 'Backlog · status e prioridade', 1, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'donut', 'helpdesk.porStatus',     '{"colSpan":6}'::jsonb, now()),
      (gen_random_uuid()::text, f, 1, 'bar',   'helpdesk.porPrioridade', '{"colSpan":6}'::jsonb, now());

    -- Folha 3: Fluxo e categorias
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at) VALUES (f, pid, 'Fluxo e categorias', 2, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'bar',   'helpdesk.serie',       '{"colSpan":8}'::jsonb, now()),
      (gen_random_uuid()::text, f, 1, 'table', 'helpdesk.porCategoria', '{"colSpan":4}'::jsonb, now());

    -- Folha 4: Desempenho por agente
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at) VALUES (f, pid, 'Desempenho por agente', 3, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'table', 'helpdesk.porAgente', '{"colSpan":12}'::jsonb, now());

    -- Folha 5: SLA estourado
    f := gen_random_uuid()::text;
    INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at) VALUES (f, pid, 'SLA estourado · ação imediata', 4, 12, now());
    INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES
      (gen_random_uuid()::text, f, 0, 'table', 'helpdesk.slaEstourados', '{"colSpan":12}'::jsonb, now());
  END IF;
END $$;
