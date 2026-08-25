// Importa do OneClick v1 (db_intranet) o Controle de Férias:
//   • crp_ferias (ativos)          → ferias_periodos
//   • crp_ferias_eventos (ativos)  → ferias_eventos (gozos)
//   • crp_ferias_arquivos (ativos + arquivo existente em /files/crp_ferias)
//                                  → ferias_arquivos
//
// Colaborador = id_usuario (ger_cad_usu) → user do v2 com resíduo de nome.
// `historico`/`pago` preservados; datas 0000-00-00 viram NULL; `dias` era
// varchar (sempre "30") e vira inteiro. O saldo NÃO é migrado: é derivado
// no service (dias + saldo anterior − gozados).
//
// Gera SQL idempotente em scripts/out/ e copia os arquivos físicos para
// apps/api/uploads/ferias-legado/. Read-only no v1. NÃO aplica nada.
// Levantamento: docs/migracao-controle-ferias-v1.md

const fs = require('fs')
const path = require('path')
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'))
const { PrismaClient } = require(path.join(__dirname, '..', 'packages', 'db', 'src', 'generated', 'client'))

const EMP = 'cmnn7xm6e00009gqgoii3ims2' // CENTRAL CONTÁBIL (tenant ativo)
const SAIDA = path.join(__dirname, 'out')
const ORIGEM_ARQ = '\\\\192.168.0.7\\wwwroot\\files\\crp_ferias'
const DESTINO_ARQ = path.join(__dirname, '..', 'apps', 'api', 'uploads', 'ferias-legado')

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

