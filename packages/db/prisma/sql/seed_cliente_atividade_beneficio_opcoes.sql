-- ============================================================
-- Seed: catálogo de Atividades e Benefícios fiscais do cliente (#5/#6)
-- Popula opcoes_cadastro (tipo='CLIENTE_ATIVIDADE' / 'CLIENTE_BENEFICIO').
-- Usado pelos selects dos modais "Nova atividade" / "Novo Benefício".
-- Idempotente: só insere o que ainda não existe (por tipo+valor).
-- Globais (empresa_id NULL) — visíveis a todas as empresas.
-- ============================================================

-- ATIVIDADES
INSERT INTO opcoes_cadastro (id, tipo, valor, ordem, ativo, empresa_id)
SELECT gen_random_uuid()::text, 'CLIENTE_ATIVIDADE', v.valor, v.ordem, true, NULL
FROM (VALUES
  ('Comércio', 1),
  ('Indústria', 2),
  ('Importação', 3),
  ('Serviço', 4),
  ('Telecomunicações', 5),
  ('Transportadora', 6)
) AS v(valor, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM opcoes_cadastro o
  WHERE o.tipo = 'CLIENTE_ATIVIDADE' AND o.valor = v.valor
);

-- BENEFÍCIOS FISCAIS
-- Combina a lista pedida (#6) com os relevantes/ativos do dump legado
-- cad_cli_beneficios (Fundap, Invest, Compete Atacadista, Contribuinte
-- Substituto, Compete E-commerce, Compete Bares e Restaurantes, etc.).
INSERT INTO opcoes_cadastro (id, tipo, valor, ordem, ativo, empresa_id)
SELECT gen_random_uuid()::text, 'CLIENTE_BENEFICIO', v.valor, v.ordem, true, NULL
FROM (VALUES
  ('SUBSTITUTO', 1),
  ('COMPETE ATACADISTA', 2),
  ('FUNDAP', 3),
  ('INVEST', 4),
  ('COMPETE IND PAPELAO MAT PLAST', 5),
  ('COMPETE SETOR IND GRAFICAS', 6),
  ('COMPETE VAREJISTA', 7),
  ('Invest Importação', 8),
  ('Compete Metalmecânico', 9),
  ('Compete Bares e Restaurantes', 10),
  ('Compete E-commerce', 11),
  ('Crédito Presumido em 20% (Transp)', 12),
  ('Compete Atacadista / Contribuinte Substituto', 13),
  ('Compete E-commerce / Contribuinte Substituto', 14)
) AS v(valor, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM opcoes_cadastro o
  WHERE o.tipo = 'CLIENTE_BENEFICIO' AND o.valor = v.valor
);
