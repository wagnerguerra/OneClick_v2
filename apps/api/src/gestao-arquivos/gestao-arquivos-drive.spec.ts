/**
 * Google Drive na Gestão de Arquivos.
 *
 * O risco específico aqui: a rota recebe um id de pasta do cliente HTTP. Sem a
 * trava de contenção, alguém trocaria esse id e listaria qualquer pasta da
 * conta do escritório — inclusive a de outro cliente e a dos backups — por uma
 * rota cuja única finalidade é abrir a pasta de UM cliente.
 */

const cliente = { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), findUnique: jest.fn() }
const gestaoArquivosDrive = { findUnique: jest.fn(), upsert: jest.fn() }
const arquivoLog = { findMany: jest.fn(), create: jest.fn() }
const user = { findUnique: jest.fn() }
const clienteAreaContratada = { findMany: jest.fn() }

jest.mock('@saas/db', () => ({
  prisma: { cliente, gestaoArquivosDrive, clienteAreaContratada, arquivoLog, user },
}))

const listSubfolders = jest.fn()
const listFolderContents = jest.fn()
const getFolderInfo = jest.fn()
const getParents = jest.fn()
const getFileMeta = jest.fn()
const downloadStream = jest.fn()
const moveFile = jest.fn()
const listTrashedInFolder = jest.fn()
const untrashFile = jest.fn()
const deleteFilePermanently = jest.fn()

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
    moveFile = moveFile
    listTrashedInFolder = listTrashedInFolder
    untrashFile = untrashFile
    deleteFilePermanently = deleteFilePermanently
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
  moveFile.mockResolvedValue(undefined)
  listTrashedInFolder.mockResolvedValue([])
  untrashFile.mockResolvedValue(undefined)
  deleteFilePermanently.mockResolvedValue(undefined)
  arquivoLog.findMany.mockResolvedValue([])
  arquivoLog.create.mockResolvedValue({ id: 'log-1' })
  user.findUnique.mockResolvedValue({ name: 'Cliente Teste' })
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

describe('lado do PORTAL (o cliente olhando a própria pasta)', () => {
  // O que decide não é mais o NÍVEL, e sim a permissão por usuário. Os nomes
  // abaixo são só apelidos dos três perfis que interessam.
  const base = { clienteId: 'cli-1', nivel: 'OPERACIONAL' as const, areas: ['fiscal'] }
  const completo = { ...base, podeVer: true, podeEditar: true, podeExcluir: true }
  const soLeitura = { ...base, podeVer: true, podeEditar: false, podeExcluir: false }
  const semAcesso = { ...base, podeVer: false, podeEditar: false, podeExcluir: false }

  beforeEach(() => {
    cliente.findUnique.mockResolvedValue({
      portalDriveFolderId: 'pasta-do-cliente', portalDriveFolderNome: 'ACME',
    })
  })

  it('quem enxerga é quem tem podeVer, independente do nível', () => {
    // A regra antiga era o nível (só ADMINISTRADOR). Trocou para permissão por
    // usuário: com o portal listando só o Drive, amarrar ao nível deixava todo
    // não-admin com a tela vazia.
    expect(svc.podeVerDriveNoPortal(completo)).toBe(true)
    expect(svc.podeVerDriveNoPortal(soLeitura)).toBe(true)
    expect(svc.podeVerDriveNoPortal(semAcesso)).toBe(false)
  })

  it('quem não pode recebe explicação, não erro', async () => {
    const r = await svc.listarParaPortal(semAcesso)
    expect(r.vinculada).toBe(false)
    expect(r.motivo).toMatch(/não tem permissão/i)
    expect(listFolderContents).not.toHaveBeenCalled()
  })

  it('quem pode ver recebe o conteúdo da própria pasta', async () => {
    listFolderContents.mockResolvedValue([
      { id: 'f1', name: 'guia.pdf', mimeType: 'application/pdf', size: 10, modifiedTime: '', webViewLink: 'https://drive/...', isFolder: false },
    ])
    const r = await svc.listarParaPortal(soLeitura)
    expect(r.vinculada).toBe(true)
    expect(listFolderContents).toHaveBeenCalledWith('pasta-do-cliente')
    // O link direto do Drive NÃO vai para o cliente: ele só abriria para quem
    // tem a pasta compartilhada no Google, que é justamente o que o desenho
    // quer deixar de exigir.
    expect(r.itens[0]!.link).toBe('')
  })

  it('subpasta fora da pasta do cliente é recusada também no portal', async () => {
    getParents.mockResolvedValue(['pasta-de-outro'])
    await expect(svc.listarParaPortal(completo, 'alheia')).rejects.toThrow(/não encontrada/i)
  })

  it('sem podeEditar não cria pasta nem envia arquivo', async () => {
    await expect(svc.criarPastaParaPortal(soLeitura, 'Notas'))
      .rejects.toThrow(/não tem permissão/i)
    await expect(svc.enviarParaPortal(soLeitura, { fileName: 'n.pdf', fileUrl: '/api/upload/n.pdf' }, 'u1'))
      .rejects.toThrow(/não tem permissão/i)
  })

  it('sem podeExcluir não manda nada para a lixeira', async () => {
    await expect(svc.excluirParaPortal(soLeitura, 'f1')).rejects.toThrow(/não tem permissão/i)
  })

  it('nem quem pode excluir apaga a raiz configurada pelo escritório', async () => {
    // Seria o cliente removendo a própria pasta do Drive do escritório.
    await expect(svc.excluirParaPortal(completo, 'pasta-do-cliente'))
      .rejects.toThrow(/não pode ser excluída/i)
  })

  it('não exclui item de fora da pasta do cliente', async () => {
    getParents.mockResolvedValue(['pasta-de-outro'])
    await expect(svc.excluirParaPortal(completo, 'alheio')).rejects.toThrow(/não encontrado/i)
  })

  it('criar pasta recusa nome com barra', async () => {
    // Barra no nome faria "Notas/2026" parecer dois níveis para quem lê.
    await expect(svc.criarPastaParaPortal(completo, 'Notas/2026'))
      .rejects.toThrow(/não pode conter barras/i)
  })

  it('sem podeVer não baixa arquivo nem sabendo o id', async () => {
    getParents.mockResolvedValue(['pasta-do-cliente'])
    await expect(svc.abrirArquivoParaPortal(semAcesso, 'f1')).rejects.toThrow(/não encontrado/i)
    expect(downloadStream).not.toHaveBeenCalled()
  })

  it('quem pode ver baixa arquivo que está dentro da pasta dele', async () => {
    getParents.mockResolvedValue(['pasta-do-cliente'])
    await expect(svc.abrirArquivoParaPortal(soLeitura, 'f1'))
      .resolves.toMatchObject({ nome: 'guia.pdf', mimeType: 'application/pdf' })
  })

  it('nem quem pode ver baixa arquivo de fora da pasta dele', async () => {
    getParents.mockResolvedValue(['pasta-de-outro-cliente'])
    await expect(svc.abrirArquivoParaPortal(completo, 'alheio')).rejects.toThrow(/não encontrado/i)
    expect(downloadStream).not.toHaveBeenCalled()
  })
})

