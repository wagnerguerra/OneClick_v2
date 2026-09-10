/**
 * Porta-arquivos — o que cada usuário do cliente enxerga e pode enviar.
 *
 * Duas regras se cruzam aqui, e errar qualquer uma vaza documento:
 *  - `visivelParaCliente`, que separa o que o escritório publicou PARA o
 *    cliente do que ele guardou SOBRE o cliente;
 *  - as ÁREAS do vínculo, que separam o RH do financeiro dentro da empresa do
 *    próprio cliente.
 */

const arquivo = {
  findMany: jest.fn(), findFirst: jest.fn(), groupBy: jest.fn(),
  create: jest.fn(), update: jest.fn(),
}
const solicitacao = { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() }
const tx = { clienteArquivo: arquivo, portalSolicitacao: solicitacao }

jest.mock('@saas/db', () => ({
  prisma: {
    clienteArquivo: arquivo,
    portalSolicitacao: solicitacao,
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
  },
}))

import { PortalArquivosService } from './portal-arquivos.service'
import type { VinculoPortal } from './portal-escopo'

const svc = new PortalArquivosService()

const vinculo = (over: Partial<VinculoPortal> = {}): VinculoPortal => ({
  clienteId: 'cli-1', nivel: 'OPERACIONAL', areas: ['fiscal', 'contabil', 'pessoal'], ...over,
})

/** Primeiro argumento da chamada, tipado. */
function arg<T>(m: jest.Mock, i = 0): T {
  return m.mock.calls[i]![0] as T
}

/**
 * As categorias bloqueadas dentro do `where` montado pelo serviço.
 *
 * O `OR` tem duas entradas: `{ categoria: null }` e `{ categoria: { notIn } }`.
 * Procurar por `typeof === 'object'` pega a primeira — `typeof null` é
 * 'object'. A busca é pela presença do `notIn`.
 */
function categoriasBloqueadas(m: jest.Mock): string[] {
  const w = arg<{ where: { OR?: Array<{ categoria?: unknown }> } }>(m).where
  const entrada = w.OR?.find(o => !!o.categoria && typeof o.categoria === 'object')
  return (entrada?.categoria as { notIn: string[] } | undefined)?.notIn ?? []
}

beforeEach(() => {
  jest.clearAllMocks()
  arquivo.findMany.mockResolvedValue([])
  arquivo.groupBy.mockResolvedValue([])
  solicitacao.findMany.mockResolvedValue([])
})

describe('o recorte que toda consulta carrega', () => {
  it('lista só o que foi publicado PARA o cliente, e só do cliente do vínculo', async () => {
    // Sem `visivelParaCliente`, a lista devolveria os arquivos internos que o
    // escritório guarda sobre o cliente. Sem `clienteId`, os de outro cliente.
    await svc.listar(vinculo())
    const w = arg<{ where: Record<string, unknown> }>(arquivo.findMany).where
    expect(w.clienteId).toBe('cli-1')
    expect(w.visivelParaCliente).toBe(true)
  })

  it('as competências saem do mesmo recorte', async () => {
    await svc.competencias(vinculo())
    const w = arg<{ where: Record<string, unknown> }>(arquivo.groupBy).where
    expect(w.clienteId).toBe('cli-1')
    expect(w.visivelParaCliente).toBe(true)
  })
})

describe('recorte por área', () => {
  it('quem não tem Pessoal não vê folha', async () => {
    await svc.listar(vinculo({ areas: ['fiscal'] }))
    expect(categoriasBloqueadas(arquivo.findMany)).toContain('folha')
  })

  it('quem não tem Fiscal não vê guias nem notas', async () => {
    await svc.listar(vinculo({ areas: ['pessoal'] }))
    const bloqueadas = categoriasBloqueadas(arquivo.findMany)
    expect(bloqueadas).toEqual(expect.arrayContaining(['guias', 'notas']))
    expect(bloqueadas).not.toContain('folha')
  })

  it('quem tem todas as áreas não recebe filtro nenhum', async () => {
    await svc.listar(vinculo({ areas: ['fiscal', 'contabil', 'pessoal'] }))
    expect(arg<{ where: Record<string, unknown> }>(arquivo.findMany).where.OR).toBeUndefined()
  })

  it('arquivo sem categoria passa — é o legado, publicado de propósito', async () => {
    await svc.listar(vinculo({ areas: [] }))
    const w = arg<{ where: { OR?: Array<Record<string, unknown>> } }>(arquivo.findMany).where
    expect(w.OR).toEqual(expect.arrayContaining([{ categoria: null }]))
  })
})

