-- #HLP0289 — serviços MENSAIS fora dos totais do orçamento.
--
-- A partir deste deploy, recalcularTotais deixa o serviço mensal (recorrente)
-- fora do total e grava a soma dele em total_mensal_separado — a menos que a
-- config "Somar serviços mensais nos totais" esteja marcada. Este arquivo aplica
-- a mesma conta aos orçamentos ainda em negociação (NOVO, A_ENVIAR, ENVIADO);
-- aprovados em diante mantêm o valor fechado com o cliente.
--
-- Mesma regra do service: item SERVICO cujo serviço é recorrente_mensal ou
-- categoria MENSAL; desconto por item limitado ao subtotal; desconto geral só
-- quando "apenas desconto por item" está desmarcado (config da empresa por cima
-- da global). Orçamento sem item mensal só ganha total_mensal_separado = 0 —
-- os totais dele não são tocados.
--
-- Idempotente: só toca linhas com total_mensal_separado ainda nulo.
WITH alvo AS (
  SELECT o.id, o.empresa_id, coalesce(o.desconto_pct, 0) AS dpct, coalesce(o.desconto_valor, 0) AS dfix,
    coalesce(
      (SELECT split_part(c.valor, '=', 2) FROM opcoes_cadastro c WHERE c.tipo = 'ORCAMENTO_CONFIG' AND c.valor LIKE 'somar_servicos_mensais=%' AND c.empresa_id = o.empresa_id LIMIT 1),
      (SELECT split_part(c.valor, '=', 2) FROM opcoes_cadastro c WHERE c.tipo = 'ORCAMENTO_CONFIG' AND c.valor LIKE 'somar_servicos_mensais=%' AND c.empresa_id IS NULL LIMIT 1),
      '0') AS somar,
    coalesce(
      (SELECT split_part(c.valor, '=', 2) FROM opcoes_cadastro c WHERE c.tipo = 'ORCAMENTO_CONFIG' AND c.valor LIKE 'apenas_desconto_item=%' AND c.empresa_id = o.empresa_id LIMIT 1),
      (SELECT split_part(c.valor, '=', 2) FROM opcoes_cadastro c WHERE c.tipo = 'ORCAMENTO_CONFIG' AND c.valor LIKE 'apenas_desconto_item=%' AND c.empresa_id IS NULL LIMIT 1),
      '1') AS apenas
  FROM orcamentos o
  WHERE o.status IN ('NOVO', 'A_ENVIAR', 'ENVIADO') AND o.total_mensal_separado IS NULL
),
it AS (
  SELECT i.orcamento_id, i.tipo,
    i.quantidade * i.valor_unitario AS sub,
    CASE WHEN i.tipo = 'SERVICO'
      THEN greatest(0, least(i.quantidade * i.valor_unitario,
             i.quantidade * i.valor_unitario * coalesce(i.desconto_pct, 0) / 100 + coalesce(i.desconto_valor, 0)))
      ELSE 0 END AS dit,
    (i.tipo = 'SERVICO' AND a.somar <> '1' AND EXISTS (
      SELECT 1 FROM servicos s WHERE s.id = i.catalogo_id
         AND (s.recorrente_mensal OR s.categoria_servico::text = 'MENSAL'))) AS fora
  FROM orcamento_itens i JOIN alvo a ON a.id = i.orcamento_id
),
tot AS (
  SELECT a.id, a.dpct, a.dfix, a.apenas,
    coalesce(sum(it.sub) FILTER (WHERE it.tipo = 'SERVICO' AND NOT it.fora), 0) AS ts,
    coalesce(sum(it.sub) FILTER (WHERE it.tipo = 'TAXA'), 0)                     AS tt,
    coalesce(sum(it.sub) FILTER (WHERE it.tipo = 'DESPESA'), 0)                  AS td,
    round(coalesce(sum(it.dit) FILTER (WHERE it.tipo = 'SERVICO' AND NOT it.fora), 0), 2) AS di,
    coalesce(sum(it.sub - it.dit) FILTER (WHERE it.fora), 0)                     AS tm,
    coalesce(bool_or(it.fora), false)                                            AS tem_fora
  FROM alvo a LEFT JOIN it ON it.orcamento_id = a.id
  GROUP BY a.id, a.dpct, a.dfix, a.apenas
),
conta AS (
  SELECT t.*,
    least(t.ts, round(t.di + CASE WHEN t.apenas = '1' THEN 0 ELSE round(t.ts * t.dpct / 100 + t.dfix, 2) END, 2)) AS da
  FROM tot t
)
UPDATE orcamentos o
   SET total_mensal_separado = round(c.tm, 2),
       total_servicos    = CASE WHEN c.tem_fora THEN round(c.ts, 2) ELSE o.total_servicos END,
       total_taxas       = CASE WHEN c.tem_fora THEN round(c.tt, 2) ELSE o.total_taxas END,
       total_despesas    = CASE WHEN c.tem_fora THEN round(c.td, 2) ELSE o.total_despesas END,
       desconto_aplicado = CASE WHEN c.tem_fora THEN c.da ELSE o.desconto_aplicado END,
       total_geral       = CASE WHEN c.tem_fora THEN greatest(0, round(c.ts + c.tt + c.td - c.da, 2)) ELSE o.total_geral END
  FROM conta c
 WHERE c.id = o.id;
