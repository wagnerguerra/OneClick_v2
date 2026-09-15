/**
 * Desligar um tenant.
 *
 * As travas que estes testes prendem: a empresa nunca é apagada; quem a
 * desativação desligou fica gravado, para que a reativação devolva o acesso
 * exatamente a essas pessoas — e não a quem já era inativo antes.
 */

const empresa = { findUniqueOrThrow: jest.fn(), update: jest.fn(), delete: jest.fn() }
const empresaEvent = { create: jest.fn(), findFirst: jest.fn() }
const user = { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() }
const session = { deleteMany: jest.fn() }
const tx = { empresa, empresaEvent, user, session }

jest.mock('@saas/db', () => ({
  prisma: { ...tx, $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
  buildPaginatedResponse: jest.fn(),
  getPrismaSkipTake: jest.fn(),
}))

const invalidar = jest.fn()
jest.mock('../trpc/session-cache', () => ({ invalidateSessionCacheForUser: (id: string) => invalidar(id) }))

import { EmpresaService } from './empresa.service'

const svc = new EmpresaService()

beforeEach(() => {
  jest.clearAllMocks()
  user.findUnique.mockResolvedValue({ empresaId: 'emp-master' })
  empresa.findUniqueOrThrow.mockResolvedValue({ id: 'emp-1', isActive: true, version: 3 })
  user.findMany.mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }])
  user.updateMany.mockResolvedValue({ count: 2 })
})

describe('desativar', () => {
  it('não apaga a empresa: inativa, desliga os usuários e derruba as sessões', async () => {
    const r = await svc.desativar('emp-1', 'master')

    expect(empresa.delete).not.toHaveBeenCalled()
    expect(empresa.update).toHaveBeenCalledWith({ where: { id: 'emp-1' }, data: { isActive: false, version: 4 } })
    expect(user.findMany.mock.calls[0][0].where).toEqual({ empresaId: 'emp-1', isActive: true, isMaster: false })
    expect(user.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['u-1', 'u-2'] } }, data: { isActive: false } })
    expect(session.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: ['u-1', 'u-2'] } } })
    expect(invalidar.mock.calls.map((c) => c[0])).toEqual(['u-1', 'u-2'])
    expect(r).toEqual({ jaInativa: false, usuariosDesativados: 2 })
  })

  it('grava no evento quem foi desligado', async () => {
    await svc.desativar('emp-1', 'master')
    const evento = empresaEvent.create.mock.calls[0][0].data
    expect(evento.type).toBe('deactivated')
    expect(evento.changes.usuariosDesativados).toEqual(['u-1', 'u-2'])
  })

  it('recusa inativar a empresa de quem está operando', async () => {
    user.findUnique.mockResolvedValue({ empresaId: 'emp-1' })
    await expect(svc.desativar('emp-1', 'master')).rejects.toThrow(/pertence/)
    expect(empresa.update).not.toHaveBeenCalled()
  })

  it('empresa já inativa não gera evento nem mexe em usuário', async () => {
    empresa.findUniqueOrThrow.mockResolvedValue({ id: 'emp-1', isActive: false, version: 3 })
    const r = await svc.desativar('emp-1', 'master')
    expect(r.jaInativa).toBe(true)
    expect(user.updateMany).not.toHaveBeenCalled()
    expect(empresaEvent.create).not.toHaveBeenCalled()
  })
})

describe('reativar', () => {
  beforeEach(() => {
    empresa.findUniqueOrThrow.mockResolvedValue({ id: 'emp-1', isActive: false, version: 4 })
    empresaEvent.findFirst.mockResolvedValue({ changes: { usuariosDesativados: ['u-1', 'u-2'] } })
  })

  it('devolve o acesso só a quem a desativação desligou, e que segue na empresa', async () => {
    const r = await svc.reativar('emp-1', 'master')
    expect(user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['u-1', 'u-2'] }, empresaId: 'emp-1', isActive: false },
      data: { isActive: true },
    })
    expect(empresa.update).toHaveBeenCalledWith({ where: { id: 'emp-1' }, data: { isActive: true, version: 5 } })
    expect(r).toEqual({ jaAtiva: false, usuariosReativados: 2 })
  })

  it('sem evento de desativação, religa só a empresa', async () => {
    empresaEvent.findFirst.mockResolvedValue(null)
    const r = await svc.reativar('emp-1', 'master')
    expect(user.updateMany).not.toHaveBeenCalled()
    expect(r.usuariosReativados).toBe(0)
  })
})

describe('update', () => {
  it('não muda o status: salvar o form de uma empresa inativa não a religa', async () => {
    const updateTx = { empresa: { findUniqueOrThrow: jest.fn().mockResolvedValue({ version: 1, isActive: false }), update: jest.fn() }, empresaEvent }
    const db = jest.requireMock('@saas/db') as { prisma: { $transaction: unknown } }
    const original = db.prisma.$transaction
    db.prisma.$transaction = (fn: (t: typeof updateTx) => unknown) => fn(updateTx)
    try {
      await svc.update('emp-1', { isActive: true, razaoSocial: 'X' } as never, 'master')
      expect(updateTx.empresa.update.mock.calls[0][0].data).not.toHaveProperty('isActive')
    } finally {
      db.prisma.$transaction = original
    }
  })
})
