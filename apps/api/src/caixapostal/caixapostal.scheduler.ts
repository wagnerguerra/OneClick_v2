import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common'
import { CronJob } from 'cron'
import { prisma } from '@saas/db'
import { CaixaPostalService } from './caixapostal.service'

export interface ScheduleConfig {
  enabled: boolean
  cron: string
  delayMs: number
  filter: string // 'MENSAL' | 'ALL'
  clienteIds: string[] // IDs dos clientes selecionados (vazio = todos)
}

export interface ScheduleStatus {
  config: ScheduleConfig
  lastRun: string | null
  lastResult: {
    total: number
    success: number
    failed: number
    errors: string[]
    startedAt: string
    finishedAt: string
  } | null
  nextRun: string | null
  isRunning: boolean
}

const DEFAULT_CONFIG: ScheduleConfig = {
  enabled: false,
  cron: '0 6 * * *', // Diariamente às 6h
  delayMs: 5000,
  filter: 'MENSAL',
  clienteIds: [],
}

const CONFIG_KEYS = {
  enabled: 'CAIXA_POSTAL_SCHEDULE_ENABLED',
  cron: 'CAIXA_POSTAL_SCHEDULE_CRON',
  delayMs: 'CAIXA_POSTAL_SCHEDULE_DELAY_MS',
  filter: 'CAIXA_POSTAL_SCHEDULE_FILTER',
  clienteIds: 'CAIXA_POSTAL_SCHEDULE_CLIENTE_IDS',
  lastRun: 'CAIXA_POSTAL_SCHEDULE_LAST_RUN',
  lastResult: 'CAIXA_POSTAL_SCHEDULE_LAST_RESULT',
  progress: 'CAIXA_POSTAL_SCHEDULE_PROGRESS',
}

export interface ScheduleProgress {
  current: number
  total: number
  currentCliente: string
  status: 'running' | 'idle'
  items: Array<{ razaoSocial: string; status: 'ok' | 'erro' | 'pendente' | 'processando'; erro?: string }>
}

export interface ExecLogEntry {
  id: string
  tipo: 'manual' | 'automatico'
  iniciadoPor: string | null
  nomeUsuario: string | null
  iniciadoEm: string
  finalizadoEm: string | null
  total: number
  sucesso: number
  falhas: number
  status: 'running' | 'completed' | 'error'
  itens: Array<{ razaoSocial: string; documento: string; status: 'ok' | 'erro'; erro?: string; duracaoMs?: number }>
}

@Injectable()
export class CaixaPostalSchedulerService implements OnModuleInit, OnModuleDestroy {
  private cronJob: CronJob | null = null
  private isRunning = false

  constructor(
    @Inject(CaixaPostalService) private readonly caixaPostalService: CaixaPostalService,
  ) {}

  async onModuleInit() {
    try {
      const config = await this.getConfig()
      if (config.enabled) {
        this.startCron(config.cron)
        console.log(`[CaixaPostal Scheduler] Iniciado: ${config.cron}`)
      }
    } catch (e) {
      console.error('[CaixaPostal Scheduler] Erro ao iniciar:', (e as Error).message)
    }
  }

  onModuleDestroy() {
    this.stopCron()
  }

  // ── Configuração ──────────────────────────────────────

