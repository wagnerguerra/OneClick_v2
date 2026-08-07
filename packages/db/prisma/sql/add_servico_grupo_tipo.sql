-- Tipo/escopo do grupo de serviços (ServicoGrupo). GERAL = qualquer serviço;
-- OBRIGACOES = só obrigações acessórias; ORCAMENTO = só serviços disponíveis
-- para orçamento. Unifica o antigo GrupoObrigacao dentro de /servicos/grupos.
--
-- Idempotente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GrupoTipo') THEN
    CREATE TYPE "GrupoTipo" AS ENUM ('GERAL', 'OBRIGACOES', 'ORCAMENTO');
  END IF;
END $$;

ALTER TABLE servico_grupos
  ADD COLUMN IF NOT EXISTS tipo "GrupoTipo" NOT NULL DEFAULT 'GERAL';
