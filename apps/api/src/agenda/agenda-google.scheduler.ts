import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { prisma } from '@saas/db'
import { schedulersAtivos } from '../common/scheduler-guard'
import { sqlSemEmpresaInativa } from '../common/empresa-inativa'
import { AgendaGoogleService } from './agenda-google.service'

/** Intervalo da importação do Google (o v1 rodava por gatilho externo; aqui, a cada 30 min). */
const INTERVALO_MS = 30 * 60 * 1000

/**
 * Importação periódica do Google Agenda (paridade com o sync-from-google.asp do
 * v1): para cada usuário ATIVO com conta conectada e empresa ativa, traz os
 * eventos de -7 a +30 dias. Um usuário com token revogado só gera aviso no log.
 */
@Injectable()
export class AgendaGoogleScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AgendaGoogleSync')
  private timer: NodeJS.Timeout | null = null
  private rodando = false

  constructor(@Inject(AgendaGoogleService) private readonly google: AgendaGoogleService) {}

  onModuleInit() {
    if (!schedulersAtivos()) return
    this.timer = setInterval(() => { void this.tick() }, INTERVALO_MS)
    this.logger.log(`Importação do Google Agenda agendada (a cada ${INTERVALO_MS / 60000} min)`)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async tick(): Promise<void> {
    if (this.rodando) return
    this.rodando = true
    try {
      const usuarios = await prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
        `SELECT t.user_id FROM google_calendar_tokens t
           JOIN users u ON u.id = t.user_id
          WHERE u.is_active = true AND ${sqlSemEmpresaInativa('u.empresa_id')}`,
      )
      for (const { user_id } of usuarios) {
        try {
          const r = await this.google.syncFromGoogle(user_id, 7, 30)
          if (r.created || r.updated || r.linked || r.errors) {
            this.logger.log(`usuário ${user_id}: +${r.created} novos, ${r.updated} atualizados, ${r.linked} vinculados, ${r.errors} erros`)
          }
        } catch (e) {
          this.logger.warn(`usuário ${user_id}: ${(e as Error).message}`)
        }
      }
    } catch (e) {
      this.logger.error(`Importação do Google falhou: ${(e as Error).message}`)
    } finally {
      this.rodando = false
    }
  }
}
