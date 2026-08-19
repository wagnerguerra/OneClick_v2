// Importa do OneClick v1 (db_intranet) a Análise de Contexto da Qualidade:
//   • sgq_ctx (ativos)     → analises_contexto
//   • sgq_ctx_act (ativas) → analise_contexto_acoes
//
// Mapas do v1: contexto 1/2 → EXTERNA/INTERNA; tipo 1-4 → OPORTUNIDADE/
// AMEACA/FORCA/FRAQUEZA; ação tipo 1-3 → IMEDIATA/CORRETIVA/AVALIACAO_EFICACIA.
// O responsável do registro é user id; o da AÇÃO é TEXTO LIVRE (às vezes
// vários nomes) — casa por nome quando dá, senão vira resíduo. Datas de
// avaliação/finalização vêm em formato misto (yyyy-mm-dd E d/m/yyyy).
// sgq_ctx_arq/log/msg estão vazias e sgq_con_* é matriz antiga abandonada.
//
// Gera SQL idempotente em scripts/out/. Read-only no v1. NÃO aplica nada.
// Levantamento: docs/migracao-analise-contexto-v1.md

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
const B = (v) => (v == null ? 'NULL' : v ? 'true' : 'false')
const chave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const limpaCtl = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

// Datas do v1 em formato misto: yyyy-mm-dd OU d/m/yyyy.
function dataMista(v) {
  const t = limpaCtl(v).trim().slice(0, 10)
  if (!t || t === '0000-00-00') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

// Texto plano do v1 → HTML mínimo pro RichContent (mesma regra das tabelas).
function paraHtml(txt) {
  const t = limpaCtl(txt).trim()
  if (!t) return null
  if (/<\/?[a-z][a-z0-9]*[^>]*>/i.test(t)) return t
  const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/^"|"$/g, '')
  return esc.split(/\r?\n+/).map((l) => `<p>${l.trim()}</p>`).filter((p) => p !== '<p></p>').join('')
}

const ANALISE = { 1: 'EXTERNA', 2: 'INTERNA' }
const TIPO = { 1: 'OPORTUNIDADE', 2: 'AMEACA', 3: 'FORCA', 4: 'FRAQUEZA' }
const ACAO_TIPO = { 1: 'IMEDIATA', 2: 'CORRETIVA', 3: 'AVALIACAO_EFICACIA' }

