import { WebappGatewayService } from './webapp-gateway.service'

// Fase 1 — passo 3 (TDD): cliente HTTP server-to-server para a API Fastify do webapp.
// fetch é mockado; validamos URL, método, corpo (FormData) e mapeamento de erro.

const WEBAPP = 'http://webapp.test:8000'

function okJson(body: unknown, status = 200) {
  return {
    ok: true,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

function errResponse(status: number, body = 'erro do webapp') {
  return {
    ok: false,
    status,
    json: async () => ({ error: body }),
    text: async () => body,
  } as unknown as Response
}

describe('WebappGatewayService', () => {
  let service: WebappGatewayService
  let fetchMock: jest.Mock

  beforeEach(() => {
    process.env.WEBAPP_API_URL = WEBAPP
    service = new WebappGatewayService()
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    delete process.env.WEBAPP_API_URL
  })

  it('createJob(sped) faz POST multipart para /api/v1/tools/sped/jobs com arquivo + campos', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'job-1', status: 'queued' }, 202))

    const res = await service.createJob(
      'sped',
      [{ field: 'file', filename: 'arquivo.txt', content: Buffer.from('0000|...'), contentType: 'text/plain' }],
      { sheets: '["0150","0200"]', presentRegs: '["0000"]' },
    )

    expect(res).toEqual({ id: 'job-1', status: 'queued' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${WEBAPP}/api/v1/tools/sped/jobs`)
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    const form = init.body as FormData
    expect(form.get('sheets')).toBe('["0150","0200"]')
    expect(form.get('presentRegs')).toBe('["0000"]')
    expect(form.get('file')).toBeInstanceOf(Blob)
  })

  it('createJob(nfe) usa a rota genérica /api/v1/jobs (sem /tools/)', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'n1', status: 'queued' }, 202))

    await service.createJob('nfe', [
      { field: 'arquivos', filename: 'nota.xml', content: Buffer.from('<nfe/>'), contentType: 'text/xml' },
    ])

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe(`${WEBAPP}/api/v1/jobs`)
  })

  it('getStatus(sped) faz GET no job e repassa downloadToken/fileName', async () => {
    fetchMock.mockResolvedValue(
      okJson({ id: 'job-1', status: 'done', progress: 100, downloadToken: 'jwt.abc', fileName: 'SPED_X.xlsx' }),
    )

    const status = await service.getStatus('sped', 'job-1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${WEBAPP}/api/v1/tools/sped/jobs/job-1`)
    expect(init?.method ?? 'GET').toBe('GET')
    expect(status.status).toBe('done')
    expect(status.downloadToken).toBe('jwt.abc')
    expect(status.fileName).toBe('SPED_X.xlsx')
  })

  it('downloadUrl(sped) aponta para a rota de download da ferramenta com o token', () => {
    const url = service.downloadUrl('sped', 'job-1', 'jwt with space')
    expect(url).toBe(`${WEBAPP}/api/v1/tools/sped/jobs/job-1/download?token=jwt%20with%20space`)
  })

  it('streamDownload retorna a Response (stream) para o controller repassar', async () => {
    const fakeStream = okJson({}, 200)
    fetchMock.mockResolvedValue(fakeStream)
    const res = await service.streamDownload('sped', 'job-1', 'jwt.abc')
    expect(res).toBe(fakeStream)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe(`${WEBAPP}/api/v1/tools/sped/jobs/job-1/download?token=jwt.abc`)
  })

  it('mapeia erro HTTP (4xx/5xx) em Error com status e corpo', async () => {
    fetchMock.mockResolvedValue(errResponse(413, 'Arquivo SPED muito grande'))
    await expect(
      service.createJob('sped', [{ field: 'file', filename: 'big.txt', content: Buffer.from('x') }]),
    ).rejects.toThrow(/413/)
  })

  it('createJob(comparacao-nfse) faz o fluxo multi-step init → chunk → start', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ id: 'nfse-1' }, 201)) // init
      .mockResolvedValueOnce(okJson({ ok: true, savedPdfs: 1, savedXmls: 1 })) // chunk
      .mockResolvedValueOnce(okJson({ id: 'nfse-1', status: 'queued' }, 202)) // start

    const res = await service.createJob('comparacao-nfse', [
      { field: 'pdfs', filename: 'nota.pdf', content: Buffer.from('%PDF') },
      { field: 'xmls', filename: 'nota.xml', content: Buffer.from('<nfse/>') },
    ])

    expect(res).toEqual({ id: 'nfse-1', status: 'queued' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][0]).toBe(`${WEBAPP}/api/v1/tools/comparacao-nfse/jobs`)
    expect(fetchMock.mock.calls[1][0]).toBe(`${WEBAPP}/api/v1/tools/comparacao-nfse/jobs/nfse-1/chunk`)
    expect((fetchMock.mock.calls[1][1].body as FormData).get('pdfs')).toBeInstanceOf(Blob)
    expect(fetchMock.mock.calls[2][0]).toBe(`${WEBAPP}/api/v1/tools/comparacao-nfse/jobs/nfse-1/start`)
  })

  it('usa o default http://192.168.0.47:8000 quando WEBAPP_API_URL não está setado', async () => {
    delete process.env.WEBAPP_API_URL
    const svc = new WebappGatewayService()
    fetchMock.mockResolvedValue(okJson({ id: 'g', status: 'queued' }, 202))
    await svc.createJob('gnre', [{ field: 'pdfs', filename: 'g.pdf', content: Buffer.from('%PDF') }])
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://192.168.0.47:8000/api/v1/tools/gnre/jobs')
  })
})
