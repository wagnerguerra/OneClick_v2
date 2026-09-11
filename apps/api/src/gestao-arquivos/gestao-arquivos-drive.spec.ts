/**
 * Google Drive na Gestão de Arquivos.
 *
 * O risco específico aqui: a rota recebe um id de pasta do cliente HTTP. Sem a
 * trava de contenção, alguém trocaria esse id e listaria qualquer pasta da
 * conta do escritório — inclusive a de outro cliente e a dos backups — por uma
 * rota cuja única finalidade é abrir a pasta de UM cliente.
 */

const cliente = { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() }
const gestaoArquivosDrive = { findUnique: jest.fn(), upsert: jest.fn() }
const clienteAreaContratada = { findMany: jest.fn() }

jest.mock('@saas/db', () => ({
  prisma: { cliente, gestaoArquivosDrive, clienteAreaContratada },
}))

const listSubfolders = jest.fn()
const listFolderContents = jest.fn()
const getFolderInfo = jest.fn()
const getParents = jest.fn()
const getFileMeta = jest.fn()
const downloadStream = jest.fn()

jest.mock('../drive-sync/drive.client', () => ({
  DriveClient: class {
    static extractFolderId(input: string): string {
      const m = input.trim().match(/\/folders\/([a-zA-Z0-9_-]+)/)
      if (m && m[1]) return m[1]
      if (/^[a-zA-Z0-9_-]{20,}$/.test(input.trim())) return input.trim()
      throw new Error('ID/URL de pasta inválido.')
    }
    listSubfolders = listSubfolders
    listFolderContents = listFolderContents
    getFolderInfo = getFolderInfo
    getParents = getParents
    getFileMeta = getFileMeta
    downloadStream = downloadStream
  },
}))

import { GestaoArquivosDriveService } from './gestao-arquivos-drive.service'

const svc = new GestaoArquivosDriveService()

const master = { userId: 'u1', isMaster: true, empresaId: 'emp-1' }
const RAIZ = '1eMv40oNPw6XwohFpKpY4UpFOrUEqR2_n'

beforeEach(() => {
  jest.clearAllMocks()
  gestaoArquivosDrive.findUnique.mockResolvedValue({
    empresaId: 'emp-1', pastaRaizId: RAIZ, pastaRaizNome: 'Clientes', ativo: true,
  })
  cliente.findFirst.mockResolvedValue({
    id: 'cli-1', empresaId: 'emp-1',
    portalDriveFolderId: 'pasta-do-cliente', portalDriveFolderNome: 'ACME',
  })
  cliente.findMany.mockResolvedValue([])
  listSubfolders.mockResolvedValue([{ id: 'pasta-do-cliente', name: 'ACME', webViewLink: '', modifiedTime: '' }])
  listFolderContents.mockResolvedValue([])
  getFolderInfo.mockResolvedValue({
    id: RAIZ, name: 'Clientes', mimeType: 'application/vnd.google-apps.folder', webViewLink: '',
  })
  getParents.mockResolvedValue([])
  getFileMeta.mockResolvedValue({ id: 'f1', name: 'guia.pdf', mimeType: 'application/pdf', size: 1024 })
  downloadStream.mockResolvedValue({ pipe: jest.fn(), on: jest.fn() })
})

