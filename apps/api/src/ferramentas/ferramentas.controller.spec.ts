import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { FerramentasController } from './ferramentas.controller'

// Fase 1 — passo 5 (TDD): controller REST (auth + permissão da área + multipart).
// @saas/db (prisma.userPermission, resolveTenantSchema) é mockado; sem DB/rede.

const dbMock = {
  prisma: { userPermission: { findMany: jest.fn() } },
  resolveTenantSchema: jest.fn(),
}
jest.mock('@saas/db', () => ({
  get prisma() {
    return dbMock.prisma
  },
  resolveTenantSchema: (...args: unknown[]) => dbMock.resolveTenantSchema(...args),
}))

// Evita carregar better-auth (ESM) no Jest — o controller só usa AuthService como token/tipo.
jest.mock('../auth/auth.service', () => ({ AuthService: class AuthService {} }))

function makeAuth(session: unknown) {
  return { auth: { api: { getSession: jest.fn().mockResolvedValue(session) } } }
}

function makeFile(over: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'a.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from('0000|...'),
    size: 8,
    ...over,
  } as Express.Multer.File
}

const SESSION = { user: { id: 'u1', empresaId: 'e1', isMaster: false, isEmpresaMaster: false, tenantId: 't1' } }

describe('FerramentasController', () => {
  let svc: { create: jest.Mock; refreshStatus: jest.Mock; getDownloadTarget: jest.Mock }
  let gateway: { streamDownload: jest.Mock; inspect: jest.Mock }
  let controller: FerramentasController

  beforeEach(() => {
    dbMock.prisma.userPermission.findMany.mockResolvedValue([
      { moduleSlug: 'ferramentas-fiscal', canRead: true, canWrite: true, canDelete: false, subPermissions: null },
    ])
    dbMock.resolveTenantSchema.mockResolvedValue('tenant_t1')
    svc = { create: jest.fn(), refreshStatus: jest.fn(), getDownloadTarget: jest.fn() }
    gateway = { streamDownload: jest.fn(), inspect: jest.fn() }
    controller = new FerramentasController(makeAuth(SESSION) as never, svc as never, gateway as never)
  })

  const req = () => ({ headers: { cookie: 'x' }, body: {}, tenantId: 't1' }) as never

  it('create: ferramenta desconhecida → 404', async () => {
    await expect(controller.create('inexistente', [makeFile()], req())).rejects.toBeInstanceOf(NotFoundException)
  })

  it('create: sem sessão → 401', async () => {
    controller = new FerramentasController(makeAuth(null) as never, svc as never, gateway as never)
    await expect(controller.create('sped', [makeFile()], req())).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('create: sem permissão na área → 403', async () => {
    dbMock.prisma.userPermission.findMany.mockResolvedValue([])
    await expect(controller.create('sped', [makeFile()], req())).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('create: sem arquivos → 400', async () => {
    await expect(controller.create('sped', [], req())).rejects.toBeInstanceOf(BadRequestException)
  })

  it('create: happy path delega ao service com contexto derivado e campos de texto', async () => {
    svc.create.mockResolvedValue({ id: 'job-1', tool: 'sped', status: 'queued' })
    const r = { headers: { cookie: 'x' }, body: { sheets: '["0150"]' }, tenantId: 't1' } as never

    const out = await controller.create('sped', [makeFile()], r)

    expect(out).toEqual({ id: 'job-1', tool: 'sped', status: 'queued' })
    const [input, isMaster, empresaId, userId, tenantSchema] = svc.create.mock.calls[0]
    expect(input.tool).toBe('sped')
    expect(input.fileNameIn).toBe('a.txt')
    expect(input.fields).toEqual({ sheets: '["0150"]' })
    expect(input.files[0]).toMatchObject({ field: 'file', filename: 'a.txt' })
    expect(isMaster).toBe(false)
    expect(empresaId).toBe('e1')
    expect(userId).toBe('u1')
    expect(tenantSchema).toBe('tenant_t1')
  })

  it('create: master ignora a checagem de permissão (não consulta userPermission)', async () => {
    controller = new FerramentasController(
      makeAuth({ user: { id: 'm1', isMaster: true } }) as never,
      svc as never,
      gateway as never,
    )
    svc.create.mockResolvedValue({ id: 'job-2' })
    await controller.create('sped', [makeFile()], req())
    expect(dbMock.prisma.userPermission.findMany).not.toHaveBeenCalled()
  })

  it('status: delega ao service.refreshStatus (permissão de leitura)', async () => {
    svc.refreshStatus.mockResolvedValue({ id: 'job-1', status: 'done' })
    const out = await controller.status('sped', 'job-1', req())
    expect(out).toEqual({ id: 'job-1', status: 'done' })
    expect(svc.refreshStatus).toHaveBeenCalledWith('job-1', false, 'e1', 'u1', 'tenant_t1')
  })

  it('download: resolve alvo, faz stream e seta Content-Disposition', async () => {
    svc.getDownloadTarget.mockResolvedValue({
      tool: 'sped',
      webappJobId: 'w1',
      token: 'tok',
      fileName: 'SPED Acme.xlsx',
    })
    const upstream = { body: {} }
    gateway.streamDownload.mockResolvedValue(upstream)
    const pipeSpy = jest
      .spyOn(controller as unknown as { pipeUpstream: () => void }, 'pipeUpstream')
      .mockImplementation(() => {})

    const res = { setHeader: jest.fn() } as never
    await controller.download('sped', 'job-1', req(), res)

    expect(svc.getDownloadTarget).toHaveBeenCalledWith('job-1', false, 'e1', 'tenant_t1')
    expect(gateway.streamDownload).toHaveBeenCalledWith('sped', 'w1', 'tok')
    const dispoCall = (res as unknown as { setHeader: jest.Mock }).setHeader.mock.calls.find(
      (c: unknown[]) => c[0] === 'Content-Disposition',
    )
    expect(dispoCall?.[1]).toContain("filename*=UTF-8''")
    expect(pipeSpy).toHaveBeenCalled()
  })

  it('inspect: delega ao gateway.inspect (SPED)', async () => {
    gateway.inspect.mockResolvedValue({ presentRegs: ['0000', '0150'] })
    const out = await controller.inspect('sped', [makeFile()], req())
    expect(out).toEqual({ presentRegs: ['0000', '0150'] })
    expect(gateway.inspect).toHaveBeenCalledWith('sped', expect.arrayContaining([expect.objectContaining({ field: 'file' })]))
  })
})
