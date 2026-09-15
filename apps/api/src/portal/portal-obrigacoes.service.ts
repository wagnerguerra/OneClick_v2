import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { VinculoPortal } from './portal-escopo'

/**
 * Obrigações do mês, do lado do CLIENTE.
 *
 * O escritório já tem `/minhas-obrigacoes`, que responde "o que EU tenho para
 * entregar": SLA, responsável, passos, pausas. Nada disso é assunto do cliente
 * — para ele a pergunta é outra, e bem mais curta: *o que a minha empresa deve,
 * quando vence, e já foi entregue?*
 *
 * Por isso este serviço não reaproveita aquele: reaproveitar traria o
 * vocabulário interno para dentro do portal, e o filtro que separa os dois é a
 * parte que mais importa. O que se compartilha são os DADOS
 * (`ServicoExecucao` das obrigações acessórias), não a leitura deles.
 */

/**
 * O que o cliente vê como situação.
 *
 * Derivada, nunca o `status` cru: `EM_ANDAMENTO` significa "o escritório está
 * trabalhando nisto", que é informação interna e não responde à pergunta do
 * cliente. `acessoriasStatus` também fica fora — é o texto cru do Acessórias
 * ("Ent. antecipada", "Atrasada!"), guardado para depuração e sujeito a mudar
 * do outro lado sem aviso.
 */
export type SituacaoObrigacao = 'ENTREGUE' | 'ATRASADA' | 'EM_ANDAMENTO' | 'DISPENSADA'

export interface ObrigacaoDoPortal {
  id: string
  nome: string
  area: string | null
  /** Competência (mês de referência), AAAAMM. */
  competencia: string
  /** Prazo LEGAL da entrega. */
  prazo: string
  situacao: SituacaoObrigacao
  /** Data da entrega, quando houve. */
  entregueEm: string | null
  /** Dias de atraso — só quando `situacao` é ATRASADA. */
  diasDeAtraso: number | null
}