describe('salvarConfig', () => {
  it('aceita a URL com /u/2/ que o Drive gera para conta secundária', async () => {
    await expect(
      svc.salvarConfig('emp-1', `https://drive.google.com/drive/u/2/folders/${RAIZ}`),
    ).resolves.toEqual({ pastaRaizId: RAIZ, pastaRaizNome: 'Clientes' })
    expect(getFolderInfo).toHaveBeenCalledWith(RAIZ)
  })

  it('recusa link que aponta para ARQUIVO, não pasta', async () => {
    // Colar o link de um PDF geraria uma tela vazia sem explicação nenhuma.
    getFolderInfo.mockResolvedValue({ id: 'x', name: 'nota.pdf', mimeType: 'application/pdf', webViewLink: '' })
    await expect(svc.salvarConfig('emp-1', `https://drive.google.com/drive/folders/${RAIZ}`))
      .rejects.toThrow(/arquivo, não para uma pasta/i)
    expect(gestaoArquivosDrive.upsert).not.toHaveBeenCalled()
  })

  it('valida contra a API antes de gravar — pasta inacessível não é salva', async () => {
    getFolderInfo.mockRejectedValue(new Error('404'))
    await expect(svc.salvarConfig('emp-1', `https://drive.google.com/drive/folders/${RAIZ}`))
      .rejects.toThrow(/compartilhada com a conta/i)
    expect(gestaoArquivosDrive.upsert).not.toHaveBeenCalled()
  })

  it('recusa texto que não é URL nem ID', async () => {
    await expect(svc.salvarConfig('emp-1', 'a pasta lá do drive')).rejects.toThrow(/inválid/i)
  })
})

describe('vincularCliente', () => {
  it('recusa pasta que não está dentro da raiz configurada', async () => {
    // Sem esta trava, um id colado à mão apontaria o módulo para qualquer pasta
    // da conta — inclusive a dos backups.
    await expect(svc.vincularCliente({ clienteId: 'cli-1', folderId: 'pasta-solta' }, master))
      .rejects.toThrow(/não está dentro da pasta raiz/i)
    expect(cliente.update).not.toHaveBeenCalled()
  })

  it('recusa pasta já vinculada a outro cliente', async () => {
    // O estrago seria documento de um cliente aparecendo na tela do outro.
    cliente.findFirst
      .mockResolvedValueOnce({ id: 'cli-1', empresaId: 'emp-1' })
      .mockResolvedValueOnce({ razaoSocial: 'OUTRO CLIENTE LTDA' })
    await expect(svc.vincularCliente({ clienteId: 'cli-1', folderId: 'pasta-do-cliente' }, master))
      .rejects.toThrow(/já é do cliente OUTRO CLIENTE LTDA/i)
    expect(cliente.update).not.toHaveBeenCalled()
  })

  it('vincula guardando o nome junto', async () => {
    cliente.findFirst
      .mockResolvedValueOnce({ id: 'cli-1', empresaId: 'emp-1' })
      .mockResolvedValueOnce(null)
    await expect(svc.vincularCliente({ clienteId: 'cli-1', folderId: 'pasta-do-cliente' }, master))
      .resolves.toEqual({ ok: true, nome: 'ACME' })
    expect(cliente.update.mock.calls[0]![0].data).toEqual({
      portalDriveFolderId: 'pasta-do-cliente', portalDriveFolderNome: 'ACME',
    })
  })

  it('desvincular não consulta o Drive', async () => {
    cliente.findFirst.mockResolvedValue({ id: 'cli-1', empresaId: 'emp-1' })
    await svc.vincularCliente({ clienteId: 'cli-1', folderId: null }, master)
    expect(listSubfolders).not.toHaveBeenCalled()
    expect(cliente.update.mock.calls[0]![0].data).toEqual({
      portalDriveFolderId: null, portalDriveFolderNome: null,
    })
  })
})

