// Importa do OneClick v1 (db_intranet) as Tabelas de Registros da Qualidade:
//   • sgq_reg → tabelas_registros + tabela_registro_versoes
//
// O sgq_reg guarda TODAS as versões na mesma tabela, encadeadas por id_mestre
// (a raiz aponta para si mesma ou para 0; as versões apontam para a raiz) e
// exatamente UMA linha ativa por cadeia viva (ativo=1 = vigente). Cadeias sem
// linha ativa são registros descartados no v1 — ficam de fora.
//
// O processo é resolvido NO DESTINO por documento_processos.legacy_id (o mapa
// de processos é compartilhado com Documentos Internos e veio da mesma
// sgq_proc) — nenhum id de processo do snapshot de dev viaja no SQL.
//
// Gera SQL idempotente em scripts/out/. Read-only no v1. NÃO aplica nada.
// Levantamento: docs/migracao-tabelas-registros-v1.md

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

// O sgq_reg tem lixo binário (NUL etc.) que o Postgres rejeita em TEXT.
const limpaCtl = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

// O v1 começou em texto plano e terminou gravando HTML de editor rico na
// MESMA coluna. HTML passa como está; texto plano é escapado e embrulhado
// em <p>, para o RichContent render os dois iguais.
function paraHtml(txt) {
  const t = limpaCtl(txt).trim()
  if (!t) return null
  if (/<\/?[a-z][a-z0-9]*[^>]*>/i.test(t)) return t
  const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.split(/\r?\n+/).map((l) => `<p>${l.trim()}</p>`).filter((p) => p !== '<p></p>').join('')
}

// Processo e tabela resolvidos no destino (ids divergem entre dev e produção).
const subProcesso = (legacyId) => legacyId
  ? `(SELECT id FROM documento_processos WHERE legacy_id = ${N(legacyId)} AND (empresa_id = ${S(EMP)} OR empresa_id IS NULL) LIMIT 1)`
  : 'NULL'
const subTabela = (legacyId) =>
  `(SELECT id FROM tabelas_registros WHERE legacy_id = ${N(legacyId)} AND empresa_id = ${S(EMP)} LIMIT 1)`

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
  const nomeV1 = new Map(usuariosV1.map((u) => [Number(u.id), String(u.nome || '').trim() || null]))
  const v1ParaV2 = new Map()
  for (const u of usuariosV1) {
    const id = (u.email && porEmail.get(String(u.email).toLowerCase())) || porNome.get(chave(u.nome)) || null
    if (id) v1ParaV2.set(Number(u.id), id)
  }

  const [regs] = await my.query('SELECT id, id_mestre, usuario, dt_registro, registro, processo, armazenamento, protecao, recuperacao, retencao, disposicao, versao, ativo FROM sgq_reg ORDER BY id')

  // Reconstrói as cadeias: raiz = id_mestre 0 ou apontando para si mesma.
  const cadeias = new Map()
  for (const r of regs) {
    const raiz = (!r.id_mestre || Number(r.id_mestre) === Number(r.id)) ? Number(r.id) : Number(r.id_mestre)
    if (!cadeias.has(raiz)) cadeias.set(raiz, [])
    cadeias.get(raiz).push(r)
  }

  const sql = []
  sql.push('-- Importação das Tabelas de Registros do OneClick v1 (sgq_reg).')
  sql.push('-- Gerado por scripts/legacy-v1-tabelas-import.js — idempotente por legacy_id.')
  sql.push('-- Aplicar DEPOIS de add_tabelas_registros.sql (e da carga de documentos,')
  sql.push('-- que traz os processos com legacy_id).')
  sql.push('')
  sql.push('BEGIN;')

  let tabelasOk = 0, versoesOk = 0, mortas = 0, semUsuario = 0
  for (const [raiz, linhas] of [...cadeias.entries()].sort((a, b) => a[0] - b[0])) {
    const vigente = linhas.find((l) => Number(l.ativo) === 1)
    if (!vigente) { mortas++; continue } // cadeia descartada no v1

    linhas.sort((a, b) => (Number(a.versao) - Number(b.versao)) || (Number(a.id) - Number(b.id)))
    const primeira = linhas[0]

    // Cabeçalho: nome e processo da linha vigente (é o que o v1 mostrava).
    sql.push(
      `INSERT INTO tabelas_registros (id, empresa_id, legacy_id, nome, processo_id, criado_em)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(raiz)}, ${S(String(vigente.registro || '').trim() || `Registro #${raiz}`)},` +
      ` ${subProcesso(vigente.processo)},` +
      ` ${dataISO(primeira.dt_registro) ? `${S(dataISO(primeira.dt_registro))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM tabelas_registros WHERE legacy_id = ${N(raiz)} AND empresa_id = ${S(EMP)});`)
    tabelasOk++

    for (const l of linhas) {
      const usu = v1ParaV2.get(Number(l.usuario)) || null
      // Ex-colaborador sem conta no v2: o nome fica como resíduo, igual às
      // capacitações — o histórico não perde o autor.
      const nomeResiduo = usu ? null : nomeV1.get(Number(l.usuario)) || null
      if (!usu && l.usuario) semUsuario++
      sql.push(
        `INSERT INTO tabela_registro_versoes (id, tabela_id, legacy_id, versao, data_versao, armazenamento, protecao, recuperacao, retencao, disposicao, registrado_por_id, registrado_por_nome, criado_em)` +
        ` SELECT gen_random_uuid()::text, ${subTabela(raiz)}, ${N(l.id)}, ${N(l.versao) === 'NULL' ? '0' : N(l.versao)},` +
        ` ${S(dataISO(l.dt_registro) || dataISO(primeira.dt_registro) || '1970-01-01')}::date,` +
        ` ${S(paraHtml(l.armazenamento))}, ${S(paraHtml(l.protecao))}, ${S(paraHtml(l.recuperacao))}, ${S(paraHtml(l.retencao))}, ${S(paraHtml(l.disposicao))},` +
        ` ${S(usu)}, ${S(nomeResiduo)},` +
        ` ${dataISO(l.dt_registro) ? `${S(dataISO(l.dt_registro))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
        ` WHERE NOT EXISTS (SELECT 1 FROM tabela_registro_versoes WHERE legacy_id = ${N(l.id)});`)
      versoesOk++
    }

    // Ponteiro da vigente — a linha ativo=1 da cadeia.
    sql.push(
      `UPDATE tabelas_registros SET versao_atual_id = (SELECT id FROM tabela_registro_versoes WHERE legacy_id = ${N(vigente.id)} LIMIT 1)` +
      ` WHERE legacy_id = ${N(raiz)} AND empresa_id = ${S(EMP)} AND versao_atual_id IS NULL;`)
  }

  sql.push('COMMIT;')

  fs.mkdirSync(SAIDA, { recursive: true })
  const arq = path.join(SAIDA, 'v1-tabelas-registros.sql')
  fs.writeFileSync(arq, sql.join('\n'), 'utf8')
  console.log('=== Tabelas de Registros — v1 → v2 ===')
  console.log(`cadeias vivas ....... ${tabelasOk}`)
  console.log(`versões ............. ${versoesOk}`)
  console.log(`cadeias mortas ...... ${mortas} (ficam no v1)`)
  console.log(`versões sem usuário . ${semUsuario} (nome do v1 fica como resíduo)`)
  console.log(`SQL: ${arq}`)

  await my.end()
  await prisma.$disconnect()
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1) })
