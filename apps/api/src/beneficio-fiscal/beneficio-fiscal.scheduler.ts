import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common'
import { CronJob } from 'cron'
import { schedulersAtivos } from '../common/scheduler-guard'
import { BeneficioFiscalService } from './beneficio-fiscal.service'

/**
 * Alerta proativo de benefícios fiscais a renovar. Roda TODO DIA às 08:30 (BR) e
 * avisa (sino + e-mail) sobre os benefícios VENCENDO/VENCIDO que ainda não têm
 * orçamento de renovação gerado — o farol da tela é passivo, este é o empurrão.
 * Um aviso consolidado por empresa. Só executa em produção (schedulersAtivos).
 */
@Injectable()
export class BeneficioFiscalSchedulerService implements OnModuleInit, OnModuleDestroy {
  private cronJob: CronJob | null = null

  constructor(@Inject(BeneficioFiscalService) private readonly service: BeneficioFiscalService) {}

  onModuleInit() {
    if (!schedulersAtivos()) { console.log('[BeneficiosFiscais Scheduler] desativado fora de produção'); return }
    this.cronJob = new CronJob('30 8 * * *', () => { void this.executar() }, null, true, 'America/Sao_Paulo')
    console.log('[BeneficiosFiscais Scheduler] Iniciado: 30 8 * * * (America/Sao_Paulo)')
  }

  onModuleDestroy() { this.cronJob?.stop() }

  private async executar() {
    try {
      // null = todas as empresas (o service agrupa e notifica por empresa).
      const r = await this.service.notificarVencimentos(null)
      if (r.itens > 0) {
        console.log(`[BeneficiosFiscais Scheduler] ${r.itens} benefício(s) a renovar — ${r.notificados} usuário(s) em ${r.empresas} empresa(s)`)
      }
    } catch (e) {
      console.error('[BeneficiosFiscais Scheduler] erro:', (e as Error).message)
    }
  }
}
