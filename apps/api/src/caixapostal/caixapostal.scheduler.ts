import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common'
import { schedulersAtivos } from '../common/scheduler-guard'
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

// Bases das chaves em system_config. ISO-003: chave REAL namespaced por empresa
// (`<BASE>:<empresaId>`) — config/lastRun/lastResult/progress nunca vazam entre
// tenants (eram singletons globais lidos por qualquer sessão).
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
  // Empresa "home" (a mais antiga) — alvo do cron automático no servidor.
  private homeEmpresaId = ''

  constructor(
    @Inject(CaixaPostalService) private readonly caixaPostalService: CaixaPostalService,
  ) {}

  // Chave de system_config escopada por empresa (ISO-003).
  private sk(base: string, empresaId: string): string {
    return `${base}:${empresaId}`
  }

  async onModuleInit() {
    if (!schedulersAtivos()) { console.log('[Scheduler] desativado fora de produção (apenas a VPS executa)'); return }
    try {
      this.homeEmpresaId = await this.caixaPostalService.resolverEmpresaId()
      const config = await this.getConfig(this.homeEmpresaId)
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

  async getConfig(empresaId: string): Promise<ScheduleConfig> {
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
      filter: map[this.sk(CONFIG_KEYS.filter, empresaId)] || DEFAULT_CONFIG.filter,
      clienteIds,
    }
  }

  async updateConfig(empresaId: string, config: Partial<ScheduleConfig>): Promise<ScheduleConfig> {
    const current = await this.getConfig(empresaId)
    const merged = { ...current, ...config }

    const entries: [string, string][] = [
      [this.sk(CONFIG_KEYS.enabled, empresaId), String(merged.enabled)],
      [this.sk(CONFIG_KEYS.cron, empresaId), merged.cron],
      [this.sk(CONFIG_KEYS.delayMs, empresaId), String(merged.delayMs)],
      [this.sk(CONFIG_KEYS.filter, empresaId), merged.filter],
      [this.sk(CONFIG_KEYS.clienteIds, empresaId), JSON.stringify(merged.clienteIds || [])],
    ]

    for (const [key, value] of entries) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        key, value,
      )
    }

    // Cron automático do servidor é único e atende a empresa home.
    if (empresaId && empresaId === this.homeEmpresaId) {
      this.stopCron()
      if (merged.enabled) this.startCron(merged.cron)
    }

    return merged
  }

  // ── Status ────────────────────────────────────────────

  async getStatus(empresaId: string): Promise<ScheduleStatus> {
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
      try {
        const next = this.cronJob.nextDate()
        nextRun = next.toISO()
      } catch { /* */ }
    }

    return {
      config,
      lastRun: map[this.sk(CONFIG_KEYS.lastRun, empresaId)] || null,
      lastResult,
      nextRun,
      isRunning: this.isRunning && empresaId === this.homeEmpresaId,
    }
  }

  // ── Progresso em tempo real ─────────────────────────────

  private async saveProgress(empresaId: string, progress: ScheduleProgress) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      this.sk(CONFIG_KEYS.progress, empresaId), JSON.stringify(progress),
    )
  }

  async getProgress(empresaId: string): Promise<ScheduleProgress> {
    if (!this.isRunning) return { current: 0, total: 0, currentCliente: '', status: 'idle', items: [] }
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT value FROM system_config WHERE key = $1`, this.sk(CONFIG_KEYS.progress, empresaId),
    )
    if (!rows.length) return { current: 0, total: 0, currentCliente: '', status: 'idle', items: [] }
    try { return JSON.parse(rows[0]!.value) } catch { return { current: 0, total: 0, currentCliente: '', status: 'idle', items: [] } }
  }

  // ── Execução ──────────────────────────────────────────

  async runNow(userId: string | undefined, empresaId: string): Promise<{ message: string }> {
    if (this.isRunning) {
      return { message: 'Uma execução já está em andamento.' }
    }
    // Executar em background (não bloqueia a resposta)
    this.executeFetch('manual', userId, empresaId).catch(e => console.error('[CaixaPostal Scheduler] Erro:', e.message))
    return { message: 'Execução iniciada em background.' }
  }

  private async executeFetch(tipo: 'manual' | 'automatico' = 'automatico', userId?: string, empresaId?: string) {
    if (this.isRunning) return
    // Escopo de empresa OBRIGATÓRIO (ISO-003) — sem ele liaria clientes de todos
    // os tenants e gravaria resultado/log global. Default-deny.
    const empId = empresaId || this.homeEmpresaId
    if (!empId) { console.error('[CaixaPostal Scheduler] Sem empresaId — execução abortada'); return }
    this.isRunning = true
    const startedAt = new Date().toISOString()
    const logId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // Salvar início
    await prisma.$executeRawUnsafe(
      `INSERT INTO system_config (id, key, value, updated_at) VALUES ($1, $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      this.sk(CONFIG_KEYS.lastRun, empId), startedAt,
    )

    // Buscar nome do usuário que iniciou
    let nomeUsuario: string | null = null
    if (userId) {
      const userRows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM users WHERE id = $1 LIMIT 1`, userId,
      )
      nomeUsuario = userRows[0]?.name || null
    }

    // Criar registro de log (escopado por empresa)
    await this.criarExecLog(logId, tipo, userId || null, nomeUsuario, startedAt, empId)

    console.log(`[CaixaPostal Scheduler] Iniciando consulta em lote: ${startedAt} (tipo: ${tipo}, usuário: ${nomeUsuario || 'sistema'}, empresa: ${empId})`)

    const config = await this.getConfig(empId)
    let total = 0, success = 0, failed = 0
    const errors: string[] = []
    const logItens: ExecLogEntry['itens'] = []

    try {
      // Buscar clientes (filtrados ou todos) — sempre escopado pela empresa
      const realIds = config.clienteIds.filter(id => id !== '__none__')
      if (config.clienteIds.includes('__none__') && realIds.length === 0) {
        await this.finalizarExecLog(logId, 0, 0, 0, 'completed', [])
        this.isRunning = false
        return
      }
      const where: Record<string, unknown> = { deletedAt: null, empresaId: empId }
      if (config.filter === 'MENSAL') where.situacao = 'MENSAL'
      if (realIds.length > 0) where.id = { in: realIds }

      const clientes = await prisma.cliente.findMany({
        where,
        select: { id: true, documento: true, razaoSocial: true, tipoDocumento: true },
        orderBy: { razaoSocial: 'asc' },
      })

      total = clientes.length

      // Inicializar progresso
      const progressItems: ScheduleProgress['items'] = clientes.map(c => ({ razaoSocial: c.razaoSocial, status: 'pendente' as const }))
      await this.saveProgress(empId, { current: 0, total, currentCliente: '', status: 'running', items: progressItems })

      for (let i = 0; i < clientes.length; i++) {
        const c = clientes[i]!
        const docLimpo = c.documento.replace(/\D/g, '')
        const tipo_doc = c.tipoDocumento === 'CPF' ? 1 : 2
        const itemStart = Date.now()

        // Atualizar progresso — processando
        progressItems[i] = { ...progressItems[i]!, status: 'processando' }
        await this.saveProgress(empId, { current: i, total, currentCliente: c.razaoSocial, status: 'running', items: progressItems })

        try {
          await this.caixaPostalService.consultarClassificadas(
            { numero: docLimpo, tipo: tipo_doc },
            empId,
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
        await this.saveProgress(empId, { current: i + 1, total, currentCliente: c.razaoSocial, status: 'running', items: progressItems })

        // Delay entre consultas (exceto na última)
        if (i < clientes.length - 1) {
          await new Promise(r => setTimeout(r, config.delayMs))
        }
      }

      // Limpar progresso
      await this.saveProgress(empId, { current: total, total, currentCliente: '', status: 'idle', items: progressItems })
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
      this.sk(CONFIG_KEYS.lastResult, empId), JSON.stringify(result),
    )

    // Salvar log completo da execução
    await this.finalizarExecLog(logId, total, success, failed, failed > 0 ? 'completed' : 'completed', logItens)

    this.isRunning = false
    console.log(`[CaixaPostal Scheduler] Concluído: ${success}/${total} sucesso, ${failed} falhas em ${Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)}s`)
  }

  // ── Log de execuções ──────────────────────────────────
  //
  // Schema (incl. coluna empresa_id) garantido pela migração
  // manual_2026_06_26_caixa_postal_exec_log_empresa.sql (ISO-003 + R2-002).
  // Sem DDL no caminho de request.

  private async criarExecLog(id: string, tipo: string, userId: string | null, nomeUsuario: string | null, iniciadoEm: string, empresaId: string) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO caixa_postal_exec_log (id, tipo, iniciado_por, nome_usuario, iniciado_em, status, empresa_id)
       VALUES ($1, $2, $3, $4, $5::timestamptz, 'running', $6)`,
      id, tipo, userId, nomeUsuario, iniciadoEm, empresaId,
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

  async listarExecLogs(limit = 20, offset = 0, empresaId = ''): Promise<{ logs: ExecLogEntry[]; total: number }> {
    // Escopo por empresa (ISO-003): só logs do tenant ativo.
    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int as total FROM caixa_postal_exec_log WHERE empresa_id = $1`, empresaId,
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
       WHERE empresa_id = $3
       ORDER BY iniciado_em DESC
       LIMIT $1 OFFSET $2`,
      limit, offset, empresaId,
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

  async getExecLogById(id: string, empresaId = ''): Promise<ExecLogEntry | null> {
    // Escopo por empresa (ISO-003): default-deny se o log for de outro tenant.
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string; tipo: string; iniciado_por: string | null; nome_usuario: string | null
      iniciado_em: Date; finalizado_em: Date | null; total: number; sucesso: number; falhas: number
      status: string; itens: string
    }>>(
      `SELECT id, tipo, iniciado_por, nome_usuario, iniciado_em, finalizado_em,
              total, sucesso, falhas, status, itens::text
       FROM caixa_postal_exec_log WHERE id = $1 AND empresa_id = $2`,
      id, empresaId,
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

  async listarClientesDisponiveis(empresaId: string) {
    return prisma.cliente.findMany({
      where: { deletedAt: null, situacao: 'MENSAL', empresaId: empresaId || null },
      select: { id: true, razaoSocial: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }

  private startCron(cronExpression: string) {
    this.stopCron()
    try {
      this.cronJob = CronJob.from({
        cronTime: cronExpression,
        onTick: () => this.executeFetch('automatico', undefined, this.homeEmpresaId),
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
