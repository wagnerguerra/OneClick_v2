import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createToolJob, getToolJobStatus, toolJobDownloadUrl, inspectSped } from './ferramentas-api'

// Fase 1 — passo 8 (TDD): camada de cliente do front p/ as rotas REST das ferramentas.
vi.mock('@/lib/api-url', () => ({ getApiUrl: () => 'http://api.test:8050' }))

function okJson(body: unknown, status = 200) {
  return { ok: true, status, json: async () => body } as unknown as Response
}
function errJson(status: number, body: unknown) {
  return { ok: false, status, json: async () => body } as unknown as Response
}

describe('ferramentas-api (cliente do front)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('createToolJob faz POST multipart com credentials e devolve o job', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'job-1', status: 'queued' }, 202))
    const file = new File(['0000|...'], 'arquivo.txt', { type: 'text/plain' })

    const res = await createToolJob('sped', file, { sheets: '["0150"]' })

    expect(res).toEqual({ id: 'job-1', status: 'queued' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test:8050/api/tools/sped/jobs')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('file')).toBeInstanceOf(File)
    expect((init.body as FormData).get('sheets')).toBe('["0150"]')
  })

  it('getToolJobStatus faz GET na rota do job', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'job-1', status: 'done', progress: 100 }))
    const r = await getToolJobStatus('sped', 'job-1')
    expect(r.status).toBe('done')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test:8050/api/tools/sped/jobs/job-1')
    expect(init.credentials).toBe('include')
  })

  it('toolJobDownloadUrl monta a URL de download', () => {
    expect(toolJobDownloadUrl('sped', 'job-1')).toBe('http://api.test:8050/api/tools/sped/jobs/job-1/download')
  })

  it('inspectSped faz POST no /inspect e devolve presentRegs', async () => {
    fetchMock.mockResolvedValue(okJson({ presentRegs: ['0000', '0150'] }))
    const file = new File(['x'], 'a.txt')
    const r = await inspectSped(file)
    expect(r.presentRegs).toEqual(['0000', '0150'])
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test:8050/api/tools/sped/inspect')
  })

  it('erro HTTP vira Error com a mensagem do backend', async () => {
    fetchMock.mockResolvedValue(errJson(413, { message: 'Arquivo SPED muito grande' }))
    const file = new File(['x'], 'a.txt')
    await expect(createToolJob('sped', file)).rejects.toThrow('Arquivo SPED muito grande')
  })
})