describe('mover (arrastar e soltar)', () => {
  const base = { clienteId: 'cli-1', nivel: 'OPERACIONAL' as const, areas: ['fiscal'] }
  const completo = { ...base, podeVer: true, podeEditar: true, podeExcluir: true }
  const soLeitura = { ...base, podeVer: true, podeEditar: false, podeExcluir: false }

  beforeEach(() => {
    cliente.findUnique.mockResolvedValue({
      portalDriveFolderId: 'pasta-do-cliente', portalDriveFolderNome: 'ACME',
    })
  })

  it('sem podeEditar não move nada', async () => {
    await expect(svc.moverParaPortal(soLeitura, 'f1', null)).rejects.toThrow(/não tem permissão/i)
    expect(moveFile).not.toHaveBeenCalled()
  })

  it('a raiz do cliente não se move', async () => {
    // É a pasta que o escritório configurou; tirá-la do lugar quebraria o
    // vínculo para todo mundo daquele cliente.
    await expect(svc.moverParaPortal(completo, 'pasta-do-cliente', null))
      .rejects.toThrow(/não pode ser movida/i)
    expect(moveFile).not.toHaveBeenCalled()
  })

  it('não move item de fora da pasta do cliente', async () => {
    getParents.mockResolvedValue(['pasta-de-outro'])
    await expect(svc.moverParaPortal(completo, 'alheio', null)).rejects.toThrow(/não encontrado/i)
    expect(moveFile).not.toHaveBeenCalled()
  })

  it('não move para destino fora da pasta do cliente', async () => {
    // `dentroDaPastaDoCliente` é chamado primeiro para o item (passa) e depois
    // para o destino (falha).
    getParents
      .mockResolvedValueOnce(['pasta-do-cliente'])
      .mockResolvedValue(['pasta-de-outro'])
    await expect(svc.moverParaPortal(completo, 'f1', 'destino-alheio'))
      .rejects.toThrow(/destino não encontrada/i)
    expect(moveFile).not.toHaveBeenCalled()
  })

  it('recusa mover uma pasta para dentro de si mesma', async () => {
    await expect(svc.moverParaPortal(completo, 'p1', 'p1'))
      .rejects.toThrow(/dentro dela mesma/i)
    expect(moveFile).not.toHaveBeenCalled()
  })

  it('recusa mover uma pasta para dentro de uma subpasta dela', async () => {
    // O estrago é silencioso: no Drive o ramo não é apagado, apenas deixa de
    // ter caminho até a raiz — some da tela sem nada dizer que sumiu.
    getParents.mockImplementation(async (id: string) => {
      if (id === 'pai') return ['pasta-do-cliente']   // item está no cliente
      if (id === 'filha') return ['pai']              // destino desce do item
      return ['pasta-do-cliente']
    })
    await expect(svc.moverParaPortal(completo, 'pai', 'filha'))
      .rejects.toThrow(/subpasta dela/i)
    expect(moveFile).not.toHaveBeenCalled()
  })

  it('mover para onde já está não chama o Drive', async () => {
    getParents.mockResolvedValue(['pasta-do-cliente'])
    await expect(svc.moverParaPortal(completo, 'f1', null))
      .resolves.toEqual({ ok: true, semMudanca: true })
    expect(moveFile).not.toHaveBeenCalled()
  })

  it('move trocando os pais de uma vez', async () => {
    // `addParents` sem `removeParents` deixaria o item nos dois lugares.
    getParents.mockImplementation(async (id: string) => {
      if (id === 'destino') return ['pasta-do-cliente']
      return ['pasta-antiga']
    })
    // A cadeia do item sobe: pasta-antiga -> ... precisa chegar na raiz.
    getParents.mockImplementation(async (id: string) => {
      if (id === 'f1') return ['pasta-antiga']
      if (id === 'pasta-antiga') return ['pasta-do-cliente']
      if (id === 'destino') return ['pasta-do-cliente']
      return []
    })
    await svc.moverParaPortal(completo, 'f1', 'destino')
    expect(moveFile).toHaveBeenCalledWith('f1', 'destino', 'pasta-antiga')
  })
})

