import * as XLSX from 'xlsx'

// ============================================================
// Extração dinâmica de tabela de arquivos tabelados (.xlsx/.xls/.csv).
//
// Interface ÚNICA do pipeline: tudo a jusante (de/para → pendências → SCI)
// consome `ExtractedTable`. A futura extração via IA (PDF/imagem) será apenas
// OUTRA implementação que devolve o mesmo formato — sem tocar no resto.
//
// Dois modos (auto-detectados):
//  • TABELA ÚNICA: uma região contígua de linhas cheias (o caso comum).
//  • RELATÓRIO paginado/agrupado: o cabeçalho de colunas se REPETE (≥2×, por
//    quebra de página) e os lançamentos vêm em várias seções intercaladas com
//    título/filtros/subtotais. Coletamos TODAS as linhas de lançamento numa
//    tabela só e, quando há cabeçalhos de seção (ex.: "Caixa/Banco: ..."),
//    propagamos o rótulo da seção para cada linha como uma coluna sintética
//    (carry-forward) — útil, p.ex., para mapear múltiplas contas correntes.
//
// Em ambos os modos expomos TODAS as colunas do corpo (não só as nomeadas no
// cabeçalho): cabeçalhos de relatórios costumam ficar desalinhados do dado, e o
// gerente do modelo mapeia pela amostra no de/para. Colunas sem nome no
// cabeçalho recebem um nome genérico ("Coluna B", "Coluna C", ...).
// ============================================================

export type CellValue = string | number | boolean | null

export interface ExtractedTable {
  headers: string[]
  /** Linhas do corpo, indexadas pelo nome do cabeçalho. Valores crus (number p/ serial/numérico). */
  rows: Array<Record<string, CellValue>>
  meta: {
    sheetName: string
    headerRowIndex: number
    bodyStartIndex: number
    bodyEndIndex: number
    totalDataRows: number
    /** Modo usado e, no modo relatório, o nome da coluna sintética de seção (se houver). */
    mode: 'single' | 'report'
    sectionColumn?: string
  }
}

export interface ExtractInput {
  buffer: Buffer
  filename: string
}

type Matrix = CellValue[][]

function isFilled(c: CellValue): boolean {
  return c !== null && c !== undefined && String(c).trim() !== ''
}

function filledCols(row: CellValue[]): number[] {
  const idx: number[] = []
  row.forEach((c, i) => { if (isFilled(c)) idx.push(i) })
  return idx
}

/** Valor "parece número" (serial/numérico/decimal). */
function isNumericish(c: CellValue): boolean {
  return typeof c === 'number' || /^-?[\d.,]+$/.test(String(c).trim())
}

/** Linha é "majoritariamente textual" (candidata a cabeçalho). */
function isMostlyText(row: CellValue[]): boolean {
  const filled = row.filter(isFilled)
  if (filled.length < 2) return false
  const textCount = filled.filter((c) => typeof c === 'string' && !isNumericish(c)).length
  return textCount > filled.length / 2
}

/** Nome de coluna por posição (A, B, ..., Z, AA, ...) para colunas sem cabeçalho. */
function colLetter(i: number): string {
  let s = ''
  let n = i
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
  return s
}

// Rótulos de cabeçalho de seção em relatórios financeiros ("Caixa/Banco:", "Banco:",
// "Conta corrente:", "Portador:", "Carteira:"). O nome da coluna sintética é o
// próprio rótulo do relatório (sem os dois-pontos).
const SECTION_LABEL_RE = /^\s*(caixa\s*\/\s*banco|banco|conta(?:\s+corrente)?|carteira|portador)\s*:/i
const TOTAL_RE = /total|prestaç|listad/i

/**
 * Formata uma data do Excel para "dd/MM/aaaa" (ou com hora, quando há).
 * O SheetJS (`cellDates: true`) constrói a Date na MEIA-NOITE LOCAL e ainda
 * adiciona um pequeno artefato de segundos na conversão do serial (ex.: a data
 * pura 01/09/2025 vira ...T00:00:28 local). Por isso:
 *  • lemos componentes LOCAIS — como construção e leitura usam o mesmo fuso, a
 *    data fecha em qualquer servidor (não há o off-by-one de UTC);
 *  • arredondamos para o minuto para descartar o artefato de segundos.
 */
function formatExcelDate(d: Date): string {
  const r = new Date(Math.round(d.getTime() / 60_000) * 60_000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const dd = pad(r.getDate())
  const mm = pad(r.getMonth() + 1)
  const yyyy = r.getFullYear()
  const h = r.getHours(), min = r.getMinutes()
  return h || min ? `${dd}/${mm}/${yyyy} ${pad(h)}:${pad(min)}` : `${dd}/${mm}/${yyyy}`
}

function sheetToMatrix(ws: XLSX.WorkSheet): Matrix {
  // raw: true preserva números (valores/códigos) como number; cellDates: true
  // (no read) faz células de data virarem Date — que formatamos para texto aqui,
  // senão vaza o número de série do Excel (ex.: 46100 em vez de 17/03/2026).
  const raw = XLSX.utils.sheet_to_json<(CellValue | Date)[]>(ws, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  })
  return raw.map((row) => row.map((c) => (c instanceof Date ? formatExcelDate(c) : c)))
}

