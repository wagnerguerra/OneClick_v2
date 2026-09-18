-- Registro de Inscrições: passa a aceitar inscrição MUNICIPAL, além da estadual.
--
-- Contexto: a tabela nasceu só para inscrições estaduais (o proprio comentario
-- do model dizia "estaduais"), com `estado` NOT NULL. Para caber a municipal,
-- `estado` precisa ser opcional e entram `tipo`, `municipio` e `data_registro`.
--
-- Idempotente: pode rodar novamente sem efeito. Nenhuma coluna e renomeada nem
-- removida — em especial, `descricao` CONTINUA existindo com esse nome; o que
-- mudou foi so o campo no Prisma (observacoes @map("descricao")) e o rotulo na
-- tela. Nenhum dado e migrado.
--
-- Historico: toda linha existente e estadual, entao o DEFAULT 'ESTADUAL' ja
-- classifica o acervo corretamente, sem UPDATE de backfill.

ALTER TABLE cliente_inscricoes
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'ESTADUAL';

ALTER TABLE cliente_inscricoes
  ADD COLUMN IF NOT EXISTS municipio TEXT;

ALTER TABLE cliente_inscricoes
  ADD COLUMN IF NOT EXISTS data_registro TIMESTAMP(3);

-- `estado` deixa de ser obrigatorio (inscricao municipal nao tem UF).
-- DROP NOT NULL nao falha se a coluna ja for anulavel.
ALTER TABLE cliente_inscricoes
  ALTER COLUMN estado DROP NOT NULL;

-- Consulta por tipo na tela de registro (filtro/ordenacao por coluna).
CREATE INDEX IF NOT EXISTS cliente_inscricoes_tipo_idx
  ON cliente_inscricoes (tipo);
