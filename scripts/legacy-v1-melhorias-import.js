// Importa do OneClick v1 (db_intranet) o módulo de Melhorias da Qualidade:
//   • sgq_mel (ativas) → melhorias
//
// As compras marcadas como melhoria (sgq_com.melhoria=1) NÃO passam por aqui:
// já foram migradas com o módulo de Aquisições e a listagem nova as soma via
// Compra.melhoria, como o índice do v1 fazia. A sgq_mel_old (6 linhas de um
// fluxo abandonado, que o v1 nem lê) fica de fora — documentado no doc.
//
// Gera SQL idempotente em scripts/out/. Read-only no v1. NÃO aplica nada.
// Levantamento: docs/migracao-melhorias-v1.md

const fs = require('fs')
const path = require('path')
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'))
const { PrismaClient } = require(path.join(__dirname, '..', 'packages', 'db', 'src', 'generated', 'client'))

const EMP = 'cmnn7xm6e00009gqgoii3ims2' // CENTRAL CONTÁBIL (tenant ativo)
const SAIDA = path.join(__dirname, 'out')

function loadEnv(file) {
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const S = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const N = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? 'NULL' : String(Number(v)))
function dataISO(v) {
  const t = String(v ?? '').slice(0, 10)
  if (!t || t === '0000-00-00') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}
const chave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

;(async () => {
  const env = loadEnv(path.join(__dirname, '..', 'apps', 'api', '.env'))
  const my = await mysql.createConnection({
    host: env.OCK_V1_DB_HOST || '192.168.0.7',
    port: Number(env.OCK_V1_DB_PORT || 3306),
    user: env.OCK_V1_DB_USER || 'rose',
    password: env.OCK_V1_DB_PASSWORD || 'acesso01',
    database: env.OCK_V1_DB_NAME || 'db_intranet',
    dateStrings: true,
  })
  const prisma = new PrismaClient()

  // Escopo "EMP ou nulo": o snapshot de dev tem parte da Central sem etiqueta
  // de empresa (ver docs/migracao-reunioes-v1.md §7).
  const ESCOPO = { OR: [{ empresaId: EMP }, { empresaId: null }] }

  const [usuariosV1] = await my.query('SELECT CAD_USU_ID id, CAD_USU_NOME nome, CAD_USU_EMAIL email FROM ger_cad_usu')
  const usuariosV2 = await prisma.user.findMany({ where: ESCOPO, select: { id: true, name: true, email: true } })
  const porNome = new Map(usuariosV2.map((u) => [chave(u.name), u.id]))
  const porEmail = new Map(usuariosV2.filter((u) => u.email).map((u) => [String(u.email).toLowerCase(), u.id]))
  const v1ParaV2 = new Map()
  for (const u of usuariosV1) {
    const id = (u.email && porEmail.get(String(u.email).toLowerCase())) || porNome.get(chave(u.nome)) || null
    if (id) v1ParaV2.set(Number(u.id), id)
  }

  const [setores] = await my.query('SELECT id, cad_set_nome nome FROM ger_cad_set')
  const areasV2 = await prisma.area.findMany({ where: { AND: [ESCOPO, { isActive: true }] }, select: { id: true, name: true } })
  const areaPorNome = new Map(areasV2.map((a) => [chave(a.name), a.id]))
  const setorParaArea = new Map()
  for (const s of setores) {
    const a = areaPorNome.get(chave(s.nome))
    if (a) setorParaArea.set(Number(s.id), a)
  }

  const [mels] = await my.query('SELECT id, titulo, id_usuario, id_setor, dt_reg, dt_melhoria, descricao FROM sgq_mel WHERE ativo = 1 ORDER BY id')

  const sql = []
  sql.push('-- Importação das Melhorias do OneClick v1 (sgq_melhorias).')
  sql.push('-- Gerado por scripts/legacy-v1-melhorias-import.js — idempotente por legacy_id.')
  sql.push('-- Aplicar DEPOIS de add_melhorias.sql.')
  sql.push('')
  sql.push('BEGIN;')
  let ok = 0
  for (const m of mels) {
    const areaId = setorParaArea.get(Number(m.id_setor)) || null
    sql.push(
      `INSERT INTO melhorias (id, empresa_id, legacy_id, titulo, descricao, area_id, prevista_para, autor_id, criado_em)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(m.id)}, ${S(String(m.titulo || '').trim() || `Melhoria #${m.id}`)},` +
      ` ${S(m.descricao)}, ${S(areaId)},` +
      ` ${dataISO(m.dt_melhoria) ? `${S(dataISO(m.dt_melhoria))}::date` : 'NULL'},` +
      ` ${S(v1ParaV2.get(Number(m.id_usuario)) || null)},` +
      ` ${dataISO(m.dt_reg) ? `${S(dataISO(m.dt_reg))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM melhorias WHERE legacy_id = ${N(m.id)} AND empresa_id = ${S(EMP)});`)
    ok++
  }
  sql.push('COMMIT;')

  fs.mkdirSync(SAIDA, { recursive: true })
  const arq = path.join(SAIDA, 'v1-melhorias.sql')
  fs.writeFileSync(arq, sql.join('\n'), 'utf8')
  console.log(`=== Melhorias — v1 → v2 ===`)
  console.log(`melhorias ....... ${ok}`)
  console.log(`SQL: ${arq}`)

  await my.end()
  await prisma.$disconnect()
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1) })
