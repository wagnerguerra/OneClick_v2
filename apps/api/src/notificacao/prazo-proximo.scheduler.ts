import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { schedulersAtivos } from '../common/scheduler-guard'
import { CronJob } from 'cron'
import { prisma } from '@saas/db'
import { NotificacaoService } from './notificacao.service'

/**
 * Scheduler horário que dispara o evento PRAZO_PROXIMO em execuções cujo
 * prazoLimite entra na janela de antecedência configurada nas regras.
 *
 * Estratégia: para cada regra ativa com evento=PRAZO_PROXIMO, calcula a
 * janela [now, now + antecedenciaHoras] e busca execuções EM_ANDAMENTO
 * (não pausadas) com prazoLimite nessa janela. Dispara a notificação;
 * idempotência via unique(regraId, execucaoId, evento) impede repetição.
 *
 * Roda no minuto 17 de cada hora pra escapar de picos com outros schedulers.
 */
@Injectable()
export class PrazoProximoScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrazoProximoScheduler.name)
  private job: CronJob | null = null

  constructor(private readonly notificacao: NotificacaoService) {}

  onModuleInit() {
    if (!schedulersAtivos()) { console.log('[Scheduler] desativado fora de produção (apenas a VPS executa)'); return }
    this.job = new CronJob('17 * * * *', () => { void this.executar() })
    this.job.start()
    this.logger.log('PrazoProximoScheduler iniciado — cron 17 * * * *')
  }

  onModuleDestroy() {
    this.job?.stop()
    this.job = null
  }

  async executar(): Promise<{ regras: number; disparados: number }> {
    const agora = new Date()
    const stats = { regras: 0, disparados: 0 }

    const regras = await prisma.servicoNotificacaoRegra.findMany({
      where: { ativa: true, evento: 'PRAZO_PROXIMO' },
      select: { id: true, servicoId: true, antecedenciaHoras: true },
    })
    stats.regras = regras.length
    if (regras.length === 0) return stats

    for (const regra of regras) {
      const horas = regra.antecedenciaHoras ?? 24
      const limite = new Date(agora.getTime() + horas * 60 * 60 * 1000)
      const execs = await prisma.servicoExecucao.findMany({
        where: {
          servicoId: regra.servicoId,
          status: 'EM_ANDAMENTO',
          pausado: false,
          prazoLimite: { gte: agora, lte: limite },
        },
        select: { id: true },
      })
      for (const e of execs) {
        // Idempotência fica no log do disparar (unique[regra,exec,evento])
        await this.notificacao.disparar(e.id, 'PRAZO_PROXIMO')
        stats.disparados++
      }
    }

    if (stats.disparados > 0) {
      this.logger.log(`[PrazoProximo] regras=${stats.regras} disparados=${stats.disparados}`)
    }
    return stats
  }
}
