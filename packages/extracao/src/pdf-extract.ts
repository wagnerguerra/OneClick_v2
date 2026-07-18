// ============================================================
// Extração determinística de tabela de lançamentos a partir de PDFs de extrato
// bancário COM camada de texto (a grande maioria dos extratos exportados pelos
// bancos). Reconstrói uma tabela (linhas × colunas) usando as COORDENADAS de
// cada fragmento de texto (x/y), e devolve o mesmo `ExtractedTable` consumido
// pelo resto do pipeline (de/para → pendências → SCI). É apenas OUTRA
// implementação da fronteira de extração — não toca no restante.
//
// Estratégia (genérica, sem regra por banco):
//  1. Coleta os fragmentos de texto com posição (x,y) via pdfjs-dist (getTextContent).
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

// Motor de PDF: PDFium via WebAssembly (@embedpdf/pdfium, MIT). MESMO código no
// Node e no browser. Diferente do pdf.js, o PDFium expõe a posição POR CARACTERE
// (FPDFText_GetCharBox/GetCharOrigin) — então NÓS controlamos a tokenização (via
// mergeTokens, por gap de x), imunes ao "combining" opaco do pdf.js que fundia
// colunas apertadas. O seam de plataforma é só fornecer os bytes do .wasm.
type PdfiumApi = {
  pdfium: {
    wasmExports: { malloc(n: number): number; free(p: number): void }
    HEAPU8: Uint8Array
    getValue(ptr: number, type: 'double'): number
  }
  FPDF_InitLibrary?: () => void
  FPDF_LoadMemDocument(dataPtr: number, size: number, password: number): number
  FPDF_GetLastError(): number
  FPDF_GetPageCount(doc: number): number
  FPDF_LoadPage(doc: number, index: number): number
  FPDF_ClosePage(page: number): void
  FPDF_CloseDocument(doc: number): void
  FPDFText_LoadPage(page: number): number
  FPDFText_ClosePage(textPage: number): void
  FPDFText_CountChars(textPage: number): number
  FPDFText_GetUnicode(textPage: number, index: number): number
  FPDFText_GetCharBox(textPage: number, index: number, l: number, r: number, b: number, t: number): void
  FPDFText_GetCharOrigin(textPage: number, index: number, x: number, y: number): void
}
let pdfiumPromise: Promise<PdfiumApi> | null = null

/** Configuração de plataforma do PDFium — o seam entre Node e browser. */
export interface PdfConfig {
  /** Bytes do binário WASM do PDFium. OBRIGATÓRIO. No browser: `fetch` da URL do
   *  `pdfium.wasm` → `arrayBuffer()`. No Node: `readFileSync` do arquivo em
   *  `@embedpdf/pdfium/dist/pdfium.wasm`. */
  wasmBinary?: ArrayBuffer | Uint8Array
}
let pdfConfig: PdfConfig = {}

/** Configura o WASM do PDFium. Chamar UMA vez no boot do app hospedeiro. */
export function configurePdf(config: PdfConfig): void {
  pdfConfig = { ...pdfConfig, ...config }
}

async function getPdfium(): Promise<PdfiumApi> {
  if (!pdfiumPromise) {
    pdfiumPromise = import('@embedpdf/pdfium').then(async ({ init }) => {
      if (!pdfConfig.wasmBinary) {
        throw new Error('PDFium não configurado: chame configurePdf({ wasmBinary }) no boot do app.')
      }
      const mod = (await init({ wasmBinary: pdfConfig.wasmBinary } as never)) as unknown as PdfiumApi
      mod.FPDF_InitLibrary?.()
      return mod
    })
  }
  return pdfiumPromise
}

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
// Linha que é SÓ um número de página "N/M" (ex.: "3/5", "1/1076"), impressa no
// rodapé. Casa com ANCHOR_DATE_RE (parece "dia/mês") e/ou gruda no saldo do último
// lançamento — é descartada do corpo. (Uma data solta "3/5" não ocorre nos
// extratos: datas sempre vêm com o restante do lançamento na mesma linha.)
const PAGE_NUM_RE = /^\s*\d{1,4}\s*\/\s*\d{1,4}\s*$/
// Palavras que caracterizam a linha de cabeçalho de um extrato.
const HEADER_KEYWORDS = [
  'data', 'lanç', 'lanc', 'histó', 'histo', 'descri', 'valor', 'saldo',
  'documento', 'crédito', 'credito', 'débito', 'debito', 'movimento', 'balancete', 'dcto',
]
// Coluna de data: cabeçalho que identifica a coluna-âncora.
const DATE_COL_RE = /\bdata\b|balancete|moviment|dt\.?\s*mov/i
// Coluna de descrição/histórico (onde a descrição do lançamento se estende).
const DESC_COL_RE = /hist[óo]|lan[çc]|descri|movimenta/i

