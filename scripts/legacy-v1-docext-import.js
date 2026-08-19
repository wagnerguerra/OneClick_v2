// Importa do OneClick v1 (db_intranet) os Documentos Externos da Qualidade:
//   • sgq_docext → documentos_externos + documento_externo_versoes
//
// Mesmo desenho do sgq_reg (Tabelas de Registros): todas as revisões na mesma
// tabela, encadeadas por id_mestre (raiz aponta si mesma ou 0), exatamente
// UMA linha ativa por cadeia viva (ativo=1 = vigente). Cadeias sem ativa são
// descartes do v1 — ficam. `situacao` é sempre 1 (irrelevante) e
// sgq_docext_arq está vazia; sgq_docext_log tem 10 frases prontas (não
// migradas — o histórico relevante são as próprias revisões).
//
// O processo é resolvido NO DESTINO por documento_processos.legacy_id.
// Gera SQL idempotente em scripts/out/. Read-only no v1. NÃO aplica nada.
// Levantamento: docs/migracao-documentos-externos-v1.md

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
const chave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const limpaCtl = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

function dataISO(v) {
  const t = String(v ?? '').slice(0, 10)
  if (!t || t === '0000-00-00') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

// Observação vira HTML mínimo (o campo do v2 é RichEditor).
function paraHtml(txt) {
  const t = limpaCtl(txt).trim()
  if (!t) return null
  if (/<\/?[a-z][a-z0-9]*[^>]*>/i.test(t)) return t
  const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.split(/\r?\n+/).map((l) => `<p>${l.trim()}</p>`).filter((p) => p !== '<p></p>').join('')
}

const subProcesso = (legacyId) => legacyId
  ? `(SELECT id FROM documento_processos WHERE legacy_id = ${N(legacyId)} AND (empresa_id = ${S(EMP)} OR empresa_id IS NULL) LIMIT 1)`
  : 'NULL'
const subDoc = (legacyId) =>
  `(SELECT id FROM documentos_externos WHERE legacy_id = ${N(legacyId)} AND empresa_id = ${S(EMP)} LIMIT 1)`

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

  const ESCOPO = { OR: [{ empresaId: EMP }, { empresaId: null }] }
  const [usuariosV1] = await my.query('SELECT CAD_USU_ID id, CAD_USU_NOME nome, CAD_USU_EMAIL email FROM ger_cad_usu')
  const usuariosV2 = await prisma.user.findMany({ where: ESCOPO, select: { id: true, name: true, email: true } })
  const porNome = new Map(usuariosV2.map((u) => [chave(u.name), u.id]))
  const porEmail = new Map(usuariosV2.filter((u) => u.email).map((u) => [String(u.email).toLowerCase(), u.id]))
  const nomeV1 = new Map(usuariosV1.map((u) => [Number(u.id), String(u.nome || '').trim() || null]))
  const v1ParaV2 = new Map()
  for (const u of usuariosV1) {
    const id = (u.email && porEmail.get(String(u.email).toLowerCase())) || porNome.get(chave(u.nome)) || null
    if (id) v1ParaV2.set(Number(u.id), id)
  }
  const userV1 = (raw) => {
    const n = Number(raw)
    if (!raw || !n) return { id: null, nome: null }
    const id = v1ParaV2.get(n) || null
    return { id, nome: id ? null : nomeV1.get(n) || null }
  }

  const [regs] = await my.query('SELECT * FROM sgq_docext ORDER BY id')

  // Reconstrói as cadeias: raiz = id_mestre 0 ou apontando para si mesma.
  const cadeias = new Map()
  for (const r of regs) {
    const raiz = (!r.id_mestre || Number(r.id_mestre) === Number(r.id)) ? Number(r.id) : Number(r.id_mestre)
    if (!cadeias.has(raiz)) cadeias.set(raiz, [])
    cadeias.get(raiz).push(r)
  }

  const sql = []
  sql.push('-- Importação dos Documentos Externos do OneClick v1 (sgq_externos).')
  sql.push('-- Gerado por scripts/legacy-v1-docext-import.js — idempotente por legacy_id.')
  sql.push('-- Aplicar DEPOIS de add_documentos_externos.sql (e da carga de documentos,')
  sql.push('-- que traz os processos com legacy_id).')
  sql.push('')
  sql.push('BEGIN;')

  let docsOk = 0, versoesOk = 0, mortas = 0, semUsuario = 0
  for (const [raiz, linhas] of [...cadeias.entries()].sort((a, b) => a[0] - b[0])) {
    const vigente = linhas.find((l) => Number(l.ativo) === 1)
    if (!vigente) { mortas++; continue }

    linhas.sort((a, b) => (Number(a.revisao) - Number(b.revisao)) || (Number(a.id) - Number(b.id)))
    const primeira = linhas[0]

    sql.push(
      `INSERT INTO documentos_externos (id, empresa_id, legacy_id, nome, processo_id, criado_em)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(raiz)}, ${S(limpaCtl(vigente.nome).trim() || `Documento #${raiz}`)},` +
      ` ${subProcesso(vigente.processo)},` +
      ` ${dataISO(primeira.dt_registro) ? `${S(dataISO(primeira.dt_registro))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM documentos_externos WHERE legacy_id = ${N(raiz)} AND empresa_id = ${S(EMP)});`)
    docsOk++

    for (const l of linhas) {
      const reg = userV1(l.usuario)
      const resp = userV1(l.responsavel)
      if ((!reg.id && l.usuario) || (!resp.id && l.responsavel)) semUsuario++
      sql.push(
        `INSERT INTO documento_externo_versoes (id, documento_id, legacy_id, revisao, data_registro, emissor, local, link, observacao, registrado_por_id, registrado_por_nome, responsavel_id, responsavel_nome, criado_em)` +
        ` SELECT gen_random_uuid()::text, ${subDoc(raiz)}, ${N(l.id)}, ${N(l.revisao) === 'NULL' ? '0' : N(l.revisao)},` +
        ` ${S(dataISO(l.dt_registro) || dataISO(primeira.dt_registro) || '1970-01-01')}::date,` +
        ` ${S(limpaCtl(l.emissor).trim() || null)}, ${S(limpaCtl(l.local).trim() || null)}, ${S(limpaCtl(l.link).trim() || null)}, ${S(paraHtml(l.observacao))},` +
        ` ${S(reg.id)}, ${S(reg.nome)}, ${S(resp.id)}, ${S(resp.nome)},` +
        ` ${dataISO(l.dt_registro) ? `${S(dataISO(l.dt_registro))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
        ` WHERE NOT EXISTS (SELECT 1 FROM documento_externo_versoes WHERE legacy_id = ${N(l.id)});`)
      versoesOk++
    }

    sql.push(
      `UPDATE documentos_externos SET versao_atual_id = (SELECT id FROM documento_externo_versoes WHERE legacy_id = ${N(vigente.id)} LIMIT 1)` +
      ` WHERE legacy_id = ${N(raiz)} AND empresa_id = ${S(EMP)} AND versao_atual_id IS NULL;`)
  }

  sql.push('COMMIT;')

  fs.mkdirSync(SAIDA, { recursive: true })
  const arq = path.join(SAIDA, 'v1-documentos-externos.sql')
  fs.writeFileSync(arq, sql.join('\n'), 'utf8')
  console.log('=== Documentos Externos — v1 → v2 ===')
  console.log(`cadeias vivas ......... ${docsOk}`)
  console.log(`revisões .............. ${versoesOk}`)
  console.log(`cadeias mortas ........ ${mortas} (ficam no v1)`)
  console.log(`versões c/ ex-colab ... ${semUsuario} (nome fica como resíduo)`)
  console.log(`SQL: ${arq}`)

  await my.end()
  await prisma.$disconnect()
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1) })
