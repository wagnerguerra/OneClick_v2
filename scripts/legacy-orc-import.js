/* eslint-disable */
/**
 * Importa o HISTÓRICO de orçamentos do legado v4 (db_intranet, família com_orc*)
 * para as tabelas auxiliares do sistema novo (orcamento_legado*).
 *
 * IMPORTANTE: esses registros são SÓ HISTÓRICO — ficam em tabelas separadas e NÃO
 * aparecem como orçamentos válidos (/orcamentos). Só são exibidos no detalhe do
 * orçamento atual e no cadastro do cliente.
 *
 * Lê via mysql2 e GERA um .sql idempotente (ids determinísticos orcleg-<id>;
 * TRUNCATE + re-insere). O cliente é casado por CNPJ via subquery no apply-time
 * (clientes.documento). Aplicar com:
 *   docker exec -i saas-postgres psql -U postgres -d saas_erp < scripts/out/orcamento_legado_import.sql   (local)
 *   docker exec -i n8n-postgres-1 psql -U oneclick -d oneclick < ... (prod, via ssh)
 *
 * Uso: node scripts/legacy-orc-import.js
 */
const fs = require('fs')
const path = require('path')
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'))

// ── credenciais do .env (não hardcoda segredo no script) ──
function readEnv() {
  const env = {}
  const p = path.join(__dirname, '..', 'apps', 'api', '.env')
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i < 0) continue
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    env[t.slice(0, i).trim()] = v
  }
  return env
}

const STATUS_MAP = { 1: 'A enviar', 2: 'Enviado', 3: 'Aprovado', 4: 'Liberado', 5: 'Finalizado', 6: 'Cancelado', 7: 'Não aprovado', 8: 'Encerrado', 9: 'Em revisão', 10: 'Respondido' }

