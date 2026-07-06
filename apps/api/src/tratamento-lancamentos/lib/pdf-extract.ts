// ============================================================
// Extração determinística de tabela de lançamentos a partir de PDFs de extrato
// bancário COM camada de texto (a grande maioria dos extratos exportados pelos
// bancos). Reconstrói uma tabela (linhas × colunas) usando as COORDENADAS de
// cada fragmento de texto (x/y), e devolve o mesmo `ExtractedTable` consumido
// pelo resto do pipeline (de/para → pendências → SCI). É apenas OUTRA
// implementação da fronteira de extração — não toca no restante.
//
// Estratégia (genérica, sem regra por banco):
//  1. Coleta os fragmentos de texto com posição (x,y) via pdf-parse (pagerender).
//  2. Agrupa fragmentos por linha física (y) e mescla fragmentos colados (x).
//  3. Detecta a linha de CABEÇALHO (Data/Histórico/Valor/Saldo...) e usa os
//     centros x das colunas como âncoras — cada token cai na coluna de centro
//     mais próximo (resolve números alinhados à direita).
//  4. Reconstrói LANÇAMENTOS: uma linha com data na coluna de data é uma âncora;
//     linhas sem data (tipo/among contraparte/CNPJ/referência) são anexadas à
//     âncora VERTICALMENTE mais próxima — porque num extrato o "tipo" costuma
//     vir ACIMA da linha do valor e a "referência" ABAIXO dela.
//
// TODO(IA): PDFs ESCANEADOS (sem camada de texto) e IMAGENS caem aqui com
// poucas/nenhuma linha — o gancho de fallback via IA (Gemini/Anthropic) deve
// devolver o mesmo `ExtractedTable`. Ver `extractTabela` em extract-tabela.ts.
// ============================================================

import { colLetter, type CellValue, type ExtractedTable } from './extract-tabela'

// pdf-parse não publica tipos; importamos via require tipado à mão.
interface PdfPageData {
  getTextContent(opts?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }): Promise<{
    items: Array<{ str: string; transform: number[]; width: number; height: number }>
  }>
}
interface PdfParseOptions { pagerender?: (page: PdfPageData) => Promise<string>; max?: number }
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (data: Buffer, opts?: PdfParseOptions) => Promise<{ text: string; numpages: number }> = require('pdf-parse')

// ---- Tipos internos --------------------------------------------------------

/** Fragmento de texto posicionado. x/y = canto inferior-esquerdo da baseline. */
interface Item { s: string; x: number; y: number; w: number }
/** Token = fragmentos horizontalmente colados mesclados. cx = centro em x. */
interface Token { text: string; x0: number; x1: number; cx: number }
/** Linha física = tokens numa mesma faixa de y (topo→base). */
interface Line { y: number; tokens: Token[] }

// A célula da coluna de data é SÓ uma data → âncora de um novo lançamento.
// Aceita separador / - . ; com ou sem ano (Sicoob usa dd/mm; Mercado Pago usa
// dd-mm-aaaa). Exigir a data como a célula INTEIRA evita que anexos
// "dd/mm HH:MM" (hora) virem lançamentos falsos (CEF).
const ANCHOR_DATE_RE = /^\s*\d{1,2}[/\-.]\d{1,2}(?:[/\-.]\d{2,4})?\s*$/
// Palavras que caracterizam a linha de cabeçalho de um extrato.
const HEADER_KEYWORDS = [
  'data', 'lanç', 'lanc', 'histó', 'histo', 'descri', 'valor', 'saldo',
  'documento', 'crédito', 'credito', 'débito', 'debito', 'movimento', 'balancete', 'dcto',
]
// Coluna de data: cabeçalho que identifica a coluna-âncora.
const DATE_COL_RE = /\bdata\b|balancete|moviment|dt\.?\s*mov/i

