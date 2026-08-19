// Corrige a acentuação dupla-codificada que veio do v1 nas cargas da
// Qualidade ("revisÃ£o" → "revisão"). O v1 gravava, em parte das linhas,
// bytes UTF-8 dentro de colunas latin1 — na leitura da carga o MySQL
// converteu de novo e nasceu o mojibake.
//
// Estratégia: varre TODAS as tabelas que têm coluna legacy_id (as migradas),
// em todas as colunas de texto; detecta o padrão de dupla codificação
// (Ã/Â seguidos de baixo, ou as trincas â€œ etc.), desfaz com o mapa
// reverso do cp1252 (o "latin1" do MySQL) e só aceita quando a decodificação
// UTF-8 estrita fecha. Palavras legítimas como "SUGESTÃO" não casam com o
// padrão (Ã seguido de letra maiúscula) e ficam intactas.
//
// Lê do Postgres de DEV (a carga é idêntica à produção) e gera UPDATEs
// chaveados por legacy_id (e legacy_source quando existe) em scripts/out/,
// aplicáveis nos dois ambientes. NÃO aplica nada.

const fs = require('fs')
const path = require('path')
const { PrismaClient } = require(path.join(__dirname, '..', 'packages', 'db', 'src', 'generated', 'client'))

const SAIDA = path.join(__dirname, 'out')
const S = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)

// Reverso do cp1252 para os pontos que não são latin1 puro (€ “ ” – — etc.).
const CP1252_REV = new Map(Object.entries({
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
  '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A,
  '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C,
  'ž': 0x9E, 'Ÿ': 0x9F,
}).map(([c, b]) => [c, b]))

const SUSPEITO = /[ÃÂ][-¿]|Ã[€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]|â€/

const decodificador = new TextDecoder('utf-8', { fatal: true })

/** Desfaz UMA rodada de dupla codificação; null se não é caso ou não fecha. */
function desfazer(s) {
  if (!s || !SUSPEITO.test(s)) return null
  const bytes = []
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    if (cp <= 0xff) bytes.push(cp)
    else if (CP1252_REV.has(ch)) bytes.push(CP1252_REV.get(ch))
    else return null // caractere que não veio de cp1252 — não é o nosso caso
  }
  try {
    const out = decodificador.decode(Buffer.from(bytes))
    return out !== s ? out : null
  } catch {
    return null // não fecha como UTF-8 → era acentuação legítima, não toca
  }
}

;(async () => {
  const prisma = new PrismaClient()

  // Todas as tabelas migradas (têm legacy_id) e suas colunas de texto.
  const tabelas = await prisma.$queryRawUnsafe(`
    SELECT c.table_name::text AS table_name, array_agg(c.column_name::text ORDER BY c.ordinal_position) cols,
           bool_or(c2.column_name = 'legacy_source') tem_source
    FROM information_schema.columns c
    JOIN information_schema.columns k
      ON k.table_schema = c.table_schema AND k.table_name = c.table_name AND k.column_name = 'legacy_id'
    LEFT JOIN information_schema.columns c2
      ON c2.table_schema = c.table_schema AND c2.table_name = c.table_name AND c2.column_name = 'legacy_source'
    WHERE c.table_schema = 'public'
      AND c.data_type IN ('text', 'character varying')
      AND c.column_name NOT IN ('id', 'legacy_source', 'protocolo')
      AND c.column_name NOT LIKE '%\\_id' ESCAPE '\\'
    GROUP BY c.table_name
    ORDER BY c.table_name`)

  const sql = []
  sql.push('-- Correção da acentuação dupla-codificada vinda do v1 (mojibake).')
  sql.push('-- Gerado por scripts/fix-acentuacao-qualidade.js — chaveado por legacy_id;')
  sql.push('-- idempotente: depois de corrigida, a linha não casa mais com o padrão.')
  sql.push('BEGIN;')

  let totalLinhas = 0, totalCampos = 0
  const porTabela = {}

  for (const t of tabelas) {
    const cols = t.cols
    const chave = t.tem_source ? ['legacy_source', 'legacy_id'] : ['legacy_id']
    const linhas = await prisma.$queryRawUnsafe(
      `SELECT ${[...chave, ...cols].map((c) => `"${c}"`).join(', ')} FROM "${t.table_name}" WHERE legacy_id IS NOT NULL`,
    )
    for (const linha of linhas) {
      const sets = []
      for (const col of cols) {
        const corrigido = desfazer(linha[col])
        if (corrigido != null) sets.push(`"${col}" = ${S(corrigido)}`)
      }
      if (!sets.length) continue
      const onde = chave.map((c) => `"${c}" = ${S(linha[c])}`).join(' AND ')
      sql.push(`UPDATE "${t.table_name}" SET ${sets.join(', ')} WHERE ${onde};`)
      totalLinhas++
      totalCampos += sets.length
      porTabela[t.table_name] = (porTabela[t.table_name] ?? 0) + 1
    }
  }

  sql.push('COMMIT;')
  fs.mkdirSync(SAIDA, { recursive: true })
  const arq = path.join(SAIDA, 'fix-acentuacao-qualidade.sql')
  fs.writeFileSync(arq, sql.join('\n'), 'utf8')

  console.log('=== Correção de acentuação (mojibake do v1) ===')
  for (const [tab, n] of Object.entries(porTabela)) console.log(`${tab} ......... ${n} linhas`)
  console.log(`TOTAL: ${totalLinhas} linhas, ${totalCampos} campos`)
  console.log(`SQL: ${arq}`)

  await prisma.$disconnect()
})().catch((e) => { console.error('FALHA:', e.message); process.exit(1) })