const esc = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`
const num = (v) => (v == null || v === '' || isNaN(Number(v))) ? 'NULL' : String(Number(v))
// Valores no legado vêm em pt-BR ("1.500,00", "216,81") e qtde como "01". Converte
// pra número (ponto = milhar, vírgula = decimal quando há vírgula).
const parseBr = (v) => {
  if (v == null) return null
  let t = String(v).trim(); if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t); return isNaN(n) ? null : n
}
const numBr = (v) => { const n = parseBr(v); return n == null ? 'NULL' : String(n) }
const dt = (v) => { if (!v) return 'NULL'; const d = new Date(v); return isNaN(d.getTime()) ? 'NULL' : `'${d.toISOString().slice(0, 19).replace('T', ' ')}'` }
const digits = (v) => String(v || '').replace(/\D/g, '')

async function main() {
  const env = readEnv()
  const conn = await mysql.createConnection({
    host: env.LEGACY_ORC_DB_HOST, user: env.LEGACY_ORC_DB_USER, password: env.LEGACY_ORC_DB_PASSWORD,
    database: env.LEGACY_ORC_DB_NAME, port: Number(env.LEGACY_ORC_DB_PORT || 3306), connectTimeout: 20000,
  })
  const EMP = env.LEGACY_ORC_EMPRESA

  console.log('Lendo orçamentos do legado (empresa CENTRAL)...')
  const [orcs] = await conn.query(
    `SELECT o.id, o.numero, o.status, o.tipo, o.contato, o.contato_email, o.validade, o.desconto, o.valor_desconto,
            o.descricao, o.dt_nov, o.dt_env, o.dt_apr, o.dt_lib, o.dt_fin, o.dt_enc, o.dt_can,
            o.nome_aprovacao, o.cpf_aprovacao, o.obs_aprovacao, o.nome_recusa, o.cpf_recusa, o.obs_recusa, o.dt_recusa,
            o.obs_pesquisa,
            g.cad_cli_cnpj AS cnpj, g.cad_cli_razao AS razao
       FROM com_orc o
       LEFT JOIN ger_cad_cli g ON g.id = o.cliente
      WHERE o.ativo = 1 AND o.id_empresa = ?
      ORDER BY o.numero ASC`, [EMP])
  console.log(`  ${orcs.length} orçamentos`)

  // catálogo de serviços (cod_serv -> nome/valor) p/ descrição e fallback de valor
  const [cad] = await conn.query(`SELECT id, servico, valor FROM com_orc_cad WHERE id_empresa = ?`, [EMP])
  const cadMap = new Map(cad.map(r => [r.id, { servico: r.servico, valor: r.valor }]))

  const lines = []
  lines.push('BEGIN;')
  lines.push('TRUNCATE orcamento_legado, orcamento_legado_item, orcamento_legado_mensagem, orcamento_legado_evento CASCADE;')

  let comCnpj = 0, totItens = 0, totMsg = 0, totEv = 0
  for (const o of orcs) {
    const pid = `orcleg-${o.id}`
    const cnpjD = digits(o.cnpj)
    if (cnpjD) comCnpj++
    const clienteSub = cnpjD ? `(SELECT id FROM clientes WHERE regexp_replace(documento,'\\D','','g') = '${cnpjD}' LIMIT 1)` : 'NULL'

    // itens — valor em pt-BR; fallback pro valor do catálogo quando o item vem vazio
    const [itens] = await conn.query(`SELECT cod_serv, qtde, valor, situacao FROM com_orc_ser WHERE cod_orc = ? AND ativo = 1 ORDER BY id ASC`, [o.numero])
    const itemValor = (it) => { const v = parseBr(it.valor); if (v != null) return v; const c = cadMap.get(it.cod_serv); return c ? parseBr(c.valor) : null }
    let total = 0
    itens.forEach(it => { const q = parseBr(it.qtde) || 1; const v = itemValor(it) || 0; total += q * v })

    // decisão
    let decisaoTipo = null, decisaoNome = null, decisaoCpf = null, decisaoObs = null, decisaoEm = null
    if (o.status === 3 || o.status === 4 || o.status === 5) { decisaoTipo = 'aprovado'; decisaoNome = o.nome_aprovacao; decisaoCpf = o.cpf_aprovacao; decisaoObs = o.obs_aprovacao; decisaoEm = o.dt_apr }
    else if (o.status === 7) { decisaoTipo = 'recusado'; decisaoNome = o.nome_recusa; decisaoCpf = o.cpf_recusa; decisaoObs = o.obs_recusa; decisaoEm = o.dt_recusa }

    lines.push(
      `INSERT INTO orcamento_legado (id, legacy_id, numero, cliente_id, cnpj, razao_social, status, tipo, contato, contato_email, validade_dias, desconto, valor_desconto, valor_total, descricao, decisao_tipo, decisao_nome, decisao_cpf, decisao_obs, decisao_em, csat_obs, dt_novo, dt_enviado, dt_aprovado, dt_liberado, dt_finalizado, dt_encerrado, dt_cancelado) VALUES (` +
      `${esc(pid)}, ${o.id}, ${o.numero}, ${clienteSub}, ${esc(cnpjD || null)}, ${esc(o.razao)}, ${esc(STATUS_MAP[o.status] || o.status)}, ${esc(o.tipo)}, ${esc(o.contato)}, ${esc(o.contato_email)}, ${num(o.validade)}, ${esc(o.desconto)}, ${esc(o.valor_desconto)}, ${num(total || null)}, ${esc(o.descricao)}, ${esc(decisaoTipo)}, ${esc(decisaoNome)}, ${esc(decisaoCpf)}, ${esc(decisaoObs)}, ${dt(decisaoEm)}, ${esc(o.obs_pesquisa)}, ${dt(o.dt_nov)}, ${dt(o.dt_env)}, ${dt(o.dt_apr)}, ${dt(o.dt_lib)}, ${dt(o.dt_fin)}, ${dt(o.dt_enc)}, ${dt(o.dt_can)});`)

    itens.forEach((it, i) => {
      totItens++
      const cad = cadMap.get(it.cod_serv)
      const vUnit = itemValor(it)
      lines.push(`INSERT INTO orcamento_legado_item (id, orcamento_id, descricao, tipo, quantidade, valor_unitario, ordem) VALUES (${esc(pid + '-i' + i)}, ${esc(pid)}, ${esc(cad ? cad.servico : null)}, ${esc(it.situacao)}, ${numBr(it.qtde)}, ${vUnit == null ? 'NULL' : String(vUnit)}, ${i});`)
    })

    const [msgs] = await conn.query(`SELECT interacao, dt_int FROM com_orc_int WHERE controle = ? AND ativo = 1 ORDER BY id ASC`, [o.numero])
    msgs.forEach((m, i) => {
      if (!m.interacao) return
      totMsg++
      lines.push(`INSERT INTO orcamento_legado_mensagem (id, orcamento_id, conteudo, data) VALUES (${esc(pid + '-m' + i)}, ${esc(pid)}, ${esc(m.interacao)}, ${dt(m.dt_int)});`)
    })

    const [evs] = await conn.query(`SELECT evento, dt_evento FROM crp_orc_log WHERE id_registro = ? ORDER BY id ASC`, [o.numero])
    evs.forEach((e, i) => {
      if (!e.evento) return
      totEv++
      lines.push(`INSERT INTO orcamento_legado_evento (id, orcamento_id, evento, data) VALUES (${esc(pid + '-e' + i)}, ${esc(pid)}, ${esc(e.evento)}, ${dt(e.dt_evento)});`)
    })
  }
  lines.push('COMMIT;')

  const outDir = path.join(__dirname, 'out')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'orcamento_legado_import.sql')
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8')

  console.log(`\nResumo: ${orcs.length} orçamentos (${comCnpj} com CNPJ) · ${totItens} itens · ${totMsg} mensagens · ${totEv} eventos`)
  console.log(`SQL gerado: ${outFile}`)
  await conn.end()
}
main().catch(e => { console.error('ERRO:', e.message); process.exit(1) })
