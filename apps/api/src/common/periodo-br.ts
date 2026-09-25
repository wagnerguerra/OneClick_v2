import { z } from 'zod'

/**
 * Período de relatório em datas de Brasília.
 *
 * Os painéis comerciais tinham só janelas fixas ("últimos 30/60/90 dias",
 * contadas a partir de agora). Desde 25/09/2026 o /comercial pede data inicial
 * e final. As duas formas convivem: `de`/`ate` (AAAA-MM-DD, inclusivos) têm
 * precedência sobre `dias`, que continua servindo o Painel TV e os relatórios.
 */

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const periodoSchema = z.object({
  dias: z.number().int().positive().optional(),
  de: dataIso.optional(),
  ate: dataIso.optional(),
})
export type Periodo = z.infer<typeof periodoSchema>

/** Intervalo de instantes; lado ausente = aberto. */
export interface Janela { gte?: Date; lte?: Date }

/** 00:00 do dia em Brasília. O Brasil não tem horário de verão desde 2019. */
export function inicioDoDiaBr(dia: string): Date {
  return new Date(`${dia}T00:00:00.000-03:00`)
}

/** 23:59:59.999 do dia em Brasília. */
export function fimDoDiaBr(dia: string): Date {
  return new Date(`${dia}T23:59:59.999-03:00`)
}

export function janelaDoPeriodo(p: Periodo | undefined, agora: Date = new Date()): Janela {
  if (!p) return {}
  if (p.de || p.ate) {
    return {
      ...(p.de ? { gte: inicioDoDiaBr(p.de) } : {}),
      ...(p.ate ? { lte: fimDoDiaBr(p.ate) } : {}),
    }
  }
  if (p.dias) return { gte: new Date(agora.getTime() - p.dias * 86_400_000), lte: agora }
  return {}
}

/** Filtro Prisma de data, ou `undefined` quando o período é "tudo". */
export function filtroDeData(j: Janela): { gte?: Date; lte?: Date } | undefined {
  return j.gte || j.lte ? { ...j } : undefined
}

/**
 * Filtro Prisma de data para os métodos que recebem `dias` (últimos N dias) OU
 * a janela já resolvida de um período com datas.
 */
export function filtroDeDiasOuJanela(dias: number | Janela | undefined, agora: Date = new Date()): { gte?: Date; lte?: Date } | undefined {
  if (typeof dias === 'object') return filtroDeData(dias)
  return dias ? { gte: new Date(agora.getTime() - dias * 86_400_000) } : undefined
}
