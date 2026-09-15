-- ============================================================================
-- Gestão de Arquivos (bloco Administrativo) — lado do escritório do
-- porta-arquivos que a Fase 1 do Portal criou.
--
-- `prisma db push` roda ANTES destes arquivos no deploy, então as colunas e as
-- tabelas já vão existir. Os IF NOT EXISTS são para a instalação que aplicar o
-- SQL sem o push, e para rodar duas vezes sem quebrar.
--
-- Três decisões que este arquivo materializa:
--
-- 1. EXCLUSÃO É LÓGICA. `cliente_arquivos.excluido_em` — são documentos fiscais
--    e trabalhistas de terceiros, e um DELETE transforma clique errado em perda
--    definitiva. O log de quem excluiu não serve de nada se nada volta.
--
-- 2. "ARQUIVO NOVO" É POR PESSOA (`arquivo_visualizacoes`), não uma coluna no
--    arquivo. Um cliente tem responsáveis diferentes por área; se o fiscal
--    abrir a folha e isso apagar o destaque de todo mundo, quem era o
--    destinatário nunca fica sabendo.
--
-- 3. O LOG GUARDA TEXTO, não só ids (`arquivo_nome`, `pasta_caminho`,
--    `usuario_nome`). Log que só tem id vira lista de códigos mortos
--    exatamente no dia em que alguém precisa dele.
-- ============================================================================

-- ── Exclusão lógica dos arquivos ────────────────────────────────────────────
ALTER TABLE cliente_arquivos ADD COLUMN IF NOT EXISTS excluido_em     timestamp(3);
ALTER TABLE cliente_arquivos ADD COLUMN IF NOT EXISTS excluido_por_id text;

-- Toda listagem filtra por excluido_em IS NULL. Índice parcial porque o caso
-- comum é "não excluído" e ele é a esmagadora maioria das linhas.
CREATE INDEX IF NOT EXISTS cliente_arquivos_vivos_idx
  ON cliente_arquivos (cliente_id, pasta_id)
  WHERE excluido_em IS NULL;

-- ── Nível de exclusão do lado do CLIENTE ────────────────────────────────────
-- Default FALSE: quem ganha o poder de apagar, ganha por ato deliberado.
-- Separado do `nivel` porque as duas coisas não andam juntas — há escritório
-- que não quer ninguém de fora apagando, e há OPERACIONAL que precisa corrigir
-- o próprio envio errado.
ALTER TABLE cliente_usuarios ADD COLUMN IF NOT EXISTS pode_excluir boolean NOT NULL DEFAULT false;

