-- Controle de Férias: corrige a semântica do campo `historico` nos períodos
-- importados do v1.
--
-- O que estava errado: a carga leu `crp_ferias.historico = 1` como "período
-- arquivado". A tela do v1 faz o oposto — ela lista justamente
-- `WHERE historico = '1' AND ativo = '1'`, ou seja, **historico=1 é o período
-- VIGENTE do colaborador** (são os 29 registros que aparecem lá). Os
-- `historico = 0` são os períodos anteriores e os `ativo = 0`, os excluídos.
--
-- Resultado: no v2, `historico = false` passa a significar "período vigente"
-- (aparece no filtro "Em aberto") e `true`, "período encerrado/arquivado".
-- Só mexe em quem veio do v1 (legacy_id não nulo); idempotente.
UPDATE ferias_periodos SET historico = true WHERE legacy_id IS NOT NULL AND historico = false;

UPDATE ferias_periodos SET historico = false
WHERE legacy_id IN (
  -- SELECT id FROM crp_ferias WHERE historico='1' AND ativo='1' (29 vigentes, 1 por colaborador)
  110, 114, 117, 118, 122, 123, 124, 130, 131, 132, 134, 138, 139, 140, 141,
  144, 146, 149, 150, 151, 152, 153, 154, 155, 156, 157, 159, 161, 163
);
