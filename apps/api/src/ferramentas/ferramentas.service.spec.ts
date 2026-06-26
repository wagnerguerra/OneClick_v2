import { FerramentasService } from './ferramentas.service'

// Fase 1 — passo 4 (TDD): orquestra ToolJob (tenant-scoped) + gateway + eventos.
// @saas/db é mockado para não tocar no banco; o gateway é um duble.

const fakeDb = {
  toolJob: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
}

jest.mock('@saas/db', () => ({
  scoped: (_schema: unknown, fn: (db: unknown) => unknown) => fn(fakeDb),
  getPrismaSkipTake: (page: number, limit: number) => ({ skip: (page - 1) * limit, take: limit }),
  buildPaginatedResponse: (data: unknown[], total: number, page: number, limit: number) => ({
    data,
    total,
    page,
    limit,
  }),
}))

function makeGateway() {
  return {
    createJob: jest.fn(),
    getStatus: jest.fn(),
    streamDownload: jest.fn(),
    downloadUrl: jest.fn(),
  }
}

describe('FerramentasService', () => {
  let gateway: ReturnType<typeof makeGateway>
  let service: FerramentasService

  beforeEach(() => {
    gateway = makeGateway()
    service = new FerramentasService(gateway as never)
  })

  const files = [{ field: 'file', filename: 'a.txt', content: Buffer.from('x') }]

  it('create: grava ToolJob queued com evento "created", chama o gateway e guarda o webappJobId', async () => {
    fakeDb.toolJob.create.mockResolvedValue({ id: 'job-1', tool: 'sped', status: 'queued', version: 1 })
    gateway.createJob.mockResolvedValue({ id: 'webapp-1', status: 'queued' })
    fakeDb.toolJob.update.mockResolvedValue({ id: 'job-1', webappJobId: 'webapp-1', status: 'queued' })

    const out = await service.create(
      { tool: 'sped', files, fields: { sheets: '["0150"]' }, fileNameIn: 'a.txt' },
      false,
      'emp-1',
      'user-1',
      'tenant_x',
    )

    const createData = fakeDb.toolJob.create.mock.calls[0][0].data
    expect(createData.tool).toBe('sped')
    expect(createData.status).toBe('queued')
    expect(createData.empresaId).toBe('emp-1')
    expect(createData.eventos.create.type).toBe('created')
    expect(gateway.createJob).toHaveBeenCalledWith('sped', files, { sheets: '["0150"]' })
    expect(fakeDb.toolJob.update.mock.calls[0][0].data.webappJobId).toBe('webapp-1')
    expect(out.webappJobId).toBe('webapp-1')
  })

  it('create: se o gateway falha, marca o ToolJob como failed (evento status-change) e propaga o erro', async () => {
    fakeDb.toolJob.create.mockResolvedValue({ id: 'job-1', tool: 'sped', status: 'queued', version: 1 })
    gateway.createJob.mockRejectedValue(new Error('HTTP 503 Redis'))
    fakeDb.toolJob.update.mockResolvedValue({})

    await expect(
      service.create({ tool: 'sped', files, fileNameIn: 'a.txt' }, false, 'emp-1', 'user-1', 'tenant_x'),
    ).rejects.toThrow(/503/)

    const failData = fakeDb.toolJob.update.mock.calls[0][0].data
    expect(failData.status).toBe('failed')
    expect(failData.eventos.create.type).toBe('status-change')
  })

  it('list: filtra deletedAt:null + empresa do usuário (não-master) e aplica filtro de tool', async () => {
    fakeDb.toolJob.findMany.mockResolvedValue([])
    fakeDb.toolJob.count.mockResolvedValue(0)

    await service.list({ page: 1, limit: 20, sortDir: 'asc', tool: 'sped' }, false, 'emp-1', 'tenant_x')

    const where = fakeDb.toolJob.findMany.mock.calls[0][0].where
    expect(where.deletedAt).toBeNull()
    expect(where.empresaId).toBe('emp-1')
    expect(where.tool).toBe('sped')
  })

  it('list: master vê todas as empresas (sem filtro de empresaId)', async () => {
    fakeDb.toolJob.findMany.mockResolvedValue([])
    fakeDb.toolJob.count.mockResolvedValue(0)

    await service.list({ page: 1, limit: 20, sortDir: 'asc' }, true, undefined, 'tenant_x')

    const where = fakeDb.toolJob.findMany.mock.calls[0][0].where
    expect(where.empresaId).toBeUndefined()
    expect(where.deletedAt).toBeNull()
  })

  it('refreshStatus: quando o status muda, atualiza e grava evento "status-change"', async () => {
    fakeDb.toolJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      tool: 'sped',
      status: 'running',
      progress: 40,
      version: 1,
      empresaId: 'emp-1',
      webappJobId: 'webapp-1',
      fileNameOut: null,
    })
    gateway.getStatus.mockResolvedValue({ id: 'webapp-1', status: 'done', progress: 100, fileName: 'SPED.xlsx' })
    fakeDb.toolJob.update.mockResolvedValue({ id: 'job-1', status: 'done' })

    await service.refreshStatus('job-1', false, 'emp-1', 'user-1', 'tenant_x')

    expect(gateway.getStatus).toHaveBeenCalledWith('sped', 'webapp-1')
    const data = fakeDb.toolJob.update.mock.calls[0][0].data
    expect(data.status).toBe('done')
    expect(data.fileNameOut).toBe('SPED.xlsx')
    expect(data.eventos.create.type).toBe('status-change')
  })

  it('refreshStatus: sem mudança de status não grava evento nem update', async () => {
    fakeDb.toolJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      tool: 'sped',
      status: 'running',
      progress: 40,
      version: 1,
      empresaId: 'emp-1',
      webappJobId: 'webapp-1',
      fileNameOut: null,
    })
    gateway.getStatus.mockResolvedValue({ id: 'webapp-1', status: 'running', progress: 40 })

    await service.refreshStatus('job-1', false, 'emp-1', 'user-1', 'tenant_x')

    expect(fakeDb.toolJob.update).not.toHaveBeenCalled()
  })

  it('isolamento por tenant: nega acesso a job de outra empresa (não-master)', async () => {
    fakeDb.toolJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      tool: 'sped',
      status: 'done',
      empresaId: 'OUTRA-emp',
      webappJobId: 'webapp-1',
    })

    await expect(service.refreshStatus('job-1', false, 'emp-1', 'user-1', 'tenant_x')).rejects.toThrow(
      /negado/i,
    )
    expect(gateway.getStatus).not.toHaveBeenCalled()
  })

  it('delete: soft-delete com evento "deleted"', async () => {
    fakeDb.toolJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      tool: 'sped',
      empresaId: 'emp-1',
      version: 2,
    })
    fakeDb.toolJob.update.mockResolvedValue({ id: 'job-1', deletedAt: new Date() })

    await service.delete('job-1', false, 'emp-1', 'user-1', 'tenant_x')

    const data = fakeDb.toolJob.update.mock.calls[0][0].data
    expect(data.deletedAt).toBeInstanceOf(Date)
    expect(data.eventos.create.type).toBe('deleted')
  })
})