/** Pontua uma aba pelo tamanho do maior bloco contíguo de linhas preenchidas. */
function scoreSheet(matrix: Matrix): number {
  let best = 0
  let run = 0
  for (const row of matrix) {
    if (filledCols(row).length >= 2) {
      run++
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return best
}

// ---- Construção da tabela (comum aos dois modos) ---------------------------

interface DataRowRef { i: number; section?: string }

/**
 * Monta a `ExtractedTable` a partir de um conjunto de linhas de dados, expondo
 * TODAS as colunas do corpo (união das colunas preenchidas), nomeadas pelo
 * cabeçalho onde houver — senão "Coluna X". Prefixa a coluna sintética de seção
 * quando informada.
 */
function buildTable(
  matrix: Matrix,
  sheetName: string,
  headerRowIndex: number,
  dataRows: DataRowRef[],
  mode: 'single' | 'report',
  sectionColumn?: string,
): ExtractedTable {
  const headerRow = matrix[headerRowIndex] ?? []

  // Colunas do corpo = união das colunas preenchidas nas linhas de dados.
  const bodySet = new Set<number>()
  for (const { i } of dataRows) for (const c of filledCols(matrix[i] ?? [])) bodySet.add(c)
  const bodyCols = [...bodySet].sort((a, b) => a - b)

  const seen = new Map<string, number>()
  const uniqueName = (base: string): string => {
    const dup = seen.get(base) ?? 0
    seen.set(base, dup + 1)
    return dup > 0 ? `${base} (${dup + 1})` : base
  }

  // Reserva o nome da coluna sintética primeiro (para não colidir com o corpo).
  const sectionName = sectionColumn ? uniqueName(sectionColumn) : null

  const nameByCol = new Map<number, string>()
  for (const c of bodyCols) {
    const h = headerRow[c]
    const base = isFilled(h) && !isNumericish(h) ? String(h).trim() : `Coluna ${colLetter(c)}`
    nameByCol.set(c, uniqueName(base))
  }

  const headers: string[] = [...(sectionName ? [sectionName] : []), ...bodyCols.map((c) => nameByCol.get(c)!)]

  const rows: Array<Record<string, CellValue>> = []
  for (const { i, section } of dataRows) {
    const row = matrix[i] ?? []
    const obj: Record<string, CellValue> = {}
    if (sectionName) obj[sectionName] = section ?? ''
    for (const c of bodyCols) {
      const v = row[c]
      obj[nameByCol.get(c)!] = isFilled(v) ? v : null
    }
    rows.push(obj)
  }

  const indices = dataRows.map((d) => d.i)
  return {
    headers,
    rows,
    meta: {
      sheetName,
      headerRowIndex,
      bodyStartIndex: indices.length ? Math.min(...indices) : headerRowIndex,
      bodyEndIndex: indices.length ? Math.max(...indices) : headerRowIndex,
      totalDataRows: rows.length,
      mode,
      ...(sectionName ? { sectionColumn: sectionName } : {}),
    },
  }
}

// ---- Modo RELATÓRIO --------------------------------------------------------

interface RepeatedHeader { cols: number[]; rowIndex: number; fingerprint: string; count: number }

/** Cabeçalho que se repete: a assinatura textual (≥4 colunas) que aparece ≥2×. */
function detectRepeatedHeader(matrix: Matrix): RepeatedHeader | null {
  const groups = new Map<string, { cols: number[]; rowIndex: number; count: number }>()
  matrix.forEach((row, i) => {
    if (!isMostlyText(row)) return
    const cols = filledCols(row)
    if (cols.length < 4) return
    const fp = cols.map((c) => String(row[c]).trim().toLowerCase()).join('')
    const g = groups.get(fp)
    if (g) g.count++
    else groups.set(fp, { cols, rowIndex: i, count: 1 })
  })
  let best: RepeatedHeader | null = null
  for (const [fp, g] of groups) {
    if (g.count < 2) continue
    if (!best || g.cols.length > best.cols.length) best = { cols: g.cols, rowIndex: g.rowIndex, fingerprint: fp, count: g.count }
  }
  return best
}

/** Extrai um relatório paginado/agrupado a partir de um cabeçalho repetido. */
function extractReport(matrix: Matrix, sheetName: string, header: RepeatedHeader): ExtractedTable | null {
  const COVERAGE = 0.7
  let currentSection = ''
  let sectionColumn: string | undefined
  const dataRows: DataRowRef[] = []

  matrix.forEach((row, i) => {
    const cols = filledCols(row)
    if (cols.length === 0) return

    // Cabeçalho de seção: célula que começa com "<Rótulo>:". O rótulo (sem ":")
    // vira o nome da coluna sintética; o valor = demais células preenchidas.
    const secCell = row.findIndex((c) => isFilled(c) && SECTION_LABEL_RE.test(String(c)))
    if (secCell >= 0) {
      const label = String(row[secCell])
      const colName = label.slice(0, label.indexOf(':')).trim()
      if (!sectionColumn && colName) sectionColumn = colName
      currentSection = cols.filter((c) => c !== secCell).map((c) => String(row[c]).trim()).join(' ').replace(/\s+/g, ' ').trim()
      return
    }

    // Cabeçalho repetido → ignora.
    if (isMostlyText(row) && cols.map((c) => String(row[c]).trim().toLowerCase()).join('') === header.fingerprint) return
    // Linhas de total/subtotal → ignora.
    if (row.some((c) => isFilled(c) && TOTAL_RE.test(String(c)))) return
    // Linha de lançamento? cobre ≥70% das colunas do cabeçalho.
    const cover = header.cols.filter((c) => isFilled(row[c])).length / header.cols.length
    if (cover < COVERAGE) return

    dataRows.push({ i, section: sectionColumn ? currentSection : undefined })
  })

  if (dataRows.length === 0) return null
  return buildTable(matrix, sheetName, header.rowIndex, dataRows, 'report', sectionColumn)
}

// ---- Modo TABELA ÚNICA -----------------------------------------------------

/** Acha [headerRowIndex, bodyStart, bodyEnd] na maior região contígua de linhas cheias. */
function detectRegion(matrix: Matrix): { headerRowIndex: number; bodyStart: number; bodyEnd: number } | null {
  const counts = matrix.map((r) => filledCols(r).length)
  const maxFilled = Math.max(0, ...counts)
  if (maxFilled < 2) return null

  // "Linha cheia" = pelo menos 60% da largura máxima (mín. 2 colunas).
  const fullThreshold = Math.max(2, Math.ceil(maxFilled * 0.6))
  const isFull = counts.map((c) => c >= fullThreshold)

  // Maior sequência consecutiva de linhas cheias = corpo candidato.
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0
  for (let i = 0; i < isFull.length; i++) {
    if (isFull[i]) {
      if (curLen === 0) curStart = i
      curLen++
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
    } else {
      curLen = 0
    }
  }
  if (bestStart < 0) return null

  // Cabeçalho: procura acima do corpo a 1ª linha textual com largura razoável.
  let headerRowIndex = -1
  for (let i = bestStart - 1; i >= 0; i--) {
    if (counts[i]! >= Math.ceil(maxFilled * 0.5) && isMostlyText(matrix[i]!)) {
      headerRowIndex = i
      break
    }
    if (counts[i]! >= fullThreshold) break // linha cheia não-textual acima: para
  }

  let bodyStart = bestStart
  if (headerRowIndex === -1) {
    headerRowIndex = bestStart
    bodyStart = bestStart + 1
  }

  return { headerRowIndex, bodyStart, bodyEnd: bestStart + bestLen - 1 }
}

function extractSingle(matrix: Matrix, sheetName: string): ExtractedTable {
  const region = detectRegion(matrix)
  if (!region) {
    throw new Error('Não foi possível localizar uma tabela de lançamentos no arquivo.')
  }
  const { headerRowIndex, bodyStart, bodyEnd } = region
  const dataRows: DataRowRef[] = []
  for (let r = bodyStart; r <= bodyEnd; r++) {
    if (filledCols(matrix[r] ?? []).length === 0) continue // pula linhas em branco internas
    dataRows.push({ i: r })
  }
  return buildTable(matrix, sheetName, headerRowIndex, dataRows, 'single')
}

export function extractTabelaFromMatrix(matrix: Matrix, sheetName: string): ExtractedTable {
  // Cabeçalho repetido ≥2× → relatório paginado/agrupado. Se a coleta falhar
  // (0 linhas), cai no modo tabela única.
  const header = detectRepeatedHeader(matrix)
  if (header) {
    const report = extractReport(matrix, sheetName, header)
    if (report) return report
  }
  return extractSingle(matrix, sheetName)
}

/**
 * Extrai a tabela de lançamentos de um arquivo tabelado.
 * TODO(IA): para formatos não-tabelados (PDF/imagem), implementar uma extração
 * alternativa que devolva o mesmo `ExtractedTable` (Gemini/Anthropic) — a
 * fronteira do pipeline é esta função.
 */
export function extractTabela(input: ExtractInput): ExtractedTable {
  const wb = XLSX.read(input.buffer, { type: 'buffer', cellDates: true })
  if (wb.SheetNames.length === 0) throw new Error('Arquivo sem planilhas.')

  // Seleciona a aba de maior bloco contíguo preenchido.
  let bestSheet = wb.SheetNames[0]!
  let bestScore = -1
  let bestMatrix: Matrix = []
  for (const name of wb.SheetNames) {
    const matrix = sheetToMatrix(wb.Sheets[name]!)
    const score = scoreSheet(matrix)
    if (score > bestScore) { bestScore = score; bestSheet = name; bestMatrix = matrix }
  }

  return extractTabelaFromMatrix(bestMatrix, bestSheet)
}
