import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { ExtratoEditController } from './extrato-edit.controller'

const dbMock = { prisma: { userPermission: { findMany: jest.fn() } } }
jest.mock('@saas/db', () => ({
  get prisma() {
    return dbMock.prisma
  },
}))
jest.mock('../auth/auth.service', () => ({ AuthService: class AuthService {} }))

function makeAuth(session: unknown) {
  return { auth: { api: { getSession: jest.fn().mockResolvedValue(session) } } }
}
const SESSION = { user: { id: 'u1', isMaster: false, isEmpresaMaster: false } }
const req = () => ({ headers: { cookie: 'x' } }) as never

describe('ExtratoEditController (proxy do cadastro)', () => {
  let gateway: { extratoEditRequest: jest.Mock }
  let controller: ExtratoEditController

  beforeEach(() => {
    dbMock.prisma.userPermission.findMany.mockResolvedValue([
      { moduleSlug: 'ferramentas-contabil', canRead: true, canWrite: true },
    ])
    gateway = { extratoEditRequest: jest.fn().mockResolvedValue({ ok: true }) }
    controller = new ExtratoEditController(makeAuth(SESSION) as never, gateway as never)
  })

  it('list: repassa GET entidades com query (permissão de leitura)', async () => {
    await controller.list('acme', 'cliente', '10', '0', req())
    expect(gateway.extratoEditRequest).toHaveBeenCalledWith('GET', 'entidades', {
      query: { q: 'acme', tipo: 'cliente', limit: '10', offset: '0' },
    })
  })

  it('import: repassa POST entidades/import com o corpo (permissão de escrita)', async () => {
    const body = { tipo: 'cliente', rows: [] }
    await controller.import(body, req())
    expect(gateway.extratoEditRequest).toHaveBeenCalledWith('POST', 'entidades/import', { body })
  })

  it('sem sessão → 401', async () => {
    controller = new ExtratoEditController(makeAuth(null) as never, gateway as never)
    await expect(controller.counts(req())).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('sem permissão contábil → 403', async () => {
    dbMock.prisma.userPermission.findMany.mockResolvedValue([])
    await expect(controller.counts(req())).rejects.toBeInstanceOf(ForbiddenException)
    expect(gateway.extratoEditRequest).not.toHaveBeenCalled()
  })

  it('master ignora checagem de permissão', async () => {
    controller = new ExtratoEditController(makeAuth({ user: { id: 'm', isMaster: true } }) as never, gateway as never)
    await controller.counts(req())
    expect(dbMock.prisma.userPermission.findMany).not.toHaveBeenCalled()
    expect(gateway.extratoEditRequest).toHaveBeenCalledWith('GET', 'entidades/counts')
  })
})