// Tolerâncias (ajustadas com os PDFs de exemplo; refináveis).
const Y_TOL = 2.5        // fragmentos dentro dessa faixa de y = mesma linha
const GAP_MERGE = 3      // gap x <= isso → fragmentos colados (mesmo token)
const ATTACH_MAX_DY = 40 // distância y máxima p/ anexar linha-detalhe a uma âncora
const HEADER_MERGE_DY = 14 // junta um cabeçalho quebrado em 2 linhas (ex.: "Data" acima)
const CLUSTER_X = 20       // tokens de cabeçalho a < isso em x = mesma coluna

// ---- 1. Coleta de fragmentos posicionados ----------------------------------

async function extractPageItems(buffer: Buffer): Promise<Item[][]> {
  const pages: Item[][] = []
  await pdfParse(buffer, {
    // pdf-parse chama isto por página; empurramos os itens e ignoramos o retorno.
    pagerender: async (page) => {
      const tc = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
      const items: Item[] = []
      for (const it of tc.items) {
        if (!it.str || it.str.trim() === '') continue
        items.push({ s: it.str, x: it.transform[4]!, y: it.transform[5]!, w: it.width })
      }
      pages.push(items)
      return ''
    },
  })
  return pages
}

// ---- 2. Fragmentos → linhas → tokens ---------------------------------------

function buildLines(items: Item[]): Line[] {
  // Ordena topo→base (y maior primeiro) e agrupa por proximidade de y.
  const sorted = [...items].sort((a, b) => b.y - a.y)
  const groups: Item[][] = []
  let refY = Number.POSITIVE_INFINITY
  for (const it of sorted) {
    if (groups.length && Math.abs(refY - it.y) <= Y_TOL) {
      groups[groups.length - 1]!.push(it)
    } else {
      groups.push([it])
      refY = it.y
    }
  }
  return groups.map((g) => ({ y: g[0]!.y, tokens: mergeTokens(g) }))
}

function mergeTokens(lineItems: Item[]): Token[] {
  const s = [...lineItems].sort((a, b) => a.x - b.x)
  const out: Token[] = []
  for (const it of s) {
    const x0 = it.x
    const x1 = it.x + it.w
    const last = out[out.length - 1]
    if (last && x0 - last.x1 <= GAP_MERGE) {
      last.text += it.s
      last.x1 = Math.max(last.x1, x1)
    } else {
      out.push({ text: it.s, x0, x1, cx: 0 })
    }
  }
  return out
    .map((t) => ({ ...t, text: t.text.replace(/\s+/g, ' ').trim(), cx: (t.x0 + t.x1) / 2 }))
    .filter((t) => t.text !== '')
}

// ---- 3. Cabeçalho e colunas ------------------------------------------------

interface HeaderSpec {
  centers: number[]      // centro x de cada coluna (ordenado)
  names: string[]        // nome de cada coluna (único, "Coluna A/B/..." quando vazio)
  fingerprint: string    // assinatura textual p/ detectar repetição em outras páginas
  dateCol: number        // índice da coluna-âncora de data
}

function headerScore(line: Line): number {
  if (line.tokens.length < 3) return 0
  let score = 0
  for (const t of line.tokens) {
    const low = t.text.toLowerCase()
    if (HEADER_KEYWORDS.some((k) => low.includes(k))) score++
  }
  return score
}

function lineFingerprint(line: Line): string {
  return line.tokens.map((t) => t.text.toLowerCase()).join('|')
}

