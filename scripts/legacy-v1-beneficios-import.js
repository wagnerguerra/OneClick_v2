// Importa do OneClick v1 (db_intranet) os benefícios fiscais:
//   • catálogo cad_cli_beneficios → beneficio_fiscal_catalogo (servicoId casado por nome do serviço)
//   • vínculos cad_cli_bnf (ativos) → beneficio_fiscal_cliente (cliente casado por CNPJ)
// Gera SQL idempotente em scripts/out/. Read-only no v1. NÃO aplica nada sozinho.
const fs = require('fs')
const path = require('path')
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'))

const EMP = 'cmnn7xm6e00009gqgoii3ims2' // CENTRAL CONTÁBIL (tenant ativo)

function loadEnv(file) {
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const digits = (s) => (s || '').replace(/\D/g, '')
const S = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const Sreq = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`

;(async () => {
  const env = loadEnv(path.join(__dirname, '..', 'apps', 'api', '.env'))
  const c = await mysql.createConnection({
    host: env.OCK_V1_DB_HOST, port: Number(env.OCK_V1_DB_PORT || 3306),
    user: env.OCK_V1_DB_USER, password: env.OCK_V1_DB_PASSWORD,
    database: env.OCK_V1_DB_NAME || 'db_intranet', dateStrings: true,
  })

  const [catalogo] = await c.query(
    `SELECT b.beneficio AS nome, b.notifica_vencimento AS notifica, b.obs, b.ativo, s.servico AS svc
       FROM cad_cli_beneficios b
       LEFT JOIN com_orc_cad s ON s.id = b.id_servico`)
  const [vinculos] = await c.query(
    `SELECT b.beneficio AS catNome, a.dt_alerta AS dt, a.portaria, a.processo, a.obs, c.cad_cli_cnpj AS cnpj
       FROM cad_cli_bnf a
       JOIN ger_cad_cli c ON c.id = a.id_cliente
       JOIN cad_cli_beneficios b ON b.id = a.id_beneficio
      WHERE a.ativo = 1`)
  await c.end()

  let sql = `-- AUTO-GERADO por legacy-v1-beneficios-import.js
-- Import dos benefícios fiscais do v1. Idempotente. empresa_id = CENTRAL CONTÁBIL.
-- Catálogo: servico_id casado por nome do serviço (null se não casar — ajustar na UI).
-- Vínculos: cliente casado por CNPJ (dígitos). Pula duplicatas (cliente+catálogo).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

`
  // ── Catálogo ──
  for (const b of catalogo) {
    const notifica = b.notifica != null && Number(b.notifica) > 0 ? Number(b.notifica) : 'NULL'
    sql += `INSERT INTO beneficio_fiscal_catalogo (id, nome, servico_id, notifica_vencimento_dias, obs, ativo, empresa_id, created_at, updated_at)
SELECT gen_random_uuid()::text, ${Sreq(b.nome)},
       ${b.svc ? `(SELECT id FROM servicos WHERE upper(trim(nome)) = upper(trim(${Sreq(b.svc)})) AND (empresa_id = '${EMP}' OR empresa_id IS NULL) ORDER BY (empresa_id = '${EMP}') DESC LIMIT 1)` : 'NULL'},
       ${notifica}, ${S(b.obs)}, ${b.ativo ? 'true' : 'false'}, '${EMP}', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM beneficio_fiscal_catalogo WHERE nome = ${Sreq(b.nome)} AND empresa_id = '${EMP}');
`
  }
  sql += `\n`
  // ── Vínculos ──
  for (const v of vinculos) {
    const cnpj = digits(v.cnpj)
    if (cnpj.length !== 14 && cnpj.length !== 11) continue
    const dt = v.dt && v.dt !== '0000-00-00' ? `${Sreq(String(v.dt).slice(0, 10))}::date` : 'NULL'
    sql += `INSERT INTO beneficio_fiscal_cliente (id, cliente_id, catalogo_id, data_vencimento, portaria, processo, obs, ativo, empresa_id, created_at, updated_at)
SELECT gen_random_uuid()::text, cl.id, cat.id, ${dt}, ${S(v.portaria)}, ${S(v.processo)}, ${S(v.obs)}, true, '${EMP}', now(), now()
FROM clientes cl
JOIN beneficio_fiscal_catalogo cat ON cat.nome = ${Sreq(v.catNome)} AND cat.empresa_id = '${EMP}'
WHERE regexp_replace(cl.documento, '\\D', '', 'g') = '${cnpj}' AND cl.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM beneficio_fiscal_cliente x WHERE x.cliente_id = cl.id AND x.catalogo_id = cat.id)
LIMIT 1;
`
  }
  sql += `\nCOMMIT;\n`

  const outDir = path.join(__dirname, 'out')
  fs.mkdirSync(outDir, { recursive: true })
  const out = path.join(outDir, 'import_beneficios_v1.sql')
  fs.writeFileSync(out, sql, 'utf8')
  console.log(`catálogo=${catalogo.length} vínculos_ativos=${vinculos.length} → ${out}`)
})().catch(e => { console.error('ERRO:', e.code || '', e.message); process.exit(1) })
