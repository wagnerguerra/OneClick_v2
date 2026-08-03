/**
 * Recortes de período do filtro de prazo, comuns às telas do Acessórias.
 *
 * Os recortes "atual" incluem os dias que ainda vêm (a semana e o mês
 * inteiros), porque as telas também olham para a frente; "últimos N dias" e
 * "anterior" são só passado, como o nome diz.
 */
export const PERIODOS = [
  { valor: 'todo',      label: 'Todo o período' },
  { valor: 'ultimos7',  label: 'Últimos 7 dias' },
  { valor: 'ultimos30', label: 'Últimos 30 dias' },
  { valor: 'semana',    label: 'Semana atual' },
  { valor: 'semanaAnt', label: 'Semana anterior' },
  { valor: 'mes',       label: 'Mês atual' },
  { valor: 'mesAnt',    label: 'Mês anterior' },
] as const

export type Periodo = (typeof PERIODOS)[number]['valor']

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Segunda-feira da semana de `d` — a semana comercial começa na segunda. */
function segundaDa(d: Date) {
  const x = new Date(d)
  const diaDaSemana = (x.getDay() + 6) % 7 // domingo (0) vira 6
  x.setDate(x.getDate() - diaDaSemana)
  return x
}

export function intervaloDe(p: Periodo): { de?: string; ate?: string } {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const mais = (dias: number) => { const x = new Date(hoje); x.setDate(x.getDate() + dias); return x }
  switch (p) {
    case 'ultimos7':  return { de: iso(mais(-7)), ate: iso(hoje) }
    case 'ultimos30': return { de: iso(mais(-30)), ate: iso(hoje) }
    case 'semana': {
      const ini = segundaDa(hoje)
      const fim = new Date(ini); fim.setDate(fim.getDate() + 6)
      return { de: iso(ini), ate: iso(fim) }
    }
    case 'semanaAnt': {
      const ini = segundaDa(hoje); ini.setDate(ini.getDate() - 7)
      const fim = new Date(ini); fim.setDate(fim.getDate() + 6)
      return { de: iso(ini), ate: iso(fim) }
    }
    case 'mes': {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
      return { de: iso(ini), ate: iso(fim) }
    }
    case 'mesAnt': {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
      return { de: iso(ini), ate: iso(fim) }
    }
    default: return {}
  }
}
