// Importa do OneClick v1 (db_intranet) o módulo de Reuniões da Qualidade:
//   • tipos 1/2/3 chumbados no v1 → reuniao_tipos
//   • sgq_reu (ativas)            → reunioes
//   • sgq_reu.participantes +
//     sgq_reu_par                 → reuniao_participantes   (ver §2 do doc)
//   • sgq_reu_aca                 → reuniao_acoes
//   • sgq_reu_arq                 → reuniao_arquivos (só os que têm arquivo)
//   • sgq_reu_msg                 → reuniao_mensagens
//   • files/sgq_reunioes          → apps/api/uploads/reunioes-legado/
//
// Gera SQL idempotente em scripts/out/ e COPIA os arquivos. Read-only no v1.
// NÃO aplica SQL nenhum sozinho.
//
// Levantamento do legado: docs/migracao-reunioes-v1.md

const fs = require('fs')
const path = require('path')
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'))
const { PrismaClient } = require(path.join(__dirname, '..', 'packages', 'db', 'src', 'generated', 'client'))

const EMP = 'cmnn7xm6e00009gqgoii3ims2' // CENTRAL CONTÁBIL (tenant ativo)
const ORIGEM_ARQUIVOS = '//192.168.0.7/wwwroot/files/sgq_reunioes'
const DESTINO_ARQUIVOS = path.join(__dirname, '..', 'apps', 'api', 'uploads', 'reunioes-legado')
const SAIDA = path.join(__dirname, 'out')
const COPIAR = !process.argv.includes('--sem-arquivos')

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
const B = (v) => (v ? 'true' : 'false')

/** Data do MySQL: `0000-00-00` e nulo viram ausência declarada, não 1970. */
function dataISO(v) {
  const t = String(v ?? '').slice(0, 10)
  if (!t || t === '0000-00-00') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

/** Os três tipos que o v1 tinha chumbados no `<select>` do create.asp. */
const TIPOS = [
  { legacy: 1, nome: 'Análise Crítica' },
  { legacy: 2, nome: 'Setorial' },
  { legacy: 3, nome: 'Outros' },
]

/** `sgq_reu_aca.situacao` '1'/'2' → status do v2. */
const STATUS_ACAO = { 1: 'PENDENTE', 2: 'CONCLUIDA' }

const MIME = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }

