// Read-only preview of the legacy OneClick v1 (db_intranet) clients table ger_cad_cli.
// Goal: confirm the start-date column (cad_cli_dt_ini), data quality, and counts.
// Uses OCK_V1_DB_* credentials from apps/api/.env. NO writes.
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

(async () => {
  const env = loadEnv(path.join(__dirname, '..', 'apps', 'api', '.env'));
  const conn = await mysql.createConnection({
    host: env.OCK_V1_DB_HOST || 'localhost',
    port: Number(env.OCK_V1_DB_PORT || 3306),
    user: env.OCK_V1_DB_USER || 'root',
    password: env.OCK_V1_DB_PASSWORD || '',
    database: env.OCK_V1_DB_NAME || 'db_intranet',
    connectTimeout: 10000,
  });
  console.log('CONECTADO em', env.OCK_V1_DB_HOST + ':' + (env.OCK_V1_DB_PORT||3306), 'db=', env.OCK_V1_DB_NAME);

  // 1) colunas da ger_cad_cli (confirmar nomes)
  const [cols] = await conn.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'ger_cad_cli'
       AND column_name IN ('cad_cli_razao','cad_cli_cnpj','cad_cli_dt_ini','cad_cli_ativo','id')
     ORDER BY ordinal_position`, [env.OCK_V1_DB_NAME]);
  console.log('\n== colunas relevantes em ger_cad_cli ==');
  console.table(cols);

  // 2) contagens
  const [[c]] = await conn.query(
    `SELECT
       COUNT(*) AS total,
       SUM(cad_cli_ativo='1') AS ativos,
       SUM(cad_cli_ativo='1' AND cad_cli_dt_ini IS NOT NULL AND cad_cli_dt_ini <> '' AND cad_cli_dt_ini <> '0000-00-00') AS ativos_com_dtini,
       SUM(cad_cli_ativo='1' AND (cad_cli_cnpj IS NOT NULL AND cad_cli_cnpj <> '')) AS ativos_com_cnpj
     FROM ger_cad_cli`);
  console.log('\n== contagens ==');
  console.table([c]);

  // 3) amostra de 12 ativos com dt_ini (ver formato)
  const [sample] = await conn.query(
    `SELECT cad_cli_cnpj, cad_cli_razao, cad_cli_dt_ini
     FROM ger_cad_cli
     WHERE cad_cli_ativo='1' AND cad_cli_dt_ini IS NOT NULL AND cad_cli_dt_ini <> '' AND cad_cli_dt_ini <> '0000-00-00'
     ORDER BY cad_cli_dt_ini DESC LIMIT 12`);
  console.log('\n== amostra (12 mais recentes) ==');
  console.table(sample);

  await conn.end();
})().catch(e => { console.error('ERRO:', e.code || '', e.message); process.exit(1); });
