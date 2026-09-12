/**
 * Obrigações no portal do cliente.
 *
 * Duas coisas se cruzam aqui, e errar qualquer uma tem consequência: o recorte
 * por ÁREA (o RH do cliente não deve ver o Fiscal) e a SITUAÇÃO que o cliente
 * lê — que é derivada, porque o status interno responde a outra pergunta.
 */

const servicoExecucao = { findMany: jest.fn() }

jest.mock('@saas/db', () => ({ prisma: { servicoExecucao } }))

import { PortalObrigacoesService } from './portal-obrigacoes.service'
import type { VinculoPortal } from './portal-escopo'

const svc = new PortalObrigacoesService()

const vinculo = (over: Partial<VinculoPortal> = {}): VinculoPortal => ({
  clienteId: 'cli-1',
  nivel: 'OPERACIONAL',
  areas: ['area-fiscal', 'area-trabalhista'],
  podeVer: true,
  podeEditar: true,
  podeExcluir: false,
  modulos: ['documentos', 'obrigacoes'],
  ...over,
})

/** Uma execução de obrigação acessória, como vem do banco. */
function execucao(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    status: 'EM_ANDAMENTO',
    concluidoEm: null,
    acessoriasComp: new Date(Date.UTC(2026, 6, 1)),   // jul/2026
    acessoriasPrazo: new Date(Date.UTC(2030, 0, 15)), // bem no futuro
    servico: { nome: 'Guia de FGTS', area: { name: 'Trabalhista' } },
    ...over,
  }
}

function whereDaChamada() {
  return servicoExecucao.findMany.mock.calls[0]![0].where as Record<string, any>
}

beforeEach(() => {
  jest.clearAllMocks()
  servicoExecucao.findMany.mockResolvedValue([])
})

describe('o recorte que toda consulta carrega', () => {
  it('lista só o cliente do vínculo e só obrigação acessória', async () => {
    // Sem `clienteId`, obrigação de outra empresa. Sem `ehObrigacaoAcessoria`,
    // a lista encheria com o trabalho interno do escritório.
    await svc.listar(vinculo())
    const w = whereDaChamada()
    expect(w.clienteId).toBe('cli-1')
    expect(w.servico.ehObrigacaoAcessoria).toBe(true)
  })

  it('recorta por área — e aqui a promessa do portal vale de verdade', async () => {
    // Toda obrigação acessória tem área própria, ao contrário dos arquivos do
    // Drive. Então o RH do cliente vê Trabalhista e não vê Fiscal.
    await svc.listar(vinculo({ areas: ['area-trabalhista'] }))
    expect(whereDaChamada().servico.areaId).toEqual({ in: ['area-trabalhista'] })
  })

  it('vínculo sem área nenhuma não vê NADA — e não vê tudo', async () => {
    // `{ in: [] }` devolve zero linhas; omitir o filtro devolveria a carteira
    // inteira daquele cliente. É o mesmo fail-closed do `__none__`.
    await svc.listar(vinculo({ areas: [] }))
    expect(whereDaChamada().servico.areaId).toEqual({ in: [] })
  })

  it('não lista execução CANCELADA', async () => {
    // Cancelamento é acerto interno (duplicidade, erro de cadastro). Mostrar
    // faria o cliente perguntar sobre obrigação que nunca existiu para ele.
    await svc.listar(vinculo())
    expect(whereDaChamada().status.in).not.toContain('CANCELADO')
  })
})

