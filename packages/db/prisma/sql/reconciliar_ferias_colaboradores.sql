-- Controle de Férias: reconcilia o VÍNCULO dos períodos que ficaram só com o
-- nome no resíduo (colaborador_id NULL) com a base de usuários do v2.
--
-- Por que é preciso: a carga é idempotente por legacy_id, então um período
-- importado quando o colaborador ainda não existia no v2 (ou não casou) fica
-- com o resíduo para sempre — reimportar não corrige. Este UPDATE reconcilia.
-- Idempotente: só toca em quem está sem vínculo e só quando o nome casa com
-- EXATAMENTE UM usuário (nomes ambíguos ficam de fora, de propósito).
-- O `colaborador_nome` é preservado como histórico do que veio do v1.
UPDATE ferias_periodos f
SET colaborador_id = (
  SELECT u.id FROM users u
  WHERE lower(btrim(u.name)) = lower(btrim(f.colaborador_nome))
  -- Prefere o cadastro ATIVO quando a pessoa foi recadastrada.
  ORDER BY u.is_active DESC
  LIMIT 1
)
WHERE f.colaborador_id IS NULL
  AND btrim(coalesce(f.colaborador_nome, '')) <> ''
  AND (
    SELECT count(*) FROM users u
    WHERE lower(btrim(u.name)) = lower(btrim(f.colaborador_nome))
  ) = 1;