describe('autoria do envio', () => {
  const base = { clienteId: 'cli-1', nivel: 'OPERACIONAL' as const, areas: ['fiscal'] }
  const completo = { ...base, podeVer: true, podeEditar: true, podeExcluir: true }

  it('a listagem devolve quem enviou, vindo do NOSSO log', async () => {
    // O Drive não sabe e nunca vai saber: lá o dono de todo arquivo é a conta
    // do escritório. A autoria é registro nosso.
    cliente.findUnique.mockResolvedValue({
      portalDriveFolderId: 'pasta-do-cliente', portalDriveFolderNome: 'ACME',
    })
    listFolderContents.mockResolvedValue([
      { id: 'f1', name: 'nota.pdf', mimeType: 'application/pdf', size: 99, modifiedTime: '', webViewLink: '', isFolder: false },
      { id: 'f2', name: 'outro.pdf', mimeType: 'application/pdf', size: 10, modifiedTime: '', webViewLink: '', isFolder: false },
    ])
    arquivoLog.findMany.mockResolvedValue([
      { arquivoId: 'f1', usuarioNome: 'Maria', criadoEm: new Date('2026-09-11T10:00:00Z') },
    ])

    const r = await svc.listarParaPortal(completo)
    expect(r.itens[0]!.enviadoPor).toBe('Maria')
    // Arquivo que chegou por fora do sistema (solto direto no Drive) fica nulo
    // — e isso é informação, não ausência de dado.
    expect(r.itens[1]!.enviadoPor).toBeNull()
  })

  it('usa a PRIMEIRA linha: interessa quem enviou, não quem mexeu por último', async () => {
    cliente.findUnique.mockResolvedValue({ portalDriveFolderId: 'pasta-do-cliente', portalDriveFolderNome: 'ACME' })
    listFolderContents.mockResolvedValue([
      { id: 'f1', name: 'n.pdf', mimeType: '', size: 1, modifiedTime: '', webViewLink: '', isFolder: false },
    ])
    arquivoLog.findMany.mockResolvedValue([
      { arquivoId: 'f1', usuarioNome: 'Quem enviou', criadoEm: new Date('2026-09-01') },
      { arquivoId: 'f1', usuarioNome: 'Quem mexeu depois', criadoEm: new Date('2026-09-10') },
    ])
    const r = await svc.listarParaPortal(completo)
    expect(r.itens[0]!.enviadoPor).toBe('Quem enviou')
  })

  it('falha ao gravar o log não derruba o envio', async () => {
    // O arquivo já está no Drive quando o log roda.
    cliente.findUnique.mockResolvedValue({ portalDriveFolderId: 'pasta-do-cliente' })
    arquivoLog.create.mockRejectedValue(new Error('banco fora'))
    // `uploadFile` não está no dublê do client; o teste cobre só o caminho de
    // permissão + destino, que é onde o log entra.
    await expect(
      svc.enviarParaPortal(completo, { fileName: 'n.pdf', fileUrl: '/api/upload/inexistente.pdf' }, 'u1'),
    ).rejects.toThrow(/não foi encontrado/i)
  })
})

