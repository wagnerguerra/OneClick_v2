/**
 * Migração das Compras/Aquisições do OneClick v1 (MySQL sgq_com*) para o v2
 * (models Compra + itens/anexos/mensagens/critérios/avaliação da Fase 3).
 *
 * PRÉ-REQUISITO: os fornecedores já migrados COM legacy_id (rodar
 * migrar-fornecedores-legado.js primeiro). O pedido → fornecedor é mapeado pelo
 * legacy_id (robusto p/ CNPJs duplicados).
 *
 * Uso (da máquina do Wagner, na LAN):
 *   LEGACY_DB_USER=rose LEGACY_DB_PASSWORD=*** DATABASE_URL=<pg> [EMPRESA_ID=...] \
 *   [COPIAR_ARQUIVOS=1] [DRY_RUN=1] [FORCE=1] node packages/db/scripts/migrar-compras-legado.js
 */
const path = require('path')
const fs = require('fs')
const mysql = require(path.join(process.cwd(), 'node_modules', 'mysql2', 'promise'))
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const DRY = process.env.DRY_RUN === '1'
const COPIAR = process.env.COPIAR_ARQUIVOS === '1'
const SRC_ARQ = '\\\\192.168.0.7\\wwwroot\\files\\aquisicoes'
const DEST_ARQ = path.join(process.cwd(), 'apps', 'api', 'uploads', 'aquisicoes-legado')

const STATUS = { 1: 'NOVO', 2: 'AGUARDANDO_APROVACAO', 3: 'APROVADO', 4: 'RECEBIDO', 5: 'AVALIADO', 6: 'CANCELADO' }
const TIPO_FORN = { 1: 'NORMAL', 2: 'CONTRATO_PERMANENTE', 3: 'CONTRATO_TEMPORARIO', 4: 'CURSO_TREINAMENTO', 5: 'MANUTENCAO_SOFTWARE' }

function pgUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const m = fs.readFileSync(path.join(process.cwd(), 'apps', 'api', '.env'), 'utf8').match(/DATABASE_URL=(.*)/)
  return m ? m[1].replace(/"/g, '').trim() : null
}
function num(v) { const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
function dataOuNull(v) { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) || d.getFullYear() < 1990 ? null : d }
function basename(link) { const s = String(link || '').replace(/\\/g, '/'); return s.slice(s.lastIndexOf('/') + 1) }

