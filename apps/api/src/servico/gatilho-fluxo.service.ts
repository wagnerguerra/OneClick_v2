import { Injectable, Logger } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { Condicao } from '@saas/types'
import { avaliarCondicao } from '../processo/avaliador-condicao'
import { ServicoService } from './servico.service'

/**
 * Eventos do cadastro que podem iniciar um fluxo.
 *
 * Texto e não enum do banco de propósito: acrescentar um evento novo é
 * acrescentar uma linha aqui e passar a chamar `disparar()` no lugar certo —
 * sem migração e sem mexer na tabela de configuração.
 */
export const EVENTOS_GATILHO = [
  'encerramento_solicitado',
  'saida_agendada',
  'cliente_inativado',
  'cliente_criado',
  'area_contratada',
  'area_encerrada',
] as const
export type EventoGatilho = (typeof EVENTOS_GATILHO)[number]

export interface ResultadoGatilho {
  /** Execuções abertas, com o serviço que as originou. */
  disparados: Array<{ servicoId: string; servicoNome: string; execucaoId: string; aguardandoConfirmacao: boolean }>
  /** Regras que existiam e não dispararam — com o motivo. */
  ignorados: Array<{ servicoId: string; servicoNome: string; motivo: string }>
}

/**
 * A ponte entre um evento do cadastro e o motor de fluxos dos serviços.
 *
 * Até aqui existia UMA ponte, e ela era chumbada: `iniciarOffboarding` procurava
 * um serviço pelo NOME (variável de ambiente) e abria a execução, sempre a
 * mesma, sempre por clique humano. Qualquer outro evento do cadastro não tinha
 * como iniciar fluxo nenhum.
 *
 * Aqui a ligação vira dado: uma linha em `gatilhos_fluxo` diz "quando este
 * evento acontecer, e se esta condição bater, inicie aquele serviço". A cadeia
 * seguinte continua sendo responsabilidade do motor — encadeamento, blocos de
 * pergunta, SLA e notificação já existem e não são reimplementados aqui.
 */
@Injectable()
export class GatilhoFluxoService {
  private readonly logger = new Logger(GatilhoFluxoService.name)

  constructor(private readonly servicoService: ServicoService) {}

  /**
   * Dispara os gatilhos de um evento para um cliente.
   *
   * Nunca lança: um gatilho que falha não pode derrubar a operação que o
   * originou. Registrar um pedido de encerramento tem de funcionar mesmo que o
   * serviço configurado tenha sido apagado — o resultado devolvido diz o que
   * aconteceu, e quem chamou grava isso no histórico.
   */
  async disparar(
    evento: EventoGatilho,
    ctx: { clienteId: string; empresaId?: string | null; userId?: string | null },
  ): Promise<ResultadoGatilho> {
    const saida: ResultadoGatilho = { disparados: [], ignorados: [] }

    try {
      const regras = await prisma.gatilhoFluxo.findMany({
        where: {
          evento,
          ativo: true,
          // Gatilho sem empresa é global (vale para todas); com empresa, só para ela.
          ...(ctx.empresaId ? { OR: [{ empresaId: ctx.empresaId }, { empresaId: null }] } : {}),
        },
        orderBy: { ordem: 'asc' },
        include: { servico: { select: { id: true, nome: true, ativo: true } } },
      })
      if (regras.length === 0) return saida

      // Contexto da condição carregado UMA vez, não por regra.
      const cliente = await prisma.cliente.findUnique({
        where: { id: ctx.clienteId },
        select: { regime: true, situacao: true, tributacao: true, categoria: true, tipoCliente: true },
      })
      const contexto = {
        cliente: cliente
          ? {
              regime: cliente.regime ?? null,
              situacao: (cliente.situacao as string | null) ?? null,
              tributacao: (cliente.tributacao as string | null) ?? null,
              categoria: cliente.categoria ?? null,
              tipoCliente: cliente.tipoCliente ?? null,
            }
          : null,
        orcamento: null,
      }

      for (const regra of regras) {
        const nome = regra.servico?.nome ?? regra.servicoId

        if (!regra.servico?.ativo) {
          saida.ignorados.push({ servicoId: regra.servicoId, servicoNome: nome, motivo: 'serviço inativo' })
          continue
        }

        if (regra.condicao) {
          const passou = avaliarCondicao(regra.condicao as Condicao, contexto)
          if (!passou) {
            saida.ignorados.push({ servicoId: regra.servicoId, servicoNome: nome, motivo: 'condição não atendida' })
            continue
          }
        }

        // Já existe execução em aberto deste serviço para este cliente? Não abre
        // outra. Duas execuções do mesmo fluxo partiriam o histórico em dois —
        // é a mesma trava que o offboarding manual já aplicava.
        const emAberto = await prisma.servicoExecucao.findFirst({
          where: {
            servicoId: regra.servicoId,
            clienteId: ctx.clienteId,
            status: { notIn: ['CONCLUIDO', 'CANCELADO'] },
          },
          select: { id: true },
        })
        if (emAberto) {
          saida.ignorados.push({ servicoId: regra.servicoId, servicoNome: nome, motivo: 'já havia execução em aberto' })
          continue
        }

        try {
          const execucao = await this.servicoService.createExecucao(
            { servicoId: regra.servicoId, clienteId: ctx.clienteId, responsavelId: ctx.userId ?? null },
            ctx.empresaId ?? undefined,
            // `confirmar` = nasce parada esperando alguém puxar o gatilho. É o
            // padrão porque a cadeia de encerramento abre distrato, convoca as
            // áreas e fala com o cliente — um registro por engano custa caro.
            regra.confirmar ? { statusInicial: 'AGUARDANDO_INICIO' } : undefined,
          )
          saida.disparados.push({
            servicoId: regra.servicoId,
            servicoNome: nome,
            execucaoId: (execucao as { id: string }).id,
            aguardandoConfirmacao: regra.confirmar,
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'falha ao abrir a execução'
          this.logger.error(`Gatilho "${evento}" → "${nome}" falhou: ${msg}`)
          saida.ignorados.push({ servicoId: regra.servicoId, servicoNome: nome, motivo: msg })
        }
      }
    } catch (e) {
      // A tabela pode não existir ainda numa instalação que não aplicou o SQL.
      // Nesse caso o cadastro segue funcionando sem gatilho nenhum.
      this.logger.warn(`Não foi possível avaliar os gatilhos de "${evento}": ${e instanceof Error ? e.message : e}`)
    }

    return saida
  }
}