describe('a situação que o cliente lê', () => {
  it('CONCLUIDO vira ENTREGUE, com a data', async () => {
    servicoExecucao.findMany.mockResolvedValue([
      execucao({ status: 'CONCLUIDO', concluidoEm: new Date('2026-08-18T12:00:00Z') }),
    ])
    const [o] = await svc.listar(vinculo())
    expect(o!.situacao).toBe('ENTREGUE')
    expect(o!.entregueEm).toContain('2026-08-18')
  })

  it('prazo vencido e não entregue vira ATRASADA, com os dias', async () => {
    servicoExecucao.findMany.mockResolvedValue([
      execucao({ acessoriasPrazo: new Date(Date.UTC(2020, 0, 1)) }),
    ])
    const [o] = await svc.listar(vinculo())
    expect(o!.situacao).toBe('ATRASADA')
    expect(o!.diasDeAtraso).toBeGreaterThan(1000)
  })

  it('entrega FEITA depois do prazo não fica atrasada para sempre', async () => {
    // A obrigação foi cumprida. Marcá-la de vermelho eternamente
    // transformaria histórico em cobrança permanente.
    servicoExecucao.findMany.mockResolvedValue([
      execucao({
        status: 'CONCLUIDO',
        concluidoEm: new Date('2020-02-10T12:00:00Z'),
        acessoriasPrazo: new Date(Date.UTC(2020, 0, 1)),
      }),
    ])
    const [o] = await svc.listar(vinculo())
    expect(o!.situacao).toBe('ENTREGUE')
    expect(o!.diasDeAtraso).toBeNull()
  })

  it('PULADO vira DISPENSADA, e não conta como atraso', async () => {
    servicoExecucao.findMany.mockResolvedValue([
      execucao({ status: 'PULADO', acessoriasPrazo: new Date(Date.UTC(2020, 0, 1)) }),
    ])
    const [o] = await svc.listar(vinculo())
    expect(o!.situacao).toBe('DISPENSADA')
    expect(o!.diasDeAtraso).toBeNull()
  })

  it('prazo no futuro é EM_ANDAMENTO', async () => {
    servicoExecucao.findMany.mockResolvedValue([execucao()])
    const [o] = await svc.listar(vinculo())
    expect(o!.situacao).toBe('EM_ANDAMENTO')
  })

  it('não devolve nada do vocabulário interno', async () => {
    // O que NÃO sai daqui é a parte que mais importa: SLA, responsável,
    // observações e o status cru do Acessórias são assunto do escritório.
    servicoExecucao.findMany.mockResolvedValue([execucao()])
    const [o] = await svc.listar(vinculo())
    const chaves = Object.keys(o!)
    for (const interna of ['responsavel', 'responsavelId', 'prazoLimite', 'observacoes', 'acessoriasStatus', 'status']) {
      expect(chaves).not.toContain(interna)
    }
  })

  it('o prazo é o LEGAL, nunca o SLA interno', async () => {
    // O módulo interno usa `prazoLimite ?? acessoriasPrazo`. Aqui é só o
    // legal: o SLA é um compromisso que o escritório se impôs, e mostrá-lo
    // como "seu prazo" confundiria uma data que gera multa com uma que não.
    servicoExecucao.findMany.mockResolvedValue([execucao()])
    await svc.listar(vinculo())
    const select = servicoExecucao.findMany.mock.calls[0]![0].select as Record<string, unknown>
    expect(select.acessoriasPrazo).toBe(true)
    expect(select.prazoLimite).toBeUndefined()
  })
})

describe('competência', () => {
  it('filtra pelo mês pedido', async () => {
    await svc.listar(vinculo(), { competencia: '202607' })
    const janela = whereDaChamada().acessoriasComp
    expect(janela.gte.toISOString()).toContain('2026-07-01')
    expect(janela.lt.toISOString()).toContain('2026-08-01')
  })

  it('competência malformada devolve vazio em vez de ignorar o filtro', async () => {
    // Ignorar traria a lista inteira quando a tela pediu um mês — pior do que
    // não devolver nada, porque parece que funcionou.
    await expect(svc.listar(vinculo(), { competencia: '2026-07' })).resolves.toEqual([])
    expect(servicoExecucao.findMany).not.toHaveBeenCalled()
  })

  it('devolve AAAAMM, o formato que o resto do sistema usa', async () => {
    servicoExecucao.findMany.mockResolvedValue([execucao()])
    const [o] = await svc.listar(vinculo())
    expect(o!.competencia).toBe('202607')
  })
})

describe('resumo', () => {
  it('conta sobre a MESMA lista que a tela mostra', async () => {
    servicoExecucao.findMany.mockResolvedValue([
      execucao({ status: 'CONCLUIDO', concluidoEm: new Date('2026-08-01T12:00:00Z') }),
      execucao({ acessoriasPrazo: new Date(Date.UTC(2020, 0, 1)) }),
      execucao(),
      execucao({ status: 'PULADO' }),
    ])
    await expect(svc.resumo(vinculo())).resolves.toEqual({
      total: 4, entregues: 1, emAndamento: 1, atrasadas: 1, dispensadas: 1,
    })
  })
})
