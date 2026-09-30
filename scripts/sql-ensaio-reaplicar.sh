#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# Ensaio de REAPLICAÇÃO dos SQL de deploy (packages/db/prisma/sql/*.sql).
#
# Pressupõe um banco onde o schema do Prisma e todos os SQL JÁ foram
# aplicados uma vez (etapas 1 e 2 do workflow sql-deploy). Aplica cada
# arquivo DE NOVO e compara a "impressão digital" dos dados antes e depois:
# se alguma tabela mudar, o arquivo não aguenta rodar duas vezes.
#
# Por quê: em 30/09/2026 o Service Manager não conseguiu ler o livro de SQL
# aplicados e reexecutou os 161 arquivos em produção. Arquivo que não aguenta
# rodar de novo (INSERT sem ON CONFLICT, seed que reseta valor, UPDATE sem
# condição de "ainda não migrado") estraga dado nessas horas.
#
# Uso: DATABASE_URL=... scripts/sql-ensaio-reaplicar.sh [pasta]
# Sai com 1 se algum arquivo mudar dados na segunda execução.
# ──────────────────────────────────────────────────────────────────────────
set -uo pipefail

PASTA="${1:-packages/db/prisma/sql}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -tA)

# Impressão digital: hash do conteúdo inteiro de cada tabela do public. Mora
# num schema próprio (ensaio) para não entrar na própria conta.
"${PSQL[@]}" <<'SQL' >/dev/null
CREATE SCHEMA IF NOT EXISTS ensaio;
CREATE OR REPLACE FUNCTION ensaio.impressao() RETURNS TABLE(tabela text, hash text)
LANGUAGE plpgsql AS $f$
DECLARE r record; h text;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1
  LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(x::text, ''|'' ORDER BY x::text), '''')) FROM public.%I x', r.table_name)
      INTO h;
    tabela := r.table_name; hash := h; RETURN NEXT;
  END LOOP;
END $f$;
SQL

impressao() { "${PSQL[@]}" -c "SELECT tabela || ' ' || hash FROM ensaio.impressao()"; }

falhas=0
total=0
for f in $(ls "$PASTA"/*.sql | sort); do
  total=$((total + 1))
  antes=$(impressao)
  if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" > /tmp/reaplica.out 2>&1; then
    falhas=$((falhas + 1))
    echo "  FALHA $(basename "$f") — erro ao rodar de novo"
    echo "::error file=$f::$(grep -m1 -E 'ERROR' /tmp/reaplica.out || echo 'falhou na segunda execução')"
    continue
  fi
  depois=$(impressao)
  if [ "$antes" != "$depois" ]; then
    falhas=$((falhas + 1))
    # Linhas "tabela hash" de depois que não existiam antes = tabelas que mudaram.
    mudou=$(awk 'NR==FNR { v[$0]=1; next } !($0 in v) { print $1 }' <(echo "$antes") <(echo "$depois") | paste -sd, -)
    echo "  MUDOU $(basename "$f") — tabelas: $mudou"
    echo "::error file=$f::Rodar de novo alterou dados em: $mudou. Use IF NOT EXISTS / ON CONFLICT / WHERE de 'ainda não migrado'."
  else
    echo "  ok    $(basename "$f")"
  fi
done

"${PSQL[@]}" -c "DROP SCHEMA ensaio CASCADE" >/dev/null 2>&1

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Reaplicação dos SQL de deploy"
    echo ""
    echo "- arquivos reaplicados: **$total**"
    echo "- que não aguentam rodar duas vezes: **$falhas**"
  } >> "$GITHUB_STEP_SUMMARY"
fi

if [ "$falhas" -ne 0 ]; then
  echo "$falhas arquivo(s) não aguentam rodar duas vezes."
  exit 1
fi
echo "Todos os $total arquivos aguentam rodar de novo sem mudar dados."
