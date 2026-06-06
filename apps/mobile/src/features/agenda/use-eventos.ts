// Hook de dados da Agenda (visão semanal).
//
// Encapsula a query tRPC `agenda.listEventos` para um range de datas e normaliza
// o shape cru da API para algo amigável à UI:
//   - `evento.data` chega como datetime ISO (ex.: '2026-06-06T00:00:00.000Z'),
//     pois o cliente tRPC NÃO usa transformer — DateTime do Prisma vira string.
//     Aqui fatiamos para 'yyyy-MM-dd' (os 10 primeiros chars do ISO UTC), que é o
//     formato esperado por `groupByDay`/`toISODate`/comparações de dia.
//   - Mantemos as relações que a API realmente retorna (`tipo`, `criador`,
//     `participantes`) — sem inventar campos.

import { trpc } from '@/lib/trpc'
import { rangeISO, startOfWeek, endOfWeek } from './date'

/**
 * Tipo de um evento como o tRPC entrega ao cliente (já serializado: campos
 * `Date` do Prisma viram `string`). Inferimos do retorno real do `useQuery`
 * (via a função-âncora abaixo) pra não duplicar o shape nem inventar campos —
 * inclui as relações que a API retorna (`tipo`, `criador`, `participantes`).
 *
 * Por que a função-âncora? Pegar `ReturnType<typeof useQuery>['data']` direto
 * cai numa sobrecarga genérica que resolve pra `{}`. Capturando `query.data`
 * dentro de uma função, o TS resolve a sobrecarga concreta e expõe o tipo certo.
 */
function ancoraTipoEventos() {
  const query = trpc.agenda.listEventos.useQuery({ dataInicio: '', dataFim: '' })
  return query.data
}

export type EventoAgenda = NonNullable<ReturnType<typeof ancoraTipoEventos>>[number]

/**
 * Busca os eventos da semana que contém `referencia`.
 * Retorna o estado da query (isPending/isError/refetch) + a lista normalizada.
 */
export function useEventosDaSemana(referencia: Date) {
  // Range ISO de domingo a sábado da semana de referência.
  const { dataInicio, dataFim } = rangeISO(startOfWeek(referencia), endOfWeek(referencia))

  const query = trpc.agenda.listEventos.useQuery(
    { dataInicio, dataFim },
    {
      // Mantém os dados anteriores visíveis ao trocar de semana (evita flicker).
      placeholderData: (anterior) => anterior,
    },
  )

  // Normaliza `data` (datetime ISO -> 'yyyy-MM-dd'). Os 10 primeiros chars do ISO
  // UTC batem com a data de calendário, pois o backend grava datas como meia-noite UTC.
  const eventos: EventoAgenda[] = (query.data ?? []).map((ev) => ({
    ...ev,
    data: String(ev.data).slice(0, 10),
  }))

  return {
    eventos,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
