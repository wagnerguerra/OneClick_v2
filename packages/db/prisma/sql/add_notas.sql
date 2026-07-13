-- Notas rápidas pessoais (Google Keep style) — por usuário. Idempotente.
CREATE TABLE IF NOT EXISTS notas (
  id         text PRIMARY KEY,
  user_id    text NOT NULL,
  titulo     text,
  conteudo   text NOT NULL DEFAULT '',
  cor        text NOT NULL DEFAULT 'default',
  fixado     boolean NOT NULL DEFAULT false,
  arquivado  boolean NOT NULL DEFAULT false,
  ordem      integer NOT NULL DEFAULT 0,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS notas_user_arquivado_fixado_idx ON notas (user_id, arquivado, fixado);

-- FK resiliente ao deploy: adicionar a constraint pega um ShareRowExclusiveLock em
-- `users`. Com a API sob carga (login/sessões escrevem em `users`), o ALTER pode
-- ficar preso e pendurar a pipeline por minutos. Aqui usamos lock_timeout curto e,
-- se o lock não vier, PULAMOS sem abortar o deploy — a constraint entra num próximo
-- deploy em momento sem contenção. Tabela e índice já ficam prontos de qualquer forma.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notas_user_id_fkey') THEN
    PERFORM set_config('lock_timeout', '4s', true);
    ALTER TABLE notas ADD CONSTRAINT notas_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION
  WHEN lock_not_available THEN
    RAISE NOTICE 'notas_user_id_fkey adiado: lock em users/notas indisponível neste deploy';
END $$;