describe('listarDoCliente', () => {
  it('cliente sem pasta vinculada devolve vazio, sem erro', async () => {
    cliente.findFirst.mockResolvedValue({ portalDriveFolderId: null, portalDriveFolderNome: null })
    await expect(svc.listarDoCliente({ clienteId: 'cli-1' }, master))
      .resolves.toEqual({ vinculada: false, nome: null, link: null, itens: [] })
    expect(listFolderContents).not.toHaveBeenCalled()
  })

  it('abre a pasta do cliente sem checar contenção — ela É a raiz dele', async () => {
    await svc.listarDoCliente({ clienteId: 'cli-1' }, master)
    expect(listFolderContents).toHaveBeenCalledWith('pasta-do-cliente')
    expect(getParents).not.toHaveBeenCalled()
  })

  it('recusa subpasta que NÃO descende da pasta do cliente', async () => {
    // O ataque: trocar `subPastaId` na requisição pela pasta de outro cliente.
    getParents.mockResolvedValue(['outra-raiz-qualquer'])
    await expect(svc.listarDoCliente({ clienteId: 'cli-1', subPastaId: 'pasta-alheia' }, master))
      .rejects.toThrow(/não encontrada/i)
    expect(listFolderContents).not.toHaveBeenCalled()
  })

  it('aceita subpasta que descende, mesmo alguns níveis abaixo', async () => {
    getParents
      .mockResolvedValueOnce(['nivel-2'])
      .mockResolvedValueOnce(['pasta-do-cliente'])
    await svc.listarDoCliente({ clienteId: 'cli-1', subPastaId: 'nivel-3' }, master)
    expect(listFolderContents).toHaveBeenCalledWith('nivel-3')
  })

  it('cadeia de pais sem fim não vira acesso — erra para o lado seguro', async () => {
    // Ciclo ou árvore absurda: o laço para em 10 saltos e a resposta é "não".
    getParents.mockResolvedValue(['sempre-o-mesmo'])
    await expect(svc.listarDoCliente({ clienteId: 'cli-1', subPastaId: 'x' }, master))
      .rejects.toThrow(/não encontrada/i)
  })

  it('cliente fora do alcance não chega ao Drive', async () => {
    // O recorte é o do módulo, não o do Drive: quem não vê o cliente aqui não
    // vê os arquivos dele lá.
    clienteAreaContratada.findMany.mockResolvedValue([])
    await expect(
      svc.listarDoCliente({ clienteId: 'cli-9' }, { userId: 'u2', isMaster: false, empresaId: 'emp-1' }),
    ).rejects.toThrow(/não encontrado/i)
    expect(listFolderContents).not.toHaveBeenCalled()
  })

  it('Drive fora do ar vira erro claro, não tela quebrada', async () => {
    listFolderContents.mockRejectedValue(new Error('ECONNRESET'))
    await expect(svc.listarDoCliente({ clienteId: 'cli-1' }, master))
      .rejects.toThrow(/não foi possível falar com o google drive/i)
  })
})

describe('abrirArquivo (o proxy que serve os bytes)', () => {
  it('recusa arquivo que não está dentro da pasta do cliente', async () => {
    // O ataque direto: pedir um fileId qualquer da conta do escritório por uma
    // rota que só deveria servir arquivo de UM cliente.
    getParents.mockResolvedValue(['pasta-de-outro-cliente'])
    await expect(svc.abrirArquivo({ clienteId: 'cli-1', fileId: 'alheio' }, master))
      .rejects.toThrow(/não encontrado/i)
    expect(downloadStream).not.toHaveBeenCalled()
  })

  it('serve o arquivo que está na pasta do cliente, com nome e tipo', async () => {
    getParents.mockResolvedValue(['pasta-do-cliente'])
    await expect(svc.abrirArquivo({ clienteId: 'cli-1', fileId: 'f1' }, master))
      .resolves.toMatchObject({ nome: 'guia.pdf', mimeType: 'application/pdf', tamanho: 1024 })
  })

  it('cliente sem pasta vinculada não serve nada', async () => {
    cliente.findFirst.mockResolvedValue({ portalDriveFolderId: null })
    await expect(svc.abrirArquivo({ clienteId: 'cli-1', fileId: 'f1' }, master))
      .rejects.toThrow(/não encontrado/i)
    expect(downloadStream).not.toHaveBeenCalled()
  })

  it('quem não alcança o cliente não alcança os bytes', async () => {
    clienteAreaContratada.findMany.mockResolvedValue([])
    await expect(
      svc.abrirArquivo({ clienteId: 'cli-9', fileId: 'f1' }, { userId: 'u2', isMaster: false, empresaId: 'emp-1' }),
    ).rejects.toThrow(/não encontrado/i)
    expect(downloadStream).not.toHaveBeenCalled()
  })
})
