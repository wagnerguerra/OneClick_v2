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
const pasta = {
  findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn(),
}
const tx = { clienteArquivo: arquivo, portalSolicitacao: solicitacao }
const arquivoLog = { create: jest.fn() }
const user = { findUnique: jest.fn() }

jest.mock('@saas/db', () => ({
  prisma: {
    clienteArquivo: arquivo,
    portalSolicitacao: solicitacao,
    portalPasta: pasta,
    arquivoLog,
    user,
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
  },
}))

import { PortalArquivosService } from './portal-arquivos.service'
import type { VinculoPortal } from './portal-escopo'

/**
 * O serviço passou a avisar por e-mail (Gestão de Arquivos) ao enviar e ao
 * abrir. O dublê registra as chamadas sem mandar nada — o que estes testes
 * verificam é o porta-arquivos, e o conteúdo do aviso tem os testes dele.
 */
const notificacao = { disparar: jest.fn().mockResolvedValue(true) }
const svc = new PortalArquivosService(notificacao as never)

const vinculo = (over: Partial<VinculoPortal> = {}): VinculoPortal => ({
  clienteId: 'cli-1', nivel: 'OPERACIONAL', areas: ['fiscal', 'contabil', 'pessoal'],
  podeVer: true, podeEditar: true, podeExcluir: false,
  ...over,
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
  pasta.findMany.mockResolvedValue([])
  pasta.findFirst.mockResolvedValue({ id: 'p1', nome: 'Contratos', paiId: null })
  pasta.create.mockResolvedValue({ id: 'nova', nome: 'Contratos' })
  arquivoLog.create.mockResolvedValue({ id: 'log-1' })
  user.findUnique.mockResolvedValue({ name: 'Fulano do Cliente' })
  notificacao.disparar.mockResolvedValue(true)
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

  it('a raiz lista o que não está em pasta nenhuma', async () => {
    await svc.listar(vinculo())
    const w = arg<{ where: Record<string, unknown> }>(arquivo.findMany).where
    expect(w.pastaId).toBeNull()
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

describe('pastas', () => {
  it('abrir a raiz não valida pasta nenhuma', async () => {
    await svc.abrirPasta(vinculo(), null)
    // `findFirst` de pasta só é chamado para montar o caminho, e na raiz não há
    // caminho — nenhuma chamada.
    expect(pasta.findFirst).not.toHaveBeenCalled()
  })

  it('abrir pasta de OUTRO cliente é 404', async () => {
    // A validação vem antes de qualquer listagem: sem ela, bastaria adivinhar
    // um id para ler os arquivos de outra empresa.
    pasta.findFirst.mockResolvedValue(null)
    await expect(svc.abrirPasta(vinculo(), 'de-outro')).rejects.toThrow(/não encontrada|nao encontrada/i)
    expect(arquivo.findMany).not.toHaveBeenCalled()
  })

  it('lista subpastas e arquivos da pasta aberta', async () => {
    pasta.findFirst.mockResolvedValue({ id: 'p1', nome: 'Contratos', paiId: null })
    pasta.findMany.mockResolvedValue([
      { id: 'f1', nome: 'Aditivos', origem: 'CLIENTE', criadaEm: new Date(), _count: { filhas: 0, arquivos: 3 } },
    ])
    const r = await svc.abrirPasta(vinculo(), 'p1')
    expect(r.pastas[0]).toMatchObject({ id: 'f1', nome: 'Aditivos', itens: 3 })
    expect(arg<{ where: Record<string, unknown> }>(arquivo.findMany).where.pastaId).toBe('p1')
  })

  it('o caminho vai da raiz até a pasta atual', async () => {
    pasta.findFirst
      .mockResolvedValueOnce({ id: 'p2', nome: 'Aditivos', paiId: 'p1' })   // validação
      .mockResolvedValueOnce({ id: 'p2', nome: 'Aditivos', paiId: 'p1' })   // caminho
      .mockResolvedValueOnce({ id: 'p1', nome: 'Contratos', paiId: null })
    const r = await svc.abrirPasta(vinculo(), 'p2')
    expect(r.caminho.map(c => c.nome)).toEqual(['Contratos', 'Aditivos'])
  })

  it('sem podeEditar não cria pasta', async () => {
    // A regra era o NÍVEL (CONSULTA não escrevia). Virou permissão por usuário,
    // porque o escritório precisa poder dar e tirar isso de alguém sem mexer no
    // nível, que governa outras partes do portal.
    await expect(svc.criarPasta(vinculo({ podeEditar: false }), { nome: 'X' }, 'u1'))
      .rejects.toThrow(/não tem permissão/i)
    expect(pasta.create).not.toHaveBeenCalled()
  })

  it('recusa nome repetido lado a lado', async () => {
    // É o que evita o cliente criar "Notas" três vezes sem perceber.
    pasta.findFirst.mockResolvedValue({ id: 'ja-existe' })
    await expect(svc.criarPasta(vinculo(), { nome: 'Notas' }, 'u1')).rejects.toThrow(/Ja existe|Já existe/i)
  })

  it('cria no cliente do vínculo, marcada como do CLIENTE', async () => {
    pasta.findFirst.mockResolvedValue(null)
    await svc.criarPasta(vinculo(), { nome: 'Contratos' }, 'u1')
    const d = arg<{ data: Record<string, unknown> }>(pasta.create).data
    expect(d).toMatchObject({ clienteId: 'cli-1', nome: 'Contratos', origem: 'CLIENTE', criadaPorId: 'u1' })
  })

  it('não apaga pasta com conteúdo', async () => {
    // O cascade do banco levaria as subpastas e o SetNull soltaria os arquivos
    // na raiz — as duas perdas sem ninguém perceber.
    pasta.findFirst.mockResolvedValue({ id: 'p1', _count: { filhas: 0, arquivos: 2 } })
    await expect(svc.excluirPasta(vinculo({ podeExcluir: true }), 'p1'))
      .rejects.toThrow(/nao esta vazia|não está vazia/i)
    expect(pasta.delete).not.toHaveBeenCalled()
  })

  it('sem podeExcluir não apaga nem pasta vazia', async () => {
    pasta.findFirst.mockResolvedValue({ id: 'p1', _count: { filhas: 0, arquivos: 0 } })
    await expect(svc.excluirPasta(vinculo(), 'p1')).rejects.toThrow(/não tem permissão/i)
    expect(pasta.delete).not.toHaveBeenCalled()
  })

  it('com podeExcluir, apaga pasta vazia', async () => {
    pasta.findFirst.mockResolvedValue({ id: 'p1', _count: { filhas: 0, arquivos: 0 } })
    await svc.excluirPasta(vinculo({ podeExcluir: true }), 'p1')
    expect(pasta.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
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

  it('sem podeEditar não envia', async () => {
    await expect(svc.enviar(vinculo({ podeEditar: false }), base, 'u1'))
      .rejects.toThrow(/não tem permissão/i)
    expect(arquivo.create).not.toHaveBeenCalled()
  })

  it('sem podeVer, a listagem vem vazia em vez de erro', async () => {
    // Permissão negada não é falha do sistema: a pasta aparece sem conteúdo.
    await expect(svc.listar(vinculo({ podeVer: false }))).resolves.toEqual([])
  })

  it('recusa pasta de destino de outro cliente', async () => {
    pasta.findFirst.mockResolvedValue(null)
    await expect(svc.enviar(vinculo(), { ...base, pastaId: 'de-outro' }, 'u1'))
      .rejects.toThrow(/nao encontrada|não encontrada/i)
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

describe('trilha e aviso (Gestão de Arquivos)', () => {
  it('envio do cliente avisa o escritório — é o evento principal do módulo', async () => {
    // Sem este disparo, o documento que o cliente acabou de mandar só é
    // descoberto se alguém do escritório abrir o portal por conta própria.
    arquivo.create.mockResolvedValue({ id: 'a9', fileName: 'nota.pdf' })
    await svc.enviar(vinculo(), { fileName: 'nota.pdf', fileUrl: '/u/nota.pdf' }, 'u1')
    expect(notificacao.disparar).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'ARQUIVO_ENVIADO', clienteId: 'cli-1' }),
    )
  })

  it('envio entra na trilha marcado como lado CLIENTE', async () => {
    // O `lado` é o que separa o ato do cliente do ato do escritório na mesma
    // tabela. Sem ele, a trilha diria que alguém do escritório enviou.
    arquivo.create.mockResolvedValue({ id: 'a9', fileName: 'nota.pdf' })
    await svc.enviar(vinculo(), { fileName: 'nota.pdf', fileUrl: '/u/nota.pdf' }, 'u1')
    const d = arg<{ data: Record<string, unknown> }>(arquivoLog.create).data
    expect(d).toMatchObject({ clienteId: 'cli-1', evento: 'ENVIOU', lado: 'CLIENTE', usuarioId: 'u1' })
  })

  it('primeira abertura avisa; reabrir não', async () => {
    // Recibo de leitura responde "o cliente viu?". Reabrir não é notícia, e
    // avisar toda vez transformaria o evento de maior volume numa enxurrada.
    arquivo.findFirst.mockResolvedValue({
      id: 'a1', fileUrl: '/u/g.pdf', fileName: 'g.pdf', categoria: 'guias', lidoEm: null,
    })
    await svc.abrir(vinculo(), 'a1', 'u1')
    expect(notificacao.disparar).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'ARQUIVO_LIDO' }),
    )

    notificacao.disparar.mockClear()
    arquivo.findFirst.mockResolvedValue({
      id: 'a1', fileUrl: '/u/g.pdf', fileName: 'g.pdf', categoria: 'guias', lidoEm: new Date(),
    })
    await svc.abrir(vinculo(), 'a1', 'u1')
    expect(notificacao.disparar).not.toHaveBeenCalled()
  })

  it('falha ao gravar a trilha não derruba o envio do cliente', async () => {
    // O arquivo já foi enviado quando o log roda. Perder uma linha de auditoria
    // é ruim; devolver erro ao cliente por algo que ele não causou é pior.
    arquivo.create.mockResolvedValue({ id: 'a9', fileName: 'nota.pdf' })
    arquivoLog.create.mockRejectedValue(new Error('banco fora'))
    await expect(svc.enviar(vinculo(), { fileName: 'nota.pdf', fileUrl: '/u/n.pdf' }, 'u1'))
      .resolves.toMatchObject({ id: 'a9' })
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

describe('arquivo excluído pelo escritório', () => {
  it('some da listagem do cliente', async () => {
    // A exclusão é lógica — a linha continua na tabela para a lixeira e para a
    // auditoria. Sem o filtro, o arquivo seguiria na tela do cliente depois de
    // apagado.
    await svc.listar(vinculo())
    const w = arg<{ where: Record<string, unknown> }>(arquivo.findMany).where
    expect(w.excluidoEm).toBeNull()
  })

  it('e não abre nem com o id na mão', async () => {
    await svc.abrir(vinculo(), 'a1', 'u1').catch(() => undefined)
    const w = arg<{ where: Record<string, unknown> }>(arquivo.findFirst).where
    expect(w.excluidoEm).toBeNull()
  })
})
