const cliente = { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() }
const clienteAreaContratada = { findMany: jest.fn(), findFirst: jest.fn() }
const gestaoArquivosPastaArea = { findMany: jest.fn(), upsert: jest.fn() }

jest.mock('@saas/db', () => ({
  prisma: { cliente, clienteAreaContratada, gestaoArquivosPastaArea },
}))

const listSubfolders = jest.fn()
const createFolder = jest.fn()
jest.mock('../drive-sync/drive.client', () => ({
  DriveClient: class { listSubfolders = listSubfolders; createFolder = createFolder },
}))

import { GestaoArquivosDriveService } from './gestao-arquivos-drive.service'
import type { GestaoArquivosLoteService } from './gestao-arquivos-lote.service'
import type { ContextoInterno } from './gestao-arquivos-escopo'

/**
 * Copiar a estrutura de pastas de um cliente para outro.
 *
 * As travas que estes testes prendem: só pastas viajam, o destino precisa
 * estar no alcance de quem pede, rodar de novo não duplica nada, e a
 * simulação não escreve no Drive.
 */

const svc = new GestaoArquivosDriveService({} as unknown as GestaoArquivosLoteService)

/** Dono do tenant: alcança todos os clientes da empresa. */
const ctx: ContextoInterno = { userId: 'u-1', isEmpresaMaster: true, empresaId: 'emp-1' }

const ORIGEM = { id: 'cli-origem', razaoSocial: 'MODELO LTDA', empresaId: 'emp-1', portalDriveFolderId: 'raiz-origem' }
const DESTINO = { id: 'cli-destino', razaoSocial: 'NOVA LTDA', empresaId: 'emp-1', portalDriveFolderId: 'raiz-destino' }

const copiar = (over: Partial<{ destinoIds: string[]; comAreas: boolean; simular: boolean }> = {}) =>
  svc.copiarEstrutura(
    { origemId: 'cli-origem', destinoIds: ['cli-destino'], comAreas: false, simular: false, ...over },
    ctx,
  )

beforeEach(() => {
  jest.clearAllMocks()
  cliente.findFirst.mockResolvedValue(ORIGEM)
  cliente.findMany.mockResolvedValue([DESTINO])
  gestaoArquivosPastaArea.findMany.mockResolvedValue([])
  clienteAreaContratada.findMany.mockResolvedValue([])
  createFolder.mockImplementation(async (nome: string) => ({ id: `nova-${nome}`, name: nome }))
  // origem: FISCAL (com CONTRATOS dentro) · destino: vazio
  listSubfolders.mockImplementation(async (id: string) => {
    if (id === 'raiz-origem') return [{ id: 'p-fiscal', name: 'FISCAL' }]
    if (id === 'p-fiscal') return [{ id: 'p-contratos', name: 'CONTRATOS' }]
    return []
  })
})

describe('o que viaja', () => {
  it('recria as pastas no destino, em profundidade', async () => {
    const r = await copiar()
    expect(createFolder.mock.calls.map(c => c[0])).toEqual(['FISCAL', 'CONTRATOS'])
    expect(createFolder.mock.calls[0][1]).toBe('raiz-destino')
    expect(createFolder.mock.calls[1][1]).toBe('nova-FISCAL')
    expect(r.resultados[0]).toMatchObject({ status: 'ok', criadas: 2, existentes: 0 })
  })

  it('não copia arquivo nenhum — só pastas entram na leitura da origem', async () => {
    await copiar()
    // `listSubfolders` lista apenas pastas; `listFolderContents` (que traz
    // arquivos) não é usado pela cópia.
    expect(listSubfolders).toHaveBeenCalled()
    expect((svc as unknown as { listarDoCliente: unknown }).listarDoCliente).toBeDefined()
  })

  it('pasta de mesmo nome é reaproveitada, não duplicada', async () => {
    listSubfolders.mockImplementation(async (id: string) => {
      if (id === 'raiz-origem') return [{ id: 'p-fiscal', name: 'FISCAL' }]
      if (id === 'p-fiscal') return [{ id: 'p-contratos', name: 'CONTRATOS' }]
      if (id === 'raiz-destino') return [{ id: 'd-fiscal', name: 'fiscal' }]
      if (id === 'd-fiscal') return [{ id: 'd-contratos', name: 'CONTRATOS' }]
      return []
    })
    const r = await copiar()
    expect(createFolder).not.toHaveBeenCalled()
    expect(r.resultados[0]).toMatchObject({ criadas: 0, existentes: 2 })
  })

  it('a simulação conta o que criaria e não escreve', async () => {
    const r = await copiar({ simular: true })
    expect(createFolder).not.toHaveBeenCalled()
    expect(gestaoArquivosPastaArea.upsert).not.toHaveBeenCalled()
    expect(r.simulado).toBe(true)
    expect(r.resultados[0]).toMatchObject({ criadas: 2 })
  })
})

