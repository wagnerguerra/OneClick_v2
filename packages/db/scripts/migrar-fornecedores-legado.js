/**
 * Migração dos Fornecedores do OneClick v1 (MySQL db_intranet, tabelas cad_for*)
 * para o v2 (Postgres — models Fornecedor + sub-entidades ISO da Fase 0/1).
 *
 * Só LÊ do MySQL (LAN do escritório) e ESCREVE no Postgres alvo. Idempotência:
 * pula fornecedor cujo `documento` já exista na empresa (reaproveita o id p/ os
 * filhos). Anexos apontam p/ /api/upload/fornecedores-legado/<arquivo> (mesmo
 * padrão do orcamentos-legado) — os arquivos físicos são copiados à parte
 * (COPIAR_ARQUIVOS=1) de \\192.168.0.7\wwwroot\files\fornecedores.
 *
 * Uso (da máquina do Wagner, na LAN):
 *   LEGACY_DB_HOST=192.168.0.7 LEGACY_DB_USER=rose LEGACY_DB_PASSWORD=*** \
 *   LEGACY_DB_NAME=db_intranet DATABASE_URL=<postgres> [EMPRESA_ID=...] \
 *   [COPIAR_ARQUIVOS=1] [DRY_RUN=1] node packages/db/scripts/migrar-fornecedores-legado.js
 */
const path = require('path')
const fs = require('fs')
const mysql = require(path.join(process.cwd(), 'node_modules', 'mysql2', 'promise'))
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const DRY = process.env.DRY_RUN === '1'
const COPIAR = process.env.COPIAR_ARQUIVOS === '1'
const SRC_ARQ = '\\\\192.168.0.7\\wwwroot\\files\\fornecedores'
const DEST_ARQ = path.join(process.cwd(), 'apps', 'api', 'uploads', 'fornecedores-legado')

const TIPO = { '1': 'SERVICO', '2': 'PRODUTO', '3': 'AMBOS' }
const RISCO = { 1: 'BAIXO', 2: 'MEDIO', 3: 'ALTO' }

function pgUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const m = fs.readFileSync(path.join(process.cwd(), 'apps', 'api', '.env'), 'utf8').match(/DATABASE_URL=(.*)/)
  return m ? m[1].replace(/"/g, '').trim() : null
}
function limpaDoc(s) { return (s || '').replace(/\D/g, '') }
function basename(link) { const s = String(link || '').replace(/\\/g, '/'); return s.slice(s.lastIndexOf('/') + 1) }
function parseData(s) { const d = new Date(s); return isNaN(d.getTime()) ? new Date('2020-01-01') : d }

