// Agrupamento de eventos da Agenda por dia.
//
// Função pura e genérica: agrupa qualquer objeto que tenha os campos mínimos
// de um evento (data/horaInicio/diaInteiro), sem acoplar ao tipo completo da API.

/** Campos mínimos que um evento precisa expor para ser agrupado. */
export interface EventoLike {
  /** Data ISO 'yyyy-MM-dd'. */
  data: string
  /** Hora de início 'HH:MM' ou null (ex.: eventos de dia inteiro). */
  horaInicio: string | null
  /** true se o evento ocupa o dia todo. */
  diaInteiro: boolean
}

/**
 * Agrupa eventos por dia ('yyyy-MM-dd').
 *
 * Ordenação:
 *  - Grupos por `dia` em ordem crescente (a string ISO ordena lexicograficamente
 *    igual à ordem cronológica).
 *  - Dentro de cada dia: eventos de DIA INTEIRO primeiro; depois os demais por
 *    `horaInicio` crescente. Início nulo (e não-dia-inteiro) vai para o fim.
 *
 * Preserva o tipo concreto T dos eventos (genérico restrito a EventoLike).
 */
export function groupByDay<T extends EventoLike>(
  eventos: T[],
): Array<{ dia: string; eventos: T[] }> {
  // Mapa dia -> lista de eventos daquele dia.
  const mapa = new Map<string, T[]>()

  for (const evento of eventos) {
    const lista = mapa.get(evento.data)
    if (lista === undefined) {
      mapa.set(evento.data, [evento])
    } else {
      lista.push(evento)
    }
  }

  // Dias em ordem crescente.
  const diasOrdenados = Array.from(mapa.keys()).sort((a, b) => a.localeCompare(b))

  return diasOrdenados.map((dia) => {
    // Cópia rasa antes de ordenar pra não mutar a ordem original do input.
    const eventosDoDia = [...(mapa.get(dia) ?? [])]

    eventosDoDia.sort((a, b) => {
      // Dia inteiro sempre antes de eventos com horário.
      if (a.diaInteiro !== b.diaInteiro) {
        return a.diaInteiro ? -1 : 1
      }
      // Entre dia-inteiros (ou ambos sem flag), mantém estável.
      if (a.diaInteiro && b.diaInteiro) return 0

      // Ambos com horário: nulos vão pro fim, demais por horaInicio asc.
      if (a.horaInicio === null && b.horaInicio === null) return 0
      if (a.horaInicio === null) return 1
      if (b.horaInicio === null) return -1
      return a.horaInicio.localeCompare(b.horaInicio)
    })

    return { dia, eventos: eventosDoDia }
  })
}
