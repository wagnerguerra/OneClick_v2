const clienteFindUnique = jest.fn()
const feriadoFindMany = jest.fn()
const clienteUsuarioFindMany = jest.fn()
const eventoFindMany = jest.fn()
jest.mock('@saas/db', () => ({
  prisma: {
    cliente: { findUnique: (...a: unknown[]) => clienteFindUnique(...a) },
    feriado: { findMany: (...a: unknown[]) => feriadoFindMany(...a) },
    clienteUsuario: { findMany: (...a: unknown[]) => clienteUsuarioFindMany(...a) },
    agendaEvento: { findMany: (...a: unknown[]) => eventoFindMany(...a) },
  },
}))

import { itensDoCalendario } from './portal-calendario'
import type { VinculoPortal } from './portal-escopo'

/**
 * Calendário do portal. O que estes testes prendem: o cliente vê os feriados
 * que valem para a cidade dele e SÓ os eventos em que ele aparece — nunca a
 * agenda do escritório.
 */

const vinculo = { clienteId: 'cli-1' } as unknown as VinculoPortal

const feriado = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'f1', nome: 'Feriado', tipo: 'NACIONAL', data: new Date(Date.UTC(2020, 8, 7)),
  recorrente: true, uf: null, cidade: null, ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  clienteFindUnique.mockResolvedValue({ empresaId: 'emp-1', uf: 'ES', cidade: 'Vitória' })
  feriadoFindMany.mockResolvedValue([])
  clienteUsuarioFindMany.mockResolvedValue([{ userId: 'u-1', user: { email: 'maria@cliente.com' } }])
  eventoFindMany.mockResolvedValue([])
})

describe('feriados', () => {
  it('nacional recorrente entra pelo dia e mês, com o ano pedido', async () => {
    feriadoFindMany.mockResolvedValue([feriado()])
    const itens = await itensDoCalendario(vinculo, 2026, 9)
    expect(itens[0]).toMatchObject({ tipo: 'feriado', data: '2026-09-07', detalhe: 'Feriado nacional' })
  })

  it('municipal de outra cidade não vale para este cliente', async () => {
    feriadoFindMany.mockResolvedValue([
      feriado({ id: 'f2', nome: 'Aniversário de Vila Velha', tipo: 'MUNICIPAL', uf: 'ES', cidade: 'Vila Velha' }),
    ])
    expect(await itensDoCalendario(vinculo, 2026, 9)).toEqual([])
  })

  it('estadual entra quando a UF bate', async () => {
    feriadoFindMany.mockResolvedValue([feriado({ id: 'f3', tipo: 'ESTADUAL', uf: 'ES' })])
    expect(await itensDoCalendario(vinculo, 2026, 9)).toHaveLength(1)
  })

  it('não recorrente só vale no ano dele', async () => {
    feriadoFindMany.mockResolvedValue([
      feriado({ id: 'f4', recorrente: false, data: new Date(Date.UTC(2025, 8, 9)) }),
    ])
    expect(await itensDoCalendario(vinculo, 2026, 9)).toEqual([])
    expect(await itensDoCalendario(vinculo, 2025, 9)).toHaveLength(1)
  })

  it('pede só os feriados globais e os da empresa do cliente', async () => {
    await itensDoCalendario(vinculo, 2026, 9)
    expect(feriadoFindMany.mock.calls[0][0].where.OR).toEqual([{ empresaId: null }, { empresaId: 'emp-1' }])
  })
})

describe('eventos da agenda', () => {
  it('só entram eventos ativos, não particulares, da empresa e do mês', async () => {
    await itensDoCalendario(vinculo, 2026, 9)
    const where = eventoFindMany.mock.calls[0][0].where
    expect(where.isActive).toBe(true)
    expect(where.particular).toBe(false)
    expect(where.empresaId).toBe('emp-1')
    expect(where.data.gte.toISOString()).toContain('2026-09-01')
    expect(where.data.lte.toISOString()).toContain('2026-09-30')
  })

  it('casa por participante do portal ou pelo e-mail citado no evento', async () => {
    await itensDoCalendario(vinculo, 2026, 9)
    const or = eventoFindMany.mock.calls[0][0].where.OR
    expect(or[0]).toEqual({ participantes: { some: { isActive: true, usuarioId: { in: ['u-1'] } } } })
    expect(or).toContainEqual({ contato: { contains: 'maria@cliente.com', mode: 'insensitive' } })
    expect(or).toContainEqual({ descricao: { contains: 'maria@cliente.com', mode: 'insensitive' } })
  })

  it('cliente sem usuário de portal não vê evento nenhum — nem consulta', async () => {
    clienteUsuarioFindMany.mockResolvedValue([])
    expect(await itensDoCalendario(vinculo, 2026, 9)).toEqual([])
    expect(eventoFindMany).not.toHaveBeenCalled()
  })

  it('evento de dia inteiro não mostra hora; com hora, mostra HH:MM', async () => {
    eventoFindMany.mockResolvedValue([
      { id: 'e1', titulo: 'Reunião', data: new Date(Date.UTC(2026, 8, 10)), horaInicio: '14:30:00', diaInteiro: false, local: 'Sala 2', presenca: 'PRESENCIAL', tipo: { nome: 'Reunião' } },
      { id: 'e2', titulo: 'Fechamento', data: new Date(Date.UTC(2026, 8, 30)), horaInicio: null, diaInteiro: true, local: null, presenca: 'ONLINE', tipo: { nome: 'Interno' } },
    ])
    const itens = await itensDoCalendario(vinculo, 2026, 9)
    expect(itens[0]).toMatchObject({ tipo: 'evento', data: '2026-09-10', hora: '14:30', detalhe: 'Reunião · Sala 2' })
    expect(itens[1]).toMatchObject({ data: '2026-09-30', hora: null, detalhe: 'Interno · Online' })
  })
})
