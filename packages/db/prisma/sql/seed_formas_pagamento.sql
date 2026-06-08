-- ============================================================
-- Seed: Formas de Pagamento dos orçamentos (#HLP0090)
-- Popula opcoes_cadastro (tipo='FORMA_PAGAMENTO') com as opções
-- ATIVAS do módulo legado crp_orcamentos (tabela com_orc_ven, ativo=1).
-- Idempotente: só insere o que ainda não existe (por tipo+valor).
-- Globais (empresa_id NULL) — visíveis a todas as empresas.
-- ============================================================

INSERT INTO opcoes_cadastro (id, tipo, valor, ordem, ativo, empresa_id)
SELECT gen_random_uuid()::text, 'FORMA_PAGAMENTO', v.valor, v.ordem, true, NULL
FROM (VALUES
  ('A Vista', 1),
  ('Boleto', 2),
  ('30 Dias', 3),
  ('50% a vista e 50% para 30 dias', 4),
  ('02 Parcelas - 1ª parcela A Vista e 2ª parcela 30 dias', 5),
  ('03 Parcelas (A Vista, 30 dias e 60 dias)', 6),
  ('04 Parcelas (A Vista - 30 - 60 - 90 dias)', 7),
  ('06 Parcelas (a vista - 30 - 60 - 90 - 120 dias)', 8),
  ('A Combinar Com o Financeiro', 9),
  ('Na entrega do serviço', 10),
  ('Mensal - Vencimento do boleto no último dia útil do mês', 11),
  ('Conforme descrito no orçamento', 12),
  ('Cortesia (Serviço não será cobrado)', 13)
) AS v(valor, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM opcoes_cadastro o
  WHERE o.tipo = 'FORMA_PAGAMENTO' AND o.valor = v.valor
);
