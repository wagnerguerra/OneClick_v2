-- Habilita a extensão `unaccent` do Postgres pra suportar busca
-- acento-insensitive ("são paulo" casar com "sao paulo"). Usada no service
-- de clientes pra busca textual (#HLP0077).
--
-- A extensão vem com o Postgres oficial — basta CREATE EXTENSION.
-- Idempotente (IF NOT EXISTS).
CREATE EXTENSION IF NOT EXISTS unaccent;