function competenciaDe(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

@Injectable()
export class PortalObrigacoesService {
  /**
   * Recorte por área — e aqui ele FUNCIONA, ao contrário do porta-arquivos.
   *
   * Toda obrigação acessória tem área própria (`Servico.areaId`), conferido na
   * base inteira: 7.939 de 7.939. Então a promessa do portal de separar por
   * área vale integralmente nesta tela — o RH do cliente vê Trabalhista e não
   * vê Fiscal.
   *
   * Vínculo sem área nenhuma cai em lista vazia, não em lista completa. É o
   * mesmo fail-closed do `__none__` do lado interno: `{ in: [] }` devolve zero
   * linhas, enquanto omitir o filtro devolveria tudo.
   */
  private filtroDeArea(vinculo: VinculoPortal) {
    return { areaId: { in: vinculo.areas } }
  }

  /**
   * As obrigações de uma competência, ou das mais recentes quando não se pede
   * uma.
   *
   * O prazo é SEMPRE o `acessoriasPrazo` — o prazo legal. O
   * `ServicoExecucao.prazoLimite`, que o módulo interno usa como primeira
   * opção, é o SLA que o escritório se impôs: mostrá-lo ao cliente exporia um
   * compromisso interno como se fosse a data que gera multa. São coisas
   * diferentes, e só uma delas é do cliente.
   */
  async listar(
    vinculo: VinculoPortal,
    input: { competencia?: string | null } = {},
  ): Promise<ObrigacaoDoPortal[]> {
    const competencia = input.competencia?.trim() || null
    if (competencia && !/^\d{6}$/.test(competencia)) return []

    const janela = competencia
      ? {
          gte: new Date(Date.UTC(Number(competencia.slice(0, 4)), Number(competencia.slice(4, 6)) - 1, 1)),
          lt: new Date(Date.UTC(Number(competencia.slice(0, 4)), Number(competencia.slice(4, 6)), 1)),
        }
      : undefined

    const execucoes = await prisma.servicoExecucao.findMany({
      where: {
        clienteId: vinculo.clienteId,
        servico: { ehObrigacaoAcessoria: true, ...this.filtroDeArea(vinculo) },
        acessoriasComp: janela ?? { not: null },
        // CANCELADO fica de fora: execução cancelada é acerto interno do
        // escritório (duplicidade, erro de cadastro), e listá-la faria o
        // cliente perguntar sobre uma obrigação que nunca existiu para ele.
        status: { in: ['EM_ANDAMENTO', 'AGUARDANDO_INICIO', 'CONCLUIDO', 'PULADO'] },
      },
      orderBy: [{ acessoriasComp: 'desc' }, { acessoriasPrazo: 'asc' }],
      take: 400,
      select: {
        id: true,
        status: true,
        concluidoEm: true,
        acessoriasComp: true,
        acessoriasPrazo: true,
        servico: { select: { nome: true, area: { select: { name: true } } } },
      },
    })

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    return execucoes
      .filter(e => e.acessoriasComp && e.acessoriasPrazo)
      .map(e => {
        const prazo = e.acessoriasPrazo!
        const entregue = e.status === 'CONCLUIDO'
        const dispensada = e.status === 'PULADO'
        // Atrasada só faz sentido no que ainda não foi entregue: uma entrega
        // feita depois do prazo já cumpriu a obrigação, e marcá-la de vermelho
        // para sempre transformaria histórico em cobrança permanente.
        const atrasada = !entregue && !dispensada && prazo.getTime() < hoje.getTime()

        const situacao: SituacaoObrigacao = entregue
          ? 'ENTREGUE'
          : dispensada
          ? 'DISPENSADA'
          : atrasada
          ? 'ATRASADA'
          : 'EM_ANDAMENTO'

        return {
          id: e.id,
          nome: e.servico.nome,
          area: e.servico.area?.name ?? null,
          competencia: competenciaDe(e.acessoriasComp!),
          prazo: prazo.toISOString(),
          situacao,
          entregueEm: entregue && e.concluidoEm ? e.concluidoEm.toISOString() : null,
          diasDeAtraso: atrasada
            ? Math.floor((hoje.getTime() - prazo.getTime()) / 86_400_000)
            : null,
        }
      })
  }

  /**
   * Competências que este cliente tem, para o seletor.
   *
   * `distinct` no banco em vez de reduzir a lista em memória: sem isso a tela
   * precisaria baixar todas as obrigações só para descobrir quais meses
   * existem.
   */
  async competencias(vinculo: VinculoPortal): Promise<string[]> {
    const linhas = await prisma.servicoExecucao.findMany({
      where: {
        clienteId: vinculo.clienteId,
        servico: { ehObrigacaoAcessoria: true, ...this.filtroDeArea(vinculo) },
        acessoriasComp: { not: null },
      },
      distinct: ['acessoriasComp'],
      orderBy: { acessoriasComp: 'desc' },
      take: 36,
      select: { acessoriasComp: true },
    })
    return linhas.filter(l => l.acessoriasComp).map(l => competenciaDe(l.acessoriasComp!))
  }

  /**
   * Contadores do cabeçalho.
   *
   * Conta sobre a MESMA lista que a tela mostra, chamando `listar`, em vez de
   * um `groupBy` próprio. Dois caminhos para o mesmo número divergem no dia em
   * que um deles mudar — e o número que desmente a lista ao lado destrói a
   * confiança na tela inteira.
   */
  async resumo(vinculo: VinculoPortal, competencia?: string | null) {
    const lista = await this.listar(vinculo, { competencia })
    return {
      total: lista.length,
      entregues: lista.filter(o => o.situacao === 'ENTREGUE').length,
      emAndamento: lista.filter(o => o.situacao === 'EM_ANDAMENTO').length,
      atrasadas: lista.filter(o => o.situacao === 'ATRASADA').length,
      dispensadas: lista.filter(o => o.situacao === 'DISPENSADA').length,
    }
  }
}
