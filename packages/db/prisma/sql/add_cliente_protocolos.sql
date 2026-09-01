-- Protocolos de documentos do cliente (port do `cad_cli_pro` do v1).
--
-- A tabela já existia, descrevendo outra coisa: protocolo de processo em órgão
-- público, de um esqueleto inicial que nunca foi usado — zero referências em
-- código e zero linhas em produção. As colunas antigas saem, as novas entram.
-- `IF EXISTS`/`IF NOT EXISTS` em tudo para o script poder rodar de novo.

ALTER TABLE cliente_protocolos DROP COLUMN IF EXISTS orgao;
ALTER TABLE cliente_protocolos DROP COLUMN IF EXISTS tipo;
ALTER TABLE cliente_protocolos DROP COLUMN IF EXISTS protocolo;
ALTER TABLE cliente_protocolos DROP COLUMN IF EXISTS descricao;
ALTER TABLE cliente_protocolos DROP COLUMN IF EXISTS status;
ALTER TABLE cliente_protocolos DROP COLUMN IF EXISTS resultado;
ALTER TABLE cliente_protocolos DROP COLUMN IF EXISTS data_retorno;
ALTER TABLE cliente_protocolos DROP COLUMN IF EXISTS created_at;
ALTER TABLE cliente_protocolos DROP COLUMN IF EXISTS updated_at;

ALTER TABLE cliente_protocolos ADD COLUMN IF NOT EXISTS empresa_id    TEXT;
ALTER TABLE cliente_protocolos ADD COLUMN IF NOT EXISTS legacy_id     INTEGER;
ALTER TABLE cliente_protocolos ADD COLUMN IF NOT EXISTS numero        INTEGER;
ALTER TABLE cliente_protocolos ADD COLUMN IF NOT EXISTS data          DATE;
ALTER TABLE cliente_protocolos ADD COLUMN IF NOT EXISTS usuario_nome  TEXT;
ALTER TABLE cliente_protocolos ADD COLUMN IF NOT EXISTS documentos    TEXT;
ALTER TABLE cliente_protocolos ADD COLUMN IF NOT EXISTS recebido      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cliente_protocolos ADD COLUMN IF NOT EXISTS recebido_em   TIMESTAMP(3);
ALTER TABLE cliente_protocolos ADD COLUMN IF NOT EXISTS ativo         BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE cliente_protocolos ADD COLUMN IF NOT EXISTS criado_em     TIMESTAMP(3) NOT NULL DEFAULT now();
ALTER TABLE cliente_protocolos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP(3) NOT NULL DEFAULT now();

-- Só depois de preenchidas é que podem ser obrigatórias. A tabela está vazia,
-- então o SET NOT NULL passa; num ambiente com dado antigo, ele avisa em vez
-- de corromper.
ALTER TABLE cliente_protocolos ALTER COLUMN numero SET NOT NULL;
ALTER TABLE cliente_protocolos ALTER COLUMN data   SET NOT NULL;

-- O nº é por cliente, e o comprovante impresso depende de ser único.
CREATE UNIQUE INDEX IF NOT EXISTS cliente_protocolos_cliente_id_numero_key
  ON cliente_protocolos (cliente_id, numero);
CREATE INDEX IF NOT EXISTS cliente_protocolos_empresa_id_ativo_idx
  ON cliente_protocolos (empresa_id, ativo);
CREATE INDEX IF NOT EXISTS cliente_protocolos_cliente_id_data_idx
  ON cliente_protocolos (cliente_id, data);
CREATE INDEX IF NOT EXISTS cliente_protocolos_legacy_id_idx
  ON cliente_protocolos (legacy_id);
