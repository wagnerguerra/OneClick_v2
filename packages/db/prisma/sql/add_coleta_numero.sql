-- Coleta e Recebimento: número sequencial legível (#1234) pra localizar o
-- registro rápido. Os importados do v1 mantêm o id do crpclt (legacy_id);
-- os novos seguem a sequência a partir do maior. Idempotente.
ALTER TABLE coletas ADD COLUMN IF NOT EXISTS numero integer;
CREATE SEQUENCE IF NOT EXISTS coletas_numero_seq;

DO $$
BEGIN
  -- (Re)numera só quando há linha sem número ou legado divergente do legacy_id.
  IF EXISTS (SELECT 1 FROM coletas WHERE numero IS NULL OR (legacy_id IS NOT NULL AND numero <> legacy_id)) THEN
    ALTER TABLE coletas ALTER COLUMN numero DROP NOT NULL;
    UPDATE coletas SET numero = NULL;
    UPDATE coletas SET numero = legacy_id WHERE legacy_id IS NOT NULL;
    WITH s AS (
      SELECT id,
             (SELECT COALESCE(MAX(legacy_id), 0) FROM coletas) + ROW_NUMBER() OVER (ORDER BY registrado_em, criado_em, id) AS n
      FROM coletas WHERE legacy_id IS NULL
    )
    UPDATE coletas c SET numero = s.n FROM s WHERE c.id = s.id;
  END IF;
END $$;

SELECT setval('coletas_numero_seq', GREATEST((SELECT COALESCE(MAX(numero), 0) FROM coletas), 1));
ALTER TABLE coletas ALTER COLUMN numero SET DEFAULT nextval('coletas_numero_seq');
ALTER SEQUENCE coletas_numero_seq OWNED BY coletas.numero;
ALTER TABLE coletas ALTER COLUMN numero SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS coletas_numero_key ON coletas(numero);