;(async () => {
  const my = await mysql.createConnection({
    host: process.env.LEGACY_DB_HOST || '192.168.0.7', port: Number(process.env.LEGACY_DB_PORT || 3306),
    user: process.env.LEGACY_DB_USER, password: process.env.LEGACY_DB_PASSWORD,
    database: process.env.LEGACY_DB_NAME || 'db_intranet', connectTimeout: 10000,
  })
  const pg = new Client({ connectionString: pgUrl() })
  await pg.connect()
  try {
    let empresaId = process.env.EMPRESA_ID
    if (!empresaId) empresaId = (await pg.query('SELECT id FROM empresas ORDER BY created_at LIMIT 1')).rows[0].id

    const jaTem = await pg.query('SELECT count(*)::int n FROM compras WHERE empresa_id=$1', [empresaId])
    if (jaTem.rows[0].n > 0 && process.env.FORCE !== '1' && !DRY) {
      console.error(`ABORTADO: a empresa já tem ${jaTem.rows[0].n} compra(s). Use FORCE=1 p/ importar mesmo assim.`); return
    }

    // Mapa fornecedor: legacy_id → v2 id
    const fRows = (await pg.query('SELECT id, legacy_id FROM fornecedores WHERE legacy_id IS NOT NULL AND empresa_id=$1', [empresaId])).rows
    const mapForn = new Map(fRows.map((r) => [r.legacy_id, r.id]))
    if (!mapForn.size) { console.error('ABORTADO: nenhum fornecedor com legacy_id. Rode a migração dos fornecedores primeiro.'); return }

    const stats = { pedidos: 0, semForn: 0, itens: 0, anexos: 0, msgs: 0, criterios: 0, respostas: 0 }
    const mapPedido = new Map()  // legacy sgq_com.id → new compra.id
    const criOrdenados = []      // [id0..id4] p/ mapear P1..P5

    // ── 1) Critérios (sgq_com_cri, últimos 5 ativos) ──
    const [cris] = await my.query("SELECT * FROM sgq_com_cri WHERE ATIVO='1' ORDER BY id ASC LIMIT 5")
    for (let i = 0; i < cris.length; i++) {
      const c = cris[i]
      if (DRY) { criOrdenados.push('dry-' + i); stats.criterios++; continue }
      const ins = await pg.query(
        `INSERT INTO compra_criterios (id, empresa_id, criterio, ordem, is_active, created_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3,true,NOW()) RETURNING id`,
        [empresaId, c.CRITERIO || `Critério ${i + 1}`, i],
      )
      criOrdenados.push(ins.rows[0].id); stats.criterios++
    }

    // ── 2) Pedidos (sgq_com, flag='0') ──
    const [peds] = await my.query("SELECT * FROM sgq_com WHERE flag='0' ORDER BY id ASC")
    for (const p of peds) {
      const fId = mapForn.get(Number(p.ID_FORN))
      if (!fId) { stats.semForn++; continue }
      const status = STATUS[Number(p.status)] || 'NOVO'
      const isActive = Number(p.ATIVO) === 1
      if (DRY) { mapPedido.set(p.id, 'dry-' + p.id); stats.pedidos++; continue }
      const ins = await pg.query(
        `INSERT INTO compras
          (id, code, fornecedor_id, status, forma_pagamento, prazo_entrega, prazo_pagamento, frete, observacoes,
           data_solicitacao, data_aprovacao, data_recebimento, data_avaliacao, tipo_fornecimento,
           nf_numero, nf_valor, melhoria, melhoria_obs, legacy_id, empresa_id, is_active, created_at, updated_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3::"StatusCompra",$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW(),NOW())
         RETURNING id`,
        [Number(p.id), fId, status, p.FORMA ? String(p.FORMA) : null, p.PRAZO_ENTREGA || null, p.PRAZO_PAGTO || null,
         num(p.FRETE) || null, p.OBS || null, dataOuNull(p.DT_SOL), dataOuNull(p.DT_LIB), dataOuNull(p.DT_REC),
         dataOuNull(p.DT_AV), TIPO_FORN[Number(p.TIPO_FORN)] || null, p.NF_NUM || null, num(p.NF_VALOR) || null,
         Number(p.MELHORIA) === 1, p.MELHORIA_OBS || null, Number(p.id), empresaId, isActive],
      )
      mapPedido.set(p.id, ins.rows[0].id)
      stats.pedidos++

      // Respostas P1..P5 (só p/ AVALIADO)
      if (status === 'AVALIADO') {
        for (let i = 0; i < criOrdenados.length; i++) {
          const pv = p[`P${i + 1}`]
          await pg.query(
            `INSERT INTO compra_avaliacao_respostas (id, compra_id, criterio_id, atende, created_at)
             VALUES (gen_random_uuid()::text,$1,$2,$3,NOW()) ON CONFLICT (compra_id,criterio_id) DO NOTHING`,
            [ins.rows[0].id, criOrdenados[i], Number(pv) === 1],
          )
          stats.respostas++
        }
      }
    }

    // ── 3) Itens (sgq_com_ite) ──
    const [itens] = await my.query("SELECT * FROM sgq_com_ite WHERE ATIVO='1' ORDER BY ID ASC")
    for (const it of itens) {
      const cId = mapPedido.get(Number(it.ID_PEDIDO))
      if (!cId || DRY) { if (cId) stats.itens++; continue }
      await pg.query(
        `INSERT INTO compra_itens (id, compra_id, descricao, unidade, quantidade, valor_unitario, is_active, created_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,true,NOW())`,
        [cId, it.DESCRICAO || '(sem descrição)', it.UNIDADE || null, Number(it.QUANTIDADE) || 1, num(it.VALOR_UNI)],
      )
      stats.itens++
    }

    // ── 4) Anexos (sgq_com_arq) ──
    const [arqs] = await my.query("SELECT * FROM sgq_com_arq WHERE ativo='1' ORDER BY Id ASC")
    for (const a of arqs) {
      const cId = mapPedido.get(Number(a.pedido))
      if (!cId) continue
      const fileName = basename(a.link)
      if (!fileName || DRY) { if (fileName) stats.anexos++; continue }
      let tamanho = null
      try { const sp = path.join(SRC_ARQ, fileName); if (fs.existsSync(sp)) tamanho = fs.statSync(sp).size } catch { /* */ }
      const ext = fileName.split('.').pop()?.toLowerCase()
      const mime = ext === 'pdf' ? 'application/pdf' : ['jpg', 'jpeg', 'png', 'gif'].includes(ext) ? 'image/' + (ext === 'jpg' ? 'jpeg' : ext) : null
      await pg.query(
        `INSERT INTO compra_anexos (id, compra_id, descricao, file_url, file_name, mime_type, tamanho, is_active, created_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,true,NOW())`,
        [cId, a.descricao || null, `/api/upload/aquisicoes-legado/${fileName}`, fileName, mime, tamanho],
      )
      stats.anexos++
    }

    // ── 5) Mensagens (sgq_com_msg — coluna CONTROLE = pedido) ──
    const [msgs] = await my.query("SELECT * FROM sgq_com_msg WHERE ATIVO='1' ORDER BY ID ASC")
    for (const m of msgs) {
      const cId = mapPedido.get(Number(m.CONTROLE))
      if (!cId || DRY) { if (cId) stats.msgs++; continue }
      await pg.query(
        `INSERT INTO compra_mensagens (id, compra_id, texto, is_active, created_at, updated_at)
         VALUES (gen_random_uuid()::text,$1,$2,true,$3,$3)`,
        [cId, m.INTERACAO || '', dataOuNull(m.DT_INT) || new Date()],
      )
      stats.msgs++
    }

    // Reajusta a sequência do code p/ não colidir com os números preservados
    if (!DRY) await pg.query("SELECT setval('compras_code_seq', COALESCE((SELECT MAX(code) FROM compras),1))")

    // ── 6) Cópia física dos arquivos (opcional) ──
    if (COPIAR && !DRY) {
      fs.mkdirSync(DEST_ARQ, { recursive: true })
      let copiados = 0, faltando = 0
      for (const a of arqs) {
        const fileName = basename(a.link); if (!fileName) continue
        const src = path.join(SRC_ARQ, fileName), dst = path.join(DEST_ARQ, fileName)
        try { if (fs.existsSync(src)) { if (!fs.existsSync(dst)) fs.copyFileSync(src, dst); copiados++ } else faltando++ } catch { faltando++ }
      }
      console.log(`Arquivos: ${copiados} copiados p/ ${DEST_ARQ}, ${faltando} não encontrados.`)
    }

    console.log(`\n${DRY ? '[DRY RUN] ' : ''}Resumo:`, JSON.stringify(stats, null, 2))
  } catch (e) { console.error('ERRO:', e.message); process.exitCode = 1 }
  finally { await my.end(); await pg.end() }
})()
