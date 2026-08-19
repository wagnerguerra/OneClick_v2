// Importa do OneClick v1 (db_intranet) as Não Conformidades da Qualidade:
//   • sgq_nc_ori           → nao_conformidade_origens (seeds, 7)
//   • sgq_nc (ativas)      → nao_conformidades
//   • sgq_nc_aca (ativas)  → nao_conformidade_acoes
//   • sgq_nc_msg (ativas)  → nao_conformidade_mensagens
//   • sgq_nc_arq (ativos + arquivo existente em /files/sgq_rnc) → nao_conformidade_arquivos
//   • sgq_nc_log           → nao_conformidade_logs (frases prontas do v1)
//
// Regras: cliente resolvido NO DESTINO por CNPJ (ids divergem entre ambientes);
// processo por documento_processos.legacy_id; origem por legacy_id; vínculos
// entre NCs (similar/reincidência) por UPDATE de segunda passada via legacy_id.
// A sgq_nc_old (138) NÃO entra: nenhuma página do v1 a lê (fluxo abandonado).
//
// Gera SQL idempotente em scripts/out/ e copia os arquivos físicos para
// apps/api/uploads/nc-legado/. Read-only no v1. NÃO aplica nada.
// Levantamento: docs/migracao-nao-conformidades-v1.md

const fs = require('fs')
const path = require('path')
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'))
const { PrismaClient } = require(path.join(__dirname, '..', 'packages', 'db', 'src', 'generated', 'client'))

const EMP = 'cmnn7xm6e00009gqgoii3ims2' // CENTRAL CONTÁBIL (tenant ativo)
const SAIDA = path.join(__dirname, 'out')
const ORIGEM_ARQ = '\\\\192.168.0.7\\wwwroot\\files\\sgq_rnc'
const DESTINO_ARQ = path.join(__dirname, '..', 'apps', 'api', 'uploads', 'nc-legado')

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