describe('lixeira do Drive', () => {
  const base = { clienteId: 'cli-1', nivel: 'OPERACIONAL' as const, areas: ['fiscal'] }
  const comExcluir = { ...base, podeVer: true, podeEditar: true, podeExcluir: true }
  const semExcluir = { ...base, podeVer: true, podeEditar: true, podeExcluir: false }
  const master = { userId: 'u1', isMaster: true, empresaId: 'emp-1' }

  beforeEach(() => {
    cliente.findUnique.mockResolvedValue({ portalDriveFolderId: 'pasta-do-cliente' })
    cliente.findFirst.mockResolvedValue({ id: 'cli-1', portalDriveFolderId: 'pasta-do-cliente' })
  })

  it('sem podeExcluir não vê a lixeira', async () => {
    await expect(svc.lixeiraParaPortal(semExcluir)).rejects.toThrow(/não tem permissão/i)
    expect(listTrashedInFolder).not.toHaveBeenCalled()
  })

  it('lista o que foi excluído de dentro da pasta do cliente', async () => {
    // A lixeira do Google é uma só, da conta do escritório. O recorte por
    // cliente só existe porque o Drive mantém os pais do item excluído.
    listSubfolders.mockResolvedValue([])
    listTrashedInFolder.mockResolvedValue([
      { id: 'f1', name: 'guia.pdf', mimeType: 'application/pdf', size: 10, trashedTime: '2026-09-11T10:00:00Z', isFolder: false },
    ])
    const r = await svc.lixeiraParaPortal(comExcluir)
    expect(listTrashedInFolder).toHaveBeenCalledWith('pasta-do-cliente')
    expect(r[0]!.nome).toBe('guia.pdf')
  })

  it('não desce em pasta que está na lixeira', async () => {
    // Restaurar a pasta traz o conteúdo junto; descer nela listaria os filhos
    // como se cada um tivesse sido excluído por si.
    listSubfolders.mockResolvedValue([])
    listTrashedInFolder.mockResolvedValue([
      { id: 'p9', name: '2024', mimeType: 'application/vnd.google-apps.folder', size: 0, trashedTime: '', isFolder: true },
    ])
    const r = await svc.lixeiraParaPortal(comExcluir)
    expect(r).toHaveLength(1)
    expect(listTrashedInFolder).toHaveBeenCalledTimes(1)
  })

  it('não restaura item que nunca foi deste cliente', async () => {
    getParents.mockResolvedValue(['pasta-de-outro'])
    await expect(svc.restaurarParaPortal(comExcluir, 'alheio')).rejects.toThrow(/não encontrado/i)
    expect(untrashFile).not.toHaveBeenCalled()
  })

  it('restaura o que está dentro da pasta do cliente', async () => {
    getParents.mockResolvedValue(['pasta-do-cliente'])
    await expect(svc.restaurarParaPortal(comExcluir, 'f1')).resolves.toEqual({ ok: true })
    expect(untrashFile).toHaveBeenCalledWith('f1')
  })

  it('sem podeExcluir não restaura', async () => {
    await expect(svc.restaurarParaPortal(semExcluir, 'f1')).rejects.toThrow(/não tem permissão/i)
    expect(untrashFile).not.toHaveBeenCalled()
  })

  it('apagar de vez recusa a raiz configurada pelo escritório', async () => {
    await expect(svc.excluirDefinitivo({ clienteId: 'cli-1', itemId: 'pasta-do-cliente' }, master))
      .rejects.toThrow(/não pode ser excluída/i)
    expect(deleteFilePermanently).not.toHaveBeenCalled()
  })

  it('apagar de vez recusa item de fora da pasta do cliente', async () => {
    getParents.mockResolvedValue(['pasta-de-outro'])
    await expect(svc.excluirDefinitivo({ clienteId: 'cli-1', itemId: 'alheio' }, master))
      .rejects.toThrow(/não encontrado/i)
    expect(deleteFilePermanently).not.toHaveBeenCalled()
  })

  it('apagar de vez funciona dentro da pasta do cliente', async () => {
    getParents.mockResolvedValue(['pasta-do-cliente'])
    await expect(svc.excluirDefinitivo({ clienteId: 'cli-1', itemId: 'f1' }, master))
      .resolves.toEqual({ ok: true })
    expect(deleteFilePermanently).toHaveBeenCalledWith('f1')
  })
})
