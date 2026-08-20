// Importa do OneClick v1 (db_intranet) a Coleta e Recebimento:
//   • crpcltcat (19)              → coleta_categorias (área por nome do setor)
//   • crpclt (ativos)             → coletas
//   • crpcltlog (dos ativos)      → coleta_logs
//
// Mapeamentos fiéis ao original:
//   tipo 1/2/3 → ENTREGA/COLETA/RECEBIMENTO; situacao 1..12 → enum na ordem
//   do crpcltsts; prioridade 1/2/3 (Baixa/Média/Alta) preservada.
//   Cliente: crpclt.cliente é id do ger_cad_cli → v2 por CNPJ (subselect no
//   destino, funciona em dev e produção). Solicitante/autor do log:
//   ger_cad_usu → user v2 por email/nome, com resíduo de nome.
//   descricao vinha em HTML do editor do v1 → vira texto puro (tags fora,
//   entidades decodificadas).
//
// Gera SQL idempotente (legacy_id) em scripts/out/. Read-only no v1.

const fs = require('fs')
const path = require('path')
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'))
const { PrismaClient } = require(path.join(__dirname, '..', 'packages', 'db', 'src', 'generated', 'client'))

const EMP = 'cmnn7xm6e00009gqgoii3ims2' // CENTRAL CONTÁBIL (tenant ativo)
const SAIDA = path.join(__dirname, 'out')

const SIT = ['', 'AGUARDANDO_ROTA', 'ROTA_CONFIRMADA', 'RETIRADA_DISPONIVEL', 'ENTREGUE_CLIENTE',
  'NA_RECEPCAO', 'EM_TRIAGEM', 'NO_SETOR', 'DEVOLVIDO_ARQUIVO', 'DEVOLVIDO_CLIENTE',
  'PROTOCOLO_ARQUIVADO', 'ENTREGUE_ARQUIVO', 'PROTOCOLO_ENTREGUE']
const TIPO = { 1: 'ENTREGA', 2: 'COLETA', 3: 'RECEBIMENTO' }

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
const limpaCtl = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

