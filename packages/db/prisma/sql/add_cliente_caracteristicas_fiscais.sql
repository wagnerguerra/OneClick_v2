-- Caracteristicas fiscais do cliente: como ele apura e o que ele movimenta.
--
-- Vieram da planilha que a contabilidade mantinha a parte (tres abas, uma por
-- colaborador). O cadastro so guardava o regime; apuracao do Lucro Real, Fator
-- R, imposto por fora, pro-labore, funcionarios e sem movimento viviam num
-- arquivo que nao acompanhava o cliente.
--
-- Todas NULLABLE, sem DEFAULT, de proposito: NULL = "nao informado", que nao e
-- a mesma coisa que "nao". Um DEFAULT false afirmaria, em 1.600 clientes de uma
-- vez, algo que ninguem apurou.
--
-- apuracao_lucro_real e TEXT (TRIMESTRAL | ANUAL | ESTIMATIVA) em vez de enum:
-- a tela ja restringe os valores, e um enum novo obrigaria CREATE TYPE aqui,
-- que quebra se o objeto nascer com dono diferente do usuario da aplicacao.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS apuracao_lucro_real  TEXT,
  ADD COLUMN IF NOT EXISTS fator_r              BOOLEAN,
  ADD COLUMN IF NOT EXISTS apura_iss_por_fora   BOOLEAN,
  ADD COLUMN IF NOT EXISTS apura_icms_por_fora  BOOLEAN,
  ADD COLUMN IF NOT EXISTS possui_pro_labore    BOOLEAN,
  ADD COLUMN IF NOT EXISTS possui_funcionarios  BOOLEAN,
  ADD COLUMN IF NOT EXISTS sem_movimento        BOOLEAN;