// Tolerâncias (ajustadas com os PDFs de exemplo; refináveis).
const Y_TOL = 2.5        // fragmentos dentro dessa faixa de y = mesma linha
const GAP_MERGE = 3      // gap x <= isso → fragmentos colados (mesmo token)
// Limiar de gap x (pena) p/ agrupar chars do PDFium em runs: acima disso = outra
// coluna → quebra o run. Em PIXELS (coordenada de página), robusto ao tamanho de
// fonte reportado (que às vezes é unitário — ex.: Sicoob reporta 1.0).
const COL_BREAK = 3.5
const ATTACH_MAX_DY = 40 // distância y máxima p/ anexar linha-detalhe a uma âncora
const HEADER_MERGE_DY = 14 // junta um cabeçalho quebrado em 2 linhas (ex.: "Data" acima)
const CLUSTER_X = 20       // tokens de cabeçalho a < isso em x = mesma coluna

// ---- 1. Coleta de fragmentos posicionados ----------------------------------

async function extractPageItems(data: Uint8Array): Promise<Item[][]> {
  const api = await getPdfium()
  const P = api.pdfium
  // Copia os bytes p/ a heap do WASM (Uint8Array independente do Buffer do Node).
  const bytes = new Uint8Array(data)
  const filePtr = P.wasmExports.malloc(bytes.length)
  P.HEAPU8.set(bytes, filePtr)
  const doc = api.FPDF_LoadMemDocument(filePtr, bytes.length, 0)
  if (!doc) {
    P.wasmExports.free(filePtr)
    throw new Error(`Falha ao abrir o PDF (PDFium erro ${api.FPDF_GetLastError()}).`)
  }

  // buf: 4 doubles do charbox (l,r,b,t) + 2 doubles do origin (x,y) = 48 bytes.
  const buf = P.wasmExports.malloc(48)
  const pages: Item[][] = []
  try {
    const numPages = api.FPDF_GetPageCount(doc)
    for (let p = 0; p < numPages; p++) {
      const page = api.FPDF_LoadPage(doc, p)
      const items: Item[] = []
      if (page) {
        const tp = api.FPDFText_LoadPage(page)
        if (tp) {
          const n = api.FPDFText_CountChars(tp)
          // Agrupa os caracteres em RUNS na ORDEM DE LEITURA, preservando os espaços
          // que o PDFium já gera entre palavras. Quebra o run só num salto grande de x
          // (fronteira de coluna) ou mudança de linha (y). NÃO reordenamos por x (como
          // faria o mergeTokens) — isso perderia a ordem/os espaços. NÃO inserimos
          // espaços por gap: medimos que não há limiar universal não-ambíguo (largura
          // de espaço varia por doc/justificação; ver scratchpad/pdfiumtest), e inserir
          // desestabiliza a reconstrução (muda tokens → quebra coluna/âncora). Erramos
          // pro lado de COLAR (substring preservada, keyword segura) em vez de DIVIDIR.
          // Posição pela PENA (originX), não pela tinta (charbox), cujo gap entre
          // glifos é inflado e criava espaços espúrios (ex.: "ANTERIO R").
          let cur: { s: string; x0: number; x1: number; y: number } | null = null
          const flush = (): void => { if (cur) items.push({ s: cur.s, x: cur.x0, y: cur.y, w: cur.x1 - cur.x0 }) }
          for (let i = 0; i < n; i++) {
            const cp = api.FPDFText_GetUnicode(tp, i)
            if (cp < 32) continue // pula controle (\r \n \0) — mantém o espaço (32)
            api.FPDFText_GetCharBox(tp, i, buf, buf + 8, buf + 16, buf + 24)
            api.FPDFText_GetCharOrigin(tp, i, buf + 32, buf + 40)
            const right = P.getValue(buf + 8, 'double')
            const originX = P.getValue(buf + 32, 'double')
            const originY = P.getValue(buf + 40, 'double') // baseline
            const ch = String.fromCharCode(cp)
            const gap = cur ? originX - cur.x1 : 0
            if (cur && Math.abs(originY - cur.y) <= Y_TOL && gap <= COL_BREAK) {
              cur.s += ch
              cur.x1 = Math.max(cur.x1, right)
            } else {
              flush()
              cur = { s: ch, x0: originX, x1: right, y: originY }
            }
          }
          flush()
          api.FPDFText_ClosePage(tp)
        }
        api.FPDF_ClosePage(page)
      }
      pages.push(items)
    }
  } finally {
    P.wasmExports.free(buf)
    api.FPDF_CloseDocument(doc)
    P.wasmExports.free(filePtr)
  }
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
  descCol: number        // índice da coluna de descrição/histórico (-1 se não achou)
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
  // Junta tokens de linhas vizinhas PURAMENTE TEXTUAIS dentro de uma janela y —
  // mas só os que ALINHAM (cx) a uma coluna-base OU ficam FORA do range das
  // colunas-base (uma coluna nova à esquerda/direita, como o "Data"/"Data Efetiva"
  // do CEF, numa linha própria à esquerda do "Documento Histórico Valor Saldo").
  // Um cluster no MEIO das colunas (Sicoob "HISTÓRICO DE MOVIMENTAÇÃO", título
  // centralizado entre HISTÓRICO e VALOR) NÃO alinha e NÃO está fora → é ignorado,
  // não virando coluna falsa.
  const baseCxs = base.tokens.map((t) => t.cx)
  const minC = Math.min(...baseCxs), maxC = Math.max(...baseCxs)
  const tokens: Token[] = [...base.tokens]
  lines.forEach((l, j) => {
    if (j === idx) return
    if (Math.abs(l.y - base.y) > HEADER_MERGE_DY) return
    if (!l.tokens.every((t) => !/\d/.test(t.text))) return
    for (const t of l.tokens) {
      const aligns = base.tokens.some((bt) => Math.abs(bt.cx - t.cx) <= CLUSTER_X)
      if (aligns || t.cx < minC || t.cx > maxC) tokens.push(t)
    }
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
  const descCol = cols.findIndex((c) => DESC_COL_RE.test(c.text))
  return { centers: cols.map((c) => c.cx), names, fingerprint: lineFingerprint(base), dateCol, descCol }
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
export async function extractPdfTable(data: Uint8Array): Promise<ExtractedTable> {
  const pages = await extractPageItems(data)

  const perRow = extractPerRow(pages)
  if (perRow && perRow.rows.length >= 3) return buildExtractedTable(perRow.header, perRow.rows)

  const section = extractSectionGrouped(pages)
  if (section && section.rows.length > (perRow?.rows.length ?? 0)) return section

  if (perRow) return buildExtractedTable(perRow.header, perRow.rows)
  if (section) return section
  throw new Error('Não foi possível localizar uma tabela de lançamentos no PDF (sem camada de texto?).')
}

/** Modo POR-LINHA (Shape-1): cabeçalho por palavra-chave + âncora de data em cada
 *  linha. Une TODAS as páginas numa sequência vertical contínua (com um vão de
 *  ~1 linha entre páginas) para que um detalhe no rodapé de uma página possa se
 *  anexar à âncora no TOPO da página seguinte — caso de um lançamento cuja
 *  descrição/razão social se divide na virada de página (Itaú). Devolve null
 *  quando nenhum cabeçalho é encontrado. */
function extractPerRow(pages: Item[][]): { header: HeaderSpec; rows: string[][] } | null {
  // 1) Cabeçalho: fixado na 1ª página que o contiver. Coleta os CORPOS por página
  //    (linhas abaixo do cabeçalho, sem os metadados de topo).
  let header: HeaderSpec | null = null
  const pageBodies: Line[][] = []
  for (const pageItems of pages) {
    const lines = buildLines(pageItems)
    if (!header) header = detectHeader(lines)
    if (!header) continue // página sem cabeçalho ainda (capa/resumo) → ignora
    const headerLineY = lines.find((l) => lineFingerprint(l) === header!.fingerprint)?.y
    const body = lines.filter((l) => {
      if (headerLineY !== undefined && l.y >= headerLineY - Y_TOL) return false
      if (lineFingerprint(l) === header!.fingerprint) return false
      // Cabeçalho REPETIDO/DUPLICADO por página (Mercado Pago reimprime, às vezes
      // sobreposto: "Data Data Descrição Descrição Valor Valor…"). O fingerprint
      // exato não casa a versão duplicada; um headerScore alto pega ambas sem
      // atingir lançamento (que quase nunca tem 3+ palavras de cabeçalho).
      if (headerScore(l) >= 3) return false
      if (PAGE_NUM_RE.test(lineText(l))) return false // número de página no rodapé
      return true
    })
    if (body.length) pageBodies.push(body)
  }
  if (!header) return null

  // 2) Vão de "uma linha para baixo" = altura de linha DENTRO de um bloco. Usa o
  //    cluster de gaps PEQUENOS (não a mediana, inflada pelo espaço ENTRE
  //    transações em extratos de 1 linha por lançamento — Mercado Pago ~30 entre
  //    txns vs ~12 dentro de uma descrição). Serve de vão ENTRE páginas na
  //    sequência contínua (a última linha de uma página fica a ~1 linha da 1ª da
  //    seguinte) e para calibrar o anti-rodapé (`belowMax`).
  const gaps: number[] = []
  for (const body of pageBodies) {
    for (let i = 1; i < body.length; i++) { const g = body[i - 1]!.y - body[i]!.y; if (g > 0 && g < 100) gaps.push(g) }
  }
  const medGap = median(gaps)
  const smallGaps = gaps.filter((g) => g < medGap)
  const typicalSmall = smallGaps.length ? median(smallGaps) : medGap
  const interGap = typicalSmall || ATTACH_MAX_DY / 2

  // 3) Sequência GLOBAL de linhas com um `gy` monotônico decrescente (preserva os
  //    vãos intra-página; encadeia as páginas com `interGap`). Cada linha vira as
  //    células atribuídas às colunas e marca se é âncora (data na coluna-data).
  interface GLine { gy: number; cells: string[]; isAnchor: boolean; page: number }
  const glines: GLine[] = []
  let cursor = 0
  pageBodies.forEach((body, page) => {
    const topY = body[0]!.y
    for (const l of body) {
      const cells = assignCells(l.tokens, header!.centers)
      glines.push({ gy: cursor - (topY - l.y), cells, isAnchor: ANCHOR_DATE_RE.test(cells[header!.dateCol] ?? ''), page })
    }
    cursor = cursor - (topY - body[body.length - 1]!.y) - interGap
  })

  const anchorIdx: number[] = []
  glines.forEach((g, i) => { if (g.isAnchor) anchorIdx.push(i) })
  if (anchorIdx.length === 0) return { header, rows: [] }

  // Guarda anti-rodapé/resumo para detalhes ABAIXO da âncora: `belowMax` = salto
  // vertical máximo aceitável para a linha imediatamente acima. Um pulo grande
  // marca o FIM da tabela (rodapé "SAC/Ouvidoria", nota "os saldos acima…", bloco
  // de resumo). É calibrado pelo cluster de gaps PEQUENOS (o vão DENTRO de um
  // lançamento, ~entre a âncora e seu detalhe), NÃO pela mediana geral — que em
  // extratos de 1 linha por lançamento (Santander) é o vão ENTRE transações e
  // deixaria passar o resumo, que tem o mesmo espaçamento. Ex.: Santander detalhe
  // 6,9 vs resumo 25,1 → belowMax ~14 barra o resumo e mantém o detalhe.
  // (`typicalSmall` calculado junto com o `interGap`, acima.)
  const belowMax = Math.min(ATTACH_MAX_DY, Math.max(14, typicalSmall * 1.8))

  // 4) Âncora mais próxima de cada detalhe: como `gy` é monotônico com o índice, a
  //    mais próxima é a âncora imediatamente ANTERIOR ou POSTERIOR na sequência.
  const n = glines.length
  const prevA = new Array<number>(n).fill(-1)
  for (let i = 0, last = -1; i < n; i++) { if (glines[i]!.isAnchor) last = i; prevA[i] = last }
  const nextA = new Array<number>(n).fill(-1)
  for (let i = n - 1, last = -1; i >= 0; i--) { if (glines[i]!.isAnchor) last = i; nextA[i] = last }

  // 5) Distribui os detalhes (linhas sem data) para as âncoras, separando os que
  //    estão ACIMA dos que estão ABAIXO — para recompor o texto na ordem de leitura
  //    (acima → âncora → abaixo). A ESTRATÉGIA depende do MODO DE LAYOUT do extrato:
  //
  //  • "ÂNCORA NO MEIO" (Itaú, e o QR do Mercado Pago): a descrição fica ACIMA e
  //    abaixo da linha de data+valor. Detalhes-ACIMA (prefácios) são comuns → usa a
  //    âncora mais PRÓXIMA (com o redirect cross-page).
  //  • "ÂNCORA NO TOPO" (Sicoob, CEF, BB, Santander): a âncora traz o início da
  //    descrição e as continuações vêm ABAIXO. Detalhe-abaixo ENCADEIA para a âncora
  //    de cima (sem o limite de distância — resolve blocos altos e o "shift" das
  //    linhas de baixo), com parada estrutural no RESUMO e prefácio p/ âncora vazia.
  //
  // O modo é detectado pela linha logo ACIMA de cada âncora: se está MUITO mais perto
  // desta âncora do que da anterior (< 0.65×), é um detalhe-acima daquela âncora.
  const descCol = header.descCol
  const descEmpty = (ai: number): boolean => descCol < 0 || (glines[ai]!.cells[descCol] ?? '').trim() === ''
  // Coluna de VALOR = a que mais carrega dinheiro NAS ÂNCORAS. `valueOnAnchor`: o
  // valor mora na linha-âncora (Sicoob/BB) e não num detalhe (CEF, cujas âncoras não
  // têm valor). Usado só para a parada por RESUMO.
  const colMoney = header.names.map((_, c) => anchorIdx.filter((ai) => MONEY_RE.test(glines[ai]!.cells[c] ?? '')).length)
  const valueCol = colMoney.length ? colMoney.indexOf(Math.max(...colMoney)) : -1
  const valueOnAnchor = valueCol >= 0 && colMoney[valueCol]! > anchorIdx.length * 0.5

  // "Âncora no meio" = uma fração relevante das âncoras tem a DESCRIÇÃO VAZIA na
  // própria linha (a descrição mora ACIMA/abaixo — Itaú, QR do MP). Sinal robusto,
  // não enganado por bloco alto (ao contrário de medir distância geométrica).
  // Só um doc SEM praticamente nenhuma âncora de descrição vazia (Sicoob/BB —
  // descrição na própria linha da âncora, continuações só ABAIXO) usa o
  // encadeamento-abaixo. Qualquer fração relevante de âncoras vazias significa que
  // há descrição ACIMA (CEF "PIX RECEBIDO", Itaú, QR do MP) → usa o nearest, que
  // trata acima+abaixo. O limiar é baixo (5%) porque a distinção é "tem OU não tem
  // detalhe-acima".
  const emptyDescAnchors = descCol < 0 ? 0 : anchorIdx.filter((ai) => descEmpty(ai)).length
  const emptyFrac = emptyDescAnchors / Math.max(1, anchorIdx.length)
  const anchorInMiddle = emptyFrac > 0.05

  const above = new Map<number, string[][]>()
  const below = new Map<number, string[][]>()
  for (const ai of anchorIdx) { above.set(ai, []); below.set(ai, []) }

  if (anchorInMiddle) {
    // ===== ÂNCORA NO MEIO (Itaú, MP): âncora mais próximo, com CORTE-DE-RUN na virada =====
    // Base: cada detalhe vai ao âncora mais próximo (continuação-ABAIXO da âncora de
    // cima ou prefácio-ACIMA da de baixo). Isso funciona DENTRO de uma página, onde o
    // vão real ENTRE blocos separa bem os detalhes. Na VIRADA, porém, o vão sintético
    // `interGap` colapsa a distância: num nome de 3+ linhas, o detalhe de 2º nível
    // (ex.: "…LTDA") fica mais perto do âncora da página vizinha do que do seu. Para
    // os runs que CRUZAM uma quebra de página, então, decide por CONTIGUIDADE: corta o
    // run (linhas entre dois âncoras consecutivos X↑ e Y↓) no MAIOR vão — as de cima
    // ficam abaixo-de-X, as de baixo acima-de-Y. A quebra ganha um empurrãozinho
    // (`PB_BONUS`) para vencer empates (a virada colapsa o vão real ~1 linha), mas um
    // vão intra-página claramente maior — bloco que CRUZA a página (Itaú: tipo no rabo
    // da pág. N, âncora no topo da N+1) — ainda vence, preservando a continuação.
    const PB_BONUS = 0.5
    const straddleOwner = new Array<{ ai: number; below: boolean } | null>(n).fill(null)
    const bounds = [-1, ...anchorIdx, n] // sentinelas: X ausente (=-1) / Y ausente (=n)
    for (let b = 0; b < bounds.length - 1; b++) {
      const xIdx = bounds[b]!, yIdx = bounds[b + 1]!
      const from = xIdx + 1, to = yIdx // linhas from..to-1 = run entre X e Y
      if (from >= to) continue
      // Só runs que cruzam quebra de página (ou a borda inicial/final) usam corte-de-run;
      // o intra-página mantém o âncora mais próximo original, inalterado.
      const straddle = xIdx < 0 || yIdx >= n || glines[xIdx]!.page !== glines[yIdx]!.page
      if (!straddle) continue
      // Corte s = nº de linhas que vão p/ below-X, no vão efetivo MÁXIMO. A borda
      // ausente (xIdx<0 ou yIdx>=n) tem vão infinito → joga o run inteiro p/ o âncora
      // presente (linhas antes do 1º âncora = prefácio dele; após o último = sufixo).
      let bestS = 0, bestGap = Number.NEGATIVE_INFINITY
      for (let s = 0; s <= to - from; s++) {
        const li = s === 0 ? xIdx : from + s - 1
        const ri = s === to - from ? yIdx : from + s
        const eff = (li < 0 || ri >= n)
          ? Number.POSITIVE_INFINITY
          : (glines[li]!.gy - glines[ri]!.gy) + (glines[li]!.page !== glines[ri]!.page ? PB_BONUS : 0)
        if (eff > bestGap) { bestGap = eff; bestS = s }
      }
      for (let k = 0; k < to - from; k++) {
        const li = from + k
        if (k < bestS) { if (xIdx >= 0) straddleOwner[li] = { ai: xIdx, below: true } }
        else if (yIdx < n) straddleOwner[li] = { ai: yIdx, below: false }
      }
    }
    for (let i = 0; i < n; i++) {
      if (glines[i]!.isAnchor) continue
      const gapPrev = i > 0 ? glines[i - 1]!.gy - glines[i]!.gy : Number.POSITIVE_INFINITY
      let nearest: number, isBelow: boolean
      const so = straddleOwner[i]
      if (so) {
        nearest = so.ai; isBelow = so.below
      } else {
        // Intra-página (baseline): âncora mais próximo entre a de cima (mesma página)
        // e a de baixo; trava de rodapé por salto grande na continuação-abaixo.
        const cands: number[] = []
        if (nextA[i]! >= 0) cands.push(nextA[i]!)
        if (prevA[i]! >= 0 && glines[prevA[i]!]!.page === glines[i]!.page) cands.push(prevA[i]!)
        let best = -1, nd = Number.POSITIVE_INFINITY
        for (const ai of cands) {
          const d = Math.abs(glines[ai]!.gy - glines[i]!.gy)
          if (d > ATTACH_MAX_DY) continue
          if (glines[i]!.gy < glines[ai]!.gy && gapPrev > belowMax) continue // detalhe-abaixo distante = rodapé
          if (d < nd) { nd = d; best = ai }
        }
        if (best < 0) continue
        nearest = best; isBelow = glines[i]!.gy < glines[nearest]!.gy
      }
      // Trava final comum: distância máxima à âncora + rodapé (continuação-abaixo na mesma página).
      if (Math.abs(glines[nearest]!.gy - glines[i]!.gy) > ATTACH_MAX_DY) continue
      if (isBelow && glines[nearest]!.page === glines[i]!.page && gapPrev > belowMax) continue
      ;(isBelow ? below.get(nearest)! : above.get(nearest)!).push(glines[i]!.cells)
    }
  } else {
    // ===== ÂNCORA NO TOPO (Sicoob/CEF/BB/Santander): encadeamento-abaixo =====
    // `lastBelowGy` = gy do último detalhe já anexado ABAIXO da âncora (ou a âncora).
    const lastBelowGy = new Map<number, number>()
    for (const ai of anchorIdx) lastBelowGy.set(ai, glines[ai]!.gy)
    for (let i = 0; i < n; i++) {
      if (glines[i]!.isAnchor) continue
      // Prefácio de âncora com descrição VAZIA logo abaixo: o detalhe imediatamente
      // ACIMA de uma âncora sem descrição a prefacia (Santander [89]: "Cr Cob Bloq"
      // sobre a âncora 9.260,23 de histórico vazio).
      const na = nextA[i]!
      if (na >= 0 && na === i + 1 && descEmpty(na)) { above.get(na)!.push(glines[i]!.cells); continue }
      const pa = prevA[i]!
      if (pa < 0) continue
      // Parada estrutural no RESUMO: quando o valor mora na âncora, uma linha-detalhe
      // que TAMBÉM tem valor na coluna de valor NÃO é continuação de descrição — é
      // resumo/summary (Sicoob "(+) SALDO EM CONTA: 3.129,74C") → não anexa.
      if (valueOnAnchor && valueCol >= 0 && MONEY_RE.test(glines[i]!.cells[valueCol] ?? '')) continue
      // Encadeamento: salto do ÚLTIMO detalhe já anexado a `pa` (ou de `pa`) até aqui.
      // Um pulo grande (rodapé/fim da tabela) quebra a cadeia.
      const chain = (lastBelowGy.get(pa) ?? glines[pa]!.gy) - glines[i]!.gy
      if (chain <= 0 || chain > belowMax) continue
      below.get(pa)!.push(glines[i]!.cells)
      lastBelowGy.set(pa, glines[i]!.gy)
    }
  }

  // 6) Recompõe cada lançamento na ordem visual (âncoras em ordem de leitura). A
  //    data (coluna-âncora) nunca é sobrescrita por detalhe.
  const rows: string[][] = anchorIdx.map((ai) => {
    const a = glines[ai]!.cells
    const ab = above.get(ai)!, be = below.get(ai)!
    return a.map((cell, c) => {
      if (c === header!.dateCol) return cell
      const parts = [...ab.map((x) => x[c] ?? ''), cell, ...be.map((x) => x[c] ?? '')].filter((v) => v && v.trim())
      return parts.join(' ')
    })
  })

  return { header, rows }
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

// Data COMPLETA em qualquer posição da linha (textual PT ou dd/mm[/aa]). O
// separador numérico exige `/` ou `-` (NÃO `.`) para não casar com valores
// monetários ("12.345,67"). Alimenta o detector de INTERVALO de datas.
const MES_ALT = Object.keys(MESES_PT).sort((a, b) => b.length - a.length).join('|')
const ANY_DATE_RE = new RegExp(
  `\\d{1,2}\\s*(?:de\\s*)?(?:${MES_ALT})\\.?\\s*(?:de\\s*)?\\d{2,4}` +
  `|\\b\\d{1,2}[/\\-]\\d{1,2}(?:[/\\-]\\d{2,4})?\\b`,
  'giu',
)
/**
 * Linha que carrega DUAS+ datas completas = **intervalo/período** do extrato
 * (ex.: "01 DE MARÇO DE 2026 a 31 DE MARÇO DE 2026"), impresso no topo de cada
 * página. Começa com data, mas NÃO é cabeçalho de um dia — não deve virar
 * carry-forward. (Só é consultado em linhas que já começam com data.)
 */
function isDateRange(text: string): boolean {
  const m = text.match(ANY_DATE_RE)
  return (m?.length ?? 0) >= 2
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

// ─────────────────────────────────────────────────────────────────────────────
// FLAG REVERSÍVEL — recuperação da continuação do ÚLTIMO lançamento de cada página
// (Shape-2), via detecção de rodapé por invariância entre páginas (ver o bloco
// "[REVERSÍVEL]" em extractSectionGrouped). Adição mais especulativa da leva de
// QA; isolada aqui para reverter fácil:
//   • `false` → desliga: a fronteira da tabela volta a ser o último lançamento
//     (comportamento anterior; a continuação do último lançamento por página volta
//     a não ser anexada — a "ressalva conhecida" reabre, sem outros efeitos).
//   • para remover de vez: apague o bloco marcado "[REVERSÍVEL]" e este flag.
const FEATURE_RECUPERA_CONTINUACAO_RABO = true
// ─────────────────────────────────────────────────────────────────────────────

function extractSectionGrouped(pages: Item[][]): ExtractedTable | null {
  const all: Line[] = []
  for (const pageItems of pages) all.push(...buildLines(pageItems))

  // Ignora o preâmbulo (cabeçalho/caixa de resumo) ANTES da 1ª data do dia — ali
  // há valores (saldo total/disponível) que não são lançamentos e poluiriam as
  // colunas. Sem nenhuma data → não é um extrato seção-agrupado.
  const firstDate = all.findIndex((l) => leadingDate(lineText(l)))
  if (firstDate < 0) return null
  const lines = all.slice(firstDate)

  // Preâmbulo REPETIDO por página (nome do titular, CNPJ, nº da conta — reimpresso
  // no topo de cada página, ex.: Nubank). É o mesmo bloco que aparece ANTES da 1ª
  // data na página 1; guardamos seus textos para PULAR as repetições nas páginas
  // seguintes (senão grudariam como "continuação" no último lançamento da página
  // anterior). Ignora textos muito curtos para não casar continuações legítimas.
  const preambleTexts = new Set(all.slice(0, firstDate).map((l) => lineText(l)).filter((s) => s.length >= 5))

  // Candidata a lançamento: tem valor, NÃO começa com data (cabeçalho do dia) e
  // não é subtotal.
  const isMoneyTok = (s: string): boolean => MONEY_RE.test(s)
  const isCand = (l: Line): boolean => {
    const t = lineText(l)
    return !leadingDate(t) && !SUBTOTAL_RE.test(t) && MONEY_RE.test(t)
  }
  const candLines = lines.filter(isCand)
  if (candLines.length < 3) return null

  // Colunas de VALOR = clusters (por x0) dos tokens monetários das candidatas. Um
  // lançamento ALINHA o valor numa coluna; valores de resumo soltos (ex.: o
  // "R$ 0,00" do saldo final, na margem esquerda) caem FORA dessas colunas → não
  // são lançamentos. Isso NÃO supõe que todo lançamento tenha texto (extratos "só
  // valor" existem) — usa a consistência POSICIONAL da coluna de valor.
  const valXs = candLines
    .flatMap((l) => l.tokens.filter((tk) => isMoneyTok(tk.text)).map((tk) => tk.x0))
    .sort((a, b) => a - b)
  const clusters: Array<{ min: number; max: number; count: number }> = []
  for (const x of valXs) {
    const last = clusters[clusters.length - 1]
    if (last && x - last.max <= 28) { last.max = x; last.count++ }
    else clusters.push({ min: x, max: x, count: 1 })
  }
  // Colunas de valor "dominantes" = onde MUITAS candidatas têm valor (lançamentos
  // >> linhas de resumo). Sem nenhuma dominante (doc atípico), não filtra por
  // posição — evita perder lançamentos.
  const minCount = Math.max(3, Math.floor(candLines.length * 0.15))
  const colsValor = clusters.filter((c) => c.count >= minCount)
  const noColunaDeValor = (l: Line): boolean =>
    l.tokens.some((tk) => isMoneyTok(tk.text) && colsValor.some((c) => tk.x0 >= c.min && tk.x0 <= c.max))
  const isTxn = (l: Line): boolean => isCand(l) && (colsValor.length === 0 || noColunaDeValor(l))

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

  // ┌── [REVERSÍVEL: FEATURE_RECUPERA_CONTINUACAO_RABO] ─────────────────────────
  // │ Estende a fronteira da tabela de cada página para INCLUIR a continuação da
  // │ descrição do ÚLTIMO lançamento (a que cai no "rabo", junto do rodapé).
  // │ Distingue continuação de rodapé por INVARIÂNCIA entre páginas: o rodapé
  // │ institucional ("Fale com a gente", "SAC/Ouvidoria", "Tem alguma dúvida?…")
  // │ repete IDÊNTICO no rabo de ≥ metade das páginas; a continuação é única (o
  // │ limiar alto evita confundir uma contraparte repetida — Nubank AMAZON — com
  // │ rodapé). Avança do último lançamento enquanto a linha NÃO for rodapé e
  // │ estiver a ~1 vão de linha; para no 1º rodapé ou salto grande. Fallback: doc
  // │ de 1 página não tem invariância a medir → mantém o rabo curto.
  // │ Desligar (flag=false) ⇒ `tableBoundary` == `lastTableIdx` (comportamento
  // │ anterior). Remover de vez ⇒ apague este bloco e use `lastTableIdx` no guard.
  const tableBoundary = new Map(lastTableIdx)
  if (FEATURE_RECUPERA_CONTINUACAO_RABO) {
    const nPages = (pageOf[pageOf.length - 1] ?? 0) + 1
    const footerMinPages = Math.max(2, Math.ceil(nPages * 0.5))
    const tailTextPages = new Map<string, Set<number>>()
    lines.forEach((l, i) => {
      if (i <= (lastTableIdx.get(pageOf[i]!) ?? -1)) return
      const key = lineText(l)
      if (!tailTextPages.has(key)) tailTextPages.set(key, new Set())
      tailTextPages.get(key)!.add(pageOf[i]!)
    })
    const recurringFooter = new Set([...tailTextPages].filter(([, pgs]) => pgs.size >= footerMinPages).map(([k]) => k))
    if (nPages >= 2) {
      for (const [page, base] of lastTableIdx) {
        let b = base
        for (let i = base + 1; i < lines.length && pageOf[i] === page; i++) {
          if (recurringFooter.has(lineText(lines[i]!))) break
          const gap = lines[i - 1]!.y - lines[i]!.y
          if (!(gap > 0 && gap <= lineGap * 1.5)) break
          b = i
        }
        tableBoundary.set(page, b)
      }
    }
  }
  // └── fim do bloco [REVERSÍVEL] ──────────────────────────────────────────────

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
  let lastPage = -1 // página do lançamento aberto (p/ continuação que cruza a virada)
  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx]!
    const t = lineText(l)
    // Preâmbulo repetido no topo das páginas seguintes → ignora (não é continuação).
    if (preambleTexts.has(t)) continue
    const d = leadingDate(t)
    // Cabeçalho de PERÍODO ("01 DE MARÇO DE 2026 a 31 DE MARÇO DE 2026",
    // repetido no topo de cada página): começa com data mas é um INTERVALO —
    // ignora sem tocar em currentDate/last, para não quebrar o carry-forward da
    // data nem a continuação de descrição que atravessa a virada de página.
    if (d && isDateRange(t)) continue
    if (d) { currentDate = d; last = null; continue }
    if (SUBTOTAL_RE.test(t)) { last = null; continue }
    if (isTxn(l)) {
      last = [currentDate, ...assignByStart(l.tokens, starts)]
      lastY = l.y
      lastPage = pageOf[idx]!
      rows.push(last)
    } else if (
      last &&
      // `tableBoundary` = fronteira da tabela da página (== `lastTableIdx` se o
      // bloco [REVERSÍVEL] estiver desligado). Reverter → troque por `lastTableIdx`.
      idx <= (tableBoundary.get(pageOf[idx]!) ?? -1) &&
      // Proximidade: na MESMA página, salto vertical de ~1 linha; ao CRUZAR a
      // virada (o y reinicia lá no topo), aceita por adjacência de ordem de leitura
      // — o preâmbulo repetido já foi pulado acima, então as 1ªs linhas-sem-data da
      // nova página são a continuação da descrição do lançamento da página anterior
      // (Nubank: "…Bank of America Merrill" | "Lynch Banco… Agência" | "Conta: …").
      (pageOf[idx]! === lastPage
        ? (lastY - l.y >= 0 && lastY - l.y <= lineGap * 1.5)
        : pageOf[idx]! > lastPage)
    ) {
      // Continuação de descrição (linha sem valor/data, logo abaixo do lançamento).
      // Guards adicionais: cai numa ÚNICA coluna (rodapé costuma espalhar), de
      // TEXTO (nunca polui coluna de valor), e o lançamento já tem conteúdo nela.
      const cells = assignByStart(l.tokens, starts)
      const touched = cells.map((c, i) => (c ? i : -1)).filter((i) => i >= 0)
      if (touched.length === 1) {
        const i = touched[0]!
        if (!numericCol[i] && last[i + 1]) { last[i + 1] = `${last[i + 1]} ${cells[i]}`; lastY = l.y; lastPage = pageOf[idx]! }
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
