-- Filtros por campo do catalogo no relatorio salvo.
--
-- "Situacao e um de [Mensal]" — a condicao que o usuario monta depois de ja
-- ter escolhido a coluna. Coluna separada de `filtros`, que espelha o input de
-- cliente.list e precisa manter aquela forma para o where continuar sendo o
-- mesmo da listagem.
--
-- Nullable: relatorio salvo antes disso simplesmente nao tem filtro de campo.
ALTER TABLE relatorio_definicoes
  ADD COLUMN IF NOT EXISTS filtros_campos JSONB;
