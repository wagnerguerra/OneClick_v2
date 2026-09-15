-- ============================================================================
-- Liberação dos módulos do Portal do Cliente, por empresa.
--
-- Guarda só as EXCEÇÕES: ausência de linha significa "vale o padrão do módulo",
-- declarado em `apps/api/src/portal/portal-modulos.ts`. O contrário — exigir
-- linha para tudo — apagaria Documentos do portal de quem já usa no instante
-- do deploy, até alguém ir ligar de novo.
--
-- É por EMPRESA e não por tenant. Não é atalho: `empresas` não tem coluna
-- `tenant_id`, e as empresas em operação estão todas sem tenant (o único
-- tenant cadastrado aponta para um sandbox com zero clientes). Um gate por
-- tenant não alcançaria cliente nenhum hoje. O portal é escopado por
-- cliente → empresa, e é nessa linha que o gate precisa ficar.
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_modulos_empresa (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  empresa_id      text NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  modulo          text NOT NULL,
  liberado        boolean NOT NULL DEFAULT true,
  alterado_por_id text,
  criado_em       timestamp(3) NOT NULL DEFAULT NOW(),
  atualizado_em   timestamp(3) NOT NULL DEFAULT NOW()
);

-- Uma decisão por módulo em cada empresa. Sem isto, dois cliques simultâneos
-- deixariam duas linhas para o mesmo módulo e a última leitura decidiria por
-- acaso qual vale.
CREATE UNIQUE INDEX IF NOT EXISTS portal_modulos_empresa_key
  ON portal_modulos_empresa (empresa_id, modulo);

CREATE INDEX IF NOT EXISTS portal_modulos_empresa_idx
  ON portal_modulos_empresa (empresa_id);

-- Nenhum INSERT de carga. A tabela nasce vazia de propósito: toda empresa
-- segue o padrão do catálogo até que alguém decida o contrário, e é a
-- existência da linha que distingue "ninguém mexeu" de "foi decidido que
-- fique assim".
