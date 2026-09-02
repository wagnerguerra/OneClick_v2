import { prisma } from '@saas/db'

/**
 * Feriados cadastrados que caem nos anos pedidos, como `Set<YYYY-MM-DD>`.
 *
 * Complementa `feriados-br.ts`, que sabe só os nacionais calculados. Aqui entra
 * o que o usuario cadastrou na tabela `Feriado` — estadual, municipal, ponto
 * facultativo — para que "dia util" signifique a mesma coisa em todo o sistema.
 *
 * Vive em `common/` porque tem mais de um dono: o scheduler de recorrencias de
 * servico e a agenda. Era metodo privado do scheduler; copiar para a agenda
 * faria as duas nocoes de feriado divergirem na primeira mudanca de regra.
 *
 * Le em UTC de proposito: a coluna e `@db.Date`, entao o horario nao existe e
 * `getUTC*` evita que o fuso do servidor jogue o feriado para o dia anterior.
 */
export async function carregarDiasNaoUteis(anos: number[]): Promise<Set<string>> {
  if (anos.length === 0) return new Set()
  const set = new Set<string>()
  const anoMin = Math.min(...anos)
  const anoMax = Math.max(...anos)
  const inicio = new Date(anoMin, 0, 1)
  const fimExclusivo = new Date(anoMax + 1, 0, 1)

  const feriados = await prisma.feriado.findMany({
    where: {
      OR: [
        { recorrente: true },
        { recorrente: false, data: { gte: inicio, lt: fimExclusivo } },
      ],
    },
    select: { data: true, recorrente: true },
  })

  for (const f of feriados) {
    const d = new Date(f.data)
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    if (f.recorrente) {
      // Recorrente = vale em todos os anos da janela pedida.
      for (const ano of anos) set.add(`${ano}-${mm}-${dd}`)
    } else {
      set.add(`${d.getUTCFullYear()}-${mm}-${dd}`)
    }
  }
  return set
}

/** Lista de anos entre duas datas, para alimentar `carregarDiasNaoUteis`. */
export function anosEntre(inicio: Date, fim: Date): number[] {
  const anos: number[] = []
  for (let a = inicio.getFullYear(); a <= fim.getFullYear(); a++) anos.push(a)
  return anos
}