function dataISO(v) {
  const t = String(v ?? '').slice(0, 10)
  if (!t || t === '0000-00-00') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

const subPeriodo = (legacyId) =>
  `(SELECT id FROM ferias_periodos WHERE legacy_id = ${N(legacyId)} AND empresa_id = ${S(EMP)} LIMIT 1)`

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
  // O usuário sai por SUBSELECT no destino (e-mail e, na falta, nome): a mesma
  // carga vale em dev e produção, que têm ids distintos. O nome do v1 fica
  // sempre como resíduo — se o colaborador não existir mais, não se perde.
  const emailV1 = new Map(usuariosV1.map((u) => [Number(u.id), String(u.email || '').toLowerCase().trim() || null]))
  const userV1 = (raw) => {
    const n = Number(raw)
    if (!raw || !n) return { expr: 'NULL', nome: null, casou: false }
    const email = emailV1.get(n)
    const nome = nomeV1.get(n)
    const casou = v1ParaV2.has(n)
    if (email) return { expr: `(SELECT id FROM users WHERE lower(email) = ${S(email)} LIMIT 1)`, nome, casou }
    if (nome) return { expr: `(SELECT id FROM users WHERE lower(name) = ${S(nome.toLowerCase())} LIMIT 1)`, nome, casou }
    return { expr: 'NULL', nome, casou }
  }

  // Traz TAMBÉM os períodos com ativo=0: no v1 eles são sempre historico=1 —
  // não é lixo, é o arquivo morto (2014→2025) que a equipe precisa consultar
  // sem voltar ao sistema antigo (pedido do Wagner, 25/08).
  const [periodos] = await my.query('SELECT * FROM crp_ferias ORDER BY id')
  const [eventos] = await my.query('SELECT * FROM crp_ferias_eventos WHERE ativo = 1 ORDER BY id')
  const [arquivos] = await my.query('SELECT * FROM crp_ferias_arquivos WHERE ativo = 1 ORDER BY Id')
  const perIds = new Set(periodos.map((p) => Number(p.id)))

  const sql = []
  sql.push('-- Importação do Controle de Férias do OneClick v1 (crp_ferias).')
  sql.push('-- Gerado por scripts/legacy-v1-ferias-import.js — idempotente por legacy_id.')
  sql.push('-- Aplicar DEPOIS de add_controle_ferias.sql.')
  sql.push('')
  sql.push('BEGIN;')

  let perOk = 0, semColab = 0
  for (const p of periodos) {
    const colab = userV1(p.id_usuario)
    if (!colab.casou) semColab++
    const pags = [dataISO(p.dt_pagto), dataISO(p.dt_pagto2), dataISO(p.dt_pagto3)]
    sql.push(
      `INSERT INTO ferias_periodos (id, empresa_id, legacy_id, colaborador_id, colaborador_nome, periodo_inicial, periodo_final, descricao, saldo_anterior, dias, previsao, pagamento_1, pagamento_2, pagamento_3, pago, historico, registrado_em)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(p.id)}, ${colab.expr}, ${S(colab.nome)},` +
      ` ${N(p.periodo_inicial) === 'NULL' ? '0' : N(p.periodo_inicial)}, ${N(p.periodo_final) === 'NULL' ? '0' : N(p.periodo_final)},` +
      ` ${S(String(p.descricao || '').trim() || null)}, ${N(p.saldo_anterior) === 'NULL' ? '0' : N(p.saldo_anterior)}, ${N(p.dias) === 'NULL' ? '30' : N(p.dias)},` +
      ` ${dataISO(p.dt_previsao) ? `${S(dataISO(p.dt_previsao))}::date` : 'NULL'},` +
      ` ${pags[0] ? `${S(pags[0])}::date` : 'NULL'}, ${pags[1] ? `${S(pags[1])}::date` : 'NULL'}, ${pags[2] ? `${S(pags[2])}::date` : 'NULL'},` +
      // ATENÇÃO à semântica invertida: a tela do v1 lista
      // `WHERE historico='1' AND ativo='1'` — lá `historico=1` é o período
      // VIGENTE do colaborador. No v2, `historico=true` = encerrado/arquivado.
      ` ${Number(p.pago) === 1 || pags.some(Boolean) ? 'true' : 'false'}, ${Number(p.historico) === 1 && Number(p.ativo) === 1 ? 'false' : 'true'},` +
      ` ${dataISO(p.dt_registro) ? `${S(dataISO(p.dt_registro))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM ferias_periodos WHERE legacy_id = ${N(p.id)} AND empresa_id = ${S(EMP)});`)
    perOk++
  }

  let evOk = 0, evOrfaos = 0
  for (const e of eventos) {
    const pai = Number(e.id_registro)
    if (!perIds.has(pai)) { evOrfaos++; continue }
    const ini = dataISO(e.dt_inicio)
    const fim = dataISO(e.dt_fim) || ini
    if (!ini) { evOrfaos++; continue }
    const reg = userV1(e.id_usuario)
    sql.push(
      `INSERT INTO ferias_eventos (id, periodo_id, legacy_id, ordem, data_inicio, data_fim, descricao, registrado_por_id, registrado_em)` +
      ` SELECT gen_random_uuid()::text, ${subPeriodo(pai)}, ${N(e.id)}, ${N(e.ordem) === 'NULL' ? '1' : N(e.ordem)},` +
      ` ${S(ini)}::date, ${S(fim)}::date, ${S(String(e.descricao || '').trim() || null)}, ${reg.expr},` +
      ` ${dataISO(e.dt_registro) ? `${S(dataISO(e.dt_registro))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM ferias_eventos WHERE legacy_id = ${N(e.id)});`)
    evOk++
  }

  fs.mkdirSync(DESTINO_ARQ, { recursive: true })
  let arqOk = 0, arqSumidos = 0
  for (const a of arquivos) {
    const pai = Number(a.id_registro)
    if (!perIds.has(pai)) { arqSumidos++; continue }
    const nomeFisico = String(a.link || '').replace(/^\//, '')
    const origem = path.join(ORIGEM_ARQ, nomeFisico)
    if (!nomeFisico || !fs.existsSync(origem)) { arqSumidos++; continue }
    fs.copyFileSync(origem, path.join(DESTINO_ARQ, nomeFisico))
    const autor = userV1(a.usuario)
    sql.push(
      `INSERT INTO ferias_arquivos (id, periodo_id, legacy_id, nome, path, autor_id, criado_em)` +
      ` SELECT gen_random_uuid()::text, ${subPeriodo(pai)}, ${N(a.Id)}, ${S(String(a.descricao || nomeFisico).trim())}, ${S('/api/upload/ferias-legado/' + nomeFisico)}, ${autor.expr},` +
      ` ${dataISO(a.dt_arq) ? `${S(dataISO(a.dt_arq))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM ferias_arquivos WHERE legacy_id = ${N(a.Id)});`)
    arqOk++
  }

  sql.push('COMMIT;')

  fs.mkdirSync(SAIDA, { recursive: true })
  const arq = path.join(SAIDA, 'v1-controle-ferias.sql')
  fs.writeFileSync(arq, sql.join('\n'), 'utf8')
  console.log('=== Controle de Férias — v1 → v2 ===')
  console.log(`períodos ......... ${perOk} (sem colaborador casado: ${semColab})`)
  console.log(`gozos ............ ${evOk} (órfãos/sem data: ${evOrfaos})`)
  console.log(`arquivos ......... ${arqOk} (de pai inativo ou sumidos: ${arqSumidos})`)
  console.log(`SQL: ${arq}`)

  await my.end()
  await prisma.$disconnect()
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1) })
