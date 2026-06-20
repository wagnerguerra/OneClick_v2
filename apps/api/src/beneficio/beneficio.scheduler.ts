import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common'
import { CronJob } from 'cron'
import { prisma } from '@saas/db'
import { schedulersAtivos } from '../common/scheduler-guard'
import { BeneficioService } from './beneficio.service'

/**
 * Notificação mensal automática dos líderes de setor para lançarem os
 * apontamentos de benefícios. Roda todo dia 25 às 08:00 (BR): para cada
 * empresa com uma competência ABERTA/EM_APONTAMENTO no mês corrente, dispara
 * notificarLideres (e-mail + sino). Só executa em produção (schedulersAtivos).
 */
@Injectable()
export class BeneficioSchedulerService implements OnModuleInit, OnModuleDestroy {
  private cronJob: CronJob | null = null

  constructor(@Inject(BeneficioService) private readonly beneficioService: BeneficioService) {}

  onModuleInit() {
    if (!schedulersAtivos()) { console.log('[Beneficios Scheduler] desativado fora de produção'); return }
    // Dia 25 às 08:00, fuso de São Paulo.
    this.cronJob = new CronJob('0 8 25 * *', () => { void this.executar() }, null, true, 'America/Sao_Paulo')
    console.log('[Beneficios Scheduler] Iniciado: 0 8 25 * * (America/Sao_Paulo)')
  }

  onModuleDestroy() { this.cronJob?.stop() }

  private async executar() {
    try {
      const agora = new Date()
      const ano = agora.getFullYear(), mes = agora.getMonth() + 1
      const comps = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM beneficio_competencia WHERE ano=$1 AND mes=$2 AND status IN ('ABERTA','EM_APONTAMENTO')`, ano, mes,
      ).catch(() => [])
      for (const c of comps) {
        await this.beneficioService.notificarLideres(c.id).catch(e => console.error('[Beneficios Scheduler] notificar falhou', c.id, (e as Error).message))
      }
      console.log(`[Beneficios Scheduler] Notificados líderes de ${comps.length} competência(s) ${mes}/${ano}`)
    } catch (e) {
      console.error('[Beneficios Scheduler] erro:', (e as Error).message)
    }
  }
}
