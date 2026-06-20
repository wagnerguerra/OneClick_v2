import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common'
import { CronJob } from 'cron'
import { prisma } from '@saas/db'
import { schedulersAtivos } from '../common/scheduler-guard'
import { BeneficioService } from './beneficio.service'

/**
 * Alerta mensal automático aos líderes de setor para lançarem os apontamentos.
 * Roda TODO DIA às 08:00 (BR) e, para cada empresa com `notificar_auto=true` cujo
 * `dia_notificacao` seja o dia de hoje, dispara notificarLideres (e-mail + sino)
 * na competência ABERTA/EM_APONTAMENTO do mês corrente. O dia é configurável em
 * /beneficios › Configurações. Só executa em produção (schedulersAtivos).
 */
@Injectable()
export class BeneficioSchedulerService implements OnModuleInit, OnModuleDestroy {
  private cronJob: CronJob | null = null

  constructor(@Inject(BeneficioService) private readonly beneficioService: BeneficioService) {}

  onModuleInit() {
    if (!schedulersAtivos()) { console.log('[Beneficios Scheduler] desativado fora de produção'); return }
    this.cronJob = new CronJob('0 8 * * *', () => { void this.executar() }, null, true, 'America/Sao_Paulo')
    console.log('[Beneficios Scheduler] Iniciado: 0 8 * * * (America/Sao_Paulo)')
  }

  onModuleDestroy() { this.cronJob?.stop() }

  private async executar() {
    try {
      // Dia/mês/ano no fuso de São Paulo (independe do fuso do servidor).
      const br = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
      const dia = br.getDate(), mes = br.getMonth() + 1, ano = br.getFullYear()
      const empresas = await prisma.$queryRawUnsafe<Array<{ empresa_id: string }>>(
        `SELECT empresa_id FROM beneficio_config WHERE notificar_auto=true AND dia_notificacao=$1`, dia,
      ).catch(() => [])
      let n = 0
      for (const e of empresas) {
        const comp = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM beneficio_competencia WHERE empresa_id=$1 AND ano=$2 AND mes=$3 AND status IN ('ABERTA','EM_APONTAMENTO') LIMIT 1`,
          e.empresa_id, ano, mes,
        ).catch(() => [])
        if (comp[0]) { await this.beneficioService.notificarLideres(comp[0].id).catch(err => console.error('[Beneficios Scheduler] notificar falhou', comp[0]!.id, (err as Error).message)); n++ }
      }
      if (empresas.length) console.log(`[Beneficios Scheduler] dia ${dia}: ${n}/${empresas.length} empresa(s) notificadas (${mes}/${ano})`)
    } catch (e) {
      console.error('[Beneficios Scheduler] erro:', (e as Error).message)
    }
  }
}