  async getConfig(): Promise<ScheduleConfig> {
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
      filter: map[CONFIG_KEYS.filter] || DEFAULT_CONFIG.filter,
      clienteIds,
    }
  }

  async updateConfig(config: Partial<ScheduleConfig>): Promise<ScheduleConfig> {
    const current = await this.getConfig()
    const merged = { ...current, ...config }

    const entries: [string, string][] = [
      [CONFIG_KEYS.enabled, String(merged.enabled)],
      [CONFIG_KEYS.cron, merged.cron],
      [CONFIG_KEYS.delayMs, String(merged.delayMs)],
      [CONFIG_KEYS.filter, merged.filter],
      [CONFIG_KEYS.clienteIds, JSON.stringify(merged.clienteIds || [])],
    ]

    for (const [key, value] of entries) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        key, value,
      )
    }

    // Reiniciar cron
    this.stopCron()
    if (merged.enabled) {
      this.startCron(merged.cron)
    }

    return merged
  }

  // ── Status ────────────────────────────────────────────

  async getStatus(): Promise<ScheduleStatus> {
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
      try {
        const next = this.cronJob.nextDate()
        nextRun = next.toISO()
      } catch { /* */ }
    }

    return {
      config,
      lastRun: map[CONFIG_KEYS.lastRun] || null,
      lastResult,
      nextRun,
      isRunning: this.isRunning,
    }
  }

  // ── Progresso em tempo real ─────────────────────────────

  private async saveProgress(progress: ScheduleProgress) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      CONFIG_KEYS.progress, JSON.stringify(progress),
    )
  }

  async getProgress(): Promise<ScheduleProgress> {
    if (!this.isRunning) return { current: 0, total: 0, currentCliente: '', status: 'idle', items: [] }
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT value FROM system_config WHERE key = $1`, CONFIG_KEYS.progress,
    )
    if (!rows.length) return { current: 0, total: 0, currentCliente: '', status: 'idle', items: [] }
    try { return JSON.parse(rows[0]!.value) } catch { return { current: 0, total: 0, currentCliente: '', status: 'idle', items: [] } }
  }

  // ── Execução ──────────────────────────────────────────

  async runNow(userId?: string): Promise<{ message: string }> {
    if (this.isRunning) {
      return { message: 'Uma execução já está em andamento.' }
    }
    // Executar em background (não bloqueia a resposta)
    this.executeFetch('manual', userId).catch(e => console.error('[CaixaPostal Scheduler] Erro:', e.message))
    return { message: 'Execução iniciada em background.' }
  }

  private async executeFetch(tipo: 'manual' | 'automatico' = 'automatico', userId?: string) {
    if (this.isRunning) return
    this.isRunning = true
    const startedAt = new Date().toISOString()
    const logId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // Salvar início
    await prisma.$executeRawUnsafe(
      `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      CONFIG_KEYS.lastRun, startedAt,
    )

    // Buscar nome do usuário que iniciou
    let nomeUsuario: string | null = null
    if (userId) {
      const userRows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM users WHERE id = $1 LIMIT 1`, userId,
      )
      nomeUsuario = userRows[0]?.name || null
    }

    // Criar registro de log
    await this.criarExecLog(logId, tipo, userId || null, nomeUsuario, startedAt)

    console.log(`[CaixaPostal Scheduler] Iniciando consulta em lote: ${startedAt} (tipo: ${tipo}, usuário: ${nomeUsuario || 'sistema'})`)

    const config = await this.getConfig()
    let total = 0, success = 0, failed = 0
    const errors: string[] = []
    const logItens: ExecLogEntry['itens'] = []

    try {
      // Buscar clientes (filtrados ou todos)
      const realIds = config.clienteIds.filter(id => id !== '__none__')
      if (config.clienteIds.includes('__none__') && realIds.length === 0) {
        await this.finalizarExecLog(logId, 0, 0, 0, 'completed', [])
        this.isRunning = false
        return
      }
      const where: Record<string, unknown> = { deletedAt: null }
      if (config.filter === 'MENSAL') where.situacao = 'MENSAL'
      if (realIds.length > 0) where.id = { in: realIds }

      const clientes = await prisma.cliente.findMany({
        where,
        select: { id: true, documento: true, razaoSocial: true, tipoDocumento: true },
        orderBy: { razaoSocial: 'asc' },
      })

      total = clientes.length
      const empresaId = await this.caixaPostalService.resolverEmpresaId()

      // Inicializar progresso
      const progressItems: ScheduleProgress['items'] = clientes.map(c => ({ razaoSocial: c.razaoSocial, status: 'pendente' as const }))
      await this.saveProgress({ current: 0, total, currentCliente: '', status: 'running', items: progressItems })

      for (let i = 0; i < clientes.length; i++) {
        const c = clientes[i]!
        const docLimpo = c.documento.replace(/\D/g, '')
        const tipo_doc = c.tipoDocumento === 'CPF' ? 1 : 2
        const itemStart = Date.now()

        // Atualizar progresso — processando
        progressItems[i] = { ...progressItems[i]!, status: 'processando' }
        await this.saveProgress({ current: i, total, currentCliente: c.razaoSocial, status: 'running', items: progressItems })

        try {
          await this.caixaPostalService.consultarClassificadas(
            { numero: docLimpo, tipo: tipo_doc },
            empresaId,
          )
          success++
          progressItems[i] = { ...progressItems[i]!, status: 'ok' }
          logItens.push({ razaoSocial: c.razaoSocial, documento: docLimpo, status: 'ok', duracaoMs: Date.now() - itemStart })
          console.log(`[CaixaPostal Scheduler] ${i + 1}/${total} OK: ${c.razaoSocial}`)

          // Limpar alerta de procuração se consulta foi bem-sucedida
          await prisma.cliente.update({
            where: { id: c.id },
            data: { alertaProcuracao: false, alertaProcuracaoEm: null },
          }).catch(() => {})
        } catch (e) {
          failed++
          const errMsg = (e as Error).message
          const msg = `${c.razaoSocial}: ${errMsg}`
          errors.push(msg)
          progressItems[i] = { ...progressItems[i]!, status: 'erro', erro: errMsg }
          logItens.push({ razaoSocial: c.razaoSocial, documento: docLimpo, status: 'erro', erro: errMsg, duracaoMs: Date.now() - itemStart })
          console.error(`[CaixaPostal Scheduler] ${i + 1}/${total} ERRO: ${msg}`)

          // Marcar alerta de procuração se erro 403
          if (errMsg.includes('403')) {
            await prisma.cliente.update({
              where: { id: c.id },
              data: { alertaProcuracao: true, alertaProcuracaoEm: new Date() },
            }).catch(() => {})
          }
        }

        // Salvar progresso atualizado
        await this.saveProgress({ current: i + 1, total, currentCliente: c.razaoSocial, status: 'running', items: progressItems })

        // Delay entre consultas (exceto na última)
        if (i < clientes.length - 1) {
          await new Promise(r => setTimeout(r, config.delayMs))
        }
      }

      // Limpar progresso
      await this.saveProgress({ current: total, total, currentCliente: '', status: 'idle', items: progressItems })
    } catch (e) {
      errors.push(`Erro geral: ${(e as Error).message}`)
      console.error('[CaixaPostal Scheduler] Erro geral:', (e as Error).message)
    }

    const finishedAt = new Date().toISOString()
    const result = { total, success, failed, errors: errors.slice(0, 50), startedAt, finishedAt }

    // Salvar resultado
    await prisma.$executeRawUnsafe(
      `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      CONFIG_KEYS.lastResult, JSON.stringify(result),
    )

    // Salvar log completo da execução
    await this.finalizarExecLog(logId, total, success, failed, failed > 0 ? 'completed' : 'completed', logItens)

    this.isRunning = false
    console.log(`[CaixaPostal Scheduler] Concluído: ${success}/${total} sucesso, ${failed} falhas em ${Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)}s`)
  }

  // ── Log de execuções ──────────────────────────────────

  private async ensureExecLogTable() {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS caixa_postal_exec_log (
        id TEXT PRIMARY KEY,
        tipo TEXT NOT NULL DEFAULT 'manual',
        iniciado_por TEXT,
        nome_usuario TEXT,
        iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finalizado_em TIMESTAMPTZ,
        total INT NOT NULL DEFAULT 0,
        sucesso INT NOT NULL DEFAULT 0,
        falhas INT NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'running',
        itens JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  }

  private async criarExecLog(id: string, tipo: string, userId: string | null, nomeUsuario: string | null, iniciadoEm: string) {
    await this.ensureExecLogTable()
    await prisma.$executeRawUnsafe(
      `INSERT INTO caixa_postal_exec_log (id, tipo, iniciado_por, nome_usuario, iniciado_em, status)
       VALUES ($1, $2, $3, $4, $5::timestamptz, 'running')`,
      id, tipo, userId, nomeUsuario, iniciadoEm,
    )
  }

  private async finalizarExecLog(id: string, total: number, sucesso: number, falhas: number, status: string, itens: ExecLogEntry['itens']) {
    await prisma.$executeRawUnsafe(
      `UPDATE caixa_postal_exec_log
       SET finalizado_em = NOW(), total = $2, sucesso = $3, falhas = $4, status = $5, itens = $6::jsonb
       WHERE id = $1`,
      id, total, sucesso, falhas, status, JSON.stringify(itens),
    )
  }

  async listarExecLogs(limit = 20, offset = 0): Promise<{ logs: ExecLogEntry[]; total: number }> {
    await this.ensureExecLogTable()
    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int as total FROM caixa_postal_exec_log`,
    )
    const totalCount = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string; tipo: string; iniciado_por: string | null; nome_usuario: string | null
      iniciado_em: Date; finalizado_em: Date | null; total: number; sucesso: number; falhas: number
      status: string; itens: string
    }>>(
      `SELECT id, tipo, iniciado_por, nome_usuario, iniciado_em, finalizado_em,
              total, sucesso, falhas, status, itens::text
       FROM caixa_postal_exec_log
       ORDER BY iniciado_em DESC
       LIMIT $1 OFFSET $2`,
      limit, offset,
    )

    const logs: ExecLogEntry[] = rows.map(r => {
      let itens: ExecLogEntry['itens'] = []
      try { itens = typeof r.itens === 'string' ? JSON.parse(r.itens) : r.itens } catch { /* */ }
      return {
        id: r.id,
        tipo: r.tipo as 'manual' | 'automatico',
        iniciadoPor: r.iniciado_por,
        nomeUsuario: r.nome_usuario,
        iniciadoEm: r.iniciado_em instanceof Date ? r.iniciado_em.toISOString() : String(r.iniciado_em),
        finalizadoEm: r.finalizado_em instanceof Date ? r.finalizado_em.toISOString() : r.finalizado_em ? String(r.finalizado_em) : null,
        total: r.total,
        sucesso: r.sucesso,
        falhas: r.falhas,
        status: r.status as 'running' | 'completed' | 'error',
        itens,
      }
    })

    return { logs, total: totalCount }
  }

  async getExecLogById(id: string): Promise<ExecLogEntry | null> {
    await this.ensureExecLogTable()
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string; tipo: string; iniciado_por: string | null; nome_usuario: string | null
      iniciado_em: Date; finalizado_em: Date | null; total: number; sucesso: number; falhas: number
      status: string; itens: string
    }>>(
      `SELECT id, tipo, iniciado_por, nome_usuario, iniciado_em, finalizado_em,
              total, sucesso, falhas, status, itens::text
       FROM caixa_postal_exec_log WHERE id = $1`,
      id,
    )
    if (!rows.length) return null
    const r = rows[0]!
    let itens: ExecLogEntry['itens'] = []
    try { itens = typeof r.itens === 'string' ? JSON.parse(r.itens) : r.itens } catch { /* */ }
    return {
      id: r.id,
      tipo: r.tipo as 'manual' | 'automatico',
      iniciadoPor: r.iniciado_por,
      nomeUsuario: r.nome_usuario,
      iniciadoEm: r.iniciado_em instanceof Date ? r.iniciado_em.toISOString() : String(r.iniciado_em),
      finalizadoEm: r.finalizado_em instanceof Date ? r.finalizado_em.toISOString() : r.finalizado_em ? String(r.finalizado_em) : null,
      total: r.total,
      sucesso: r.sucesso,
      falhas: r.falhas,
      status: r.status as 'running' | 'completed' | 'error',
      itens,
    }
  }

  // ── Cron management ───────────────────────────────────

  async listarClientesDisponiveis() {
    return prisma.cliente.findMany({
      where: { deletedAt: null, situacao: 'MENSAL' },
      select: { id: true, razaoSocial: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }

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
      console.error('[CaixaPostal Scheduler] Expressão cron inválida:', cronExpression, (e as Error).message)
    }
  }

  private stopCron() {
    if (this.cronJob) {
      this.cronJob.stop()
      this.cronJob = null
    }
  }
}
