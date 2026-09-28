-- #HLP0278 — Orçamentos com o mesmo número (4536, 4537, 4538 e 4539).
--
-- Duas causas, ambas já corrigidas no código: criações simultâneas lendo o
-- mesmo max(numero) (advisory lock, 20/07) e o "Duplicar" caindo na sequência
-- parada do banco, que devolvia números antigos (17/09, a6ae69f9).
--
-- Acerto decidido pelo Wagner (28/09/2026): em cada par fica com o número o
-- orçamento que o CLIENTE recebeu por e-mail; o outro é renumerado para um
-- número livre da faixa do v2 (4546, 4547, 4575 — de orçamentos excluídos) e,
-- faltando livre, para o próximo número. Abaixo de 4532 a numeração é do v1.
--
-- Idempotente: cada UPDATE só age se o orçamento ainda tem o número antigo e o
-- destino está livre. Mesmo advisory lock do create/duplicar, para não
-- disputar número com um orçamento criado durante o deploy.

DO $$
DECLARE
  r RECORD;
  destino INT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('cmpy0m1e70019mz061jd0yzpb', 4536, 4546),  -- Paulo Sérgio (Metaltelas fica 4536)
      ('cmpy41ls6000jp307xy3jiyuo', 4537, 4547),  -- Paulo Sérgio (Telabrasil fica 4537)
      ('cmrmhkj97026hn407rrjqmmrp', 4538, 4575),  -- Lead Paulo Sérgio, cancelado (Serv-Food fica 4538)
      ('cmu4eerg4009qno08woop6wki', 4539, NULL)   -- Bluevix, cancelado (Lorena fica 4539) → próximo número
    ) AS t(id, de, para)
  LOOP
    PERFORM 1 FROM orcamentos WHERE id = r.id AND numero = r.de;
    CONTINUE WHEN NOT FOUND;

    PERFORM pg_advisory_xact_lock(hashtext('orcamento_numero:' || COALESCE(
      (SELECT empresa_id FROM orcamentos WHERE id = r.id), 'global')));

    destino := r.para;
    IF destino IS NULL OR EXISTS (SELECT 1 FROM orcamentos WHERE numero = destino) THEN
      SELECT COALESCE(MAX(numero), 0) + 1 INTO destino FROM orcamentos;
    END IF;

    UPDATE orcamentos SET numero = destino, updated_at = now() WHERE id = r.id;

    INSERT INTO orcamento_eventos (id, orcamento_id, user_id, tipo, de, para, descricao, created_at)
    VALUES (gen_random_uuid()::text, r.id, NULL, 'edicao', r.de::text, destino::text,
            'Número alterado de #' || r.de || ' para #' || destino
            || ' — o #' || r.de || ' estava repetido em outro orçamento (#HLP0278)', now());
  END LOOP;
END $$;
