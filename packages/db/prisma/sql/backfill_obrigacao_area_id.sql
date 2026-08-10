-- Frente 2.5 — backfill de Servico.areaId nas obrigações acessórias a partir do
-- categoria_obrigacao (nome da área), ANTES de dropar a coluna-ponte.
--
-- Só toca obrigações (eh_obrigacao_acessoria) com area_id NULL e categoria_obrigacao
-- preenchida — preserva quem já tem área real. Casa Area por nome (case/trim-insensitive),
-- preferindo a área da empresa sobre a global. A cláusula EXISTS evita zerar area_id
-- de eventuais obrigações sem Area correspondente (em prod são 0; defensivo).
--
-- Aditivo e idempotente (só preenche NULL). Rodar ANTES de drop_servico_categoria_obrigacao.sql.

-- GUARD: mesma armadilha do arquivo de grupos. O push do deploy ja removeu a
-- coluna-ponte `categoria_obrigacao` quando esta etapa roda, e ler dela quebrava
-- o deploy. Cumprido o papel, o arquivo vira no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'servicos' AND column_name = 'categoria_obrigacao'
  ) THEN
    RAISE NOTICE '[backfill_obrigacao_area_id] categoria_obrigacao ja nao existe — backfill ignorado (concluido).';
    RETURN;
  END IF;

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
END $$;