;(async () => {
  const my = await mysql.createConnection({
    host: process.env.LEGACY_DB_HOST || '192.168.0.7',
    port: Number(process.env.LEGACY_DB_PORT || 3306),
    user: process.env.LEGACY_DB_USER,
    password: process.env.LEGACY_DB_PASSWORD,
    database: process.env.LEGACY_DB_NAME || 'db_intranet',
    connectTimeout: 10000,
  })
  const pg = new Client({ connectionString: pgUrl() })
  await pg.connect()

  try {
    // Empresa alvo
    let empresaId = process.env.EMPRESA_ID
    if (!empresaId) {
      const r = await pg.query('SELECT id, razao_social FROM empresas ORDER BY created_at LIMIT 1')
      empresaId = r.rows[0].id
      console.log(`Empresa alvo (mais antiga): ${r.rows[0].razao_social} [${empresaId}]`)
    }

    // Guarda contra dupla execução: aborta se a empresa já tem fornecedores
    // (a não ser FORCE=1). Evita duplicar tudo num re-run acidental.
    const jaTem = await pg.query('SELECT count(*)::int n FROM fornecedores WHERE empresa_id=$1', [empresaId])
    if (jaTem.rows[0].n > 0 && process.env.FORCE !== '1' && !DRY) {
      console.error(`ABORTADO: a empresa já tem ${jaTem.rows[0].n} fornecedor(es). Use FORCE=1 p/ importar mesmo assim.`)
      return
    }

    const stats = { forn: 0, crit: 0, qua: 0, log: 0, arq: 0, arqSemForn: 0 }
    const mapForn = new Map() // legacy cad_for.ID → new fornecedor.id
    const mapCri = new Map()  // legacy cad_for_cri.ID → new fornecedor_criterio.id

    // ── 1) Fornecedores (cad_for) — importa TODOS (inclui CNPJs duplicados do v1) ──
    const [forns] = await my.query('SELECT * FROM cad_for ORDER BY ID ASC')
    for (const f of forns) {
      const doc = limpaDoc(f.CNPJ)
      const data = {
        razaoSocial: f.RAZAO || 'SEM RAZÃO',
        documento: doc,
        tipoDocumento: doc.length === 11 ? 'CPF' : 'CNPJ',
        tipoFornecedor: TIPO[String(f.TIPO)] || 'AMBOS',
        risco: RISCO[f.RISCO] || 'MEDIO',
        avaliacaoObrigatoria: Number(f.avaliacao) === 1,
        inscricaoEstadual: f.INSC_EST || null,
        inscricaoMunicipal: f.INSC_MUN || null,
        cep: f.CEP || null, logradouro: f.ENDERECO || null, numero: f.NUMERO || null,
        complemento: f.COMPLEMENTO || null, bairro: f.BAIRRO || null, cidade: f.CIDADE || null,
        uf: (f.estado || '').slice(0, 2) || null,
        telefone: f.TEL || null, email: f.EMAIL || null, contatoPrincipal: f.CONTATO || null,
        observacoes: f.OBSERVACOES || null,
        isActive: Number(f.ATIVO) === 1,
      }
      if (DRY) { mapForn.set(f.ID, 'dry-' + f.ID); stats.forn++; continue }
      const ins = await pg.query(
        `INSERT INTO fornecedores
          (id, razao_social, documento, tipo_documento, tipo_fornecedor, risco, avaliacao_obrigatoria,
           inscricao_estadual, inscricao_municipal, cep, logradouro, numero, complemento, bairro, cidade, uf,
           telefone, email, contato_principal, observacoes, is_active, empresa_id, legacy_id, version, created_at, updated_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3::"TipoDocumento",$4::"TipoFornecedor",$5::"RiscoFornecedor",$6,
           $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,1,NOW(),NOW())
         RETURNING id`,
        [data.razaoSocial, data.documento, data.tipoDocumento, data.tipoFornecedor, data.risco, data.avaliacaoObrigatoria,
         data.inscricaoEstadual, data.inscricaoMunicipal, data.cep, data.logradouro, data.numero, data.complemento,
         data.bairro, data.cidade, data.uf, data.telefone, data.email, data.contatoPrincipal, data.observacoes,
         data.isActive, empresaId, Number(f.ID)],
      )
      mapForn.set(f.ID, ins.rows[0].id)
      stats.forn++
    }

    // ── 2) Critérios de seleção (cad_for_cri, QA='S' ou vazio) ──
    const [cris] = await my.query("SELECT * FROM cad_for_cri WHERE ATIVO='1' AND (QA='S' OR QA IS NULL OR QA='') ORDER BY ID ASC")
    for (const c of cris) {
      const tipo = TIPO[String(c.TIPO)] || 'AMBOS'
      if (DRY) { mapCri.set(c.ID, 'dry-' + c.ID); stats.crit++; continue }
      const ins = await pg.query(
        `INSERT INTO fornecedor_criterios (id, empresa_id, tipo_fornecedor, criterio, ordem, is_active, created_at)
         VALUES (gen_random_uuid()::text,$1,$2::"TipoFornecedor",$3,$4,true,NOW()) RETURNING id`,
        [empresaId, tipo, c.CRITERIO || '(sem texto)', Number(c.ID) || 0],
      )
      mapCri.set(c.ID, ins.rows[0].id)
      stats.crit++
    }

    // ── 3) Qualificações (cad_for_qua) ──
    const [quas] = await my.query('SELECT * FROM cad_for_qua')
    for (const q of quas) {
      const fId = mapForn.get(Number(q.FORNECEDOR))
      const cId = mapCri.get(Number(q.ID_CRI))
      if (!fId || !cId || DRY) { if (fId && cId) stats.qua++; continue }
      await pg.query(
        `INSERT INTO fornecedor_qualificacoes (id, fornecedor_id, criterio_id, atende, created_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3,NOW())
         ON CONFLICT (fornecedor_id, criterio_id) DO UPDATE SET atende=EXCLUDED.atende`,
        [fId, cId, String(q.QUALIFICACAO) === '1'],
      )
      stats.qua++
    }

    // ── 4) Logs (cad_for_log) → FornecedorEvent ──
    const [logs] = await my.query('SELECT * FROM cad_for_log ORDER BY id ASC')
    for (const l of logs) {
      const fId = mapForn.get(Number(l.id_registro))
      if (!fId || DRY) { if (fId) stats.log++; continue }
      const type = /cadastr/i.test(l.evento || '') ? 'created' : 'updated'
      await pg.query(
        `INSERT INTO fornecedor_events (id, fornecedor_id, user_id, type, version, changes, created_at)
         VALUES (gen_random_uuid()::text,$1,NULL,$2,0,$3::jsonb,$4)`,
        [fId, type, JSON.stringify({ legado: true, evento: l.evento, usuario: l.usuario }), parseData(l.dt_evento)],
      )
      stats.log++
    }

    // ── 5) Anexos (cad_for_arq) ──
    const [arqs] = await my.query("SELECT * FROM cad_for_arq WHERE ativo='1' ORDER BY Id ASC")
    for (const a of arqs) {
      const fId = mapForn.get(Number(a.fornecedor))
      if (!fId) { stats.arqSemForn++; continue }
      const fileName = basename(a.link)
      if (!fileName) continue
      let tamanho = null, mimeType = null
      const srcPath = path.join(SRC_ARQ, fileName)
      try { if (fs.existsSync(srcPath)) tamanho = fs.statSync(srcPath).size } catch { /* */ }
      const ext = fileName.split('.').pop()?.toLowerCase()
      if (ext === 'pdf') mimeType = 'application/pdf'
      else if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) mimeType = 'image/' + (ext === 'jpg' ? 'jpeg' : ext)
      if (DRY) { stats.arq++; continue }
      await pg.query(
        `INSERT INTO fornecedor_anexos (id, fornecedor_id, descricao, file_url, file_name, mime_type, tamanho, uploaded_by_id, is_active, created_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,NULL,true,$7)`,
        [fId, a.descricao || null, `/api/upload/fornecedores-legado/${fileName}`, fileName, mimeType, tamanho, parseData(a.dt_arq)],
      )
      stats.arq++
    }

    // ── 6) Cópia física dos arquivos (opcional) ──
    if (COPIAR && !DRY) {
      fs.mkdirSync(DEST_ARQ, { recursive: true })
      let copiados = 0, faltando = 0
      for (const a of arqs) {
        const fileName = basename(a.link)
        if (!fileName) continue
        const src = path.join(SRC_ARQ, fileName)
        const dst = path.join(DEST_ARQ, fileName)
        try {
          if (fs.existsSync(src)) { if (!fs.existsSync(dst)) fs.copyFileSync(src, dst); copiados++ }
          else faltando++
        } catch (e) { faltando++ }
      }
      console.log(`Arquivos: ${copiados} copiados p/ ${DEST_ARQ}, ${faltando} não encontrados no origem.`)
    }

    console.log(`\n${DRY ? '[DRY RUN] ' : ''}Resumo:`, JSON.stringify(stats, null, 2))
  } catch (e) {
    console.error('ERRO:', e.message)
    process.exitCode = 1
  } finally {
    await my.end()
    await pg.end()
  }
})()
