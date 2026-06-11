import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common'
import { schedulersAtivos } from '../common/scheduler-guard'
import { CronJob } from 'cron'
import { prisma } from '@saas/db'
import { CndService } from './cnd.service'

export interface CndScheduleConfig {
  enabled: boolean
  cron: string
  delayMs: number
  clienteIds: string[]
}

export interface CndScheduleProgress {
  current: number
  total: number
  currentCliente: string
  status: 'running' | 'idle'
  items: Array<{ razaoSocial: string; status: 'ok' | 'erro' | 'pendente' | 'processando'; erro?: string }>
}

const DEFAULT_CONFIG: CndScheduleConfig = {
  enabled: false,
  cron: '0 7 * * 1', // Segunda-feira as 7h
  delayMs: 5000,
  clienteIds: [],
}

const CONFIG_KEYS = {
  enabled: 'CND_SCHEDULE_ENABLED',
  cron: 'CND_SCHEDULE_CRON',
  delayMs: 'CND_SCHEDULE_DELAY_MS',
  clienteIds: 'CND_SCHEDULE_CLIENTE_IDS',
  lastRun: 'CND_SCHEDULE_LAST_RUN',
  lastResult: 'CND_SCHEDULE_LAST_RESULT',
  progress: 'CND_SCHEDULE_PROGRESS',
}

@Injectable()
export class CndSchedulerService implements OnModuleInit, OnModuleDestroy {
  private cronJob: CronJob | null = null
  private isRunning = false

  constructor(@Inject(CndService) private readonly cndService: CndService) {}

  async onModuleInit() {
    if (!schedulersAtivos()) { console.log('[Scheduler] desativado fora de produção (apenas a VPS executa)'); return }
    try {
      const config = await this.getConfig()
      if (config.enabled) {
        this.startCron(config.cron)
        console.log(`[CND Scheduler] Iniciado: ${config.cron}`)
      }
    } catch (e) {
      console.error('[CND Scheduler] Erro ao iniciar:', (e as Error).message)
    }
  }

  onModuleDestroy() { this.stopCron() }

  // ── Configuracao ──────────────────────────────────────

  async getConfig(): Promise<CndScheduleConfig> {
    const rows = await prisma.$queryRawUnsafe<Array<{ key: string; value: string }>>(
      `SELECT key, value FROM system_config WHERE key = ANY($1::text[])`,
      Object.values(CONFIG_KEYS),
    )
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

    let clienteIds: string[] = []
    if (map[CONFIG_KEYS.clienteIds]) {
      try { clienteIds = JSON.parse(map[CONFIG_KEYS.clienteIds]!) } catch { /* */ }
    }

    return {
      enabled: map[CONFIG_KEYS.enabled] === 'true',
      cron: map[CONFIG_KEYS.cron] || DEFAULT_CONFIG.cron,
      delayMs: Number(map[CONFIG_KEYS.delayMs]) || DEFAULT_CONFIG.delayMs,
      clienteIds,
    }
  }

