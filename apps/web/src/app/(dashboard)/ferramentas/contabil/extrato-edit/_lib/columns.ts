import type { Cell } from './parseExtrato'

export type EntidadeTipo = 'cliente' | 'fornecedor'

/** Detecta a coluna de "Cód. Cliente/Fornecedor" (para vincular o CNPJ pelo código). */
export function detectCodigoColumn(headers: string[]): { index: number; tipo: EntidadeTipo } | null {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? '').toLowerCase()
    if (/c[óo]d.*forneced/.test(h)) return { index: i, tipo: 'fornecedor' }
    if (/c[óo]d.*client/.test(h)) return { index: i, tipo: 'cliente' }
  }
  return null
}

/** Projeta as linhas para as colunas escolhidas (na ordem dada). */
export function projectRows(headers: string[], rows: Cell[][], order: string[]): { headers: string[]; rows: Cell[][] } {
  const idx = order.map((h) => headers.indexOf(h)).filter((i) => i >= 0)
  return {
    headers: idx.map((i) => headers[i]!),
    rows: rows.map((r) => idx.map((i) => r[i] ?? null)),
  }
}

/** Texto plano de uma célula para exibição na prévia. */
export function cellPreview(v: Cell): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toLocaleDateString('pt-BR')
  return String(v)
}