function buildHeaderSpec(lines: Line[], idx: number): HeaderSpec {
  const base = lines[idx]!
  // Cabeçalho pode quebrar em 2 linhas (ex.: "Data" acima de "Documento ...").
  // Junta tokens de linhas vizinhas PURAMENTE TEXTUAIS dentro de uma janela y.
  const tokens: Token[] = [...base.tokens]
  lines.forEach((l, j) => {
    if (j === idx) return
    if (Math.abs(l.y - base.y) > HEADER_MERGE_DY) return
    if (!l.tokens.every((t) => !/\d/.test(t.text))) return
    tokens.push(...l.tokens)
  })

  // Agrupa tokens por x → colunas (junta quem está a < CLUSTER_X de distância).
  const sorted = [...tokens].sort((a, b) => a.cx - b.cx)
  const clusters: Token[][] = []
  for (const t of sorted) {
    const last = clusters[clusters.length - 1]
    if (last && t.cx - last[last.length - 1]!.cx <= CLUSTER_X) last.push(t)
    else clusters.push([t])
  }
  const cols = clusters.map((c) => ({
    // Junta os textos únicos e colapsa palavras repetidas ("Data Data Efetiva"
    // → "Data Efetiva"), fruto de cabeçalho quebrado em 2 linhas.
    text: [...new Set(c.map((t) => t.text))].join(' ')
      .replace(/\s+/g, ' ').trim()
      .replace(/\b(\p{L}+)(?:\s+\1\b)+/giu, '$1'),
    cx: c.reduce((s, t) => s + t.cx, 0) / c.length,
  }))

  const seen = new Map<string, number>()
  const names = cols.map((c, i) => {
    const name = c.text || `Coluna ${colLetter(i)}`
    const dup = seen.get(name) ?? 0
    seen.set(name, dup + 1)
    return dup > 0 ? `${name} (${dup + 1})` : name
  })
  const dateCol = Math.max(0, cols.findIndex((c) => DATE_COL_RE.test(c.text)))
  return { centers: cols.map((c) => c.cx), names, fingerprint: lineFingerprint(base), dateCol }
}

/**
 * Escolhe a linha de cabeçalho: entre as candidatas (score ≥ 2), prefere a que
 * é seguida por ≥2 linhas com data na coluna de data (rejeita "caixas de resumo"
 * como "Saldo total | disponível | bloqueado"). Sem nenhuma válida, usa a de
 * maior score (fallback).
 */
function detectHeader(lines: Line[]): HeaderSpec | null {
  const cands = lines
    .map((l, i) => ({ i, y: l.y, score: headerScore(l) }))
    .filter((c) => c.score >= 2)
    .sort((a, b) => b.score - a.score)

  let fallback: HeaderSpec | null = null
  for (const c of cands) {
    const spec = buildHeaderSpec(lines, c.i)
    if (!fallback) fallback = spec
    let dateRows = 0
    for (const l of lines) {
      if (l.y >= c.y - Y_TOL) continue // só o que está abaixo do cabeçalho
      const cells = assignCells(l.tokens, spec.centers)
      if (ANCHOR_DATE_RE.test(cells[spec.dateCol] ?? '') && ++dateRows >= 2) break
    }
    if (dateRows >= 2) return spec
  }
  return fallback
}