const ENT = { aacute: 'á', agrave: 'à', atilde: 'ã', acirc: 'â', eacute: 'é', ecirc: 'ê',
  iacute: 'í', oacute: 'ó', otilde: 'õ', ocirc: 'ô', uacute: 'ú', uuml: 'ü', ccedil: 'ç',
  Aacute: 'Á', Agrave: 'À', Atilde: 'Ã', Acirc: 'Â', Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í',
  Oacute: 'Ó', Otilde: 'Õ', Ocirc: 'Ô', Uacute: 'Ú', Ccedil: 'Ç', nbsp: ' ', ordm: 'º',
  ordf: 'ª', deg: '°', sect: '§', middot: '·', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', quot: '"' }

/** HTML do editor do v1 → texto puro (o campo no v2 é texto simples). */
function htmlParaTexto(html) {
  if (!html) return null
  let s = String(html)
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
  s = s.replace(/&(#\d+|[A-Za-z]+);/g, (m, e) => {
    if (e[0] === '#') return String.fromCharCode(Number(e.slice(1)))
    if (e === 'amp') return '&'
    if (e === 'lt') return '<'
    if (e === 'gt') return '>'
    return ENT[e] ?? m
  })
  s = limpaCtl(s).replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim()
  return s || null
}

function tsISO(v) {
  // aceita "2026-08-19 14:23:22" e o "2026-8-19 14:41:19" sem zero do log
  const m = String(v ?? '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const p = (x) => String(x).padStart(2, '0')
  return `${m[1]}-${p(m[2])}-${p(m[3])} ${p(m[4])}:${p(m[5])}:${p(m[6] || '00')}`
}

const subColeta = (legacyId) =>
  `(SELECT id FROM coletas WHERE legacy_id = ${N(legacyId)} AND empresa_id = ${S(EMP)} LIMIT 1)`
const subCliente = (cnpjLimpo) =>
  `(SELECT id FROM clientes WHERE regexp_replace(upper(documento), '[^0-9A-Z]', '', 'g') = ${S(cnpjLimpo)} AND (empresa_id = ${S(EMP)} OR empresa_id IS NULL) ORDER BY (empresa_id = ${S(EMP)}) DESC NULLS LAST, created_at LIMIT 1)`

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

  // ── usuários v1 → v2 (email > nome), com resíduo de nome ──
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

  // ── clientes v1: id → CNPJ limpo + razão (resíduo) ──
  const [clientesV1] = await my.query('SELECT id, cad_cli_cnpj cnpj, cad_cli_razao razao FROM ger_cad_cli')
  const cliV1 = new Map(clientesV1.map((c) => [Number(c.id), {
    cnpj: String(c.cnpj || '').toUpperCase().replace(/[^0-9A-Z]/g, '') || null,
    razao: String(c.razao || '').trim() || null,
  }]))

  // ── áreas v2 por nome (para ligar crpcltcat.area = ger_cad_set) ──
  const [setoresV1] = await my.query('SELECT id, CAD_SET_NOME nome FROM ger_cad_set')
  const areasV2 = await prisma.area.findMany({ where: ESCOPO, select: { id: true, name: true } })
  const areaPorNome = new Map(areasV2.map((a) => [chave(a.name), a.id]))
  const setorParaArea = new Map()
  for (const st of setoresV1) {
    const id = areaPorNome.get(chave(st.nome)) || null
    if (id) setorParaArea.set(Number(st.id), id)
  }

  const [cats] = await my.query('SELECT * FROM crpcltcat ORDER BY id')
  const [regs] = await my.query('SELECT * FROM crpclt WHERE ativo = 1 ORDER BY id')
  const regIds = new Set(regs.map((r) => Number(r.id)))
  const idsSql = regs.map((r) => Number(r.id)).join(',') || '0'
  const [logs] = await my.query(`SELECT * FROM crpcltlog WHERE id_registro IN (${idsSql}) ORDER BY id`)

  const sql = []
  sql.push('-- Importação da Coleta e Recebimento do OneClick v1 (crpclt).')
  sql.push('-- Gerado por scripts/legacy-v1-coleta-import.js — idempotente por legacy_id.')
  sql.push('-- Aplicar DEPOIS de add_coleta_documentos.sql.')
  sql.push('')
  sql.push('BEGIN;')

  // ── categorias ──
  let catComArea = 0
  for (const c of cats) {
    const areaId = setorParaArea.get(Number(c.area)) || null
    if (areaId) catComArea++
    sql.push(
      `INSERT INTO coleta_categorias (id, empresa_id, legacy_id, nome, area_id, ativo)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(c.id)}, ${S(String(c.categoria || '').trim())}, ${S(areaId)}, ${Number(c.ativo) === 1 ? 'true' : 'false'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM coleta_categorias WHERE legacy_id = ${N(c.id)} AND empresa_id = ${S(EMP)});`)
  }
  const subCategoria = (legacyId) =>
    `(SELECT id FROM coleta_categorias WHERE legacy_id = ${N(legacyId)} AND empresa_id = ${S(EMP)} LIMIT 1)`

  // ── registros ──
  let regOk = 0, semCliente = 0, semSolic = 0
  for (const r of regs) {
    const tipo = TIPO[Number(r.tipo)]
    const situacao = SIT[Number(r.situacao)]
    if (!tipo || !situacao) { console.log(`  ! registro ${r.id} com tipo/situacao inválido (${r.tipo}/${r.situacao}) — pulado`); continue }
    const cli = cliV1.get(Number(r.cliente)) || null
    if (!cli || !cli.cnpj) semCliente++
    const solic = userV1(r.usuario)
    if (!solic.id) semSolic++
    const catLegacy = Number(r.categoria) || null
    sql.push(
      `INSERT INTO coletas (id, empresa_id, legacy_id, tipo, situacao, categoria_id, competencia, prioridade, cliente_id, cliente_nome, contato, solicitante_id, solicitante_nome, descricao, notifica, ativo, registrado_em)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(r.id)}, ${S(tipo)}, ${S(situacao)},` +
      ` ${catLegacy ? subCategoria(catLegacy) : 'NULL'}, ${S(String(r.competencia || '').trim() || null)}, ${N(r.prioridade) === 'NULL' ? '2' : N(r.prioridade)},` +
      ` ${cli && cli.cnpj ? subCliente(cli.cnpj) : 'NULL'}, ${S(cli ? cli.razao : null)},` +
      ` ${S(limpaCtl(String(r.contato || '')).trim() || null)}, ${S(solic.id)}, ${S(solic.nome)},` +
      ` ${S(htmlParaTexto(r.descricao))}, ${Number(r.notifica) === 1 ? 'true' : 'false'}, true,` +
      ` ${tsISO(r.dt_reg) ? `${S(tsISO(r.dt_reg))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM coletas WHERE legacy_id = ${N(r.id)} AND empresa_id = ${S(EMP)});`)
    regOk++
  }

  // ── trilha ──
  let logOk = 0, logOrfaos = 0
  for (const l of logs) {
    const pai = Number(l.id_registro)
    if (!regIds.has(pai)) { logOrfaos++; continue }
    const autor = userV1(l.usuario)
    const situacao = SIT[Number(l.id_situacao)] || null
    sql.push(
      `INSERT INTO coleta_logs (id, coleta_id, legacy_id, situacao, evento, usuario_id, usuario_nome, criado_em)` +
      ` SELECT gen_random_uuid()::text, ${subColeta(pai)}, ${N(l.id)}, ${S(situacao)},` +
      ` ${S(limpaCtl(String(l.evento || '')).trim() || 'Evento')}, ${S(autor.id)}, ${S(autor.nome)},` +
      ` ${tsISO(l.dt_evento) ? `${S(tsISO(l.dt_evento))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM coleta_logs WHERE legacy_id = ${N(l.id)});`)
    logOk++
  }

  sql.push('COMMIT;')

  fs.mkdirSync(SAIDA, { recursive: true })
  const arq = path.join(SAIDA, 'v1-coleta.sql')
  fs.writeFileSync(arq, sql.join('\n'), 'utf8')
  console.log('=== Coleta e Recebimento — v1 → v2 ===')
  console.log(`categorias ....... ${cats.length} (com área casada: ${catComArea})`)
  console.log(`registros ........ ${regOk} (sem cliente com CNPJ: ${semCliente}; solicitante só no resíduo: ${semSolic})`)
  console.log(`eventos da trilha  ${logOk} (de registros inativos: ${logOrfaos})`)
  console.log(`SQL: ${arq}`)

  await my.end()
  await prisma.$disconnect()
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1) })