describe('abrir — download e recibo de leitura', () => {
  const linha = {
    id: 'a1', fileUrl: '/api/upload/x.pdf', fileName: 'DAS.pdf',
    categoria: 'guias', lidoEm: null,
  }

  it('busca pelo par arquivo+cliente, nunca só pelo id', async () => {
    // `findUnique` por id devolveria arquivo de outro cliente para quem
    // adivinhasse o identificador.
    arquivo.findFirst.mockResolvedValue(linha)
    await svc.abrir(vinculo(), 'a1', 'u1')
    const w = arg<{ where: Record<string, unknown> }>(arquivo.findFirst).where
    expect(w).toMatchObject({ id: 'a1', clienteId: 'cli-1', visivelParaCliente: true })
  })

  it('marca o recibo na primeira abertura', async () => {
    arquivo.findFirst.mockResolvedValue(linha)
    await svc.abrir(vinculo(), 'a1', 'u1')
    expect(arquivo.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lidoEm: expect.any(Date), lidoPorId: 'u1' } }),
    )
  })

  it('reabrir NÃO reescreve a data', async () => {
    // "Lido em" é quando abriu a primeira vez. Reescrever transformaria isso em
    // "aberto pela última vez", que é outra informação — e some com a prova de
    // que a guia foi vista a tempo.
    arquivo.findFirst.mockResolvedValue({ ...linha, lidoEm: new Date('2026-09-01') })
    await svc.abrir(vinculo(), 'a1', 'u1')
    expect(arquivo.update).not.toHaveBeenCalled()
  })

  it('recusa arquivo de área que a pessoa não acessa', async () => {
    arquivo.findFirst.mockResolvedValue({ ...linha, categoria: 'folha' })
    await expect(svc.abrir(vinculo({ areas: ['fiscal'] }), 'a1', 'u1')).rejects.toThrow(/não encontrado/i)
    expect(arquivo.update).not.toHaveBeenCalled()
  })
})

describe('enviar', () => {
  const base = { fileName: 'extrato.pdf', fileUrl: '/api/upload/e.pdf' }

  it('nível CONSULTA não envia', async () => {
    await expect(svc.enviar(vinculo({ nivel: 'CONSULTA' }), base, 'u1'))
      .rejects.toThrow(/somente leitura/i)
    expect(arquivo.create).not.toHaveBeenCalled()
  })

  it('grava no cliente do vínculo, como CLIENTE e já visível', async () => {
    // Visível por definição: foi a própria pessoa que mandou, e escondê-lo dela
    // seria perder o arquivo de vista logo depois de enviá-lo.
    arquivo.create.mockResolvedValue({ id: 'novo', fileName: 'extrato.pdf' })
    await svc.enviar(vinculo(), base, 'u1')
    const d = arg<{ data: Record<string, unknown> }>(arquivo.create).data
    expect(d).toMatchObject({
      clienteId: 'cli-1', origem: 'CLIENTE', visivelParaCliente: true, userId: 'u1',
    })
  })

  it('recusa categoria de área que a pessoa não acessa', async () => {
    await expect(svc.enviar(vinculo({ areas: ['fiscal'] }), { ...base, categoria: 'folha' }, 'u1'))
      .rejects.toThrow(/não tem acesso/i)
  })

  it('resolve a solicitação quando o envio veio de uma pendência', async () => {
    solicitacao.findFirst.mockResolvedValue({ id: 's1' })
    arquivo.create.mockResolvedValue({ id: 'novo', fileName: 'extrato.pdf' })
    await svc.enviar(vinculo(), { ...base, solicitacaoId: 's1' }, 'u1')
    expect(solicitacao.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: expect.objectContaining({ situacao: 'ATENDIDA', atendidaPor: 'u1' }),
      }),
    )
  })

  it('recusa solicitação de outro cliente ou já fechada', async () => {
    // O `findFirst` exige clienteId + PENDENTE; devolvendo nada, o envio para.
    solicitacao.findFirst.mockResolvedValue(null)
    await expect(svc.enviar(vinculo(), { ...base, solicitacaoId: 'de-outro' }, 'u1'))
      .rejects.toThrow(/não está mais aberta/i)
    expect(arquivo.create).not.toHaveBeenCalled()
  })
})

describe('pendências', () => {
  it('esconde a pendência de área que a pessoa não acessa', async () => {
    // Cobrar alguém por um documento que ela não tem como enviar é ruído.
    solicitacao.findMany.mockResolvedValue([
      { id: 's1', titulo: 'Extrato', categoria: 'contabil', descricao: null, prazo: null, competencia: null, criadaEm: new Date() },
      { id: 's2', titulo: 'Folha de ponto', categoria: 'folha', descricao: null, prazo: null, competencia: null, criadaEm: new Date() },
    ])
    const lista = await svc.solicitacoesPendentes(vinculo({ areas: ['contabil'] }))
    expect(lista.map(s => s.id)).toEqual(['s1'])
  })

  it('consulta só as PENDENTES do cliente do vínculo', async () => {
    await svc.solicitacoesPendentes(vinculo())
    expect(arg<{ where: unknown }>(solicitacao.findMany).where)
      .toEqual({ clienteId: 'cli-1', situacao: 'PENDENTE' })
  })
})
