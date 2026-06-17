// Labels e formatações do módulo Clientes (espelha os enums do sistema web).

export const TRIBUTACAO_LABELS: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real',
  MEI: 'MEI',
  IMUNE: 'Imune',
  ISENTA: 'Isenta',
}

export const TIPO_CLIENTE_LABELS: Record<string, string> = {
  A_DEFINIR: 'A definir',
  MATRIZ: 'Matriz',
  FILIAL: 'Filial',
  UNICO: 'Único',
}

export function tributacaoLabel(v: string | null | undefined): string | null {
  if (!v) return null
  return TRIBUTACAO_LABELS[v] ?? v
}

/** Formata um documento (só dígitos) como CNPJ (14) ou CPF (11). */
export function formatDocumento(doc: string | null | undefined): string | null {
  if (!doc) return null
  const d = doc.replace(/\D/g, '')
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }
  return doc || null
}

/** Áreas contratadas vêm como string separada por ";". */
export function parseAreas(s: string | null | undefined): string[] {
  if (!s) return []
  return s
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
}
