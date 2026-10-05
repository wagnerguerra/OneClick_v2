-- #HLP0386 — Certificados do mesmo documento vigentes ao mesmo tempo.
--
-- A partir deste deploy, cadastrar um certificado de um CPF/CNPJ que já tem
-- um vigente substitui o anterior (substituicao-certificado.ts). Os casos de
-- antes da regra (em 28/09/2026 eram 2 documentos) são acertados aqui do mesmo
-- jeito: por empresa + documento do certificado, o de validade mais longa fica
-- vigente e os outros viram RENOVADO (saem da listagem e dos contadores, mas
-- continuam na cadeia de versões). Só dados — nenhum DDL.

WITH vigentes AS (
  SELECT id, empresa_id, documento, parent_id,
         ROW_NUMBER() OVER (PARTITION BY empresa_id, documento ORDER BY expira_em DESC, created_at DESC) AS pos
  FROM certificados_digitais
  WHERE status IN ('ATIVO', 'EXPIRADO') AND NOT arquivado AND documento <> ''
),
grupos AS (
  SELECT empresa_id, documento FROM vigentes GROUP BY 1, 2 HAVING COUNT(*) > 1
),
mantido AS (
  SELECT v.* FROM vigentes v JOIN grupos g USING (empresa_id, documento) WHERE v.pos = 1
),
substituidos AS (
  SELECT v.*, m.id AS novo_id FROM vigentes v
  JOIN grupos g USING (empresa_id, documento)
  JOIN mantido m ON m.empresa_id IS NOT DISTINCT FROM v.empresa_id AND m.documento = v.documento
  WHERE v.pos > 1
),
encadeia AS (
  -- O vigente passa a apontar para o anterior mais recente (se ainda não aponta).
  UPDATE certificados_digitais c SET parent_id = s.id
  FROM substituidos s
  WHERE c.id = s.novo_id AND s.pos = 2 AND c.parent_id IS NULL
  RETURNING c.id
),
marca AS (
  UPDATE certificados_digitais c SET status = 'RENOVADO'
  FROM substituidos s WHERE c.id = s.id
  RETURNING c.id, s.novo_id
)
INSERT INTO certificados_digitais_acessos (id, certificado_id, user_id, acao, detalhes, created_at)
SELECT gen_random_uuid()::text, m.id, NULL, 'renovado',
       'Substituído pela versão ' || m.novo_id || ' (mesmo documento — acerto do #HLP0386)', now()
FROM marca m;