const chave = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim()

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

  // Escopo do tenant: `empresaId` da Central OU nulo. Nao e frouxidao — no
  // snapshot de dev parte das linhas da Central ainda esta com empresa_id
  // NULO (backfill antigo pela metade), enquanto em producao esta etiquetada.
  // Filtrar so por EMP perde metade dos usuarios no dev; incluir NULO cobre os
  // dois ambientes e nunca alcanca outro tenant, que sempre tem id proprio.
  // Prisma nao aceita null dentro de `in` — daí o OR.
  const ESCOPO_EMPRESA = { OR: [{ empresaId: EMP }, { empresaId: null }] }

  // Usuários SÓ da empresa de destino — sem este filtro o casamento por nome
  // pega gente de outro tenant (incidente de 18/08).
  const [usuariosV1] = await my.query('SELECT CAD_USU_ID id, CAD_USU_NOME nome, CAD_USU_EMAIL email, CAD_USU_SETOR setor FROM ger_cad_usu')
  const usuariosV2 = await prisma.user.findMany({
    where: ESCOPO_EMPRESA,
    select: { id: true, name: true, email: true },
  })
  const porNome = new Map(usuariosV2.map((u) => [chave(u.name), u.id]))
  const porEmail = new Map(usuariosV2.filter((u) => u.email).map((u) => [String(u.email).toLowerCase(), u.id]))

  const v1ParaV2 = new Map()
  const nomeV1 = new Map()
  for (const u of usuariosV1) {
    nomeV1.set(Number(u.id), u.nome)
    const id = (u.email && porEmail.get(String(u.email).toLowerCase())) || porNome.get(chave(u.nome)) || null
    if (id) v1ParaV2.set(Number(u.id), id)
  }
  const uid = (v) => v1ParaV2.get(Number(v)) || null

  // Áreas do v2, para herdar a do autor: era assim que o v1 derivava a área
  // (setor de quem registrou, via ger_cad_set). Casamento por nome do setor.
  const [setores] = await my.query('SELECT id, cad_set_nome nome FROM ger_cad_set')
  const areasV2 = await prisma.area.findMany({ where: { AND: [ESCOPO_EMPRESA, { isActive: true }] }, select: { id: true, name: true } })
  const areaPorNome = new Map(areasV2.map((a) => [chave(a.name), a.id]))
  const setorParaArea = new Map()
  for (const s of setores) {
    const a = areaPorNome.get(chave(s.nome))
    if (a) setorParaArea.set(Number(s.id), a)
  }
  const setorDoUsuarioV1 = new Map(usuariosV1.map((u) => [Number(u.id), Number(u.setor)]))

  // Clientes: o v1 guarda o id do ger_cad_cli; daqui sai o CNPJ, e o SQL
  // resolve o cliente NO AMBIENTE DE DESTINO por subselect. Embutir o id
  // resolvido no dev quebrou em 19/08: sete clientes existiam no snapshot com
  // um id e em producao com outro — o registro entraria apontando pro nada.
  // Limpeza mantem alfanumericos (regra do CNPJ alfanumerico), nao so digitos.
  const [clientesV1] = await my.query("SELECT id, cad_cli_cnpj cnpj FROM ger_cad_cli")
  const limpaDoc = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
  const cnpjDoClienteV1 = new Map(clientesV1.map((c) => [Number(c.id), limpaDoc(c.cnpj)]))
  const subCliente = (cnpj) => cnpj
    ? `(SELECT id FROM clientes WHERE regexp_replace(upper(coalesce(documento,'')),'[^0-9A-Z]','','g') = '${cnpj}'` +
      ` AND (empresa_id = ${S(EMP)} OR empresa_id IS NULL) ORDER BY (empresa_id IS NOT NULL) DESC LIMIT 1)`
    : 'NULL'

  const [reus] = await my.query(`
    SELECT id, tipo, cliente, titulo, usu_registro, dt_registro, data_reuniao, hora_inicio, hora_fim,
           local, pauta, ata, participantes
      FROM sgq_reu WHERE ativo = 1 ORDER BY id`)
  const [pars] = await my.query('SELECT ID_REUNIAO, PARTICIPANTE FROM sgq_reu_par WHERE ATIVO = 1')
  const [acoes] = await my.query(`
    SELECT id, id_reg, situacao, id_usuario, acao, dt_prazo, responsavel, usuario_finalizado,
           dt_finalizado, obs
      FROM sgq_reu_aca WHERE ativo = 1 ORDER BY id`)
  const [arqs] = await my.query('SELECT ID, id_registro, USUARIO, DESCRICAO, LINK FROM sgq_reu_arq WHERE ativo = 1')
  const [msgs] = await my.query('SELECT id, id_registro, interacao, usuario FROM sgq_reu_msg WHERE ativo = 1')

  const emDisco = fs.existsSync(ORIGEM_ARQUIVOS) ? new Set(fs.readdirSync(ORIGEM_ARQUIVOS)) : new Set()
  const reuIds = new Set(reus.map((r) => Number(r.id)))

  // Participantes por ID que a tabela relacional do v1 guarda (47 reuniões).
  const parPorReuniao = new Map()
  for (const p of pars) {
    const k = Number(p.ID_REUNIAO)
    if (!parPorReuniao.has(k)) parPorReuniao.set(k, new Set())
    parPorReuniao.get(k).add(Number(p.PARTICIPANTE))
  }

  const sql = []
  const avisos = []
  sql.push('-- Importação das Reuniões do OneClick v1 (sgq_reunioes).')
  sql.push('-- Gerado por scripts/legacy-v1-reunioes-import.js — idempotente por legacy_id.')
  sql.push('-- Aplicar DEPOIS de add_reunioes.sql.')
  sql.push('')
  sql.push('BEGIN;')
  sql.push('')
  sql.push('-- ── Tipos ──')
  for (const t of TIPOS) {
    sql.push(
      `INSERT INTO reuniao_tipos (id, empresa_id, legacy_id, nome, ordem, ativo)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(t.legacy)}, ${S(t.nome)}, ${N(t.legacy)}, true` +
      ` WHERE NOT EXISTS (SELECT 1 FROM reuniao_tipos WHERE legacy_id = ${N(t.legacy)} AND empresa_id = ${S(EMP)});`)
  }
  sql.push('')

  let semData = 0, semTitulo = 0, comArea = 0, comCliente = 0
  sql.push('-- ── Reuniões ──')
  for (const r of reus) {
    const data = dataISO(r.data_reuniao)
    if (!data) { semData++; avisos.push(`reunião ${r.id}: sem data legível — pulada`); continue }

    let titulo = String(r.titulo || '').trim()
    if (!titulo) { titulo = `Reunião #${r.id} (sem título no sistema antigo)`; semTitulo++ }

    // Área herdada do SETOR de quem registrou — era assim que o v1 derivava.
    const setor = setorDoUsuarioV1.get(Number(r.usu_registro))
    const areaId = setor ? setorParaArea.get(setor) || null : null
    if (areaId) comArea++
    const cnpjCli = Number(r.cliente) > 0 ? cnpjDoClienteV1.get(Number(r.cliente)) || null : null
    if (cnpjCli) comCliente++

    sql.push(
      `INSERT INTO reunioes (id, empresa_id, numero, tipo_id, titulo, cliente_id, area_id, data,` +
      ` hora_inicio, hora_fim, local, pauta, ata, autor_id)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(r.id)},` +
      ` (SELECT id FROM reuniao_tipos WHERE legacy_id = ${N(r.tipo || 3)} AND empresa_id = ${S(EMP)}),` +
      ` ${S(titulo)}, ${subCliente(cnpjCli)}, ${S(areaId)}, ${S(data)}::date,` +
      ` ${S(String(r.hora_inicio || '').slice(0, 5) || null)}, ${S(String(r.hora_fim || '').slice(0, 5) || null)},` +
      ` ${S(r.local)}, ${S(r.pauta)}, ${S(r.ata)}, ${S(uid(r.usu_registro))}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM reunioes WHERE numero = ${N(r.id)} AND empresa_id = ${S(EMP)});`)
  }
  sql.push('')

  // ── Participantes: junta os dois mecanismos do v1 ──
  // A tabela `sgq_reu_par` guarda por ID (melhor dado, 47 reuniões); o longtext
  // `participantes` guarda nomes soltos (193 reuniões). Usa-se o ID quando
  // existe e o nome quando é a única coisa que há — assim nada se perde e não
  // se duplica a mesma pessoa.
  let parPorId = 0, parPorNome = 0
  sql.push('-- ── Participantes ──')
  for (const r of reus) {
    if (!dataISO(r.data_reuniao)) continue
    const idsDaTabela = parPorReuniao.get(Number(r.id)) || new Set()
    const jaPorNome = new Set()

    for (const pv1 of idsDaTabela) {
      const u = uid(pv1)
      const nome = u ? null : (nomeV1.get(pv1) || null)
      if (!u && !nome) continue
      if (u) parPorId++; else { parPorNome++; jaPorNome.add(chave(nome)) }
      if (u) jaPorNome.add(chave(nomeV1.get(pv1)))
      sql.push(
        `INSERT INTO reuniao_participantes (id, reuniao_id, usuario_id, nome, presente)` +
        ` SELECT gen_random_uuid()::text, x.id, ${S(u)}, ${S(nome)}, true FROM reunioes x` +
        ` WHERE x.numero = ${N(r.id)} AND x.empresa_id = ${S(EMP)}` +
        ` AND NOT EXISTS (SELECT 1 FROM reuniao_participantes p WHERE p.reuniao_id = x.id` +
        ` AND ${u ? `p.usuario_id = ${S(u)}` : `p.nome = ${S(nome)}`});`)
    }

    for (const bruto of String(r.participantes || '').split(',')) {
      const nome = bruto.trim()
      if (!nome || nome === '0') continue
      if (jaPorNome.has(chave(nome))) continue   // já entrou pela tabela por ID
      jaPorNome.add(chave(nome))
      const u = porNome.get(chave(nome)) || null
      if (u) parPorId++; else parPorNome++
      sql.push(
        `INSERT INTO reuniao_participantes (id, reuniao_id, usuario_id, nome, presente)` +
        ` SELECT gen_random_uuid()::text, x.id, ${S(u)}, ${S(u ? null : nome)}, true FROM reunioes x` +
        ` WHERE x.numero = ${N(r.id)} AND x.empresa_id = ${S(EMP)}` +
        ` AND NOT EXISTS (SELECT 1 FROM reuniao_participantes p WHERE p.reuniao_id = x.id` +
        ` AND ${u ? `p.usuario_id = ${S(u)}` : `p.nome = ${S(nome)}`});`)
    }
  }
  sql.push('')

  let acoesOk = 0, acPorId = 0, acPorNome = 0
  sql.push('-- ── Plano de ação ──')
  for (const a of acoes) {
    if (!reuIds.has(Number(a.id_reg))) continue
    const respId = uid(a.id_usuario)
    const respNome = respId ? null : (String(a.responsavel || '').trim() || null)
    const status = STATUS_ACAO[Number(a.situacao)] || 'PENDENTE'
    const concl = dataISO(a.dt_finalizado)
    if (respId) acPorId++; else if (respNome) acPorNome++
    sql.push(
      `INSERT INTO reuniao_acoes (id, reuniao_id, descricao, responsavel_id, responsavel_nome, prazo,` +
      ` status, concluido_em, concluido_por_id, observacao)` +
      ` SELECT gen_random_uuid()::text, x.id, ${S(String(a.acao || '').trim() || '(sem descrição no sistema antigo)')},` +
      ` ${S(respId)}, ${S(respNome)}, ${dataISO(a.dt_prazo) ? `${S(dataISO(a.dt_prazo))}::date` : 'NULL'},` +
      ` ${S(status)}, ${status === 'CONCLUIDA' && concl ? `${S(concl)}::timestamp` : 'NULL'},` +
      ` ${S(uid(a.usuario_finalizado))}, ${S(a.obs)}` +
      ` FROM reunioes x WHERE x.numero = ${N(a.id_reg)} AND x.empresa_id = ${S(EMP)}` +
      ` AND NOT EXISTS (SELECT 1 FROM reuniao_acoes y WHERE y.reuniao_id = x.id AND y.descricao = ` +
      `${S(String(a.acao || '').trim() || '(sem descrição no sistema antigo)')});`)
    acoesOk++
  }
  sql.push('')

  let arqOk = 0, arqSem = 0
  const aCopiar = []
  sql.push('-- ── Anexos (só os que têm arquivo em disco) ──')
  for (const a of arqs) {
    if (!reuIds.has(Number(a.id_registro))) continue
    const nome = String(a.LINK || '').replace(/^\//, '')
    if (!nome || !emDisco.has(nome)) { arqSem++; continue }
    aCopiar.push(nome)
    const ext = (nome.split('.').pop() || '').toLowerCase()
    sql.push(
      `INSERT INTO reuniao_arquivos (id, reuniao_id, autor_id, nome, arquivo_path, mime)` +
      ` SELECT gen_random_uuid()::text, x.id, ${S(uid(a.USUARIO))}, ${S(a.DESCRICAO || nome)},` +
      ` ${S('/api/upload/reunioes-legado/' + nome)}, ${S(MIME[ext] || null)}` +
      ` FROM reunioes x WHERE x.numero = ${N(a.id_registro)} AND x.empresa_id = ${S(EMP)}` +
      ` AND NOT EXISTS (SELECT 1 FROM reuniao_arquivos y WHERE y.reuniao_id = x.id AND y.arquivo_path = ` +
      `${S('/api/upload/reunioes-legado/' + nome)});`)
    arqOk++
  }
  sql.push('')

  let msgOk = 0
  sql.push('-- ── Mensagens ──')
  for (const m of msgs) {
    if (!reuIds.has(Number(m.id_registro))) continue
    const texto = String(m.interacao || '').trim()
    if (!texto) continue
    sql.push(
      `INSERT INTO reuniao_mensagens (id, reuniao_id, autor_id, texto)` +
      ` SELECT gen_random_uuid()::text, x.id, ${S(uid(m.usuario))}, ${S(texto)}` +
      ` FROM reunioes x WHERE x.numero = ${N(m.id_registro)} AND x.empresa_id = ${S(EMP)}` +
      ` AND NOT EXISTS (SELECT 1 FROM reuniao_mensagens y WHERE y.reuniao_id = x.id AND y.texto = ${S(texto)});`)
    msgOk++
  }

  sql.push('')
  sql.push('COMMIT;')

  fs.mkdirSync(SAIDA, { recursive: true })
  const arqSql = path.join(SAIDA, 'v1-reunioes.sql')
  fs.writeFileSync(arqSql, sql.join('\n'), 'utf8')

  let copiados = 0, jaExistiam = 0
  if (COPIAR && aCopiar.length) {
    fs.mkdirSync(DESTINO_ARQUIVOS, { recursive: true })
    for (const nome of [...new Set(aCopiar)]) {
      const para = path.join(DESTINO_ARQUIVOS, nome)
      if (fs.existsSync(para)) { jaExistiam++; continue }
      fs.copyFileSync(path.join(ORIGEM_ARQUIVOS, nome), para)
      copiados++
    }
  }

  console.log('=== Reuniões — v1 → v2 ===')
  console.log(`tipos ........... ${TIPOS.length}`)
  console.log(`reuniões ........ ${reus.length - semData}${semData ? ` (${semData} sem data, puladas)` : ''}${semTitulo ? `  (${semTitulo} sem título no v1)` : ''}`)
  console.log(`  com CNPJ p/ resolver no destino: ${comCliente} · com área herdada do setor do autor: ${comArea}`)
  console.log(`participantes ... ${parPorId + parPorNome}  (${parPorId} por ID, ${parPorNome} só com nome)`)
  console.log(`ações ........... ${acoesOk}  (${acPorId} responsável por ID, ${acPorNome} só com nome)`)
  console.log(`anexos .......... ${arqOk}${arqSem ? `  (${arqSem} SEM arquivo em disco — fora da carga)` : ''}`)
  console.log(`mensagens ....... ${msgOk}`)
  if (COPIAR) console.log(`arquivos ........ ${copiados} copiados, ${jaExistiam} já existiam`)
  console.log(`\nSQL: ${arqSql}`)
  if (avisos.length) {
    console.log(`\navisos (${avisos.length}):`)
    for (const a of avisos.slice(0, 10)) console.log('  •', a)
  }

  await my.end()
  await prisma.$disconnect()
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1) })
