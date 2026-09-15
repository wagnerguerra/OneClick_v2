/**
 * O módulo Usuários é a equipe do escritório.
 *
 * O colaborador de cliente mora na mesma tabela, mas é gerido no cadastro do
 * cliente. Estes testes prendem a trava no servidor: sem ela, a tela deixaria
 * de mostrá-lo, mas quem soubesse o id ainda o abriria, editaria ou promoveria
 * a master chamando a rota direto.
 */

const user = {
  findMany: jest.fn(), count: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
}
jest.mock('@saas/db', () => ({
  prisma: { user, session: { deleteMany: jest.fn() }, $transaction: jest.fn() },
  buildPaginatedResponse: (data: unknown[], total: number) => ({ data, total }),
  getPrismaSkipTake: () => ({ skip: 0, take: 20 }),
}))
jest.mock('better-auth/crypto', () => ({ hashPassword: jest.fn(), verifyPassword: jest.fn() }))
jest.mock('../trpc/trpc.service', () => ({ invalidateUserPermissionsCache: jest.fn() }))

import { UserService } from './user.service'
import type { PermissionsEventsService } from '../permissions-events/permissions-events.service'

const svc = new UserService({ emit: jest.fn() } as unknown as PermissionsEventsService)

const listar = (extra: Record<string, unknown> = {}) =>
  svc.list({ page: 1, limit: 20, sortDir: 'asc', ...extra } as never, false, 'emp-1')

beforeEach(() => {
  jest.clearAllMocks()
  user.findMany.mockResolvedValue([])
  user.count.mockResolvedValue(0)
})

describe('listagem', () => {
  it('sem tipo, lista só a equipe do escritório', async () => {
    await listar()
    const where = user.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({ role: { not: 'COLABORADOR_CLIENTE' } })
  })

  it('o filtro de papel não apaga a trava — pedir "colaborador de cliente" sem tipo não traz ninguém', async () => {
    await listar({ role: 'COLABORADOR_CLIENTE' })
    const where = user.findMany.mock.calls[0][0].where
    expect(where.role).toBe('COLABORADOR_CLIENTE')
    expect(where.AND).toContainEqual({ role: { not: 'COLABORADOR_CLIENTE' } })
  })

  it('a aba de clientes do tenant continua pedindo os de clientes explicitamente', async () => {
    await listar({ tipo: 'clientes' })
    const where = user.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({ role: 'COLABORADOR_CLIENTE' })
    expect(where.AND).toContainEqual({ empresaId: 'emp-1' })
  })

  it('a busca por nome segue valendo junto do recorte de empresa', async () => {
    await listar({ search: 'ana' })
    const where = user.findMany.mock.calls[0][0].where
    expect(where.OR).toHaveLength(2)
    expect(where.AND).toContainEqual({ OR: [{ empresaId: 'emp-1' }, { empresaId: null }] })
  })
})

describe('colaborador de cliente não é aberto nem alterado pelo módulo', () => {
  const deCliente = { id: 'c-1', name: 'Pessoa do Cliente', role: 'COLABORADOR_CLIENTE', isMaster: false, isActive: true, empresaId: 'emp-1' }

  it('getById recusa', async () => {
    user.findUniqueOrThrow.mockResolvedValue(deCliente)
    await expect(svc.getById('c-1', true)).rejects.toThrow(/cadastro do cliente/)
  })

  it('create recusa o papel', async () => {
    await expect(svc.create({ name: 'X', email: 'x@x.com', role: 'COLABORADOR_CLIENTE' } as never)).rejects.toThrow(/cadastro do cliente/)
  })

  it('delete recusa', async () => {
    user.findUniqueOrThrow.mockResolvedValue(deCliente)
    await expect(svc.delete('c-1', 'eu')).rejects.toThrow(/cadastro do cliente/)
    expect(user.update).not.toHaveBeenCalled()
  })

  it('toggleMaster recusa', async () => {
    user.findUniqueOrThrow.mockResolvedValue(deCliente)
    await expect(svc.toggleMaster('c-1', 'eu', true)).rejects.toThrow(/cadastro do cliente/)
    expect(user.update).not.toHaveBeenCalled()
  })

  it('exclusão em lote pula, dizendo o motivo', async () => {
    user.findMany.mockResolvedValue([deCliente])
    const r = await svc.deleteBulk(['c-1'], 'eu')
    expect(r.desativados).toBe(0)
    expect(r.pulados[0]!.motivo).toMatch(/cadastro do cliente/)
  })

  it('permissões recusam', async () => {
    user.count.mockResolvedValue(1)
    await expect(svc.updatePermissions('c-1', [])).rejects.toThrow(/cadastro do cliente/)
  })
})

describe('selects e exportação', () => {
  it('select de colaboradores não oferece colaborador de cliente', async () => {
    await svc.listForSelect(false, 'emp-1')
    expect(user.findMany.mock.calls[0][0].where.role).toEqual({ not: 'COLABORADOR_CLIENTE' })
  })

  it('exportação sai só com a equipe', async () => {
    await svc.exportAll(false, 'emp-1')
    expect(user.findMany.mock.calls[0][0].where.role).toEqual({ not: 'COLABORADOR_CLIENTE' })
  })
})
