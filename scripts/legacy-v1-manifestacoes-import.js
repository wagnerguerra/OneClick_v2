// Importa do OneClick v1 (db_intranet) as manifestações da Qualidade:
//   • sgq_elo (ativos) → manifestacoes tipo ELOGIO   (+ elogiados por id)
//   • sgq_rec (ativas) → manifestacoes tipo RECLAMACAO
//   • sgq_sug (ativas) → manifestacoes tipo SUGESTAO
//
// Idempotente pelo par (legacy_source, legacy_id) — os ids das três tabelas
// colidem entre si. O protocolo é gerado aqui (mesmo alfabeto do service);
// re-execuções não duplicam porque o INSERT é WHERE NOT EXISTS pela chave
// de legado (o protocolo aleatório novo é descartado).
//
// Mapas: rec.status 1-5 → AGUARDANDO_RETORNO / AGUARDANDO_ANALISE /
// REGISTRAR_EFICACIA / NAO_PROCEDENTE / FINALIZADA; rec.tipo 1/2 →
// origem INTERNA/CLIENTE; rec.origem (lookup) → canal; rec.classificacao →
// titulo. sug.identificar=0 → anonima (autor NÃO gravado). elo.status ''→
// RECEBIDA, 1 → ENCERRADA. Elogiados: sgq_elo_col por id; o texto solto vai
// para elogiados_texto quando não casa.
//
// Gera SQL idempotente em scripts/out/. Read-only no v1. NÃO aplica nada.
// Levantamento: docs/migracao-manifestacoes-v1.md

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

function paraHtml(txt) {
  const t = limpaCtl(txt).trim()
  if (!t) return null
  if (/<\/?[a-z][a-z0-9]*[^>]*>/i.test(t)) return t
  const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.split(/\r?\n+/).map((l) => `<p>${l.trim()}</p>`).filter((p) => p !== '<p></p>').join('')
}

// Mesmo alfabeto do service (sem caracteres ambíguos).
const ALFABETO = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
const usados = new Set()
function protocolo(prefixo) {
  for (let i = 0; i < 50; i++) {
    let corpo = ''
    const bytes = crypto.randomBytes(8)
    for (let j = 0; j < 8; j++) corpo += ALFABETO[bytes[j] % ALFABETO.length]
    const p = `${prefixo}-${corpo.slice(0, 4)}-${corpo.slice(4, 8)}`
    if (!usados.has(p)) { usados.add(p); return p }
  }
  throw new Error('protocolo esgotado')
}

const REC_STATUS = { 1: 'AGUARDANDO_RETORNO', 2: 'AGUARDANDO_ANALISE', 3: 'REGISTRAR_EFICACIA', 4: 'NAO_PROCEDENTE', 5: 'FINALIZADA' }
const REC_CANAL = { 2: 'EMAIL', 3: 'TELEFONE', 4: 'SITE', 5: 'WHATSAPP', 6: 'OUTRO', 7: 'OUTRO', 8: 'OUTRO', 9: 'OUTRO' }
const SUG_STATUS = { 1: 'RECEBIDA', 2: 'RESPONDIDA' }

const subCliente = (cnpj) => cnpj
  ? `(SELECT id FROM clientes WHERE regexp_replace(upper(coalesce(documento,'')),'[^0-9A-Z]','','g') = '${cnpj}' AND (empresa_id = ${S(EMP)} OR empresa_id IS NULL) ORDER BY (empresa_id IS NOT NULL) DESC LIMIT 1)`
  : 'NULL'
