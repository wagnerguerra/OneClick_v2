// Importa do OneClick v1 (db_intranet) o módulo de Capacitações da Qualidade:
//   • sgq_cap_tip  → capacitacao_metodos       (o "Método" do formulário)
//   • sgq_cap      → capacitacoes
//   • sgq_cap_par  → capacitacao_participantes (já por ID no v1)
//   • sgq_cap_arq  → capacitacao_anexos        (só os que têm arquivo em disco)
//   • sgq_cap_msg  → capacitacao_mensagens
//   • files/sgq_capacitacoes → apps/api/uploads/capacitacoes-legado/
//
// Gera SQL idempotente em scripts/out/ e COPIA os arquivos. Read-only no v1.
// NÃO aplica SQL nenhum sozinho.
//
// Levantamento do legado: docs/migracao-capacitacoes-v1.md

const fs = require('fs')
const path = require('path')
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'))
const { PrismaClient } = require(path.join(__dirname, '..', 'packages', 'db', 'src', 'generated', 'client'))

const EMP = 'cmnn7xm6e00009gqgoii3ims2' // CENTRAL CONTÁBIL (tenant ativo)
const ORIGEM_ARQUIVOS = '//192.168.0.7/wwwroot/files/sgq_capacitacoes'
const DESTINO_ARQUIVOS = path.join(__dirname, '..', 'apps', 'api', 'uploads', 'capacitacoes-legado')
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

/**
 * `carga` e `custo` são varchar no v1, com "2", "07", "", "0,00", "200,00" e
 * nulo misturados. Devolve número ou null — o que não der para ler não vira 0,
 * porque 0 seria uma afirmação ("custou zero") que o dado não sustenta.
 */