  async updateConfig(config: Partial<CndScheduleConfig>): Promise<CndScheduleConfig> {
    const current = await this.getConfig()
    const merged = { ...current, ...config }

    const entries: [string, string][] = [
      [CONFIG_KEYS.enabled, String(merged.enabled)],
      [CONFIG_KEYS.cron, merged.cron],
      [CONFIG_KEYS.delayMs, String(merged.delayMs)],
      [CONFIG_KEYS.clienteIds, JSON.stringify(merged.clienteIds || [])],
    ]

    for (const [key, value] of entries) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        key, value,
      )
    }

    this.stopCron()
    if (merged.enabled) this.startCron(merged.cron)

    return merged
  }

  // ── Status ────────────────────────────────────────────

  async getStatus() {
    const config = await this.getConfig()
    const rows = await prisma.$queryRawUnsafe<Array<{ key: string; value: string }>>(
      `SELECT key, value FROM system_config WHERE key IN ($1, $2)`,
      CONFIG_KEYS.lastRun, CONFIG_KEYS.lastResult,
    )
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

    let lastResult = null
    if (map[CONFIG_KEYS.lastResult]) {
      try { lastResult = JSON.parse(map[CONFIG_KEYS.lastResult]!) } catch { /* */ }
    }

    let nextRun: string | null = null
    if (this.cronJob) {
      try { nextRun = this.cronJob.nextDate().toISO() } catch { /* */ }
    }

    return { config, lastRun: map[CONFIG_KEYS.lastRun] || null, lastResult, nextRun, isRunning: this.isRunning }
  }

  // ── Progresso ─────────────────────────────────────────

  private async saveProgress(progress: CndScheduleProgress) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      CONFIG_KEYS.progress, JSON.stringify(progress),
    )
  }

  async getProgress(): Promise<CndScheduleProgress> {
    if (!this.isRunning) return { current: 0, total: 0, currentCliente: '', status: 'idle', items: [] }
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT value FROM system_config WHERE key = $1`, CONFIG_KEYS.progress,
    )
    if (!rows.length) return { current: 0, total: 0, currentCliente: '', status: 'idle', items: [] }
    try { return JSON.parse(rows[0]!.value) } catch { return { current: 0, total: 0, currentCliente: '', status: 'idle', items: [] } }
  }

  // ── Execucao ──────────────────────────────────────────

  async runNow(userId?: string): Promise<{ message: string }> {
    if (this.isRunning) return { message: 'Uma execucao ja esta em andamento.' }
    this.executeFetch('manual', userId).catch(e => console.error('[CND Scheduler] Erro:', e.message))
    return { message: 'Execucao iniciada em background.' }
  }

  private async executeFetch(tipo: 'manual' | 'automatico' = 'automatico', userId?: string) {
    if (this.isRunning) return
    this.isRunning = true
    const startedAt = new Date().toISOString()

    await prisma.$executeRawUnsafe(
      `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      CONFIG_KEYS.lastRun, startedAt,
    )

    let nomeUsuario: string | null = null
    if (userId) {
      const userRows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM users WHERE id = $1 LIMIT 1`, userId,
      )
      nomeUsuario = userRows[0]?.name || null
    }

    console.log(`[CND Scheduler] Iniciando: ${startedAt} (tipo: ${tipo}, usuario: ${nomeUsuario || 'sistema'})`)

    const config = await this.getConfig()
    let total = 0, success = 0, failed = 0
    const errors: string[] = []

    try {
      const realIds = config.clienteIds.filter(id => id !== '__none__')
      if (config.clienteIds.includes('__none__') && realIds.length === 0) {
        this.isRunning = false; return
      }

      const where: Record<string, unknown> = { deletedAt: null, situacao: 'MENSAL' }
      if (realIds.length > 0) where.id = { in: realIds }

      const clientes = await prisma.cliente.findMany({
        where,
        select: { id: true, documento: true, razaoSocial: true, tipoDocumento: true },
        orderBy: { razaoSocial: 'asc' },
      })

      total = clientes.length
      const empresaId = await this.cndService.resolverEmpresaId()

      const progressItems: CndScheduleProgress['items'] = clientes.map(c => ({ razaoSocial: c.razaoSocial, status: 'pendente' as const }))
      await this.saveProgress({ current: 0, total, currentCliente: '', status: 'running', items: progressItems })

      for (let i = 0; i < clientes.length; i++) {
        const c = clientes[i]!
        const docLimpo = c.documento.replace(/\D/g, '')
        const tipDoc = c.tipoDocumento === 'CPF' ? 2 : 1

        progressItems[i] = { ...progressItems[i]!, status: 'processando' }
        await this.saveProgress({ current: i, total, currentCliente: c.razaoSocial, status: 'running', items: progressItems })

        try {
          await this.cndService.consultar(docLimpo, tipDoc, { clienteId: c.id, empresaId, userId: userId || undefined })
          success++
          progressItems[i] = { ...progressItems[i]!, status: 'ok' }
        } catch (e) {
          failed++
          const msg = (e as Error).message
          errors.push(`${c.razaoSocial}: ${msg}`)
          progressItems[i] = { ...progressItems[i]!, status: 'erro', erro: msg }
        }

        await this.saveProgress({ current: i + 1, total, currentCliente: c.razaoSocial, status: 'running', items: progressItems })

        if (i < clientes.length - 1) await new Promise(r => setTimeout(r, config.delayMs))
      }

      await this.saveProgress({ current: total, total, currentCliente: '', status: 'idle', items: progressItems })
    } catch (e) {
      errors.push(`Erro geral: ${(e as Error).message}`)
    }

    const finishedAt = new Date().toISOString()
    const result = { total, success, failed, errors: errors.slice(0, 50), startedAt, finishedAt }

    await prisma.$executeRawUnsafe(
      `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      CONFIG_KEYS.lastResult, JSON.stringify(result),
    )

    this.isRunning = false
    console.log(`[CND Scheduler] Concluido: ${success}/${total} sucesso, ${failed} falhas`)
  }

  // ── Clientes disponiveis ──────────────────────────────

  async listarClientesDisponiveis() {
    return prisma.cliente.findMany({
      where: { deletedAt: null, situacao: 'MENSAL' },
      select: { id: true, razaoSocial: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }

  // ── Cron management ───────────────────────────────────

  private startCron(cronExpression: string) {
    this.stopCron()
    try {
      this.cronJob = CronJob.from({
        cronTime: cronExpression,
        onTick: () => this.executeFetch('automatico'),
        timeZone: 'America/Sao_Paulo',
        start: true,
      })
    } catch (e) {
      console.error('[CND Scheduler] Cron invalida:', cronExpression, (e as Error).message)
    }
  }

  private stopCron() {
    if (this.cronJob) { this.cronJob.stop(); this.cronJob = null }
  }
}
