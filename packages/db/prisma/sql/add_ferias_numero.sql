-- Controle de Férias: número do registro (o "Nº" da tela do v1), para localizar
-- e conferir sem depender do nome. Os importados mantêm o id do crp_ferias
-- (legacy_id); os novos seguem a sequência a partir do maior. Idempotente.
ALTER TABLE ferias_periodos ADD COLUMN IF NOT EXISTS numero integer;
CREATE SEQUENCE IF NOT EXISTS ferias_periodos_numero_seq;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ferias_periodos WHERE numero IS NULL OR (legacy_id IS NOT NULL AND numero <> legacy_id)) THEN
    ALTER TABLE ferias_periodos ALTER COLUMN numero DROP NOT NULL;
    UPDATE ferias_periodos SET numero = NULL;
    UPDATE ferias_periodos SET numero = legacy_id WHERE legacy_id IS NOT NULL;
    WITH s AS (
      SELECT id,
             (SELECT COALESCE(MAX(legacy_id), 0) FROM ferias_periodos) + ROW_NUMBER() OVER (ORDER BY registrado_em, criado_em, id) AS n
      FROM ferias_periodos WHERE legacy_id IS NULL
    )
    UPDATE ferias_periodos f SET numero = s.n FROM s WHERE f.id = s.id;
  END IF;
END $$;

SELECT setval('ferias_periodos_numero_seq', GREATEST((SELECT COALESCE(MAX(numero), 0) FROM ferias_periodos), 1));
ALTER TABLE ferias_periodos ALTER COLUMN numero SET DEFAULT nextval('ferias_periodos_numero_seq');
ALTER SEQUENCE ferias_periodos_numero_seq OWNED BY ferias_periodos.numero;
ALTER TABLE ferias_periodos ALTER COLUMN numero SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ferias_periodos_numero_key ON ferias_periodos(numero);