function dataMista(v) {
  const t = limpaCtl(v).trim().slice(0, 10)
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

const SITUACAO = { 1: 'AGUARDANDO_ACOES', 2: 'EM_TRATAMENTO', 3: 'AGUARDANDO_CONCLUSAO', 4: 'FINALIZADA', 5: 'CANCELADA', 6: 'AGUARDANDO_CAUSA' }
const TIPO = { 1: 'NAO_CONFORMIDADE', 2: 'OPORTUNIDADE_MELHORIA' }
const ACAO_TIPO = { 1: 'IMEDIATA', 2: 'CORRETIVA', 3: 'AVALIACAO_EFICACIA' }
const boolOuNull = (v) => (v == null || v === '' ? 'NULL' : Number(v) === 1 ? 'true' : 'false')

const subOrigem = (legacyId) => legacyId
  ? `(SELECT id FROM nao_conformidade_origens WHERE legacy_id = ${N(legacyId)} AND empresa_id = ${S(EMP)} LIMIT 1)`
  : 'NULL'
const subProcesso = (legacyId) => legacyId
  ? `(SELECT id FROM documento_processos WHERE legacy_id = ${N(legacyId)} AND (empresa_id = ${S(EMP)} OR empresa_id IS NULL) LIMIT 1)`
  : 'NULL'
const subCliente = (cnpj) => cnpj
  ? `(SELECT id FROM clientes WHERE regexp_replace(upper(coalesce(documento,'')),'[^0-9A-Z]','','g') = '${cnpj}' AND (empresa_id = ${S(EMP)} OR empresa_id IS NULL) ORDER BY (empresa_id IS NOT NULL) DESC LIMIT 1)`
  : 'NULL'
const subNc = (legacyId) =>
  `(SELECT id FROM nao_conformidades WHERE legacy_id = ${N(legacyId)} AND empresa_id = ${S(EMP)} LIMIT 1)`

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

  // Escopo "EMP ou nulo" (snapshot de dev meio sem etiqueta — reunioes §7)
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

  // Áreas: setor do v1 → Area do v2 por nome (ids de área coincidem entre
  // ambientes — validado nas cargas anteriores).
  const [setores] = await my.query('SELECT id, cad_set_nome nome FROM ger_cad_set')
  const areasV2 = await prisma.area.findMany({ where: ESCOPO, select: { id: true, name: true } })
  const areaPorNome = new Map(areasV2.map((a) => [chave(a.name), a.id]))
  const setorNome = new Map(setores.map((s) => [Number(s.id), String(s.nome || '').trim()]))
  const setorArea = (raw) => {
    const n = Number(raw)
    if (!raw || !n) return { id: null, nome: null }
    const nome = setorNome.get(n) || null
    const id = nome ? areaPorNome.get(chave(nome)) || null : null
    return { id, nome: id ? null : nome }
  }

  // Clientes: id do v1 → CNPJ limpo (alfanumérico preservado) p/ subselect
  const [clientesV1] = await my.query('SELECT id, cad_cli_razao razao, cad_cli_cnpj cnpj FROM ger_cad_cli')
  const cliCnpj = new Map(clientesV1.map((c) => [Number(c.id), String(c.cnpj || '').toUpperCase().replace(/[^0-9A-Z]/g, '')]))
  const cliRazao = new Map(clientesV1.map((c) => [Number(c.id), String(c.razao || '').trim() || null]))

  const [origens] = await my.query('SELECT * FROM sgq_nc_ori ORDER BY id')
  const [ncs] = await my.query('SELECT * FROM sgq_nc WHERE ativo = 1 ORDER BY id')
  const [acas] = await my.query('SELECT * FROM sgq_nc_aca WHERE ativo = 1 ORDER BY id')
  const [msgs] = await my.query('SELECT * FROM sgq_nc_msg WHERE ativo = 1 ORDER BY id')
  const [arqs] = await my.query('SELECT * FROM sgq_nc_arq WHERE ativo = 1 ORDER BY Id')
  const [logs] = await my.query('SELECT * FROM sgq_nc_log ORDER BY id')
  const ncIds = new Set(ncs.map((n) => Number(n.id)))

  const sql = []
  sql.push('-- Importação das Não Conformidades do OneClick v1 (sgq_rnc).')
  sql.push('-- Gerado por scripts/legacy-v1-nc-import.js — idempotente por legacy_id.')
  sql.push('-- Aplicar DEPOIS de add_nao_conformidades.sql (e da carga de documentos,')
  sql.push('-- que traz os processos com legacy_id).')
  sql.push('')
  sql.push('BEGIN;')

  // ── Origens (seeds) ──
  for (const o of origens) {
    sql.push(
      `INSERT INTO nao_conformidade_origens (id, empresa_id, legacy_id, nome, ordem, ativo)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(o.id)}, ${S(String(o.origem || '').trim())}, ${N(o.id)}, ${Number(o.ativo) === 1 ? 'true' : 'false'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM nao_conformidade_origens WHERE legacy_id = ${N(o.id)} AND empresa_id = ${S(EMP)});`)
  }

  // ── NCs ──
  let ncOk = 0, vinculos = []
  for (const n of ncs) {
    const reg = userV1(n.id_usuario)
    const resp = userV1(n.id_responsavel)
    const causaPor = userV1(n.id_usuario_causa)
    const aval = userV1(n.id_usuario_avaliacao)
    const efResp = userV1(n.eficacia_responsavel)
    const area = setorArea(n.area)
    const cnpj = cliCnpj.get(Number(n.id_cliente)) || null
    const razao = cliRazao.get(Number(n.id_cliente)) || null

    sql.push(
      `INSERT INTO nao_conformidades (id, empresa_id, legacy_id, situacao, tipo, cliente_id, cliente_nome, area_id, area_nome, processo_id, origem_id,` +
      ` registrado_por_id, registrado_por_nome, responsavel_id, responsavel_nome, registrado_em, prazo, detalhamento, nc_similar_texto, reincidencia,` +
      ` causa, causa_em, causa_por_id, eficacia_detalhes, eficacia_responsavel_id, eficacia_prazo, eficacia_registrada,` +
      ` avaliacao, eficaz, avaliado_por_id, avaliado_por_nome, avaliado_em, atualiza_swot, atualiza_swot_desc, atualiza_revisao, atualiza_revisao_desc,` +
      ` legacy_reclamacao_id, ativo)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(n.id)}, ${S(SITUACAO[Number(n.id_situacao)] ?? 'AGUARDANDO_ACOES')}, ${S(TIPO[Number(n.tipo)] ?? 'NAO_CONFORMIDADE')},` +
      ` ${subCliente(cnpj)}, ${S(razao)}, ${S(area.id)}, ${S(area.nome)}, ${subProcesso(n.processo)}, ${subOrigem(n.id_origem)},` +
      ` ${S(reg.id)}, ${S(reg.nome)}, ${S(resp.id)}, ${S(resp.nome)},` +
      ` ${dataMista(n.dt_reg) ? `${S(dataMista(n.dt_reg))}::timestamp` : 'CURRENT_TIMESTAMP'},` +
      ` ${dataMista(n.dt_prazo) ? `${S(dataMista(n.dt_prazo))}::date` : 'NULL'},` +
      ` ${S(paraHtml(n.detalhamento) || '<p>(sem detalhamento)</p>')}, ${S(limpaCtl(n.rnc_similar_txt).trim() || null)}, ${Number(n.reincidencia) === 1 ? 'true' : 'false'},` +
      ` ${S(paraHtml(n.causa))}, ${dataMista(n.dt_causa) ? `${S(dataMista(n.dt_causa))}::date` : 'NULL'}, ${S(causaPor.id)},` +
      ` ${S(paraHtml(n.eficacia_detalhes))}, ${S(efResp.id)}, ${dataMista(n.eficacia_prazo) ? `${S(dataMista(n.eficacia_prazo))}::date` : 'NULL'}, ${Number(n.eficacia_situacao) === 1 ? 'true' : 'false'},` +
      ` ${S(paraHtml(n.avaliacao))}, ${boolOuNull(n.eficaz)}, ${S(aval.id)}, ${S(aval.nome)}, ${dataMista(n.dt_avaliacao) ? `${S(dataMista(n.dt_avaliacao))}::date` : 'NULL'},` +
      ` ${boolOuNull(n.at_swot)}, ${S(paraHtml(n.at_swot_desc))}, ${boolOuNull(n.at_rev)}, ${S(paraHtml(n.at_rev_desc))},` +
      ` ${Number(n.id_reclamacao) > 0 ? N(n.id_reclamacao) : 'NULL'}, true` +
      ` WHERE NOT EXISTS (SELECT 1 FROM nao_conformidades WHERE legacy_id = ${N(n.id)} AND empresa_id = ${S(EMP)});`)
    ncOk++

    // Vínculos NC→NC resolvidos numa segunda passada, quando todas já existem.
    if (Number(n.rnc_similar) > 0 && ncIds.has(Number(n.rnc_similar))) {
      vinculos.push(`UPDATE nao_conformidades SET nc_similar_id = ${subNc(n.rnc_similar)} WHERE legacy_id = ${N(n.id)} AND empresa_id = ${S(EMP)} AND nc_similar_id IS NULL;`)
    }
    if (Number(n.id_nc_anterior) > 0 && Number(n.id_nc_anterior) !== Number(n.id) && ncIds.has(Number(n.id_nc_anterior))) {
      vinculos.push(`UPDATE nao_conformidades SET nc_anterior_id = ${subNc(n.id_nc_anterior)} WHERE legacy_id = ${N(n.id)} AND empresa_id = ${S(EMP)} AND nc_anterior_id IS NULL;`)
    }
  }
  sql.push(...vinculos)

  // ── Ações ──
  let acaoOk = 0, acaoOrfa = 0, respTexto = 0
  for (const a of acas) {
    const pai = Number(a.id_nc)
    if (!ncIds.has(pai)) { acaoOrfa++; continue }
    const respId = porNome.get(chave(a.responsavel)) || null
    const respNome = respId ? null : (limpaCtl(a.responsavel).trim() || null)
    if (!respId && respNome) respTexto++
    const fin = userV1(a.usuario_finalizado)
    const concluida = Number(a.situacao) === 1
    sql.push(
      `INSERT INTO nao_conformidade_acoes (id, nc_id, legacy_id, tipo, descricao, responsavel_id, responsavel_nome, prazo, concluida, finalizado_em, finalizado_por_id, observacao, criado_em)` +
      ` SELECT gen_random_uuid()::text, ${subNc(pai)}, ${N(a.id)}, ${S(ACAO_TIPO[Number(a.tipo)] ?? 'CORRETIVA')},` +
      ` ${S(paraHtml(a.acao) || '<p>(sem descrição)</p>')}, ${S(respId)}, ${S(respNome)},` +
      ` ${dataMista(a.dt_prazo) ? `${S(dataMista(a.dt_prazo))}::date` : 'NULL'}, ${concluida ? 'true' : 'false'},` +
      ` ${concluida && dataMista(a.dt_finalizado) ? `${S(dataMista(a.dt_finalizado))}::date` : 'NULL'}, ${concluida ? S(fin.id) : 'NULL'}, ${S(paraHtml(a.obs))},` +
      ` ${dataMista(a.dt_registro) ? `${S(dataMista(a.dt_registro))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM nao_conformidade_acoes WHERE legacy_id = ${N(a.id)});`)
    acaoOk++
  }

  // ── Mensagens ──
  let msgOk = 0
  for (const m of msgs) {
    if (!ncIds.has(Number(m.id_registro))) continue
    const autor = userV1(m.usuario)
    sql.push(
      `INSERT INTO nao_conformidade_mensagens (id, nc_id, legacy_id, texto, autor_id, autor_nome, criado_em)` +
      ` SELECT gen_random_uuid()::text, ${subNc(m.id_registro)}, ${N(m.id)}, ${S(paraHtml(m.interacao) || '<p>—</p>')}, ${S(autor.id)}, ${S(autor.nome)},` +
      ` ${dataMista(m.dt_int) ? `${S(dataMista(m.dt_int))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM nao_conformidade_mensagens WHERE legacy_id = ${N(m.id)});`)
    msgOk++
  }

  // ── Arquivos (só os que existem fisicamente) ──
  fs.mkdirSync(DESTINO_ARQ, { recursive: true })
  let arqOk = 0, arqSumidos = 0
  for (const a of arqs) {
    if (!ncIds.has(Number(a.id_registro))) continue
    const nomeFisico = String(a.link || '').replace(/^\//, '')
    const origem = path.join(ORIGEM_ARQ, nomeFisico)
    if (!nomeFisico || !fs.existsSync(origem)) { arqSumidos++; continue }
    fs.copyFileSync(origem, path.join(DESTINO_ARQ, nomeFisico))
    const autor = userV1(a.usuario)
    sql.push(
      `INSERT INTO nao_conformidade_arquivos (id, nc_id, legacy_id, nome, path, autor_id, criado_em)` +
      ` SELECT gen_random_uuid()::text, ${subNc(a.id_registro)}, ${N(a.Id)}, ${S(String(a.descricao || nomeFisico).trim())}, ${S('/api/upload/nc-legado/' + nomeFisico)}, ${S(autor.id)},` +
      ` ${dataMista(a.dt_arq) ? `${S(dataMista(a.dt_arq))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM nao_conformidade_arquivos WHERE legacy_id = ${N(a.Id)});`)
    arqOk++
  }

  // ── Logs (frases prontas do v1) ──
  let logOk = 0, logOrfao = 0
  for (const l of logs) {
    if (!ncIds.has(Number(l.id_registro))) { logOrfao++; continue }
    const u = userV1(l.usuario)
    sql.push(
      `INSERT INTO nao_conformidade_logs (id, nc_id, legacy_id, evento, usuario_id, usuario_nome, criado_em)` +
      ` SELECT gen_random_uuid()::text, ${subNc(l.id_registro)}, ${N(l.id)}, ${S(limpaCtl(l.evento).trim() || '(evento)')} , ${S(u.id)}, ${S(u.nome)},` +
      ` ${dataMista(l.dt_evento) ? `${S(dataMista(l.dt_evento))}::timestamp` : 'CURRENT_TIMESTAMP'}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM nao_conformidade_logs WHERE legacy_id = ${N(l.id)});`)
    logOk++
  }

  sql.push('COMMIT;')

  fs.mkdirSync(SAIDA, { recursive: true })
  const arq = path.join(SAIDA, 'v1-nao-conformidades.sql')
  fs.writeFileSync(arq, sql.join('\n'), 'utf8')
  console.log('=== Não Conformidades — v1 → v2 ===')
  console.log(`origens ............. ${origens.length}`)
  console.log(`NCs (ativas) ........ ${ncOk} (inativas ficam no v1)`)
  console.log(`vínculos NC→NC ...... ${vinculos.length}`)
  console.log(`ações ............... ${acaoOk} (órfãs de NC inativa: ${acaoOrfa})`)
  console.log(`resp. ação texto .... ${respTexto}`)
  console.log(`mensagens ........... ${msgOk}`)
  console.log(`arquivos ............ ${arqOk} (sumidos no disco: ${arqSumidos})`)
  console.log(`logs ................ ${logOk} (órfãos: ${logOrfao})`)
  console.log(`SQL: ${arq}`)

  await my.end()
  await prisma.$disconnect()
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1) })