const subMan = (src, legacyId) =>
  `(SELECT id FROM manifestacoes WHERE legacy_source = ${S(src)} AND legacy_id = ${N(legacyId)} LIMIT 1)`

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
  const userId = (raw) => (raw && Number(raw) ? v1ParaV2.get(Number(raw)) || null : null)

  // Áreas por nome (ids de área coincidem entre ambientes)
  const [setores] = await my.query('SELECT id, cad_set_nome nome FROM ger_cad_set')
  const areasV2 = await prisma.area.findMany({ where: ESCOPO, select: { id: true, name: true } })
  const areaPorNome = new Map(areasV2.map((a) => [chave(a.name), a.id]))
  const setorArea = new Map()
  for (const s of setores) {
    const a = areaPorNome.get(chave(s.nome))
    if (a) setorArea.set(Number(s.id), a)
  }

  // Clientes → CNPJ (subselect no destino)
  const [clientesV1] = await my.query('SELECT id, cad_cli_cnpj cnpj FROM ger_cad_cli')
  const cliCnpj = new Map(clientesV1.map((c) => [Number(c.id), String(c.cnpj || '').toUpperCase().replace(/[^0-9A-Z]/g, '')]))

  const [elos] = await my.query("SELECT * FROM sgq_elo WHERE ativo = '1' OR ativo = 1 ORDER BY id")
  const [eloCols] = await my.query('SELECT * FROM sgq_elo_col WHERE ativo = 1')
  const [recs] = await my.query('SELECT * FROM sgq_rec WHERE ativo = 1 ORDER BY id')
  const [sugs] = await my.query('SELECT * FROM sgq_sug WHERE ativo = 1 ORDER BY id')

  const colsPorElo = new Map()
  for (const c of eloCols) {
    const k = Number(c.ID_ELOGIO)
    if (!colsPorElo.has(k)) colsPorElo.set(k, [])
    colsPorElo.get(k).push(Number(c.COLABORADOR))
  }

  const sql = []
  sql.push('-- Importação das manifestações do OneClick v1 (sgq_elo/sgq_rec/sgq_sug).')
  sql.push('-- Gerado por scripts/legacy-v1-manifestacoes-import.js — idempotente por (legacy_source, legacy_id).')
  sql.push('-- Aplicar DEPOIS de add_manifestacoes.sql (com as colunas legacy_*).')
  sql.push('')
  sql.push('BEGIN;')

  // ── ELOGIOS ──
  let eloOk = 0, eloVinculos = 0, eloTexto = 0
  for (const e of elos) {
    const cnpj = cliCnpj.get(Number(e.cliente)) || null
    const autor = userId(e.usuario)
    // Elogiados: vínculos por id (sgq_elo_col) + tentativa de casar o texto solto.
    const ids = new Set((colsPorElo.get(Number(e.id)) || []).map((v1id) => userId(v1id)).filter(Boolean))
    const nomesTexto = limpaCtl(e.elogiados).split(/[,;\/]| e /i).map((x) => x.trim()).filter(Boolean)
    const sobras = []
    for (const nm of nomesTexto) {
      const uid = porNome.get(chave(nm))
      if (uid) ids.add(uid)
      else sobras.push(nm)
    }
    if (sobras.length) eloTexto++
    eloVinculos += ids.size
    const status = String(e.status ?? '').trim() === '1' ? 'ENCERRADA' : 'RECEBIDA'
    sql.push(
      `INSERT INTO manifestacoes (id, empresa_id, legacy_source, legacy_id, protocolo, tipo, origem, anonima, autor_id, cliente_id, informante_nome, area_id, elogiados_ids, elogiados_texto, descricao, data_ocorrido, status, criado_em)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, 'elo', ${N(e.id)}, ${S(protocolo('ELO'))}, 'ELOGIO', 'CLIENTE', false,` +
      ` ${S(autor)}, ${subCliente(cnpj)}, ${S(limpaCtl(e.nome_elogio).trim() || null)}, NULL,` +
      ` ${ids.size ? `ARRAY[${[...ids].map((x) => S(x)).join(',')}]::text[]` : `ARRAY[]::text[]`}, ${S(sobras.join(', ') || null)},` +
      ` ${S(paraHtml(e.descricao) || '<p>(sem descrição)</p>')}, ${dataISO(e.dt_elo) ? `${S(dataISO(e.dt_elo))}::date` : 'NULL'}, ${S(status)},` +
      ` ${dataISO(e.dt_reg) ? `${S(dataISO(e.dt_reg))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM manifestacoes WHERE legacy_source = 'elo' AND legacy_id = ${N(e.id)});`)
    eloOk++
  }

  // ── RECLAMAÇÕES ──
  const [classes] = await my.query('SELECT id, classificacao FROM sgq_rec_classes')
  const classeNome = new Map(classes.map((c) => [Number(c.id), String(c.classificacao || '').trim()]))
  let recOk = 0
  for (const r of recs) {
    const cnpj = cliCnpj.get(Number(r.id_cliente)) || null
    const autor = userId(r.id_usuario)
    const origem = Number(r.tipo) === 1 ? 'INTERNA' : 'CLIENTE'
    const status = REC_STATUS[Number(r.status)] ?? 'AGUARDANDO_RETORNO'
    const canal = REC_CANAL[Number(r.origem)] ?? null
    const titulo = classeNome.get(Number(r.classificacao)) || null
    const tituloFinal = titulo && titulo !== 'Não Informado' ? titulo : null
    const procede = Number(r.status) === 4 ? 'false' : (Number(r.status) >= 3 ? 'true' : 'NULL')
    sql.push(
      `INSERT INTO manifestacoes (id, empresa_id, legacy_source, legacy_id, protocolo, tipo, origem, anonima, autor_id, cliente_id, informante_nome, informante_email, informante_telefone, canal, area_id, elogiados_ids, titulo, descricao, data_ocorrido, status, prazo_retorno, retorno_cliente, retorno_em, procede, causa_descricao, justificativa, retorno_final, encerrado_em, encerrado_por_id, criado_em)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, 'rec', ${N(r.id)}, ${S(protocolo('REC'))}, 'RECLAMACAO', ${S(origem)}, false,` +
      ` ${S(autor)}, ${subCliente(cnpj)}, ${S(limpaCtl(r.reclamante).trim() || null)}, ${S(limpaCtl(r.email).trim() || null)}, ${S(limpaCtl(r.telefone).trim() || null)}, ${S(canal)},` +
      ` ${S(setorArea.get(Number(r.area)) || null)}, ARRAY[]::text[], ${S(tituloFinal)},` +
      ` ${S(paraHtml(r.descricao) || '<p>(sem descrição)</p>')}, ${dataISO(r.dt_rec) ? `${S(dataISO(r.dt_rec))}::date` : 'NULL'}, ${S(status)},` +
      ` ${dataISO(r.prazo) ? `${S(dataISO(r.prazo))}::date` : 'NULL'},` +
      ` ${S(paraHtml(r.resp_cliente))}, ${dataISO(r.resp_dt) ? `${S(dataISO(r.resp_dt))}::timestamp` : 'NULL'},` +
      ` ${procede}, ${S(paraHtml(r.causa_desc))}, ${S(paraHtml(r.justificativa))}, ${S(paraHtml(r.retorno_final))},` +
      ` ${dataISO(r.dt_finalizacao) ? `${S(dataISO(r.dt_finalizacao))}::timestamp` : 'NULL'}, ${S(userId(r.id_usuario_finalizacao))},` +
      ` ${dataISO(r.dt_reg) ? `${S(dataISO(r.dt_reg))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM manifestacoes WHERE legacy_source = 'rec' AND legacy_id = ${N(r.id)});`)
    recOk++
  }

  // ── SUGESTÕES ──
  let sugOk = 0, sugAnonimas = 0
  for (const s2 of sugs) {
    const anonima = Number(s2.identificar) !== 1
    if (anonima) sugAnonimas++
    // Anônima NÃO grava autor — é o que a palavra promete (o v1 gravava e
    // escondia; aqui o dado nem viaja).
    const autor = anonima ? null : userId(s2.usuario)
    const status = SUG_STATUS[Number(s2.status)] ?? 'RECEBIDA'
    sql.push(
      `INSERT INTO manifestacoes (id, empresa_id, legacy_source, legacy_id, protocolo, tipo, origem, anonima, autor_id, elogiados_ids, titulo, descricao, status, publica, resposta, respondido_em, respondido_por_id, criado_em)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, 'sug', ${N(s2.id)}, ${S(protocolo('SUG'))}, 'SUGESTAO', 'INTERNA', ${anonima ? 'true' : 'false'},` +
      ` ${S(autor)}, ARRAY[]::text[], ${S(limpaCtl(s2.titulo).trim() || null)},` +
      ` ${S(paraHtml(s2.sugestao) || '<p>(sem descrição)</p>')}, ${S(status)}, ${Number(s2.publicar) === 1 ? 'true' : 'false'},` +
      ` ${S(paraHtml(s2.resposta))}, ${dataISO(s2.dt_resposta) ? `${S(dataISO(s2.dt_resposta))}::timestamp` : 'NULL'}, ${S(userId(s2.responsavel))},` +
      ` ${dataISO(s2.dt_sug) ? `${S(dataISO(s2.dt_sug))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM manifestacoes WHERE legacy_source = 'sug' AND legacy_id = ${N(s2.id)});`)
    sugOk++
  }

  sql.push('COMMIT;')

  fs.mkdirSync(SAIDA, { recursive: true })
  const arq = path.join(SAIDA, 'v1-manifestacoes.sql')
  fs.writeFileSync(arq, sql.join('\n'), 'utf8')
  console.log('=== Manifestações — v1 → v2 ===')
  console.log(`elogios ......... ${eloOk} (${eloVinculos} elogiados por id; ${eloTexto} com resíduo em texto)`)
  console.log(`reclamações ..... ${recOk}`)
  console.log(`sugestões ....... ${sugOk} (${sugAnonimas} anônimas — autor não gravado)`)
  console.log(`SQL: ${arq}`)

  await my.end()
  await prisma.$disconnect()
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1) })
