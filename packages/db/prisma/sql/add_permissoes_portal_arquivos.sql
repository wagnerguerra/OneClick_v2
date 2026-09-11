-- ============================================================================
-- Permissões do porta-arquivos, por usuário do cliente.
--
-- Antes, o que o usuário externo podia fazer com arquivo saía do `nivel`:
-- CONSULTA lia, OPERACIONAL para cima enviava. Funcionava enquanto o acervo
-- era só nosso. Com a pasta do Google Drive dentro do portal isso não basta —
-- lá o escritório quer decidir usuário a usuário quem enxerga, quem manda
-- arquivo e quem apaga, porque a pasta do Drive é a mesma que hoje ele
-- compartilha por e-mail com pessoas específicas.
--
-- O `nivel` continua valendo para o RESTO do portal (contrato, honorários).
-- Só o porta-arquivos passa a olhar estes três campos.
--
-- `pode_excluir` já existia (criado com a Gestão de Arquivos e nunca ligado a
-- nada); ganha os dois irmãos e passa a ser usado de verdade.
-- ============================================================================

ALTER TABLE cliente_usuarios ADD COLUMN IF NOT EXISTS pode_ver     boolean NOT NULL DEFAULT true;
ALTER TABLE cliente_usuarios ADD COLUMN IF NOT EXISTS pode_editar  boolean NOT NULL DEFAULT false;
ALTER TABLE cliente_usuarios ADD COLUMN IF NOT EXISTS pode_excluir boolean NOT NULL DEFAULT false;

-- Backfill a partir do `nivel`, uma única vez.
--
-- Sem isto, todo usuário que hoje envia arquivo perderia a permissão no
-- instante do deploy: `pode_editar` nasce `false`, e a regra que o autorizava
-- (o `nivel`) deixa de ser consultada no mesmo commit. O objetivo é que o
-- deploy não mude NADA para quem já usa — as permissões passam a existir
-- espelhando o que o nível já significava, e a partir daí o escritório ajusta.
--
-- A condição do WHERE evita reescrever quem já foi ajustado à mão: só toca em
-- quem ainda está com o default de fábrica.
UPDATE cliente_usuarios
SET pode_editar = true
WHERE nivel <> 'CONSULTA'
  AND pode_editar = false
  AND pode_ver = true
  AND pode_excluir = false;

-- `pode_excluir` fica false para todos, de propósito: ninguém tinha esse poder
-- antes, e exclusão de documento fiscal não deve ser concedida por migração.