/** Índice da coluna de centro mais próximo do token. */
function nearestCol(cx: number, centers: number[]): number {
  let best = 0
  let bestD = Number.POSITIVE_INFINITY
  for (let i = 0; i < centers.length; i++) {
    const d = Math.abs(cx - centers[i]!)
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

/** Distribui os tokens da linha nas colunas do cabeçalho (junta com espaço). */
function assignCells(tokens: Token[], centers: number[]): string[] {
  const cells: string[] = centers.map(() => '')
  for (const t of tokens) {
    const c = nearestCol(t.cx, centers)
    cells[c] = cells[c] ? `${cells[c]} ${t.text}` : t.text
  }
  return cells
}

// ---- 4. Reconstrução dos lançamentos ---------------------------------------

/**
 * Fronteira pública: tenta primeiro o modo POR-LINHA (Shape-1, cada lançamento
 * traz sua própria data numa coluna — CEF, Itaú, Santander, BB, Sicoob, MP,
 * Bradesco). Se esse modo falhar (~0 linhas: extratos onde a data é cabeçalho
 * do DIA, não repetida por linha — Inter, Nubank), cai no modo SEÇÃO-AGRUPADA
 * (Shape-2), que faz carry-forward da data como coluna sintética.
 */
export async function extractPdfTable(buffer: Buffer): Promise<ExtractedTable> {
  const pages = await extractPageItems(buffer)

  const perRow = extractPerRow(pages)
  if (perRow && perRow.rows.length >= 3) return buildExtractedTable(perRow.header, perRow.rows)

  const section = extractSectionGrouped(pages)
  if (section && section.rows.length > (perRow?.rows.length ?? 0)) return section

  if (perRow) return buildExtractedTable(perRow.header, perRow.rows)
  if (section) return section
  throw new Error('Não foi possível localizar uma tabela de lançamentos no PDF (sem camada de texto?).')
}

/** Modo POR-LINHA (Shape-1): cabeçalho por palavra-chave + âncora de data em cada
 *  linha. Devolve null quando nenhum cabeçalho é encontrado. */
function extractPerRow(pages: Item[][]): { header: HeaderSpec; rows: string[][] } | null {
  let header: HeaderSpec | null = null
  const rows: string[][] = []

  for (const pageItems of pages) {
    const lines = buildLines(pageItems)

    // Fixa o cabeçalho na 1ª página que o contiver.
    if (!header) header = detectHeader(lines)
    if (!header) continue // página sem cabeçalho ainda (capa/resumo) → ignora

    // Corta o que está ACIMA do cabeçalho desta página (metadados/topo). Se o
    // cabeçalho não se repete nesta página, considera todas as linhas.
    const headerLineY = lines.find((l) => lineFingerprint(l) === header!.fingerprint)?.y
    const body = lines.filter((l) => {
      if (headerLineY !== undefined && l.y >= headerLineY - Y_TOL) return false
      if (lineFingerprint(l) === header!.fingerprint) return false
      return true
    })

    // Atribui células e separa âncoras (com data) de linhas-detalhe (sem data).
    const assigned = body.map((l) => ({ y: l.y, cells: assignCells(l.tokens, header!.centers) }))
    const anchorIdx: number[] = []
    assigned.forEach((a, i) => { if (ANCHOR_DATE_RE.test(a.cells[header!.dateCol] ?? '')) anchorIdx.push(i) })
    if (anchorIdx.length === 0) continue // página sem lançamentos

    // Cada âncora vira uma linha; detalhes são anexados à âncora + próxima (por y).
    const anchorRows = new Map<number, string[]>()
    for (const i of anchorIdx) anchorRows.set(i, [...assigned[i]!.cells])

    for (let i = 0; i < assigned.length; i++) {
      if (anchorRows.has(i)) continue
      const a = assigned[i]!
      // Âncora mais próxima verticalmente.
      let nearest = -1
      let nd = Number.POSITIVE_INFINITY
      for (const ai of anchorIdx) {
        const d = Math.abs(assigned[ai]!.y - a.y)
        if (d < nd) { nd = d; nearest = ai }
      }
      if (nearest < 0 || nd > ATTACH_MAX_DY) continue
      const target = anchorRows.get(nearest)!
      a.cells.forEach((cell, c) => {
        if (!cell) return
        if (c === header!.dateCol) return // detalhe não sobrescreve a data
        target[c] = target[c] ? `${target[c]} ${cell}` : cell
      })
    }

    // Emite as linhas na ordem visual (topo→base = ordem de anchorIdx).
    for (const i of anchorIdx) rows.push(anchorRows.get(i)!)
  }

  return header ? { header, rows } : null
}

// ---- 5. Modo SEÇÃO-AGRUPADA (Shape-2): data como cabeçalho do dia -----------
// Extratos onde a DATA não se repete por linha, mas encabeça um bloco do dia
// (Inter: "2 de Março de 2026 Saldo do dia: ..."; Nubank: "02 MAR 2026 ..."),
// e cada lançamento abaixo herda essa data. É o MESMO carry-forward do modo
// relatório em extract-tabela.ts (extractReport): lá um cabeçalho de seção
// ("Banco: X") define currentSection propagado como coluna sintética; aqui a
// linha de data-do-dia define currentDate propagado como a coluna "Data".
//
// As colunas dos lançamentos não têm cabeçalho nomeado → viram "Coluna A/B/...",
// agrupadas pela borda esquerda (x0) dos tokens (estável mesmo com descrições
// de larguras diferentes, ao contrário do centro).

// Meses por extenso/abreviado (PT) para datas textuais.
const MESES_PT: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  janeiro: 1, fevereiro: 2, marco: 3, 'março': 3, abril: 4, maio: 5, junho: 6, julho: 7,
  agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}
// Data no INÍCIO da linha, textual ou numérica. Alguns PDFs (Inter) renderizam
// cada caractere como um item separado sem espaços → "2 de Março de 2026" chega
// como "2deMarçode2026"; por isso os \s* (espaço opcional) na variante "de…de".
const LEAD_TXT_DE = /^\s*(\d{1,2})\s*de\s*(\p{L}+?)\s*de\s*(\d{4})\b/iu   // "2 de Março de 2026"
const LEAD_TXT_ABBR = /^\s*(\d{1,2})\s+(\p{L}{3,})\.?\s+(\d{4})\b/iu       // "02 MAR 2026"
const LEAD_NUM_DATE = /^\s*(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/ // "01/04/2026"
// Valor monetário BR (com ou sem R$/sinal).
const MONEY_RE = /\d{1,3}(?:\.\d{3})*,\d{2}/
// Linhas de subtotal/seção que não são lançamentos.
const SUBTOTAL_RE = /^\s*(saldo\b|total\s+de\b|total\s+d[oa]\b|rendimento\b|movimenta|dispon[íi]vel|bloquead)/i

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Se a linha COMEÇA com uma data, devolve "dd/mm/aaaa" (ou "dd/mm"); senão null. */
function leadingDate(text: string): string | null {
  const t = text.trim()
  const mt = t.match(LEAD_TXT_DE) ?? t.match(LEAD_TXT_ABBR)
  if (mt) {
    const mes = MESES_PT[mt[2]!.toLowerCase().replace(/\.$/, '')]
    if (mes) return `${pad2(Number(mt[1]))}/${pad2(mes)}/${mt[3]}`
  }
  const mn = t.match(LEAD_NUM_DATE)
  if (mn) {
    const d = Number(mn[1]), m = Number(mn[2])
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      const y = mn[3] ? (mn[3].length === 2 ? `20${mn[3]}` : mn[3]) : ''
      return y ? `${pad2(d)}/${pad2(m)}/${y}` : `${pad2(d)}/${pad2(m)}`
    }
  }
  return null
}

function lineText(l: Line): string {
  return l.tokens.map((t) => t.text).join(' ').replace(/\s+/g, ' ').trim()
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)]! : 0
}

