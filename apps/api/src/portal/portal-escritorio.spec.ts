/**
 * Lado do escritório do porta-arquivos.
 *
 * Publicar é o ato que move um arquivo de "interno" para "o cliente vê". Errar
 * aqui não é bug de tela: é documento interno aparecendo no portal, ou arquivo
 * de outro tenant sendo publicado a partir daqui.
 */

const arquivo = { updateMany: jest.fn() }
const solicitacao = { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() }
const cliente = { findFirst: jest.fn() }
const clienteUsuario = { count: jest.fn() }

jest.mock('@saas/db', () => ({
  prisma: {
    clienteArquivo: arquivo,
    portalSolicitacao: solicitacao,
    cliente,
    clienteUsuario,
  },
}))

import { PortalEscritorioService } from './portal-escritorio.service'

const svc = new PortalEscritorioService()

/** Um usuário interno comum: não é master, e tem empresa. */
const daEmpresa = { isMaster: false, empresaId: 'emp-1' }

function arg<T>(m: jest.Mock, i = 0): T {
  return m.mock.calls[i]![0] as T
}

beforeEach(() => {
  jest.clearAllMocks()
  arquivo.updateMany.mockResolvedValue({ count: 1 })
  solicitacao.updateMany.mockResolvedValue({ count: 1 })
  solicitacao.create.mockResolvedValue({ id: 's1' })
  cliente.findFirst.mockResolvedValue({ id: 'cli-1' })
  clienteUsuario.count.mockResolvedValue(1)
})

describe('publicarArquivo', () => {
  it('exige competência para publicar', async () => {
    // Publicar sem competência deixaria o arquivo fora da árvore: ele existiria
    // e não apareceria em pasta nenhuma. O escritório acharia que entregou.
    await expect(svc.publicarArquivo({ arquivoId: 'a1', visivel: true }, daEmpresa))
      .rejects.toThrow(/competência/i)
    expect(arquivo.updateMany).not.toHaveBeenCalled()
  })

  it('não exige competência para DESPUBLICAR', async () => {
    await expect(svc.publicarArquivo({ arquivoId: 'a1', visivel: false }, daEmpresa)).resolves.toEqual({ ok: true })
  })

  it('recusa competência fora de AAAAMM', async () => {
    await expect(svc.publicarArquivo({ arquivoId: 'a1', visivel: true, competencia: '2026-09' }, daEmpresa))
      .rejects.toThrow(/AAAAMM/)
  })

  it('recusa categoria desconhecida', async () => {
    // Categoria fora da lista não casaria com nenhum filtro de área no portal,
    // e o arquivo apareceria para todo mundo.
    await expect(svc.publicarArquivo(
      { arquivoId: 'a1', visivel: true, competencia: '202609', categoria: 'inventada' }, daEmpresa,
    )).rejects.toThrow(/desconhecida/i)
  })

  it('escopa por empresa — não publica arquivo de outro tenant', async () => {
    await svc.publicarArquivo({ arquivoId: 'a1', visivel: true, competencia: '202609' }, daEmpresa)
    const w = arg<{ where: { cliente: unknown } }>(arquivo.updateMany).where
    expect(w.cliente).toEqual({ empresaId: 'emp-1' })
  })

  it('sem empresa e sem master, o filtro não devolve nada', async () => {
    // O `__none__` é fail-closed: sem escopo, a consulta não acha NADA, em vez
    // de achar tudo.
    arquivo.updateMany.mockResolvedValue({ count: 0 })
    await expect(svc.publicarArquivo(
      { arquivoId: 'a1', visivel: true, competencia: '202609' }, { isMaster: false, empresaId: null },
    )).rejects.toThrow(/não encontrado/i)
    const w = arg<{ where: { cliente: unknown } }>(arquivo.updateMany).where
    expect(w.cliente).toEqual({ empresaId: '__none__' })
  })

  it('arquivo fora do escopo vira "não encontrado"', async () => {
    arquivo.updateMany.mockResolvedValue({ count: 0 })
    await expect(svc.publicarArquivo({ arquivoId: 'de-outro', visivel: true, competencia: '202609' }, daEmpresa))
      .rejects.toThrow(/não encontrado/i)
  })
})

describe('criarSolicitacao', () => {
  const pedido = { clienteId: 'cli-1', titulo: 'Extrato do Itaú' }
  const ctx = { userId: 'u1', ...daEmpresa }

  it('recusa cliente fora do escopo', async () => {
    cliente.findFirst.mockResolvedValue(null)
    await expect(svc.criarSolicitacao(pedido, ctx)).rejects.toThrow(/não encontrado/i)
    expect(solicitacao.create).not.toHaveBeenCalled()
  })

  it('recusa quando o cliente não tem ninguém no portal', async () => {
    // Pendência que ninguém nunca verá é pior do que a ausência dela: o
    // escritório fica achando que cobrou.
    clienteUsuario.count.mockResolvedValue(0)
    await expect(svc.criarSolicitacao(pedido, ctx)).rejects.toThrow(/não tem usuário no portal/i)
    expect(solicitacao.create).not.toHaveBeenCalled()
  })

  it('cria como PENDENTE, com o autor', async () => {
    await svc.criarSolicitacao({ ...pedido, competencia: '202609', prazo: '2026-09-20' }, ctx)
    const d = arg<{ data: Record<string, unknown> }>(solicitacao.create).data
    expect(d).toMatchObject({ clienteId: 'cli-1', titulo: 'Extrato do Itaú', criadaPorId: 'u1' })
    expect(d.prazo).toBeInstanceOf(Date)
  })

  it('recusa competência malformada', async () => {
    await expect(svc.criarSolicitacao({ ...pedido, competencia: '9/26' }, ctx)).rejects.toThrow(/AAAAMM/)
  })
})

describe('cancelarSolicitacao', () => {
  it('só cancela PENDENTE, e dentro do escopo', async () => {
    await svc.cancelarSolicitacao('s1', daEmpresa)
    const w = arg<{ where: Record<string, unknown> }>(solicitacao.updateMany).where
    expect(w).toMatchObject({ id: 's1', situacao: 'PENDENTE', cliente: { empresaId: 'emp-1' } })
  })

  it('já atendida não cancela', async () => {
    // O `situacao: PENDENTE` no where não casa, e o count vem zero.
    solicitacao.updateMany.mockResolvedValue({ count: 0 })
    await expect(svc.cancelarSolicitacao('s1', daEmpresa)).rejects.toThrow(/já atendida/i)
  })
})