function numeroOuNulo(v) {
  const t = String(v ?? '').trim()
  if (!t) return null
  const limpo = t.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  if (!limpo) return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/** sgq_cap_sta → status do v2. */
const STATUS = {
  1: 'SOLICITADA', 2: 'AGUARDANDO_AUTORIZACAO', 3: 'AUTORIZADA',
  4: 'AVALIADA', 5: 'FINALIZADA', 6: 'CANCELADA',
}
/** `tipo` 1/2 do v1 — chumbado no HTML de lá. */
const AMBITO = { 1: 'INTERNA', 2: 'EXTERNA' }

const MIME = { pdf: 'application/pdf', doc: 'application/msword', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }

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

  // Mapa de usuários v1 → v2, SÓ da empresa de destino (sem este filtro o
  // casamento por nome pega gente de outro tenant — ver o incidente de 18/08).
  const [usuariosV1] = await my.query('SELECT CAD_USU_ID id, CAD_USU_NOME nome, CAD_USU_EMAIL email FROM ger_cad_usu')
  const usuariosV2 = await prisma.user.findMany({
    where: ESCOPO_EMPRESA,
    select: { id: true, name: true, email: true },
  })
  const chave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  const porNome = new Map(usuariosV2.map((u) => [chave(u.name), u.id]))
  const porEmail = new Map(usuariosV2.filter((u) => u.email).map((u) => [String(u.email).toLowerCase(), u.id]))

  const v1ParaV2 = new Map()
  for (const u of usuariosV1) {
    const id = (u.email && porEmail.get(String(u.email).toLowerCase())) || porNome.get(chave(u.nome)) || null
    if (id) v1ParaV2.set(Number(u.id), id)
  }
  const uid = (v) => v1ParaV2.get(Number(v)) || null

  const [metodos] = await my.query('SELECT Id id, tipo, ativo FROM sgq_cap_tip ORDER BY Id')
  const [caps] = await my.query(`
    SELECT id, status, tipo, metodo, solicitante, titulo, descricao, local, instrutor, organizacao,
           dt_sol, dt_aut, dt_inicio, dt_fim, dt_av, hora_ini, hora_fim, carga, custo, detalhamento,
           av_dt, av_resp, av_forma, av_evidencia, av_acoes, av_analise, ativo
      FROM sgq_cap WHERE ativo = 1 ORDER BY id`)
  const [pars] = await my.query(`
    SELECT p.id_registro, p.participante, p.confirma, p.dt_confirma, u.CAD_USU_NOME nome
      FROM sgq_cap_par p LEFT JOIN ger_cad_usu u ON u.CAD_USU_ID = p.participante
     WHERE p.ativo = 1`)
  const [arqs] = await my.query('SELECT ID, ID_REGISTRO, USUARIO, DESCRICAO, LINK FROM sgq_cap_arq WHERE ATIVO = 1')
  const [msgs] = await my.query('SELECT id, id_registro, interacao, usuario, dt_int FROM sgq_cap_msg WHERE ativo = 1')

  const emDisco = fs.existsSync(ORIGEM_ARQUIVOS) ? new Set(fs.readdirSync(ORIGEM_ARQUIVOS)) : new Set()
  const capsIds = new Set(caps.map((c) => Number(c.id)))

  const sql = []
  const avisos = []
  sql.push('-- Importação das Capacitações do OneClick v1 (sgq_capacitacoes).')
  sql.push('-- Gerado por scripts/legacy-v1-capacitacoes-import.js — idempotente por legacy_id.')
  sql.push('-- Aplicar DEPOIS de add_capacitacoes.sql.')
  sql.push('')
  sql.push('BEGIN;')
  sql.push('')
  sql.push('-- ── Métodos ──')
  for (const m of metodos) {
    sql.push(
      `INSERT INTO capacitacao_metodos (id, empresa_id, legacy_id, nome, ordem, ativo)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(m.id)}, ${S(m.tipo)}, ${N(m.id)}, ${B(Number(m.ativo) === 1)}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM capacitacao_metodos WHERE legacy_id = ${N(m.id)} AND empresa_id = ${S(EMP)});`)
  }
  sql.push('')

  let semDataInicio = 0, semTitulo = 0
  sql.push('-- ── Capacitações ──')
  for (const c of caps) {
    const inicio = dataISO(c.dt_inicio)
    if (!inicio) { semDataInicio++; avisos.push(`capacitação ${c.id}: sem data de início legível — pulada`); continue }

    // Duas capacitações de 2016/2017 estão sem título no v1, ambas finalizadas
    // e com participantes. Descartá-las perderia histórico de treinamento; o
    // título diz o que é, em vez de inventar um nome que ninguém escreveu.
    let titulo = String(c.titulo || '').trim()
    if (!titulo) {
      titulo = `Capacitação #${c.id} (sem título no sistema antigo)`
      semTitulo++
      avisos.push(`capacitação ${c.id}: sem título no v1 — importada com título genérico`)
    }

    // av_analise: 1 = Sim, 2 = Não, 0 = ainda não avaliada. No v1 o 0 se
    // confundia com "não atingiu"; aqui vira NULL, que é o que ele significa.
    const atingiu = Number(c.av_analise) === 1 ? 'true' : Number(c.av_analise) === 2 ? 'false' : 'NULL'

    sql.push(
      `INSERT INTO capacitacoes (id, empresa_id, legacy_id, titulo, ambito, metodo_id, instrutor,` +
      ` organizacao, local, data_inicio, data_fim, hora_inicio, hora_fim, carga_horaria, custo,` +
      ` descricao, status, solicitante_id, solicitada_em, autorizada_em, prazo_avaliacao,` +
      ` avaliada_em, avaliador_id, avaliacao_forma, avaliacao_evidencia, avaliacao_acoes, objetivos_atingidos)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(c.id)}, ${S(titulo)},` +
      ` ${S(AMBITO[Number(c.tipo)] || 'INTERNA')},` +
      ` (SELECT id FROM capacitacao_metodos WHERE legacy_id = ${N(c.metodo)} AND empresa_id = ${S(EMP)}),` +
      ` ${S(c.instrutor)}, ${S(c.organizacao)}, ${S(c.local)},` +
      ` ${S(inicio)}::date, ${dataISO(c.dt_fim) ? `${S(dataISO(c.dt_fim))}::date` : 'NULL'},` +
      ` ${S(String(c.hora_ini || '').slice(0, 5) || null)}, ${S(String(c.hora_fim || '').slice(0, 5) || null)},` +
      ` ${N(numeroOuNulo(c.carga))}, ${N(numeroOuNulo(c.custo))},` +
      // O v1 tinha `descricao` e `detalhamento`; o formulário só alimenta um
      // deles ("Detalhamento"), então junta-se o que houver.
      ` ${S([c.descricao, c.detalhamento].filter((x) => x && String(x).trim()).join('\n\n') || null)},` +
      ` ${S(STATUS[Number(c.status)] || 'SOLICITADA')}, ${S(uid(c.solicitante))},` +
      ` ${dataISO(c.dt_sol) ? `${S(dataISO(c.dt_sol))}::date` : 'NULL'},` +
      ` ${dataISO(c.dt_aut) ? `${S(dataISO(c.dt_aut))}::date` : 'NULL'},` +
      ` ${dataISO(c.dt_av) ? `${S(dataISO(c.dt_av))}::date` : 'NULL'},` +
      ` ${dataISO(c.av_dt) ? `${S(dataISO(c.av_dt))}::date` : 'NULL'}, ${S(uid(c.av_resp))},` +
      ` ${S(c.av_forma)}, ${S(c.av_evidencia)}, ${S(c.av_acoes)}, ${atingiu}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM capacitacoes WHERE legacy_id = ${N(c.id)} AND empresa_id = ${S(EMP)});`)
  }
  sql.push('')

  let parsPorId = 0, parsPorNome = 0, parsSemNada = 0, parsOrfaos = 0
  sql.push('-- ── Participantes ──')
  for (const p of pars) {
    if (!capsIds.has(Number(p.id_registro))) { parsOrfaos++; continue }
    const u = uid(p.participante)
    const nome = u ? null : (String(p.nome || '').trim() || null)
    // Sem usuário E sem nome não sobra nada que prove participação — aí sim
    // o vínculo se perde, e o número sai no relatório.
    if (!u && !nome) { parsSemNada++; continue }
    if (u) parsPorId++; else parsPorNome++
    const conf = Number(p.confirma) === 1
    const dedupe = u
      ? `x.usuario_id = ${S(u)}`
      : `x.nome = ${S(nome)}`
    sql.push(
      `INSERT INTO capacitacao_participantes (id, capacitacao_id, usuario_id, nome, confirmado, confirmado_em)` +
      ` SELECT gen_random_uuid()::text, c.id, ${S(u)}, ${S(nome)}, ${B(conf)},` +
      ` ${conf && dataISO(p.dt_confirma) ? `${S(dataISO(p.dt_confirma))}::date` : 'NULL'}` +
      ` FROM capacitacoes c WHERE c.legacy_id = ${N(p.id_registro)} AND c.empresa_id = ${S(EMP)}` +
      ` AND NOT EXISTS (SELECT 1 FROM capacitacao_participantes x WHERE x.capacitacao_id = c.id AND ${dedupe});`)
  }
  sql.push('')

  let arqOk = 0, arqSemArquivo = 0
  const arquivosACopiar = []
  sql.push('-- ── Anexos (só os que têm arquivo em disco) ──')
  for (const a of arqs) {
    if (!capsIds.has(Number(a.ID_REGISTRO))) continue
    const nome = String(a.LINK || '').replace(/^\//, '')
    // Anexo sem arquivo vira linha que promete um download que dá 404. Fica
    // de fora, e o total sai no relatório — 35 dos 45 do v1 estão nessa
    // situação, arquivos que sumiram do disco em algum momento.
    if (!nome || !emDisco.has(nome)) { arqSemArquivo++; continue }
    arquivosACopiar.push(nome)
    const ext = (nome.split('.').pop() || '').toLowerCase()
    sql.push(
      `INSERT INTO capacitacao_anexos (id, capacitacao_id, autor_id, descricao, arquivo_path, arquivo_nome, mime)` +
      ` SELECT gen_random_uuid()::text, c.id, ${S(uid(a.USUARIO))}, ${S(a.DESCRICAO)},` +
      ` ${S('/api/upload/capacitacoes-legado/' + nome)}, ${S(nome)}, ${S(MIME[ext] || null)}` +
      ` FROM capacitacoes c WHERE c.legacy_id = ${N(a.ID_REGISTRO)} AND c.empresa_id = ${S(EMP)}` +
      ` AND NOT EXISTS (SELECT 1 FROM capacitacao_anexos x WHERE x.capacitacao_id = c.id AND x.arquivo_nome = ${S(nome)});`)
    arqOk++
  }
  sql.push('')

  let msgOk = 0
  sql.push('-- ── Mensagens ──')
  for (const m of msgs) {
    if (!capsIds.has(Number(m.id_registro))) continue
    const texto = String(m.interacao || '').trim()
    if (!texto) continue
    sql.push(
      `INSERT INTO capacitacao_mensagens (id, capacitacao_id, autor_id, texto)` +
      ` SELECT gen_random_uuid()::text, c.id, ${S(uid(m.usuario))}, ${S(texto)}` +
      ` FROM capacitacoes c WHERE c.legacy_id = ${N(m.id_registro)} AND c.empresa_id = ${S(EMP)}` +
      ` AND NOT EXISTS (SELECT 1 FROM capacitacao_mensagens x WHERE x.capacitacao_id = c.id AND x.texto = ${S(texto)});`)
    msgOk++
  }

  sql.push('')
  sql.push('COMMIT;')

  fs.mkdirSync(SAIDA, { recursive: true })
  const arqSql = path.join(SAIDA, 'v1-capacitacoes.sql')
  fs.writeFileSync(arqSql, sql.join('\n'), 'utf8')

  let copiados = 0, jaExistiam = 0
  if (COPIAR && arquivosACopiar.length) {
    fs.mkdirSync(DESTINO_ARQUIVOS, { recursive: true })
    for (const nome of [...new Set(arquivosACopiar)]) {
      const para = path.join(DESTINO_ARQUIVOS, nome)
      if (fs.existsSync(para)) { jaExistiam++; continue }
      fs.copyFileSync(path.join(ORIGEM_ARQUIVOS, nome), para)
      copiados++
    }
  }

  console.log('=== Capacitações — v1 → v2 ===')
  console.log(`métodos ......... ${metodos.length}`)
  console.log(`capacitações .... ${caps.length - semDataInicio}${semDataInicio ? ` (${semDataInicio} sem data de início, puladas)` : ''}${semTitulo ? `  (${semTitulo} sem título no v1)` : ''}`)
  console.log(`participantes ... ${parsPorId + parsPorNome}  (${parsPorId} por ID, ${parsPorNome} só com nome)`)
  if (parsSemNada) console.log(`  ⚠ ${parsSemNada} vínculo(s) sem usuário E sem nome — perdidos`)
  if (parsOrfaos) console.log(`  · ${parsOrfaos} de capacitação inativa (fora da carga)`)
  console.log(`anexos .......... ${arqOk}${arqSemArquivo ? `  (${arqSemArquivo} SEM arquivo em disco — fora da carga)` : ''}`)
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
