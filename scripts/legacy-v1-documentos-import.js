// Importa do OneClick v1 (db_intranet) o módulo de Documentos Internos da Qualidade:
//   • sgq_proc            → documento_processos      (mapa de processos da ISO)
//   • sgq_doc_cod         → documento_tipos          (tipo do documento)
//   • sgq_doc (mestres)   → documentos_internos      (a identidade do documento)
//   • sgq_doc (todas)     → documento_interno_versoes (as revisões)
//   • sgq_doc.elaborado   → documento_interno_elaboradores (casado por nome)
//   • files/sgq_documentos → apps/api/uploads/documentos-legado/
//
// Gera SQL idempotente em scripts/out/ e COPIA os arquivos. Read-only no v1.
// NÃO aplica SQL nenhum sozinho — quem aplica é o Wagner, pelo Service Manager.
//
// Uso:
//   node scripts/legacy-v1-documentos-import.js            (gera SQL + copia arquivos)
//   node scripts/legacy-v1-documentos-import.js --sem-arquivos
//
// Levantamento do legado: docs/migracao-documentos-internos-v1.md

const fs = require('fs')
const path = require('path')
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'))
const { PrismaClient } = require(path.join(__dirname, '..', 'packages', 'db', 'src', 'generated', 'client'))

const EMP = 'cmnn7xm6e00009gqgoii3ims2' // CENTRAL CONTÁBIL (tenant ativo)
const ORIGEM_ARQUIVOS = '//192.168.0.7/wwwroot/files/sgq_documentos'
const DESTINO_ARQUIVOS = path.join(__dirname, '..', 'apps', 'api', 'uploads', 'documentos-legado')
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

/**
 * `dt_versao` é varchar em d/m/aaaa SEM zero à esquerda, e aparece com 8, 9 e
 * 10 caracteres ("1/8/2018", "1/11/2018", "10/12/2021"). Devolve ISO ou null —
 * data ilegível não vira 1970, vira ausência declarada.
 */
