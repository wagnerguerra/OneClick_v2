-- ============================================================================
-- Portal do Cliente — Fase 0: vínculo do usuário externo com o cliente.
--
-- `prisma db push` roda ANTES destes arquivos no deploy, então o tipo e a
-- tabela já vão existir quando isto rodar. Os IF NOT EXISTS são para a
-- instalação que aplicar o SQL sem o push, e para rodar duas vezes sem quebrar.
--
-- ATENÇÃO: `id`, `criado_em` e `atualizado_em` recebem DEFAULT aqui de
-- propósito. `@default(cuid())` e `@updatedAt` são do Prisma, não do banco — a
-- coluna nasceria sem default, e um INSERT manual (seed, correção pontual)
-- quebraria. Já derrubou um deploy em 04/09.
-- ============================================================================

-- ── Nível do usuário no portal ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PortalNivel') THEN
    CREATE TYPE "PortalNivel" AS ENUM ('ADMINISTRADOR', 'OPERACIONAL', 'CONSULTA');
  END IF;
END $$;

-- ── Vínculo usuário ↔ cliente ───────────────────────────────────────────────
-- Muitos-para-muitos de propósito: o diretor de um grupo precisa de UM login
-- que enxergue matriz e filiais.
CREATE TABLE IF NOT EXISTS cliente_usuarios (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cliente_id    text NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nivel         "PortalNivel" NOT NULL DEFAULT 'OPERACIONAL',
  areas         text[] NOT NULL DEFAULT '{}',
  ativo         boolean NOT NULL DEFAULT true,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  criado_em     timestamp(3) NOT NULL DEFAULT NOW(),
  atualizado_em timestamp(3) NOT NULL DEFAULT NOW()
);

-- Um vínculo por par. É o que impede dois níveis conflitantes para a mesma
-- pessoa no mesmo cliente.
CREATE UNIQUE INDEX IF NOT EXISTS cliente_usuarios_user_id_cliente_id_key
  ON cliente_usuarios (user_id, cliente_id);

-- O portal consulta sempre por um dos dois lados: "quais clientes deste
-- usuário" (login) e "quais usuários deste cliente" (aba Usuários).
CREATE INDEX IF NOT EXISTS cliente_usuarios_cliente_id_idx ON cliente_usuarios (cliente_id);
CREATE INDEX IF NOT EXISTS cliente_usuarios_user_id_idx    ON cliente_usuarios (user_id);

-- ── Convite de primeiro acesso ──────────────────────────────────────────────
-- Guarda só o SHA-256 do token; o token em claro vive apenas no e-mail. Um
-- vazamento do banco não devolve convites utilizáveis.
CREATE TABLE IF NOT EXISTS portal_convites (
  id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cliente_usuario_id text NOT NULL REFERENCES cliente_usuarios(id) ON DELETE CASCADE,
  token_hash         text NOT NULL,
  expira_em          timestamp(3) NOT NULL,
  usado_em           timestamp(3),
  criado_por_id      text,
  criado_em          timestamp(3) NOT NULL DEFAULT NOW()
);

-- O lookup do convite é SEMPRE pelo hash — é o índice que sustenta a validação
-- do link, e o unique impede colisão de token.
CREATE UNIQUE INDEX IF NOT EXISTS portal_convites_token_hash_key ON portal_convites (token_hash);
CREATE INDEX IF NOT EXISTS portal_convites_cliente_usuario_id_idx ON portal_convites (cliente_usuario_id);