const subAnalise = (legacyId) =>
  `(SELECT id FROM analises_contexto WHERE legacy_id = ${N(legacyId)} AND empresa_id = ${S(EMP)} LIMIT 1)`

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
  // Resolve um user id do v1: retorna { id, nome } (nome só quando não casa).
  const userV1 = (raw) => {
    const n = Number(raw)
    if (!raw || !n) return { id: null, nome: null }
    const id = v1ParaV2.get(n) || null
    return { id, nome: id ? null : nomeV1.get(n) || null }
  }

  const [ctxs] = await my.query('SELECT * FROM sgq_ctx WHERE ativo = 1 ORDER BY id')
  const [acts] = await my.query('SELECT * FROM sgq_ctx_act WHERE ativo = 1 ORDER BY id')
  const ctxIds = new Set(ctxs.map((c) => Number(c.id)))

  const sql = []
  sql.push('-- Importação da Análise de Contexto do OneClick v1 (sgq_contexto).')
  sql.push('-- Gerado por scripts/legacy-v1-contexto-import.js — idempotente por legacy_id.')
  sql.push('-- Aplicar DEPOIS de add_analise_contexto.sql.')
  sql.push('')
  sql.push('BEGIN;')

  let regsOk = 0, acoesOk = 0, acoesOrfas = 0, respTexto = 0
  for (const c of ctxs) {
    const resp = userV1(c.responsavel)
    const aval = userV1(c.id_usuario_avaliacao)
    sql.push(
      `INSERT INTO analises_contexto (id, empresa_id, legacy_id, analise, tipo, identificacao, processo, parte_interessada, gravidade, probabilidade, responsavel_id, responsavel_nome, prazo, avaliado_por_id, avaliado_por_nome, avaliado_em, avaliacao, eficaz, ativo)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(c.id)}, ${S(ANALISE[Number(c.contexto)] ?? 'EXTERNA')}, ${S(TIPO[Number(c.tipo)] ?? 'OPORTUNIDADE')},` +
      ` ${S(limpaCtl(c.identificacao).trim() || `Registro #${c.id}`)}, ${S(limpaCtl(c.processo).trim() || null)}, ${S(paraHtml(c.parte_interessada))},` +
      ` ${N(c.gravidade_beneficio)}, ${N(c.probabilidade)},` +
      ` ${S(resp.id)}, ${S(resp.nome)},` +
      ` ${dataMista(c.prazo) ? `${S(dataMista(c.prazo))}::date` : 'NULL'},` +
      ` ${S(aval.id)}, ${S(aval.nome)},` +
      ` ${dataMista(c.dt_avaliacao) ? `${S(dataMista(c.dt_avaliacao))}::date` : 'NULL'},` +
      ` ${S(paraHtml(c.avaliacao))},` +
      ` ${c.eficaz == null || c.eficaz === '' ? 'NULL' : Number(c.eficaz) === 1 ? 'true' : 'false'}, true` +
      ` WHERE NOT EXISTS (SELECT 1 FROM analises_contexto WHERE legacy_id = ${N(c.id)} AND empresa_id = ${S(EMP)});`)
    regsOk++
  }

  for (const a of acts) {
    const pai = Number(a.id_registro)
    if (!ctxIds.has(pai)) { acoesOrfas++; continue } // pai inativo/inexistente
    // Responsável da ação é texto livre; casa por nome só quando é UM nome conhecido.
    const respId = porNome.get(chave(a.responsavel)) || null
    const respNome = respId ? null : (limpaCtl(a.responsavel).trim() || null)
    if (!respId && respNome) respTexto++
    const fin = userV1(a.usuario_finalizado)
    const concluida = Number(a.situacao) === 1
    sql.push(
      `INSERT INTO analise_contexto_acoes (id, analise_id, legacy_id, tipo, descricao, responsavel_id, responsavel_nome, prazo, concluida, finalizado_em, finalizado_por_id, observacao)` +
      ` SELECT gen_random_uuid()::text, ${subAnalise(pai)}, ${N(a.id)}, ${S(ACAO_TIPO[Number(a.tipo)] ?? 'CORRETIVA')},` +
      ` ${S(paraHtml(a.acao || a.oquefazer) || '<p>(sem descrição)</p>')},` +
      ` ${S(respId)}, ${S(respNome)},` +
      ` ${dataMista(a.dt_prazo || a.prazo) ? `${S(dataMista(a.dt_prazo || a.prazo))}::date` : 'NULL'},` +
      ` ${concluida ? 'true' : 'false'},` +
      ` ${concluida && dataMista(a.dt_finalizado) ? `${S(dataMista(a.dt_finalizado))}::date` : 'NULL'},` +
      ` ${concluida ? S(fin.id) : 'NULL'},` +
      ` ${S(paraHtml(a.obs))}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM analise_contexto_acoes WHERE legacy_id = ${N(a.id)});`)
    acoesOk++
  }

  sql.push('COMMIT;')

  fs.mkdirSync(SAIDA, { recursive: true })
  const arq = path.join(SAIDA, 'v1-analise-contexto.sql')
  fs.writeFileSync(arq, sql.join('\n'), 'utf8')
  console.log('=== Análise de Contexto — v1 → v2 ===')
  console.log(`registros ............ ${regsOk} (de ${ctxs.length + (42 - regsOk >= 0 ? 0 : 0)} ativos no v1)`)
  console.log(`ações ................ ${acoesOk}`)
  console.log(`ações de pai inativo . ${acoesOrfas} (ficam no v1)`)
  console.log(`resp. de ação texto .. ${respTexto} (não casaram com usuário)`)
  console.log(`SQL: ${arq}`)

  await my.end()
  await prisma.$disconnect()
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1) })