/** Bordas esquerdas (x0) representativas de cada coluna, por clusterização com
 *  gap. Descrições variam de largura, mas começam todas no mesmo x0. */
function columnStarts(lines: Line[]): number[] {
  const xs = lines.flatMap((l) => l.tokens.map((t) => t.x0)).sort((a, b) => a - b)
  const cols: number[] = []
  let cluster: number[] = []
  for (const x of xs) {
    if (cluster.length && x - cluster[cluster.length - 1]! > 40) { cols.push(median(cluster)); cluster = [] }
    cluster.push(x)
  }
  if (cluster.length) cols.push(median(cluster))
  return cols
}

/** Índice da coluna (start) mais próxima da borda esquerda do token. */
function nearestStart(x0: number, starts: number[]): { idx: number; dist: number } {
  let best = 0, bd = Number.POSITIVE_INFINITY
  for (let i = 0; i < starts.length; i++) { const d = Math.abs(x0 - starts[i]!); if (d < bd) { bd = d; best = i } }
  return { idx: best, dist: bd }
}

/**
 * Rótulos de coluna a partir de uma linha de cabeçalho: alguns extratos sem
 * cabeçalho tabelado ainda imprimem rótulos das colunas de valor (Inter: "Valor",
 * "Saldo por transação") na mesma linha da 1ª data, alinhados à direita. Usa
 * esses rótulos SÓ nas colunas numéricas (as de valor) — a coluna de texto
 * (descrição) não tem rótulo e continua genérica. Tokens numéricos (data/valor)
 * e distantes de qualquer coluna são ignorados.
 */
