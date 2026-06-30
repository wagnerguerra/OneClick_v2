// ============================================================
// Parsers tolerantes para os dados de entrada de lançamentos.
//
// Os arquivos do mundo real misturam formatos na MESMA coluna:
//  - Datas: número serial do Excel (45901), "dd/mm/aaaa", "aaaa-mm-dd".
//  - Valores: BR ("5.195,40", "810,00") e US ("1880.31", "2328") juntos.
//
// Cada parser retorna um resultado com `valid` para alimentar a detecção de
// pendências (Fase 4) sem lançar exceção.
// ============================================================

export interface ParsedDate {
  valid: boolean
  /** Data normalizada (UTC) ou null se inválida. */
  date: Date | null
  /** Formato exigido pelo SCI no campo <2>: "AAAAMMDD". */
  yyyymmdd: string | null
  raw: string
}

export interface ParsedValue {
  valid: boolean
  /** Valor numérico (pode ser negativo) ou null se inválido. */
  value: number | null
  raw: string
}

function isEmpty(raw: unknown): boolean {
  return raw === null || raw === undefined || String(raw).trim() === ''
}

/** Remove tudo que não é dígito — usado para CNPJ/CPF no campo <8> do SCI. */
export function onlyDigits(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '')
}

// 25569 = dias entre a época do Excel (1899-12-30, já com o bug do ano 1900)
// e a época Unix (1970-01-01).
const EXCEL_EPOCH_DAYS = 25569
const MS_PER_DAY = 86_400_000

function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - EXCEL_EPOCH_DAYS) * MS_PER_DAY))
}

function fmtYYYYMMDD(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function buildDate(y: number, m: number, d: number): Date | null {
  // Valida via round-trip (rejeita 31/02 etc.)
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date
}

/**
 * Interpreta data a partir de: Date, número serial do Excel, ou string em
 * "dd/mm/aaaa", "dd-mm-aaaa", "aaaa-mm-dd". Anos com 2 dígitos viram 20xx.
 */
export function parseData(raw: unknown): ParsedDate {
  const rawStr = String(raw ?? '')
  const fail: ParsedDate = { valid: false, date: null, yyyymmdd: null, raw: rawStr }
  if (isEmpty(raw)) return fail

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const d = new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate()))
    return { valid: true, date: d, yyyymmdd: fmtYYYYMMDD(d), raw: rawStr }
  }

  // Número serial do Excel (ou string puramente numérica que o represente).
  if (typeof raw === 'number' || /^\d+(\.\d+)?$/.test(rawStr.trim())) {
    const serial = typeof raw === 'number' ? raw : Number(rawStr.trim())
    // Faixa plausível de serial (≈ 1925 a 2150). Evita confundir com "2026".
    if (serial > 9000 && serial < 90000) {
      const d = excelSerialToDate(serial)
      if (!isNaN(d.getTime())) return { valid: true, date: d, yyyymmdd: fmtYYYYMMDD(d), raw: rawStr }
    }
    return fail
  }

  const s = rawStr.trim()
  // aaaa-mm-dd (ISO) — separador "-" e primeiro grupo com 4 dígitos.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const d = buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    return d ? { valid: true, date: d, yyyymmdd: fmtYYYYMMDD(d), raw: rawStr } : fail
  }
  // dd/mm/aaaa ou dd-mm-aaaa (formato BR).
  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (br) {
    let year = Number(br[3])
    if (year < 100) year += 2000
    const d = buildDate(year, Number(br[2]), Number(br[1]))
    return d ? { valid: true, date: d, yyyymmdd: fmtYYYYMMDD(d), raw: rawStr } : fail
  }
  return fail
}

/**
 * Interpreta valor numérico tolerando BR e US na mesma coluna:
 *  - "5.195,40" → 5195.4   (BR: ponto milhar, vírgula decimal)
 *  - "1.400,00" → 1400
 *  - "810,00"   → 810
 *  - "1880.31"  → 1880.31  (US: ponto decimal)
 *  - "2328"     → 2328
 *  - "-15", "R$ -15,00" → negativos e símbolos tolerados
 */
export function parseValor(raw: unknown): ParsedValue {
  const rawStr = String(raw ?? '')
  if (isEmpty(raw)) return { valid: false, value: null, raw: rawStr }

  if (typeof raw === 'number') {
    return { valid: !isNaN(raw), value: isNaN(raw) ? null : raw, raw: rawStr }
  }

  // Limpa espaços, símbolo de moeda e NBSP; mantém dígitos, sinais e separadores.
  let s = rawStr.trim().replace(/\s| /g, '').replace(/R\$/gi, '')
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')

  if (hasDot && hasComma) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // Vírgula é o decimal (BR): remove pontos de milhar, vírgula → ponto.
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // Ponto é o decimal (US com milhar): remove vírgulas.
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    // Só vírgula → decimal.
    s = s.replace(',', '.')
  }
  // Só ponto (ou nenhum) → ponto já é o decimal; nada a fazer.

  if (!/^-?\d*\.?\d+$/.test(s)) return { valid: false, value: null, raw: rawStr }
  const n = Number(s)
  return { valid: !isNaN(n), value: isNaN(n) ? null : n, raw: rawStr }
}