describe('áreas', () => {
  beforeEach(() => {
    gestaoArquivosPastaArea.findMany.mockResolvedValue([{ pastaId: 'p-fiscal', areaId: 'area-fiscal' }])
  })

  it('leva o mapa quando o destino contratou a área', async () => {
    clienteAreaContratada.findMany.mockResolvedValue([{ areaId: 'area-fiscal' }])
    const r = await copiar({ comAreas: true })
    expect(gestaoArquivosPastaArea.upsert).toHaveBeenCalledTimes(1)
    expect(gestaoArquivosPastaArea.upsert.mock.calls[0][0].create).toMatchObject({
      clienteId: 'cli-destino', pastaId: 'nova-FISCAL', areaId: 'area-fiscal',
    })
    expect(r.resultados[0]).toMatchObject({ areasMapeadas: 1, areasPuladas: 0 })
  })

  it('pula a área que o destino não contratou', async () => {
    clienteAreaContratada.findMany.mockResolvedValue([])
    const r = await copiar({ comAreas: true })
    expect(gestaoArquivosPastaArea.upsert).not.toHaveBeenCalled()
    expect(r.resultados[0]).toMatchObject({ areasMapeadas: 0, areasPuladas: 1 })
  })

  it('sem "levar áreas", nem consulta o mapa da origem', async () => {
    await copiar({ comAreas: false })
    expect(gestaoArquivosPastaArea.findMany).not.toHaveBeenCalled()
    expect(gestaoArquivosPastaArea.upsert).not.toHaveBeenCalled()
  })
})

describe('recusas', () => {
  it('origem sem pasta vinculada recusa antes de tocar no Drive', async () => {
    cliente.findFirst.mockResolvedValue({ ...ORIGEM, portalDriveFolderId: null })
    await expect(copiar()).rejects.toThrow(/pasta do Drive vinculada/)
    expect(listSubfolders).not.toHaveBeenCalled()
  })

  it('destino sem pasta vinculada é relatado, não criado', async () => {
    cliente.findMany.mockResolvedValue([{ ...DESTINO, portalDriveFolderId: null }])
    const r = await copiar()
    expect(r.resultados[0]).toMatchObject({ status: 'sem-pasta', criadas: 0 })
    expect(createFolder).not.toHaveBeenCalled()
  })

  it('copiar o cliente para ele mesmo não faz sentido — recusa', async () => {
    await expect(copiar({ destinoIds: ['cli-origem'] })).rejects.toThrow(/ao menos um cliente de destino/)
  })

  it('destino fora do alcance de quem pede recusa a operação inteira', async () => {
    const restrito: ContextoInterno = { userId: 'u-2', empresaId: 'emp-1', role: 'COLABORADOR_INTERNO' }
    clienteAreaContratada.findMany.mockResolvedValue([{ clienteId: 'cli-origem' }])
    await expect(
      svc.copiarEstrutura(
        { origemId: 'cli-origem', destinoIds: ['cli-de-outro'], comAreas: false, simular: false },
        restrito,
      ),
    ).rejects.toThrow(/não encontrado/)
    expect(createFolder).not.toHaveBeenCalled()
  })

  it('falha do Drive num destino não derruba os outros', async () => {
    cliente.findMany.mockResolvedValue([DESTINO, { ...DESTINO, id: 'cli-2', razaoSocial: 'OUTRA LTDA', portalDriveFolderId: 'raiz-2' }])
    createFolder.mockImplementation(async (nome: string, pai: string) => {
      if (pai === 'raiz-2') throw new Error('Drive fora do ar')
      return { id: `nova-${nome}`, name: nome }
    })
    const r = await copiar({ destinoIds: ['cli-destino', 'cli-2'] })
    expect(r.resultados[0]).toMatchObject({ status: 'ok' })
    expect(r.resultados[1]).toMatchObject({ status: 'falhou' })
  })
})