function labelsFromHeaderLine(line: Line, starts: number[], numericCol: boolean[]): (string | null)[] {
  const labels: (string | null)[] = starts.map(() => null)
  for (const tok of line.tokens) {
    if (/\d/.test(tok.text)) continue
    const { idx, dist } = nearestStart(tok.x0, starts)
    if (dist > 60 || !numericCol[idx]) continue
    labels[idx] = labels[idx] ? `${labels[idx]} ${tok.text}` : tok.text
  }
  return labels
}

/** Distribui tokens nas colunas pela borda esquerda mais próxima. */
function assignByStart(tokens: Token[], starts: number[]): string[] {
  const cells: string[] = starts.map(() => '')
  for (const t of tokens) {
    let best = 0, bd = Number.POSITIVE_INFINITY
    for (let i = 0; i < starts.length; i++) { const d = Math.abs(t.x0 - starts[i]!); if (d < bd) { bd = d; best = i } }
    cells[best] = cells[best] ? `${cells[best]} ${t.text}` : t.text
  }
  return cells
}

function extractSectionGrouped(pages: Item[][]): ExtractedTable | null {
  const all: Line[] = []
  for (const pageItems of pages) all.push(...buildLines(pageItems))

  // Ignora o preâmbulo (cabeçalho/caixa de resumo) ANTES da 1ª data do dia — ali
  // há valores (saldo total/disponível) que não são lançamentos e poluiriam as
  // colunas. Sem nenhuma data → não é um extrato seção-agrupado.
  const firstDate = all.findIndex((l) => leadingDate(lineText(l)))
  if (firstDate < 0) return null
  const lines = all.slice(firstDate)

  // Linhas de lançamento = têm valor monetário, NÃO começam com data (essas são
  // cabeçalho do dia) e não são subtotais. Definem as colunas por x0.
  const isTxn = (l: Line): boolean => {
    const t = lineText(l)
    return !leadingDate(t) && !SUBTOTAL_RE.test(t) && MONEY_RE.test(t)
  }
  const bodyLines = lines.filter(isTxn)
  if (bodyLines.length < 3) return null
  const starts = columnStarts(bodyLines)
  if (starts.length < 2) return null

  // Colunas numéricas (de valor): NUNCA recebem texto de continuação (rodapé) e
  // ganham rótulo detectado no cabeçalho.
  const numericCol = starts.map((_, i) => {
    let num = 0, tot = 0
    for (const l of bodyLines) { const c = assignByStart(l.tokens, starts)[i]; if (c) { tot++; if (MONEY_RE.test(c)) num++ } }
    return tot > 0 && num / tot > 0.6
  })
  // Altura típica de linha (mediana dos gaps intra-página) — trava de proximidade.
  const gaps: number[] = []
  for (let i = 1; i < lines.length; i++) { const g = lines[i - 1]!.y - lines[i]!.y; if (g > 0 && g < 100) gaps.push(g) }
  const lineGap = median(gaps) || ATTACH_MAX_DY

  // Página de cada linha (y sobe bruscamente = nova página) e o índice da ÚLTIMA
  // linha "de tabela" (lançamento/data/subtotal) de cada página. Tudo depois disso
  // na página é rodapé/boilerplate → não deve receber continuação de descrição.
  const pageOf: number[] = []
  let pg = 0
  for (let i = 0; i < lines.length; i++) { if (i > 0 && lines[i]!.y > lines[i - 1]!.y + 5) pg++; pageOf.push(pg) }
  const lastTableIdx = new Map<number, number>()
  lines.forEach((l, i) => { const s = lineText(l); if (isTxn(l) || leadingDate(s) || SUBTOTAL_RE.test(s)) lastTableIdx.set(pageOf[i]!, i) })

  // Percorre em ordem visual (y decrescente = topo→base):
  //  • linha com data       → atualiza a data do dia (carry-forward);
  //  • linha com valor       → novo lançamento (herda a data);
  //  • linha sem valor/data  → continuação da descrição do lançamento anterior
  //                            (ABAIXO dele), anexada às mesmas colunas. Encadeia
  //                            (descrição de várias linhas) e trava por distância
  //                            vertical p/ rodapé/boilerplate não grudar.
  let currentDate = ''
  const rows: string[][] = []
  let last: string[] | null = null
  let lastY = 0
  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx]!
    const t = lineText(l)
    const d = leadingDate(t)
    if (d) { currentDate = d; last = null; continue }
    if (SUBTOTAL_RE.test(t)) { last = null; continue }
    if (MONEY_RE.test(t)) {
      last = [currentDate, ...assignByStart(l.tokens, starts)]
      lastY = l.y
      rows.push(last)
    } else if (
      last &&
      idx <= (lastTableIdx.get(pageOf[idx]!) ?? -1) &&   // não é rodapé (rabo da página)
      lastY - l.y >= 0 && lastY - l.y <= lineGap * 1.5
    ) {
      // Continuação de descrição (linha sem valor/data, logo abaixo do lançamento).
      // Guards adicionais: cai numa ÚNICA coluna (rodapé costuma espalhar), de
      // TEXTO (nunca polui coluna de valor), e o lançamento já tem conteúdo nela.
      const cells = assignByStart(l.tokens, starts)
      const touched = cells.map((c, i) => (c ? i : -1)).filter((i) => i >= 0)
      if (touched.length === 1) {
        const i = touched[0]!
        if (!numericCol[i] && last[i + 1]) { last[i + 1] = `${last[i + 1]} ${cells[i]}`; lastY = l.y }
      }
    }
  }
  if (rows.length === 0) return null

  // Rótulos vêm da linha LOGO ACIMA do 1º lançamento (o cabeçalho do dia, que no
  // Inter traz "Valor"/"Saldo por transação") — não da 1ª data do documento, que
  // pode ser o período do cabeçalho (Nubank: "...VALORES EM R$").
  const firstTxnIdx = lines.findIndex(isTxn)
  const labelLine = firstTxnIdx > 0 ? lines[firstTxnIdx - 1]! : null
  const labels = labelLine ? labelsFromHeaderLine(labelLine, starts, numericCol) : starts.map(() => null)
  const headers = ['Data', ...starts.map((_, i) => labels[i] || `Coluna ${colLetter(i)}`)]
  const outRows: Array<Record<string, CellValue>> = rows.map((cells) => {
    const obj: Record<string, CellValue> = {}
    headers.forEach((h, i) => { const v = cells[i]; obj[h] = v && v.trim() !== '' ? v.trim() : null })
    return obj
  })
  return {
    headers,
    rows: outRows,
    meta: {
      sheetName: 'PDF', headerRowIndex: 0, bodyStartIndex: 1, bodyEndIndex: outRows.length,
      totalDataRows: outRows.length, mode: 'report', sectionColumn: 'Data',
    },
  }
}

/** Monta o `ExtractedTable` a partir do cabeçalho e das linhas reconstruídas.
 * (Colunas 100% vazias são removidas centralmente em `extractTabela`, valendo
 * para qualquer formato — ver `dropEmptyColumns`.) */
function buildExtractedTable(header: HeaderSpec, rows: string[][]): ExtractedTable {
  const headers = header.names
  const outRows: Array<Record<string, CellValue>> = rows.map((cells) => {
    const obj: Record<string, CellValue> = {}
    headers.forEach((name, c) => {
      const v = cells[c]
      obj[name] = v && v.trim() !== '' ? v.trim() : null
    })
    return obj
  })
  return {
    headers,
    rows: outRows,
    meta: {
      sheetName: 'PDF',
      headerRowIndex: 0,
      bodyStartIndex: 1,
      bodyEndIndex: outRows.length,
      totalDataRows: outRows.length,
      mode: 'single',
    },
  }
}
