import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common'
import { CronJob } from 'cron'
import { prisma } from '@saas/db'
import { schedulersAtivos } from '../../common/scheduler-guard'
import { DossieService } from './dossie.service'

/**
 * Revalidação diária da situação cadastral dos clientes ativos.
 *
 * É o único dado do dossiê que gera alerta de negócio: cliente que foi baixado,
 * suspenso ou declarado inapto muda o que o escritório precisa fazer por ele — e
 * ninguém avisa o contador. Os demais blocos seguem o TTL de 60 dias.
 *
 * Molde do `cnd.scheduler.ts`: CronJob + config em `system_config` com chave
 * namespaced por empresa, para nada vazar entre tenants.
 */

const CONFIG_KEYS = {
  enabled: 'DOSSIE_SITUACAO_ENABLED',
  cron: 'DOSSIE_SITUACAO_CRON',
  delayMs: 'DOSSIE_SITUACAO_DELAY_MS',
  lastRun: 'DOSSIE_SITUACAO_LAST_RUN',
  lastResult: 'DOSSIE_SITUACAO_LAST_RESULT',
}

/** Situação que não é "ativa" merece aviso. */
const SITUACOES_DE_ALERTA = ['baixada', 'suspensa', 'inapta', 'nula']

@Injectable()
export class DossieSchedulerService implements OnModuleInit, OnModuleDestroy {
  private cronJob: CronJob | null = null
  private rodando = false

  constructor(@Inject(DossieService) private readonly dossie: DossieService) {}

  async onModuleInit() {
    if (!schedulersAtivos()) return
    const cron = await this.lerConfig(CONFIG_KEYS.cron) || '0 6 * * *' // todo dia às 6h
    const ligado = (await this.lerConfig(CONFIG_KEYS.enabled)) === 'true'
    if (!ligado) return
    this.cronJob = new CronJob(cron, () => { void this.revalidar() }, null, true, 'America/Sao_Paulo')
  }

  onModuleDestroy() { this.cronJob?.stop() }

  private async lerConfig(chave: string): Promise<string | null> {
    const row = await prisma.systemConfig.findFirst({ where: { key: chave }, select: { value: true } })
      .catch(() => null)
    return row?.value ?? null
  }

  private async gravarConfig(chave: string, valor: string) {
    await prisma.systemConfig.upsert({
      where: { key: chave },
      create: { key: chave, value: valor },
      update: { value: valor },
    }).catch(() => { /* config é diagnóstico, não pode derrubar o job */ })
  }

  /**
   * Revalida só quem já tem dossiê — o primeiro enriquecimento é trabalho do
   * backfill, com você olhando. O job cuida da manutenção, não da largada.
   */
  async revalidar(): Promise<{ verificados: number; alertas: number }> {
    if (this.rodando) return { verificados: 0, alertas: 0 }
    this.rodando = true
    let verificados = 0
    let alertas = 0
    try {
      const comDossie = await prisma.clienteDossieFato.findMany({
        where: { bloco: 'receita', campo: 'situacao_cadastral' },
        select: { clienteId: true, valor: true },
      })

      for (const f of comDossie) {
        const cliente = await prisma.cliente.findUnique({
          where: { id: f.clienteId },
          select: { id: true, status: true },
        })
        if (!cliente || cliente.status !== 'ATIVO') continue

        const antes = (f.valor || '').toLowerCase()
        const r = await this.dossie.enriquecer(f.clienteId, { forcar: true })
        verificados++
        if (!r.ok) continue

        const depoisFato = await prisma.clienteDossieFato.findUnique({
          where: { clienteId_bloco_campo: { clienteId: f.clienteId, bloco: 'receita', campo: 'situacao_cadastral' } },
          select: { valor: true },
        })
        const depois = (depoisFato?.valor || '').toLowerCase()
        if (depois && depois !== antes && SITUACOES_DE_ALERTA.some(s => depois.includes(s))) {
          alertas++
          await this.registrarAlerta(cliente.id, f.valor, depoisFato?.valor || '')
        }
        await new Promise(r2 => setTimeout(r2, 350))
      }

      await this.gravarConfig(CONFIG_KEYS.lastRun, new Date().toISOString())
      await this.gravarConfig(CONFIG_KEYS.lastResult, JSON.stringify({ verificados, alertas }))
      return { verificados, alertas }
    } finally {
      this.rodando = false
    }
  }

  /**
   * O alerta entra na linha do tempo do cliente, que é onde o time já olha.
   * Notificação por sino fica para quando o time definir quem deve receber —
   * mandar para todo mundo é o caminho mais curto para ninguém ler.
   */
  private async registrarAlerta(clienteId: string, antes: string | null, depois: string) {
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { version: true } })
    await prisma.clienteEvent.create({
      data: {
        clienteId,
        type: 'dossie_situacao',
        version: cliente?.version ?? 1,
        changes: { situacao_cadastral: { from: antes, to: depois } },
      },
    }).catch((e) => console.warn('[Dossie] Falha ao registrar alerta de situação:', (e as Error).message))
  }
}
