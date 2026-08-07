-- Frente 2.5 — backfill de Servico.areaId nas obrigações acessórias a partir do
-- categoria_obrigacao (nome da área), ANTES de dropar a coluna-ponte.
--
-- Só toca obrigações (eh_obrigacao_acessoria) com area_id NULL e categoria_obrigacao
-- preenchida — preserva quem já tem área real. Casa Area por nome (case/trim-insensitive),
-- preferindo a área da empresa sobre a global. A cláusula EXISTS evita zerar area_id
-- de eventuais obrigações sem Area correspondente (em prod são 0; defensivo).
--
-- Aditivo e idempotente (só preenche NULL). Rodar ANTES de drop_servico_categoria_obrigacao.sql.

UPDATE servicos s
SET area_id = (
  SELECT a.id
  FROM areas a
  WHERE lower(btrim(a.name)) = lower(btrim(s.categoria_obrigacao))
    AND (a.empresa_id = s.empresa_id OR a.empresa_id IS NULL OR s.empresa_id IS NULL)
  ORDER BY (a.empresa_id = s.empresa_id) DESC NULLS LAST
  LIMIT 1
)
WHERE s.eh_obrigacao_acessoria
  AND s.area_id IS NULL
  AND s.categoria_obrigacao IS NOT NULL
  AND btrim(s.categoria_obrigacao) <> ''
  AND EXISTS (
    SELECT 1 FROM areas a
    WHERE lower(btrim(a.name)) = lower(btrim(s.categoria_obrigacao))
      AND (a.empresa_id = s.empresa_id OR a.empresa_id IS NULL OR s.empresa_id IS NULL)
  );
