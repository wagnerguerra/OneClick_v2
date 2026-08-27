-- Coleta e Recebimento: guarda quem DIGITOU o registro, separado de quem
-- PEDIU (solicitante). Desde 26/08/2026 o modal deixa lançar em nome de outra
-- pessoa; sem esta coluna, quem digitou perderia o direito de editar e de
-- excluir o que acabou de lançar.
--
-- Backfill: só vale o evento de CRIAÇÃO do histórico ("Registro criado…").
-- Nos registros vindos do v1 o primeiro evento costuma ser "Confirmou a rota"
-- ou "Documento em Triagem" — quem fez isso foi a Recepção, não quem lançou;
-- atribuir a autoria a essa pessoa daria a ela o direito de editar registro
-- alheio. Nesses casos fica o próprio solicitante, que é o dono real.
-- Idempotente: só preenche o que ainda está nulo.
ALTER TABLE coletas ADD COLUMN IF NOT EXISTS criado_por_id text;
CREATE INDEX IF NOT EXISTS coletas_criado_por_id_idx ON coletas(criado_por_id);

UPDATE coletas c
SET criado_por_id = COALESCE(
  (SELECT l.usuario_id
     FROM coleta_logs l
    WHERE l.coleta_id = c.id
      AND l.usuario_id IS NOT NULL
      AND l.evento LIKE 'Registro criado%'
    ORDER BY l.criado_em ASC
    LIMIT 1),
  c.solicitante_id
)
WHERE c.criado_por_id IS NULL;
