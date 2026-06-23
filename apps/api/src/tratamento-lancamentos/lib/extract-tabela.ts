import * as XLSX from 'xlsx'

// ============================================================
// Extração dinâmica de tabela de arquivos tabelados (.xlsx/.xls/.csv).
//
// Interface ÚNICA do pipeline: tudo a jusante (de/para → pendências → SCI)
// consome `ExtractedTable`. A futura extração via IA (PDF/imagem) será apenas
// OUTRA implementação que devolve o mesmo formato — sem tocar no resto.
//
// Heurística (sem o usuário informar aba nem nº de linhas de cabeçalho):
//  1. Aba: a de maior bloco contíguo preenchido.
//  2. Região: maior sequência de linhas "cheias" (descarta título/cabeçalho
//     do banco no topo e linhas de totalização no rodapé, que são esparsas).
//  3. Cabeçalho: a primeira linha majoritariamente textual logo acima do corpo
//     (ou a 1ª linha do corpo, quando não há nada acima).
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

/** Linha é "majoritariamente textual" (candidata a cabeçalho). */
function isMostlyText(row: CellValue[]): boolean {
  const filled = row.filter(isFilled)
  if (filled.length < 2) return false
  const textCount = filled.filter((c) => typeof c === 'string' && !/^-?[\d.,]+$/.test(String(c).trim())).length
  return textCount > filled.length / 2
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

function sheetToMatrix(ws: XLSX.WorkSheet): Matrix {
  return XLSX.utils.sheet_to_json<CellValue[]>(ws, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  })
}

/** Acha [headerRowIndex, bodyStart, bodyEnd] na matriz. */
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
    if (counts[i] >= Math.ceil(maxFilled * 0.5) && isMostlyText(matrix[i]!)) {
      headerRowIndex = i
      break
    }
    // Linha esparsa de ruído (ex.: "cnpj" sozinho) — continua subindo.
    if (counts[i] >= fullThreshold) break // linha cheia não-textual acima: para
  }

  let bodyStart = bestStart
  if (headerRowIndex === -1) {
    // Não há cabeçalho acima: a 1ª linha do corpo é o cabeçalho.
    headerRowIndex = bestStart
    bodyStart = bestStart + 1
  }

  return { headerRowIndex, bodyStart, bodyEnd: bestStart + bestLen - 1 }
}

export function extractTabelaFromMatrix(matrix: Matrix, sheetName: string): ExtractedTable {
  const region = detectRegion(matrix)
  if (!region) {
    throw new Error('Não foi possível localizar uma tabela de lançamentos no arquivo.')
  }
  const { headerRowIndex, bodyStart, bodyEnd } = region
  const headerRow = matrix[headerRowIndex] ?? []

  // Colunas = índices com cabeçalho preenchido. Nomes duplicados ganham sufixo.
  const colIdx = filledCols(headerRow)
  const headers: string[] = []
  const headerByCol = new Map<number, string>()
  const seen = new Map<string, number>()
  for (const i of colIdx) {
    let name = String(headerRow[i]).trim()
    const dup = seen.get(name) ?? 0
    seen.set(name, dup + 1)
    if (dup > 0) name = `${name} (${dup + 1})`
    headers.push(name)
    headerByCol.set(i, name)
  }

  const rows: Array<Record<string, CellValue>> = []
  for (let r = bodyStart; r <= bodyEnd; r++) {
    const row = matrix[r] ?? []
    if (filledCols(row).length === 0) continue // pula linhas em branco internas
    const obj: Record<string, CellValue> = {}
    for (const [i, name] of headerByCol) {
      const v = row[i]
      obj[name] = v === undefined ? null : v
    }
    rows.push(obj)
  }

  return {
    headers,
    rows,
    meta: { sheetName, headerRowIndex, bodyStartIndex: bodyStart, bodyEndIndex: bodyEnd, totalDataRows: rows.length },
  }
}

/**
 * Extrai a tabela de lançamentos de um arquivo tabelado.
 * TODO(IA): para formatos não-tabelados (PDF/imagem), implementar uma extração
 * alternativa que devolva o mesmo `ExtractedTable` (Gemini/Anthropic) — a
 * fronteira do pipeline é esta função.
 */
export function extractTabela(input: ExtractInput): ExtractedTable {
  const wb = XLSX.read(input.buffer, { type: 'buffer', cellDates: false })
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