function dataISO(txt) {
  const m = String(txt || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mes, a] = m
  const iso = `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? null : iso
}

/** sgq_doc_sit → situação do v2. "Excluído" (6) não vira situação: some. */
const SITUACAO = { 1: 'NOVO', 2: 'EM_APROVACAO', 3: 'APROVADO', 4: 'SUBSTITUIDO', 5: 'CANCELADO', 6: null, 7: 'REJEITADO' }

const MIME = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

/** Normaliza nome para casar pessoas: sem acento, sem caixa, espaço colapsado. */
const chaveNome = (s) => String(s || '')
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

  // ── Mapa de usuários: v1 (ger_cad_usu) → v2 (users), casado por nome ──
  const [usuariosV1] = await my.query('SELECT CAD_USU_ID id, CAD_USU_NOME nome, CAD_USU_EMAIL email FROM ger_cad_usu')
  const usuariosV2 = await prisma.user.findMany({ select: { id: true, name: true, email: true } })
  const porNome = new Map(usuariosV2.map((u) => [chaveNome(u.name), u.id]))
  const porEmail = new Map(usuariosV2.filter((u) => u.email).map((u) => [String(u.email).toLowerCase(), u.id]))

  const v1ParaV2 = new Map()
  for (const u of usuariosV1) {
    const porMail = u.email ? porEmail.get(String(u.email).toLowerCase()) : null
    const id = porMail || porNome.get(chaveNome(u.nome)) || null
    if (id) v1ParaV2.set(Number(u.id), id)
  }
  const naoCasados = usuariosV1.filter((u) => !v1ParaV2.has(Number(u.id)))

  // ── Processos e tipos ──
  const [processos] = await my.query('SELECT id, processo FROM sgq_proc ORDER BY id')
  const [tipos] = await my.query('SELECT id, codigo, ativo FROM sgq_doc_cod ORDER BY id')

  // ── Documentos e revisões ──
  const [linhas] = await my.query(`
    SELECT id, id_mestre, situacao, ativo, usuario, elaborado, codigo, revisao, documento,
           processo, dt_versao, alteracao, justificativa, link
      FROM sgq_doc ORDER BY id`)

  // A identidade do documento é o id_mestre quando != 0, senão o próprio id.
  const grupos = new Map()
  for (const r of linhas) {
    const mestre = Number(r.id_mestre) || Number(r.id)
    if (!grupos.has(mestre)) grupos.set(mestre, [])
    grupos.get(mestre).push(r)
  }

  const sql = []
  const avisos = []
  sql.push('-- Importação dos Documentos Internos do OneClick v1 (sgq_documentos).')
  sql.push('-- Gerado por scripts/legacy-v1-documentos-import.js — idempotente por legacy_id.')
  sql.push('-- Aplicar DEPOIS de manual_2026_08_18_documentos_internos.sql.')
  sql.push('')
  sql.push('BEGIN;')
  sql.push('')
  sql.push('-- ── Mapa de processos ──')
  for (const p of processos) {
    sql.push(
      `INSERT INTO documento_processos (id, empresa_id, legacy_id, nome, ordem, ativo)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(p.id)}, ${S(p.processo)}, ${N(p.id)}, true` +
      ` WHERE NOT EXISTS (SELECT 1 FROM documento_processos WHERE legacy_id = ${N(p.id)} AND empresa_id = ${S(EMP)});`)
  }
  sql.push('')
  sql.push('-- ── Tipos de documento ──')
  for (const t of tipos) {
    sql.push(
      `INSERT INTO documento_tipos (id, empresa_id, legacy_id, nome, ordem, ativo)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(t.id)}, ${S(t.codigo)}, ${N(t.id)}, ${Number(t.ativo) === 1}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM documento_tipos WHERE legacy_id = ${N(t.id)} AND empresa_id = ${S(EMP)});`)
  }
  sql.push('')

  let totDocs = 0, totVers = 0, totElab = 0, elabCasados = 0, elabSoltos = 0, semData = 0, pulados = 0
  const arquivosACopiar = []

  for (const [mestre, versoes] of [...grupos.entries()].sort((a, b) => a[0] - b[0])) {
    versoes.sort((a, b) => Number(a.revisao) - Number(b.revisao) || Number(a.id) - Number(b.id))

    // O cabeçalho do documento vem da linha vigente (ativo=1); sem ela, da
    // última revisão — é a que carrega o nome e o processo mais recentes.
    const vigente = versoes.find((v) => Number(v.ativo) === 1) || versoes[versoes.length - 1]

    sql.push(`-- Documento #${mestre} — ${String(vigente.documento || '').slice(0, 60)} (${versoes.length} revisão/ões)`)
    sql.push(
      `INSERT INTO documentos_internos (id, empresa_id, legacy_id, nome, tipo_id, processo_id)` +
      ` SELECT gen_random_uuid()::text, ${S(EMP)}, ${N(mestre)}, ${S(vigente.documento)},` +
      ` (SELECT id FROM documento_tipos WHERE legacy_id = ${N(vigente.codigo)} AND empresa_id = ${S(EMP)}),` +
      ` (SELECT id FROM documento_processos WHERE legacy_id = ${N(vigente.processo)} AND empresa_id = ${S(EMP)})` +
      ` WHERE NOT EXISTS (SELECT 1 FROM documentos_internos WHERE legacy_id = ${N(mestre)} AND empresa_id = ${S(EMP)});`)
    totDocs++

    for (const v of versoes) {
      const situacao = SITUACAO[Number(v.situacao)]
      if (situacao === null || situacao === undefined) {
        avisos.push(`revisão ${v.id}: situação ${v.situacao} desconhecida — pulada`)
        pulados++
        continue
      }
      const data = dataISO(v.dt_versao)
      if (!data) { semData++; avisos.push(`revisão ${v.id}: dt_versao "${v.dt_versao}" ilegível`) }

      const nomeArq = String(v.link || '').replace(/^\//, '')
      const ext = (nomeArq.split('.').pop() || '').toLowerCase()
      if (nomeArq) arquivosACopiar.push(nomeArq)

      const registradoPor = v1ParaV2.get(Number(v.usuario)) || null

      // Sem data legível a revisão entra com a data do documento vigente, para
      // não perder o registro — e o aviso acima diz quais foram.
      const dataFinal = data || dataISO(vigente.dt_versao) || '1900-01-01'

      sql.push(
        `INSERT INTO documento_interno_versoes (id, documento_id, legacy_id, revisao, situacao, data_versao,` +
        ` arquivo_path, arquivo_nome, mime, alteracao, justificativa, registrado_por_id)` +
        ` SELECT gen_random_uuid()::text,` +
        ` (SELECT id FROM documentos_internos WHERE legacy_id = ${N(mestre)} AND empresa_id = ${S(EMP)}),` +
        ` ${N(v.id)}, ${N(v.revisao)}, ${S(situacao)}, ${S(dataFinal)}::date,` +
        ` ${S('/api/upload/documentos-legado/' + nomeArq)}, ${S(nomeArq)}, ${S(MIME[ext] || null)},` +
        ` ${S(v.alteracao)}, ${S(v.justificativa)}, ${S(registradoPor)}` +
        ` WHERE NOT EXISTS (SELECT 1 FROM documento_interno_versoes WHERE legacy_id = ${N(v.id)});`)
      totVers++

      // Elaboradores: o varchar com nomes separados por vírgula vira vínculo.
      const nomes = String(v.elaborado || '').split(',').map((s) => s.trim()).filter((s) => s && s !== '0')
      for (const nome of nomes) {
        const uid = porNome.get(chaveNome(nome)) || null
        if (uid) elabCasados++; else elabSoltos++
        totElab++
        sql.push(
          `INSERT INTO documento_interno_elaboradores (id, versao_id, usuario_id, nome)` +
          ` SELECT gen_random_uuid()::text, v.id, ${S(uid)}, ${uid ? 'NULL' : S(nome)}` +
          ` FROM documento_interno_versoes v WHERE v.legacy_id = ${N(v.id)}` +
          ` AND NOT EXISTS (SELECT 1 FROM documento_interno_elaboradores e WHERE e.versao_id = v.id` +
          ` AND ${uid ? `e.usuario_id = ${S(uid)}` : `e.nome = ${S(nome)}`});`)
      }
    }

    // Ponteiro da vigente, depois de todas as revisões existirem.
    sql.push(
      `UPDATE documentos_internos d SET versao_atual_id =` +
      ` (SELECT v.id FROM documento_interno_versoes v WHERE v.legacy_id = ${N(vigente.id)})` +
      ` WHERE d.legacy_id = ${N(mestre)} AND d.empresa_id = ${S(EMP)}` +
      ` AND d.versao_atual_id IS DISTINCT FROM (SELECT v.id FROM documento_interno_versoes v WHERE v.legacy_id = ${N(vigente.id)});`)
    sql.push('')
  }

  sql.push('COMMIT;')

  fs.mkdirSync(SAIDA, { recursive: true })
  const arqSql = path.join(SAIDA, 'v1-documentos-internos.sql')
  fs.writeFileSync(arqSql, sql.join('\n'), 'utf8')

  // ── Arquivos ──
  let copiados = 0, jaExistiam = 0, faltando = []
  if (COPIAR) {
    fs.mkdirSync(DESTINO_ARQUIVOS, { recursive: true })
    for (const nome of [...new Set(arquivosACopiar)]) {
      const de = path.join(ORIGEM_ARQUIVOS, nome)
      const para = path.join(DESTINO_ARQUIVOS, nome)
      if (fs.existsSync(para)) { jaExistiam++; continue }
      if (!fs.existsSync(de)) { faltando.push(nome); continue }
      fs.copyFileSync(de, para)
      copiados++
    }
  }

  console.log('=== Documentos Internos — v1 → v2 ===')
  console.log(`documentos ...... ${totDocs}`)
  console.log(`revisões ........ ${totVers}${pulados ? ` (${pulados} puladas)` : ''}`)
  console.log(`elaboradores .... ${totElab}  (${elabCasados} casados por ID, ${elabSoltos} só com nome)`)
  console.log(`processos ....... ${processos.length}`)
  console.log(`tipos ........... ${tipos.length}`)
  console.log(`datas ilegíveis . ${semData}`)
  console.log(`usuários v1 sem par no v2: ${naoCasados.length}`)
  if (COPIAR) {
    console.log(`arquivos ........ ${copiados} copiados, ${jaExistiam} já existiam${faltando.length ? `, ${faltando.length} SEM ORIGEM` : ''}`)
    if (faltando.length) console.log('   sem origem:', faltando.slice(0, 8).join(', '))
  } else {
    console.log(`arquivos ........ (--sem-arquivos)`)
  }
  console.log(`\nSQL: ${arqSql}`)
  if (avisos.length) {
    console.log(`\navisos (${avisos.length}):`)
    for (const a of avisos.slice(0, 15)) console.log('  •', a)
    if (avisos.length > 15) console.log(`  … +${avisos.length - 15}`)
  }

  await my.end()
  await prisma.$disconnect()
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1) })
