// Pull legacy v1 active clients that HAVE a start date (cad_cli_dt_ini),
// normalize CNPJ to digits, and emit a SQL file that loads them into a temp
// table in our Postgres and reports the match against `clientes`
// (by CNPJ, and by CNPJ+razão). Read-only on legacy; the emitted SQL only
// DIAGNOSES (RAISE EXCEPTION with counts) — it does NOT update anything.
const fs = require('fs');
const path = require('path');
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'));

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const digits = (s) => (s || '').replace(/\D/g, '');
const sqlStr = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";

(async () => {
  const env = loadEnv(path.join(__dirname, '..', 'apps', 'api', '.env'));
  const conn = await mysql.createConnection({
    host: env.OCK_V1_DB_HOST, port: Number(env.OCK_V1_DB_PORT || 3306),
    user: env.OCK_V1_DB_USER, password: env.OCK_V1_DB_PASSWORD,
    database: env.OCK_V1_DB_NAME || 'db_intranet', connectTimeout: 10000,
    dateStrings: true,
  });
  const [rows] = await conn.query(
    `SELECT cad_cli_cnpj AS cnpj, cad_cli_razao AS razao, cad_cli_dt_ini AS dt
     FROM ger_cad_cli
     WHERE cad_cli_ativo='1' AND cad_cli_dt_ini IS NOT NULL
       AND cad_cli_dt_ini <> '' AND cad_cli_dt_ini <> '0000-00-00'`);
  await conn.end();

  // Keep only rows with a 14-digit (CNPJ) or 11-digit (CPF) document
  const clean = rows
    .map(r => ({ cnpj: digits(r.cnpj), razao: (r.razao || '').trim(), dt: String(r.dt).slice(0, 10) }))
    .filter(r => r.cnpj.length === 14 || r.cnpj.length === 11);

  const values = clean.map(r => `(${sqlStr(r.cnpj)},${sqlStr(r.razao)},${sqlStr(r.dt)}::date)`).join(',\n');

  const sql = `-- AUTO-GERADO por legacy-v1-match.js — APENAS DIAGNÓSTICO (não altera dados)
DO $$
DECLARE leg_total int; m_cnpj int; m_cnpj_razao int; leg_sem_match int; nossa_base int;
BEGIN
  CREATE TEMP TABLE _leg (cnpj text, razao text, dt date) ON COMMIT DROP;
  INSERT INTO _leg (cnpj, razao, dt) VALUES
${values};

  SELECT count(*) INTO leg_total FROM _leg;
  SELECT count(*) INTO nossa_base FROM clientes WHERE deleted_at IS NULL;

  -- match por CNPJ (dígitos) — nossos clientes que receberiam data
  SELECT count(DISTINCT c.id) INTO m_cnpj
  FROM clientes c JOIN _leg l ON regexp_replace(c.documento,'\\D','','g') = l.cnpj
  WHERE c.deleted_at IS NULL;

  -- match por CNPJ + razão (normalizada: maiúsculas, só alfanumérico)
  SELECT count(DISTINCT c.id) INTO m_cnpj_razao
  FROM clientes c JOIN _leg l ON regexp_replace(c.documento,'\\D','','g') = l.cnpj
  WHERE c.deleted_at IS NULL
    AND upper(regexp_replace(c.razao_social,'[^A-Za-z0-9]','','g'))
      = upper(regexp_replace(l.razao,'[^A-Za-z0-9]','','g'));

  -- linhas do legado (com data) que NÃO casam com nenhum cliente nosso
  SELECT count(*) INTO leg_sem_match
  FROM _leg l WHERE NOT EXISTS (
    SELECT 1 FROM clientes c WHERE c.deleted_at IS NULL
      AND regexp_replace(c.documento,'\\D','','g') = l.cnpj);

  RAISE EXCEPTION 'leg_com_data=% | nossa_base=% | MATCH_cnpj=% | match_cnpj+razao=% | legado_sem_match=%',
    leg_total, nossa_base, m_cnpj, m_cnpj_razao, leg_sem_match;
END $$;
`;
  const out = path.join(__dirname, '..', 'packages', 'db', 'prisma', 'sql', '_tmp_match_dtini.sql');
  fs.writeFileSync(out, sql, 'utf8');

  // ---- SQL de importação REAL (keyed por CNPJ; preenche só onde está vazio) ----
  const impValues = clean.map(r => `(${sqlStr(r.cnpj)},${sqlStr(r.dt)}::date)`).join(',\n');
  const importSql = `-- AUTO-GERADO por legacy-v1-match.js
-- Importa clientes.data_entrada a partir do OneClick v1 (ger_cad_cli.cad_cli_dt_ini).
-- Match por CNPJ (dígitos). Preenche SOMENTE onde data_entrada está NULL (não sobrescreve).
-- CNPJ com mais de uma data no legado → usa a MAIS ANTIGA (min). Idempotente.
BEGIN;
CREATE TEMP TABLE _leg (cnpj text, dt date) ON COMMIT DROP;
INSERT INTO _leg (cnpj, dt) VALUES
${impValues};

WITH agg AS (SELECT cnpj, min(dt) AS dt FROM _leg GROUP BY cnpj)
UPDATE clientes c
   SET data_entrada = agg.dt, updated_at = now()
  FROM agg
 WHERE regexp_replace(c.documento,'\\D','','g') = agg.cnpj
   AND c.deleted_at IS NULL
   AND c.data_entrada IS NULL;
COMMIT;
`;
  const impOut = path.join(__dirname, '..', 'packages', 'db', 'prisma', 'sql', 'import_dtini_v1.sql');
  fs.writeFileSync(impOut, importSql, 'utf8');
  console.log('legado ativos-com-data (doc válido):', clean.length);
  console.log('diagnóstico:', out);
  console.log('importação:', impOut);
})().catch(e => { console.error('ERRO:', e.code || '', e.message); process.exit(1); });
