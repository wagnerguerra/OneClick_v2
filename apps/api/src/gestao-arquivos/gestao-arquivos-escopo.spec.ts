/**
 * Escopo da Gestão de Arquivos.
 *
 * É a regra que decide se uma pessoa enxerga a folha de pagamento de um cliente
 * que não é dela. Errar aqui não é bug de tela: é salário de terceiro visível
 * para quem não deveria, dentro do próprio escritório.
 */

const clienteAreaContratada = { findMany: jest.fn() }

jest.mock('@saas/db', () => ({ prisma: { clienteAreaContratada } }))

import {
  resolverEscopo,
  filtroDeCliente,
  alcancaCliente,
  clienteDaEmpresa,
} from './gestao-arquivos-escopo'

const colaborador = { userId: 'u1', role: 'COLABORADOR_INTERNO', isMaster: false, empresaId: 'emp-1' }

beforeEach(() => {
  jest.clearAllMocks()
  clienteAreaContratada.findMany.mockResolvedValue([{ clienteId: 'cli-1' }, { clienteId: 'cli-2' }])
})

describe('resolverEscopo', () => {
  it('master global vê tudo, sem nem consultar áreas', async () => {
    await expect(resolverEscopo({ ...colaborador, isMaster: true })).resolves.toEqual({ tudo: true })
    expect(clienteAreaContratada.findMany).not.toHaveBeenCalled()
  })

  it.each(['GESTOR', 'COORDENADOR', 'DIRETOR'])('%s vê todos os clientes', async role => {
    await expect(resolverEscopo({ ...colaborador, role })).resolves.toEqual({ tudo: true })
  })

  it('dono do tenant (isEmpresaMaster) vê todos os clientes da empresa dele', async () => {
    // Sem isto ele cairia na regra do colaborador e só enxergaria os clientes
    // em que por acaso é responsável de área — ficaria sem ver o próprio
    // escritório.
    await expect(resolverEscopo({ ...colaborador, isEmpresaMaster: true }))
      .resolves.toEqual({ tudo: true })
    expect(clienteAreaContratada.findMany).not.toHaveBeenCalled()
  })

  it('mas "tudo" do dono do tenant continua preso à empresa dele', () => {
    // "tudo" nunca significa "todos os tenants" para quem não é master global.
    expect(filtroDeCliente({ tudo: true }, { ...colaborador, isEmpresaMaster: true }))
      .toEqual({ empresaId: 'emp-1' })
  })

  it('GESTOR entra aqui, ao contrário de /orcamentos', async () => {
    // Registrado porque a divergência é deliberada e parece erro: em orçamentos
    // o gestor NÃO vê tudo (o foco dele é serviço em execução). Aqui o pedido
    // foi explícito. Se alguém "unificar" as duas listas, quebra uma das duas.
    await expect(resolverEscopo({ ...colaborador, role: 'GESTOR' })).resolves.toEqual({ tudo: true })
  })

  it('colaborador comum fica restrito aos clientes que responde', async () => {
    await expect(resolverEscopo(colaborador)).resolves.toEqual({
      tudo: false,
      clienteIds: ['cli-1', 'cli-2'],
    })
  })

  it('conta responsável E substituto — férias não podem cegar quem cobre', async () => {
    await resolverEscopo(colaborador)
    const w = clienteAreaContratada.findMany.mock.calls[0]![0].where
    expect(w.OR).toEqual([{ responsavelId: 'u1' }, { substitutoId: 'u1' }])
  })

  it('ignora área encerrada e não contratada', async () => {
    await resolverEscopo(colaborador)
    const w = clienteAreaContratada.findMany.mock.calls[0]![0].where
    expect(w.contratado).toBe(true)
    expect(w.dataEncerramento).toBeNull()
  })

  it('a busca por áreas já é recortada por empresa', async () => {
    // Sem isto, ser responsável num tenant daria acesso a um cliente de outro.
    await resolverEscopo(colaborador)
    const w = clienteAreaContratada.findMany.mock.calls[0]![0].where
    expect(w.cliente).toEqual({ empresaId: 'emp-1' })
  })
})

describe('filtroDeCliente', () => {
  it('colaborador SEM área nenhuma não vê nada — e não vê tudo', async () => {
    // O erro clássico: lista vazia vira "sem filtro" e devolve a empresa
    // inteira. `id: { in: [] }` devolve zero linhas, que é o correto.
    clienteAreaContratada.findMany.mockResolvedValue([])
    const escopo = await resolverEscopo(colaborador)
    expect(filtroDeCliente(escopo, colaborador)).toEqual({ empresaId: 'emp-1', id: { in: [] } })
  })

  it('restringe à lista, mantendo o recorte por empresa', async () => {
    const escopo = await resolverEscopo(colaborador)
    expect(filtroDeCliente(escopo, colaborador)).toEqual({
      empresaId: 'emp-1',
      id: { in: ['cli-1', 'cli-2'] },
    })
  })

  it('quem vê tudo ainda fica preso à própria empresa', () => {
    expect(filtroDeCliente({ tudo: true }, { ...colaborador, role: 'DIRETOR' }))
      .toEqual({ empresaId: 'emp-1' })
  })
})

describe('alcancaCliente', () => {
  it('recusa cliente fora da lista', () => {
    expect(alcancaCliente({ tudo: false, clienteIds: ['cli-1'] }, 'cli-9')).toBe(false)
  })

  it('aceita o que está na lista', () => {
    expect(alcancaCliente({ tudo: false, clienteIds: ['cli-1'] }, 'cli-1')).toBe(true)
  })

  it('quem vê tudo alcança qualquer um', () => {
    expect(alcancaCliente({ tudo: true }, 'cli-9')).toBe(true)
  })
})

describe('clienteDaEmpresa', () => {
  it('sem empresa e sem master, não devolve nada', () => {
    expect(clienteDaEmpresa(false, null)).toEqual({ empresaId: '__none__' })
  })

  it('master sem empresa enxerga todas', () => {
    expect(clienteDaEmpresa(true, null)).toEqual({})
  })
})
