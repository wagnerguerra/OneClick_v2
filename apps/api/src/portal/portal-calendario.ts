import { prisma } from '@saas/db'
import type { VinculoPortal } from './portal-escopo'

/**
 * O calendário do mês, do lado do CLIENTE.
 *
 * Três fontes, e cada uma com o seu recorte:
 *  - FERIADOS: os globais (sem empresa) e os da empresa do cliente, filtrados
 *    pela UF e pela cidade DO CLIENTE — feriado municipal de outra cidade não
 *    é feriado para ele.
 *  - EVENTOS DA AGENDA: só aqueles em que o cliente aparece — participante que
 *    seja usuário do portal dele, ou o e-mail de um desses usuários citado no
 *    contato ou na descrição do evento. Sem usuário e sem e-mail, devolve
 *    vazio: é o mesmo fail-closed das áreas, e aqui ele evita despejar a
 *    agenda inteira do escritório na tela de um cliente.
 *  - As OBRIGAÇÕES entram pelo router, que só as pede quando o módulo está
 *    liberado — o calendário não decide sozinho o que o escritório liberou.
 *
 * Evento `particular` nunca entra, nem redigido: no lado interno ele aparece
 * com o título escondido porque o colega precisa saber que o horário está
 * ocupado. Para o cliente isso não significa nada, e o que sobraria seria a
 * informação de que existe um compromisso que ele não pode ver.
 */

export type TipoDoItem = 'obrigacao' | 'feriado' | 'evento'

export interface ItemDoCalendario {
  id: string
  tipo: TipoDoItem
  titulo: string
  /** Dia que a grade pinta, AAAA-MM-DD. */
  data: string
  /** HH:MM quando há hora marcada. */
  hora: string | null
  /** Linha de apoio: área da obrigação, tipo do evento, âmbito do feriado. */
  detalhe: string | null
  /** Só para obrigação: ENTREGUE | ATRASADA | EM_ANDAMENTO | DISPENSADA. */
  situacao: string | null
}

/** Data de calendário (`@db.Date`) lida em UTC — o fuso local jogaria para o dia anterior. */
function diaEmUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

const AMBITO: Record<string, string> = {
  NACIONAL: 'Feriado nacional',
  ESTADUAL: 'Feriado estadual',
  MUNICIPAL: 'Feriado municipal',
  PONTO_FACULTATIVO: 'Ponto facultativo',
}

function normalizar(texto: string): string {
  return texto.trim().toLowerCase()
}

export async function itensDoCalendario(
  vinculo: VinculoPortal,
  ano: number,
  mes: number,
): Promise<ItemDoCalendario[]> {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1))
  const fim = new Date(Date.UTC(ano, mes, 0, 23, 59, 59))

  const cliente = await prisma.cliente.findUnique({
    where: { id: vinculo.clienteId },
    select: { empresaId: true, uf: true, cidade: true },
  })

  const [feriados, usuarios] = await Promise.all([
    prisma.feriado.findMany({
      where: { OR: [{ empresaId: null }, ...(cliente?.empresaId ? [{ empresaId: cliente.empresaId }] : [])] },
      select: { id: true, nome: true, tipo: true, data: true, recorrente: true, uf: true, cidade: true },
    }),
    prisma.clienteUsuario.findMany({
      where: { clienteId: vinculo.clienteId, ativo: true },
      select: { userId: true, user: { select: { email: true } } },
    }),
  ])

  const ufCliente = cliente?.uf?.trim().toUpperCase() ?? null
  const cidadeCliente = cliente?.cidade ? normalizar(cliente.cidade) : null

  const doMes = feriados.filter((f) => {
    const d = new Date(f.data)
    if (d.getUTCMonth() + 1 !== mes) return false
    if (!f.recorrente && d.getUTCFullYear() !== ano) return false
    // Municipal exige cidade (e UF, quando o cadastro trouxe): feriado de outra
    // cidade não vale aqui. Estadual exige a UF. Sem nenhum dos dois, é geral.
    if (f.cidade) {
      if (!cidadeCliente || normalizar(f.cidade) !== cidadeCliente) return false
      if (f.uf && ufCliente && f.uf.toUpperCase() !== ufCliente) return false
      return true
    }
    if (f.uf) return !!ufCliente && f.uf.toUpperCase() === ufCliente
    return true
  })

  const idsDeUsuarios = usuarios.map((u) => u.userId)
  const emails = usuarios.map((u) => u.user?.email).filter((e): e is string => !!e)

  // Sem ninguém para casar, não há evento "do cliente" — e um `OR` vazio no
  // Prisma devolveria a agenda inteira da empresa.
  const eventos = (idsDeUsuarios.length === 0 && emails.length === 0)
    ? []
    : await prisma.agendaEvento.findMany({
        where: {
          isActive: true,
          particular: false,
          ...(cliente?.empresaId ? { empresaId: cliente.empresaId } : {}),
          data: { gte: inicio, lte: fim },
          OR: [
            ...(idsDeUsuarios.length > 0
              ? [{ participantes: { some: { isActive: true, usuarioId: { in: idsDeUsuarios } } } }]
              : []),
            ...emails.flatMap((e) => ([
              { contato: { contains: e, mode: 'insensitive' as const } },
              { descricao: { contains: e, mode: 'insensitive' as const } },
            ])),
          ],
        },
        orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
        take: 200,
        select: {
          id: true, titulo: true, data: true, horaInicio: true, diaInteiro: true,
          local: true, presenca: true, tipo: { select: { nome: true } },
        },
      })

  return [
    ...doMes.map((f) => ({
      id: `feriado-${f.id}`,
      tipo: 'feriado' as const,
      titulo: f.nome,
      // Recorrente guarda o ano de referência; o que vale é o dia e o mês.
      data: `${ano}-${String(mes).padStart(2, '0')}-${String(new Date(f.data).getUTCDate()).padStart(2, '0')}`,
      hora: null,
      detalhe: AMBITO[f.tipo] ?? 'Feriado',
      situacao: null,
    })),
    ...eventos.map((e) => ({
      id: `evento-${e.id}`,
      tipo: 'evento' as const,
      titulo: e.titulo,
      data: diaEmUtc(e.data),
      hora: e.diaInteiro ? null : (e.horaInicio?.slice(0, 5) ?? null),
      detalhe: [e.tipo?.nome, e.local, e.presenca === 'ONLINE' ? 'Online' : null].filter(Boolean).join(' · ') || null,
      situacao: null,
    })),
  ]
}