-- ── Quem já abriu o quê (destaque de "novo", por pessoa) ────────────────────
CREATE TABLE IF NOT EXISTS arquivo_visualizacoes (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  arquivo_id text NOT NULL REFERENCES cliente_arquivos(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visto_em   timestamp(3) NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS arquivo_visualizacoes_arquivo_user_key
  ON arquivo_visualizacoes (arquivo_id, user_id);
CREATE INDEX IF NOT EXISTS arquivo_visualizacoes_user_idx
  ON arquivo_visualizacoes (user_id);

-- ── Trilha de auditoria ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arquivo_logs (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cliente_id    text NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  arquivo_id    text,
  arquivo_nome  text,
  pasta_id      text,
  pasta_caminho text,
  evento        text NOT NULL,
  lado          text NOT NULL DEFAULT 'ESCRITORIO',
  usuario_id    text REFERENCES users(id) ON DELETE SET NULL,
  usuario_nome  text,
  detalhe       text,
  ip            text,
  criado_em     timestamp(3) NOT NULL DEFAULT NOW()
);

-- `arquivo_id` de propósito SEM foreign key: o log precisa sobreviver ao
-- arquivo. Com ON DELETE CASCADE a auditoria sumiria junto com o que ela
-- documenta, e com RESTRICT a exclusão ficaria impossível.
CREATE INDEX IF NOT EXISTS arquivo_logs_cliente_idx ON arquivo_logs (cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS arquivo_logs_arquivo_idx ON arquivo_logs (arquivo_id);
CREATE INDEX IF NOT EXISTS arquivo_logs_usuario_idx ON arquivo_logs (usuario_id);

-- ── Configuração de e-mail ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestao_arquivos_notificacoes (
  id                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  empresa_id           text NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id           text REFERENCES clientes(id) ON DELETE CASCADE,
  evento               text NOT NULL,
  ativo                boolean NOT NULL DEFAULT true,
  notifica_responsavel boolean NOT NULL DEFAULT true,
  notifica_substituto  boolean NOT NULL DEFAULT false,
  notifica_coordenador boolean NOT NULL DEFAULT false,
  notifica_diretor     boolean NOT NULL DEFAULT false,
  emails_extras        text,
  criado_em            timestamp(3) NOT NULL DEFAULT NOW(),
  atualizado_em        timestamp(3) NOT NULL DEFAULT NOW()
);

-- Em Postgres NULL <> NULL, então um UNIQUE comum sobre (empresa, cliente,
-- evento) NÃO impede duas regras padrão para o mesmo evento — elas passariam
-- as duas e o sistema mandaria e-mail dobrado. Daí os dois índices parciais:
-- um para a regra padrão (cliente nulo), outro para a regra por cliente.
CREATE UNIQUE INDEX IF NOT EXISTS gestao_arq_notif_padrao_key
  ON gestao_arquivos_notificacoes (empresa_id, evento)
  WHERE cliente_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gestao_arq_notif_cliente_key
  ON gestao_arquivos_notificacoes (empresa_id, cliente_id, evento)
  WHERE cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gestao_arq_notif_empresa_idx
  ON gestao_arquivos_notificacoes (empresa_id);

-- ── Regras padrão, uma por empresa ──────────────────────────────────────────
-- Nasce com os quatro eventos ligados, notificando o responsável pela área.
-- ARQUIVO_LIDO fica ATIVO porém só para o responsável: é o evento de maior
-- volume (todo cliente abrindo toda guia), e ligá-lo para diretoria de saída
-- encheria a caixa de quem não precisa.
INSERT INTO gestao_arquivos_notificacoes
  (empresa_id, cliente_id, evento, ativo, notifica_responsavel, notifica_substituto, notifica_coordenador, notifica_diretor)
SELECT e.id, NULL, v.evento, true, true, v.substituto, v.coordenador, v.diretor
FROM empresas e
CROSS JOIN (VALUES
  ('ARQUIVO_ENVIADO',     true,  false, false),
  ('ARQUIVO_EXCLUIDO',    false, true,  true),
  ('SOLICITACAO_VENCIDA', true,  false, false),
  ('ARQUIVO_LIDO',        false, false, false)
) AS v(evento, substituto, coordenador, diretor)
WHERE NOT EXISTS (
  SELECT 1 FROM gestao_arquivos_notificacoes g
  WHERE g.empresa_id = e.id AND g.cliente_id IS NULL AND g.evento = v.evento
);

-- ── Google Drive ────────────────────────────────────────────────────────────
-- O escritório já mantém no Drive uma pasta guarda-chuva com uma subpasta por
-- cliente. O master aponta a raiz aqui; as pastas dos clientes são as
-- subpastas dela.
CREATE TABLE IF NOT EXISTS gestao_arquivos_drive (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  empresa_id      text NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
  pasta_raiz_id   text NOT NULL,
  pasta_raiz_nome text,
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamp(3) NOT NULL DEFAULT NOW(),
  atualizado_em   timestamp(3) NOT NULL DEFAULT NOW()
);

-- Pasta do cliente no Drive, para a Gestão de Arquivos.
--
-- SEPARADA de `clientes.drive_folder_id`, que existe desde antes e alimenta a
-- ingestão automática de XML: aquele é varrido recursivamente e tudo que for
-- XML entra no sistema. Apontá-lo para a pasta geral do cliente faria o sync
-- engolir nota que ninguém mandou importar. Dois usos da mesma conta do Drive,
-- duas colunas — misturar faria uma tela mexer na outra sem avisar.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS portal_drive_folder_id   text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS portal_drive_folder_nome text;

-- Uma pasta não pode servir a dois clientes: o estrago seria documento de um
-- aparecendo na tela do outro. Parcial porque a esmagadora maioria dos
-- clientes não tem pasta vinculada, e NULL não deve colidir com NULL.
CREATE UNIQUE INDEX IF NOT EXISTS clientes_portal_drive_folder_key
  ON clientes (empresa_id, portal_drive_folder_id)
  WHERE portal_drive_folder_id IS NOT NULL;
