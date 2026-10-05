import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common'
import { schedulersAtivos } from '../common/scheduler-guard'
import { CronJob } from 'cron'
import { prisma, type Prisma } from '@saas/db'
import { CndService } from './cnd.service'
import { cndLogger, exigirEmpresa, limparDoc } from './cnd-comum'
import { idsDeEmpresasInativas, semEmpresaInativa } from '../common/empresa-inativa'

const logger = cndLogger('Scheduler')

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

// Bases das chaves em system_config. ISO-003: a chave REAL é namespaced por
// empresa — `<BASE>:<empresaId>` — para que config/lastRun/lastResult/progress
// NUNCA vazem entre tenants (eram singletons globais lidos por qualquer sessão).
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
  /** Empresas com execução em andamento. Era um `isRunning` global: a execução de uma empresa bloqueava todas. */
  private readonly emExecucao = new Set<string>()
  // Empresa "home" (a mais antiga) — alvo do cron automático no servidor.
  private homeEmpresaId = ''

  constructor(@Inject(CndService) private readonly cndService: CndService) {}

  // Chave de system_config escopada por empresa (ISO-003).
  private sk(base: string, empresaId: string): string {
    return `${base}:${empresaId}`
  }

  async onModuleInit() {
    if (!schedulersAtivos()) { logger.log('desativado fora de produção (apenas a VPS executa)'); return }
    try {
      this.homeEmpresaId = await this.cndService.resolverEmpresaId()
      const config = await this.getConfig(this.homeEmpresaId)
      if (config.enabled) {
        this.startCron(config.cron)
        logger.log(`Iniciado: ${config.cron}`)
      }
    } catch (e) {
      logger.error(`Erro ao iniciar: ${(e as Error).message}`)
    }
  }

  onModuleDestroy() { this.stopCron() }

  // ── Configuracao ──────────────────────────────────────

  async getConfig(empresaId: string): Promise<CndScheduleConfig> {
    const keys = Object.values(CONFIG_KEYS).map(b => this.sk(b, empresaId))
    const rows = await prisma.$queryRawUnsafe<Array<{ key: string; value: string }>>(
      `SELECT key, value FROM system_config WHERE key = ANY($1::text[])`,
      keys,
    )
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

    let clienteIds: string[] = []
    const ciKey = this.sk(CONFIG_KEYS.clienteIds, empresaId)
    if (map[ciKey]) {
      try { clienteIds = JSON.parse(map[ciKey]!) } catch { /* */ }
    }

    return {
      enabled: map[this.sk(CONFIG_KEYS.enabled, empresaId)] === 'true',
      cron: map[this.sk(CONFIG_KEYS.cron, empresaId)] || DEFAULT_CONFIG.cron,
      delayMs: Number(map[this.sk(CONFIG_KEYS.delayMs, empresaId)]) || DEFAULT_CONFIG.delayMs,
      clienteIds,
    }
  }

  async updateConfig(empresaId: string, config: Partial<CndScheduleConfig>): Promise<CndScheduleConfig> {
    const current = await this.getConfig(empresaId)
    const merged = { ...current, ...config }

    const entries: [string, string][] = [
      [this.sk(CONFIG_KEYS.enabled, empresaId), String(merged.enabled)],
      [this.sk(CONFIG_KEYS.cron, empresaId), merged.cron],
      [this.sk(CONFIG_KEYS.delayMs, empresaId), String(merged.delayMs)],
      [this.sk(CONFIG_KEYS.clienteIds, empresaId), JSON.stringify(merged.clienteIds || [])],
    ]

    for (const [key, value] of entries) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        key, value,
      )
    }

    // O cron automático do servidor é único e atende a empresa home. Só
    // (re)inicia/para o cron quando a config alterada é a da home.
    if (empresaId && empresaId === this.homeEmpresaId) {
      this.stopCron()
      if (merged.enabled) this.startCron(merged.cron)
    }

    return merged
  }

  // ── Status ────────────────────────────────────────────

  async getStatus(empresaId: string) {
    const config = await this.getConfig(empresaId)
    const rows = await prisma.$queryRawUnsafe<Array<{ key: string; value: string }>>(
      `SELECT key, value FROM system_config WHERE key IN ($1, $2)`,
      this.sk(CONFIG_KEYS.lastRun, empresaId), this.sk(CONFIG_KEYS.lastResult, empresaId),
    )
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

    let lastResult = null
    const lrKey = this.sk(CONFIG_KEYS.lastResult, empresaId)
    if (map[lrKey]) {
      try { lastResult = JSON.parse(map[lrKey]!) } catch { /* */ }
    }

    let nextRun: string | null = null
    if (this.cronJob && empresaId === this.homeEmpresaId) {
      try { nextRun = this.cronJob.nextDate().toISO() } catch { /* */ }
    }

    return {
      config,
      lastRun: map[this.sk(CONFIG_KEYS.lastRun, empresaId)] || null,
      lastResult,
      nextRun,
      isRunning: this.emExecucao.has(empresaId),
    }
  }

  // ── Progresso ─────────────────────────────────────────

  private async saveProgress(empresaId: string, progress: CndScheduleProgress) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      this.sk(CONFIG_KEYS.progress, empresaId), JSON.stringify(progress),
    )
  }

  async getProgress(empresaId: string): Promise<CndScheduleProgress> {
    if (!this.emExecucao.has(empresaId)) return { current: 0, total: 0, currentCliente: '', status: 'idle', items: [] }
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT value FROM system_config WHERE key = $1`, this.sk(CONFIG_KEYS.progress, empresaId),
    )
    if (!rows.length) return { current: 0, total: 0, currentCliente: '', status: 'idle', items: [] }
    try { return JSON.parse(rows[0]!.value) } catch { return { current: 0, total: 0, currentCliente: '', status: 'idle', items: [] } }
  }

  // ── Execucao ──────────────────────────────────────────

  async runNow(userId: string | undefined, empresaId: string): Promise<{ message: string }> {
    const empId = exigirEmpresa(empresaId)
    if (this.emExecucao.has(empId)) return { message: 'Uma execucao ja esta em andamento.' }
    if ((await idsDeEmpresasInativas()).includes(empId)) return { message: 'Empresa inativa — execucao nao iniciada.' }
    this.executeFetch('manual', userId, empId).catch(e => logger.error(`Erro na execucao (empresa ${empId}): ${(e as Error).message}`))
    return { message: 'Execucao iniciada em background.' }
  }

  /**
   * Corpo inteiro dentro de try/finally: antes, as primeiras queries (lastRun,
   * nome do usuário, config) ficavam fora do try — uma falha nelas deixava
   * `isRunning` preso em true e o agendador travado até reiniciar a API.
   */
  private async executeFetch(tipo: 'manual' | 'automatico' = 'automatico', userId?: string, empresaId?: string) {
    // Escopo de empresa OBRIGATÓRIO — sem ele a execução leria clientes de todos
    // os tenants e gravaria resultado global (ISO-003). Default-deny.
    const empId = empresaId || this.homeEmpresaId
    if (!empId) { logger.error('Sem empresaId — execução abortada'); return }
    if (this.emExecucao.has(empId)) return
    this.emExecucao.add(empId)

    const startedAt = new Date().toISOString()
    let total = 0, success = 0, failed = 0, skipped = 0
    const errors: string[] = []

    try {
      // Empresa inativa não recebe rotina automática (nem manual disparada por
      // sessão antiga). Vale mesmo com o cron desligado.
      const inativas = await idsDeEmpresasInativas()
      if (inativas.includes(empId)) { logger.warn(`Empresa ${empId} inativa — execução ignorada`); return }

      await prisma.$executeRawUnsafe(
        `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        this.sk(CONFIG_KEYS.lastRun, empId), startedAt,
      )

      let nomeUsuario: string | null = null
      if (userId) {
        const userRows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
          `SELECT name FROM users WHERE id = $1 LIMIT 1`, userId,
        )
        nomeUsuario = userRows[0]?.name || null
      }

      logger.log(`Iniciando: ${startedAt} (tipo: ${tipo}, usuario: ${nomeUsuario || 'sistema'}, empresa: ${empId})`)

      const config = await this.getConfig(empId)

      try {
        const realIds = config.clienteIds.filter(id => id !== '__none__')
        if (config.clienteIds.includes('__none__') && realIds.length === 0) return

        const where: Prisma.ClienteWhereInput = { status: 'ATIVO', situacao: 'MENSAL', empresaId: empId }
        if (realIds.length > 0) where.id = { in: realIds }

        const clientes = await prisma.cliente.findMany({
          where: semEmpresaInativa<Prisma.ClienteWhereInput>(where, inativas),
          select: { id: true, documento: true, razaoSocial: true, tipoDocumento: true },
          orderBy: { razaoSocial: 'asc' },
        })

        total = clientes.length

        const progressItems: CndScheduleProgress['items'] = clientes.map(c => ({ razaoSocial: c.razaoSocial, status: 'pendente' as const }))
        await this.saveProgress(empId, { current: 0, total, currentCliente: '', status: 'running', items: progressItems })

        let consultouAlgum = false
        for (let i = 0; i < clientes.length; i++) {
          const c = clientes[i]!
          const docLimpo = limparDoc(c.documento)
          const tipDoc = c.tipoDocumento === 'CPF' ? 2 : 1 // SERPRO: 1 = CNPJ, 2 = CPF

          progressItems[i] = { ...progressItems[i]!, status: 'processando' }
          await this.saveProgress(empId, { current: i, total, currentCliente: c.razaoSocial, status: 'running', items: progressItems })

          try {
            // Certidão ainda válida por mais de 15 dias não é reemitida —
            // cada consulta ao SERPRO é paga. Conta como ok (a certidão existe).
            if (!(await this.cndService.precisaConsultar(empId, docLimpo))) {
              skipped++
              progressItems[i] = { ...progressItems[i]!, status: 'ok' }
            } else {
              if (consultouAlgum) await new Promise(r => setTimeout(r, config.delayMs))
              consultouAlgum = true
              const r = await this.cndService.consultar(empId, docLimpo, tipDoc, { clienteId: c.id, userId: userId || undefined })
              if (r.consultaFalhou) throw new Error(r.mensagemFalha || 'Consulta falhou (certidão anterior mantida)')
              success++
              progressItems[i] = { ...progressItems[i]!, status: 'ok' }
            }
          } catch (e) {
            failed++
            const msg = (e as Error).message
            errors.push(`${c.razaoSocial}: ${msg}`)
            progressItems[i] = { ...progressItems[i]!, status: 'erro', erro: msg }
          }

          await this.saveProgress(empId, { current: i + 1, total, currentCliente: c.razaoSocial, status: 'running', items: progressItems })
        }

        await this.saveProgress(empId, { current: total, total, currentCliente: '', status: 'idle', items: progressItems })
      } catch (e) {
        errors.push(`Erro geral: ${(e as Error).message}`)
      }

      const finishedAt = new Date().toISOString()
      const result = { total, success, failed, skipped, errors: errors.slice(0, 50), startedAt, finishedAt }

      await prisma.$executeRawUnsafe(
        `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        this.sk(CONFIG_KEYS.lastResult, empId), JSON.stringify(result),
      )

      logger.log(`Concluido (empresa ${empId}): ${success}/${total} sucesso, ${skipped} pulados, ${failed} falhas`)
    } finally {
      this.emExecucao.delete(empId)
    }
  }

  // ── Clientes disponiveis ──────────────────────────────

  async listarClientesDisponiveis(empresaId: string) {
    return prisma.cliente.findMany({
      where: { status: 'ATIVO', situacao: 'MENSAL', empresaId: empresaId || null },
      select: { id: true, razaoSocial: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }

  // ── Cron management ───────────────────────────────────

  // CRON PERMANENTEMENTE DESATIVADO — decisão: as consultas ao SERPRO (CND
  // federal) passam a ser feitas APENAS manualmente (botão "Executar agora"/
  // runNow ou os endpoints do router). Este método virou no-op: nem o
  // onModuleInit nem o updateConfig iniciam mais o agendamento automático.
  // Para reativar no futuro, restaure a criação do CronJob (histórico no git).
  private startCron(cronExpression: string) {
    logger.log(`Cron desativado permanentemente (era '${cronExpression}') — consultas apenas manuais.`)
  }

  private stopCron() {
    if (this.cronJob) { this.cronJob.stop(); this.cronJob = null }
  }
}
