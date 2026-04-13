import * as XLSX from 'xlsx'

export interface ExportColumn {
  /** Header da coluna no arquivo */
  header: string
  /** Chave do campo nos dados ou função extratora */
  accessor: string | ((row: Record<string, unknown>) => unknown)
}

/**
 * Exporta dados para Excel (.xlsx)
 */
export function exportToExcel(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  fileName: string,
) {
  const rows = data.map(row =>
    columns.reduce<Record<string, unknown>>((acc, col) => {
      acc[col.header] = typeof col.accessor === 'function'
        ? col.accessor(row)
        : getNestedValue(row, col.accessor)
      return acc
    }, {}),
  )

  const ws = XLSX.utils.json_to_sheet(rows)

  // Largura automática das colunas
  ws['!cols'] = columns.map(col => ({
    wch: Math.max(
      col.header.length + 2,
      ...rows.map(r => String(r[col.header] ?? '').length).slice(0, 50),
      10,
    ),
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Dados')
  XLSX.writeFile(wb, `${fileName}.xlsx`)
}

/**
 * Exporta dados para CSV
 */
export function exportToCsv(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  fileName: string,
) {
  const headers = columns.map(c => c.header).join(';')
  const rows = data.map(row =>
    columns.map(col => {
      const val = typeof col.accessor === 'function'
        ? col.accessor(row)
        : getNestedValue(row, col.accessor)
      const str = String(val ?? '')
      // Escapar aspas e valores com ponto-e-vírgula
      return str.includes(';') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str
    }).join(';'),
  )

  const content = '\uFEFF' + [headers, ...rows].join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileName}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}
