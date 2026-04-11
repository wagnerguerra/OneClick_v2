import * as XLSX from 'xlsx'

export interface ParsedRow {
  rowIndex: number
  data: Record<string, string>
  valid: boolean
  errors: string[]
}

export interface ColumnMapping {
  /** Nome da coluna no arquivo (header) — preenchido pelo usuário no mapeamento */
  fileColumn: string
  /** Nome do campo no sistema */
  fieldName: string
  /** Label legível do campo */
  label: string
  /** Obrigatório? */
  required?: boolean
}

export interface FileData {
  headers: string[]
  rows: Record<string, string>[]
  firstRow: Record<string, string>
}

// ── Extrair dados do arquivo (headers + rows brutos) ──

export async function extractFileData(file: File): Promise<FileData> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('Arquivo vazio ou sem planilha.')

  const sheet = workbook.Sheets[sheetName]!
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })

  if (!rows.length) throw new Error('Nenhum dado encontrado no arquivo.')

  const headers = Object.keys(rows[0]!)

  return { headers, rows, firstRow: rows[0]! }
}

// ── Auto-detectar mapeamento por fuzzy match ──

export function autoMapColumns(
  fileHeaders: string[],
  systemColumns: ColumnMapping[],
): Map<string, string> {
  const map = new Map<string, string>() // fieldName → fileHeader

  for (const col of systemColumns) {
    const normalizedLabel = normalize(col.label)
    const normalizedField = normalize(col.fileColumn)

    const match = fileHeaders.find(h => {
      const nh = normalize(h)
      return nh === normalizedLabel || nh === normalizedField
    })

    if (match) {
      map.set(col.fieldName, match)
    }
  }

  return map
}

// ── Parsear dados com mapeamentos do usuário ──

export function parseWithMappings(
  rawRows: Record<string, string>[],
  mappings: Map<string, string>, // fieldName → fileHeader
  systemColumns: ColumnMapping[],
): ParsedRow[] {
  return rawRows.map((raw, i) => {
    const data: Record<string, string> = {}
    const errors: string[] = []

    for (const col of systemColumns) {
      const fileHeader = mappings.get(col.fieldName)
      const value = fileHeader ? String(raw[fileHeader] ?? '').trim() : ''
      data[col.fieldName] = value

      if (col.required && !value) {
        errors.push(`"${col.label}" é obrigatório`)
      }
    }

    return {
      rowIndex: i + 2,
      data,
      valid: errors.length === 0,
      errors,
    }
  })
}

// ── Funções legadas (mantidas para compatibilidade) ──

export async function parseImportFile(
  file: File,
  columns: ColumnMapping[],
): Promise<ParsedRow[]> {
  const { rows } = await extractFileData(file)
  const mappings = autoMapColumns(
    Object.keys(rows[0]!),
    columns,
  )
  return parseWithMappings(rows, mappings, columns)
}

// ── Utilitários ──

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function parseBooleanPt(value: string): boolean {
  const v = value.toLowerCase().trim()
  return ['sim', 's', '1', 'true', 'verdadeiro', 'yes', 'y'].includes(v)
}

export function generateTemplate(columns: ColumnMapping[], fileName: string) {
  const headers = columns.map((c) => c.label)
  const ws = XLSX.utils.aoa_to_sheet([headers])
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 5, 15) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Importação')
  XLSX.writeFile(wb, `${fileName}.xlsx`)
}

export function generateTemplateCsv(columns: ColumnMapping[], fileName: string) {
  const headers = columns.map((c) => c.label).join(';')
  const blob = new Blob(['\uFEFF' + headers + '\n'], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileName}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
