-- ContratoServico.categoria → area_nome (snapshot do NOME DA ÁREA do serviço na
-- emissão do contrato). O nome `categoria` confundia com a categoria de CLÁUSULA
-- (ClausulaCategoria), que é outro conceito e agrupa a proposta.
--
-- Idempotente: só renomeia se a coluna antiga ainda existir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name='contrato_servicos' AND column_name='categoria')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name='contrato_servicos' AND column_name='area_nome') THEN
    ALTER TABLE contrato_servicos RENAME COLUMN categoria TO area_nome;
  END IF;
END $$;
