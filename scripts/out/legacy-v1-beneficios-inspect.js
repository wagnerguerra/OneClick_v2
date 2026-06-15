// Read-only inspect of legacy v1 fiscal-benefits tables (cad_cli_beneficios catalog
// + cad_cli_bnf assignments). Structure + volume. Uses OCK_V1_DB_* from apps/api/.env.
const fs = require('fs');
const path = require('path');
const mysql = require(path.join(__dirname, '..', '..', 'node_modules', 'mysql2', 'promise'));
function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
(async () => {
  const env = loadEnv(path.join(__dirname, '..', '..', 'apps', 'api', '.env'));
  const c = await mysql.createConnection({
    host: env.OCK_V1_DB_HOST, port: Number(env.OCK_V1_DB_PORT || 3306),
    user: env.OCK_V1_DB_USER, password: env.OCK_V1_DB_PASSWORD,
    database: env.OCK_V1_DB_NAME || 'db_intranet', connectTimeout: 10000, dateStrings: true,
  });
  for (const t of ['cad_cli_beneficios', 'cad_cli_bnf']) {
    const [cols] = await c.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
       WHERE table_schema=? AND table_name=? ORDER BY ordinal_position`, [env.OCK_V1_DB_NAME, t]);
    console.log(`\n== ${t} ==`); console.table(cols);
  }
  const [[cat]] = await c.query(
    `SELECT COUNT(*) total, SUM(ativo=1) ativos, SUM(id_servico IS NOT NULL AND id_servico<>0) com_servico FROM cad_cli_beneficios`);
  console.log('\n== catálogo cad_cli_beneficios =='); console.table([cat]);
  const [[asg]] = await c.query(
    `SELECT COUNT(*) total, SUM(ativo=1) ativos, SUM(dt_alerta IS NOT NULL) com_alerta, SUM(id_orcamento IS NOT NULL AND id_orcamento<>0) com_orcamento FROM cad_cli_bnf`);
  console.log('== vínculos cad_cli_bnf =='); console.table([asg]);
  const [catSample] = await c.query(`SELECT id, beneficio, ativo, id_servico FROM cad_cli_beneficios ORDER BY beneficio LIMIT 15`);
  console.log('== amostra catálogo =='); console.table(catSample);
  await c.end();
})().catch(e => { console.error('ERRO:', e.code || '', e.message); process.exit(1); });
