import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common'
import { prisma } from '@saas/db'
import { SciService, type SciBalanceteLinha } from '../cliente/sci.service'
import { BiSyncEventsService } from './bi-sync-events.service'

export interface RefreshJob {
  status: 'idle' | 'running' | 'done' | 'error'
  progress: number
  message: string
  log: string[]
  startedAt: Date
  completedAt?: Date
}

interface RefreshStatusUpdate {
  status?: RefreshJob['status']
  progress?: number
  message?: string
  log?: string[]
  completedAt?: Date
}

@Injectable()
export class BiBalanceteService {
  private readonly logger = new Logger(BiBalanceteService.name)
  private refreshJobs = new Map<string, RefreshJob>()

  constructor(
    @Inject(forwardRef(() => SciService)) private readonly sciService: SciService,
    private readonly biSyncEvents: BiSyncEventsService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. syncCategoriasFromLinhas
  // ---------------------------------------------------------------------------
  async syncCategoriasFromLinhas(
    clienteId: string,
    preservarPersonalizacoes = true,
  ): Promise<{ synced: number; created: number }> {
    // Get all distinct contas from linhas
    const linhas = await prisma.clienteBiLinha.findMany({
      where: { clienteId },
      select: { conta: true, nomeConta: true },
      distinct: ['conta'],
    })

    // Filter contas that start with '0'
    const contasValidas = linhas.filter((l) => l.conta.startsWith('0'))

    // Build a set of all contas we need (including ancestors)
    const contaMap = new Map<string, string>() // conta -> nomeConta
    for (const { conta, nomeConta } of contasValidas) {
      contaMap.set(conta, nomeConta)
    }

    // Backfill ancestor categories
    for (const { conta } of contasValidas) {
      const parts = conta.split('.')
      for (let i = 1; i < parts.length; i++) {
        const ancestorConta = parts.slice(0, i).join('.')
        if (!contaMap.has(ancestorConta)) {
          contaMap.set(ancestorConta, ancestorConta)
        }
      }
    }

    // Get existing categories for this client
    const existingCategorias = await prisma.clienteBiCategoria.findMany({
      where: { clienteId },
    })
    const existingMap = new Map(existingCategorias.map((c) => [c.conta, c]))

    let synced = 0
    let created = 0

    for (const [conta, nomeConta] of contaMap) {
      const parts = conta.split('.')
      const nivel = parts.length
      const parentConta = parts.length > 1 ? parts.slice(0, -1).join('.') : null

      const existing = existingMap.get(conta)

      if (existing) {
        // Update existing — only update nomeSci (account name from SCI)
        // NEVER touch ativo, nomeExibicao, parentConta, ordem when preserving
        if (preservarPersonalizacoes) {
          await prisma.clienteBiCategoria.update({
            where: { id: existing.id },
            data: {
              nomeSci: nomeConta,
              nivel,
            },
          })
        } else {
          await prisma.clienteBiCategoria.update({
            where: { id: existing.id },
            data: {
              nomeSci: nomeConta,
              nomeExibicao: nomeConta,
              parentConta,
              nivel,
              ordem: 0,
              ativo: false,
            },
          })
        }
        synced++
      } else {
        // New category — ativo=false by default (user must opt-in via "No BI")
        await prisma.clienteBiCategoria.create({
          data: {
            clienteId,
            conta,
            nomeSci: nomeConta,
            nomeExibicao: nomeConta,
            parentConta,
            nivel,
            ordem: 0,
            tipo: 'real',
            ativo: false,
          },
        })
        created++
        synced++
      }
    }

    return { synced, created }
  }

  // ---------------------------------------------------------------------------
  // 2. normalizeContaForStorage
  // ---------------------------------------------------------------------------
  normalizeContaForStorage(conta: string): string {
    // Remove surrounding quotes
    let cleaned = conta.replace(/^["']|["']$/g, '')

    // Split, trim each part
    const parts = cleaned.split('.').map((p) => p.trim())

    // If first part is single digit, pad to 2 digits
    if (parts.length > 0 && parts[0] && /^\d$/.test(parts[0])) {
      parts[0] = parts[0].padStart(2, '0')
    }

    return parts.join('.')
  }

  // ---------------------------------------------------------------------------
  // 3. excluirBalancetePeriodo
  // ---------------------------------------------------------------------------
  async excluirBalancetePeriodo(
    clienteId: string,
    periodo: string,
  ): Promise<{ deletedLinhas: number; deletedCache: number }> {
    const ref = parseInt(periodo, 10)

    const deletedLinhas = await prisma.clienteBiLinha.deleteMany({
      where: { clienteId, periodo },
    })

    const deletedCache = await prisma.biCacheBalancete.deleteMany({
      where: { clienteId, ref },
    })

    return {
      deletedLinhas: deletedLinhas.count,
      deletedCache: deletedCache.count,
    }
  }

  // ---------------------------------------------------------------------------
  // 4. excluirBalancetePeriodoRange
  // ---------------------------------------------------------------------------
  async excluirBalancetePeriodoRange(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
  ): Promise<{ deletedLinhas: number; deletedCache: number }> {
    const refInicio = parseInt(periodoInicio, 10)
    const refFim = parseInt(periodoFim, 10)

    const anoInicio = Math.floor(refInicio / 100)
    const mesInicio = refInicio % 100
    const anoFim = Math.floor(refFim / 100)
    const mesFim = refFim % 100

    const refs = this.rangeMeses(anoInicio, mesInicio, anoFim, mesFim)

    let totalDeletedLinhas = 0
    let totalDeletedCache = 0

    for (const ref of refs) {
      const periodo = String(ref)
      const result = await this.excluirBalancetePeriodo(clienteId, periodo)
      totalDeletedLinhas += result.deletedLinhas
      totalDeletedCache += result.deletedCache
    }

    return {
      deletedLinhas: totalDeletedLinhas,
      deletedCache: totalDeletedCache,
    }
  }

  // ---------------------------------------------------------------------------
  // 5. getRefreshStatus
  // ---------------------------------------------------------------------------
  getRefreshStatus(
    clienteId: string,
    ano: number,
  ): {
    status: 'idle' | 'running' | 'done' | 'error'
    progress?: number
    message?: string
    log?: string[]
  } {
    const key = `${clienteId}_${ano}`
    const job = this.refreshJobs.get(key)

    if (!job) {
      return { status: 'idle' }
    }

    return {
      status: job.status,
      progress: job.progress,
      message: job.message,
      log: job.log,
    }
  }

  // ---------------------------------------------------------------------------
  // 6. startRefresh
  // ---------------------------------------------------------------------------
  startRefresh(
    clienteId: string,
    ano: number,
    force = false,
  ): { jobId: string } {
    const key = `${clienteId}_${ano}`

    const existing = this.refreshJobs.get(key)
    if (existing && existing.status === 'running' && !force) {
      return { jobId: key }
    }

    this.refreshJobs.set(key, {
      status: 'running',
      progress: 0,
      message: 'Iniciando importação...',
      log: [],
      startedAt: new Date(),
    })

    return { jobId: key }
  }

  // ---------------------------------------------------------------------------
  // 7. updateRefreshStatus
  // ---------------------------------------------------------------------------
  updateRefreshStatus(
    clienteId: string,
    ano: number,
    update: RefreshStatusUpdate,
  ): void {
    const key = `${clienteId}_${ano}`
    const job = this.refreshJobs.get(key)

    if (!job) {
      this.logger.warn(`Job não encontrado: ${key}`)
      return
    }

    if (update.status !== undefined) job.status = update.status
    if (update.progress !== undefined) job.progress = update.progress
    if (update.message !== undefined) job.message = update.message
    if (update.log !== undefined) job.log.push(...update.log)
    if (update.completedAt !== undefined) job.completedAt = update.completedAt
  }

  // ---------------------------------------------------------------------------
  // 8. monthRange
  // ---------------------------------------------------------------------------
  monthRange(
    ano: number,
    mes: number,
  ): { dataIni: string; dataFim: string } {
    const year = ano
    const month = mes

    // First day of month
    const dataIni = `${year}-${String(month).padStart(2, '0')}-01`

    // Last day of month
    const lastDay = new Date(year, month, 0).getDate()
    const dataFim = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    return { dataIni, dataFim }
  }

  // ---------------------------------------------------------------------------
  // 9. rangeMeses
  // ---------------------------------------------------------------------------
  rangeMeses(
    anoInicio: number,
    mesInicio: number,
    anoFim: number,
    mesFim: number,
  ): number[] {
    const refs: number[] = []

    let ano = anoInicio
    let mes = mesInicio

    while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
      refs.push(ano * 100 + mes)
      mes++
      if (mes > 12) {
        mes = 1
        ano++
      }
    }

    return refs
  }

  // ---------------------------------------------------------------------------
  // 10. getPeriodosImportados
  // ---------------------------------------------------------------------------
  async getPeriodosImportados(
    clienteId: string,
  ): Promise<Array<{ ref: number; totalLinhas: number; atualizadoEm: Date }>> {
    const caches = await prisma.biCacheBalancete.findMany({
      where: { clienteId },
      select: {
        ref: true,
        totalLinhas: true,
        atualizadoEm: true,
      },
      orderBy: { ref: 'asc' },
    })

    return caches.map((c) => ({
      ref: c.ref,
      totalLinhas: c.totalLinhas,
      atualizadoEm: c.atualizadoEm,
    }))
  }

  // ---------------------------------------------------------------------------
  // 11. importarBalanceteSci — Importação completa do SCI mês a mês
  // ---------------------------------------------------------------------------
  async importarBalanceteSci(opts: {
    clienteId: string
    prcodemp: number
    anoInicio: number
    mesInicio: number
    anoFim: number
    mesFim: number
    substituirExistentes: boolean
  }) {
    const { clienteId, prcodemp, anoInicio, mesInicio, anoFim, mesFim, substituirExistentes } = opts
    const refInicio = anoInicio * 100 + mesInicio
    const refFim = anoFim * 100 + mesFim
    // Mesma chave que getRefreshStatusByRange (clienteId_refInicio_refFim).
    const jobKey = `${clienteId}_${refInicio}_${refFim}`

    // Check if already running
    const existing = this.refreshJobs.get(jobKey)
    if (existing && existing.status === 'running') {
      return { started: false, job: existing }
    }

    const refs = this.rangeMeses(anoInicio, mesInicio, anoFim, mesFim)

    // Produção: a VPS não alcança o Firebird da LAN (SCI_DSN=\\192.168.0.2\...).
    // Se o Service Manager está conectado ao SSE, delegamos a leitura + upload a
    // ele (roda o sci_balancete.py local) — o job só acompanha o progresso, que o
    // SM alimenta via upload-balancete + import-done. Sem SM conectado, roda o
    // Python na própria máquina (dev na LAN).
    if (this.biSyncEvents.hasListeners()) {
      const job: RefreshJob = {
        status: 'running',
        progress: 0,
        message: `Aguardando o Service Manager processar ${refs.length} mês(es)...`,
        log: [`[${new Date().toLocaleTimeString('pt-BR')}] Pedido enviado ao Service Manager (${refs.length} meses)`],
        startedAt: new Date(),
      }
      ;(job as any).totalMeses = refs.length
      ;(job as any).ok = 0
      ;(job as any).skipped = 0
      ;(job as any).failed = 0
      this.refreshJobs.set(jobKey, job)
      this.biSyncEvents.emit({
        type: 'balancete-import-request',
        clienteId,
        payload: { prcodemp, refs, refInicio, refFim, substituirExistentes },
      })
      return { started: true, viaLauncher: true, job: { status: job.status, totalMeses: refs.length } }
    }

    // Em produção, a VPS não alcança o Firebird — sem SM conectado não há como
    // importar. Falha claro em vez de rodar o Python e errar mês a mês.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Service Manager não está conectado. Abra o Service Manager no PC do escritório para ' +
        'importar o balancete do SCI — o servidor não tem acesso ao Firebird da rede local.',
      )
    }

    const job: RefreshJob = {
      status: 'running',
      progress: 0,
      message: `Iniciando importação de ${refs.length} mês(es)...`,
      log: [],
      startedAt: new Date(),
    }
    this.refreshJobs.set(jobKey, job)

    // Run in background (fallback local — só funciona onde a máquina alcança o SCI)
    this.runImportJob(jobKey, clienteId, prcodemp, refs, substituirExistentes).catch((e) => {
      this.logger.error(`Import job failed: ${(e as Error).message}`)
    })

    return { started: true, job: { status: job.status, totalMeses: refs.length } }
  }

  /** Avança o job (fluxo via launcher) quando o SM sobe um mês por upload-balancete. */
  advanceLauncherJob(clienteId: string, ref: number, inserted: number): void {
    const job = this.findRunningJobForRef(clienteId, ref)
    if (!job) return
    const total = ((job as unknown as { totalMeses?: number }).totalMeses) || 1
    const j = job as unknown as { ok?: number; skipped?: number; failed?: number }
    if (inserted > 0) j.ok = (j.ok || 0) + 1
    else j.skipped = (j.skipped || 0) + 1
    const done = (j.ok || 0) + (j.skipped || 0) + (j.failed || 0)
    job.progress = Math.min(99, Math.round((done / total) * 100))
    const mes = ref % 100, ano = Math.floor(ref / 100)
    job.message = `Recebendo ${String(mes).padStart(2, '0')}/${ano} do Service Manager (${done}/${total})...`
    job.log.push(`[${new Date().toLocaleTimeString('pt-BR')}] ref=${ref}: ${inserted} linha(s) do Service Manager`)
  }

  /** Finaliza o job (fluxo via launcher) quando o SM termina — import-done. */
  async finalizeLauncherJob(
    clienteId: string, refInicio: number, refFim: number,
    result: { ok?: number; skipped?: number; failed?: number; errorsByMes?: Record<number, string>; erro?: string },
  ): Promise<{ ok: boolean }> {
    const jobKey = `${clienteId}_${refInicio}_${refFim}`
    const job = this.refreshJobs.get(jobKey)
    if (!job) return { ok: false }
    const ok = result.ok ?? (job as unknown as { ok?: number }).ok ?? 0
    const skipped = result.skipped ?? (job as unknown as { skipped?: number }).skipped ?? 0
    const failed = result.failed ?? 0
    // Sincroniza categorias no servidor (preserva personalizações do BI).
    try {
      await this.syncCategoriasFromLinhas(clienteId, true)
      job.log.push(`[${new Date().toLocaleTimeString('pt-BR')}] Categorias sincronizadas`)
    } catch (e) {
      job.log.push(`[${new Date().toLocaleTimeString('pt-BR')}] Erro ao sincronizar categorias: ${(e as Error).message}`)
    }
    job.status = (result.erro || (failed > 0 && ok === 0)) ? 'error' : 'done'
    job.progress = 100
    job.completedAt = new Date()
    job.message = result.erro
      ? `Falhou: ${result.erro}`
      : `Concluído: ${ok} importado(s), ${skipped} pulado(s), ${failed} falha(s)`
    const j = job as unknown as { ok?: number; skipped?: number; failed?: number; errorsByMes?: Record<number, string> }
    j.ok = ok; j.skipped = skipped; j.failed = failed
    if (result.errorsByMes) j.errorsByMes = result.errorsByMes
    return { ok: true }
  }

  /** Acha o job 'running' cuja faixa (refInicio..refFim, na chave) cobre `ref`. */
  private findRunningJobForRef(clienteId: string, ref: number): RefreshJob | null {
    for (const [key, job] of this.refreshJobs) {
      if (job.status !== 'running' || !key.startsWith(`${clienteId}_`)) continue
      const parts = key.split('_')
      const ri = Number(parts[parts.length - 2]), rf = Number(parts[parts.length - 1])
      if (Number.isFinite(ri) && Number.isFinite(rf) && ref >= ri && ref <= rf) return job
    }
    return null
  }

  private async runImportJob(
    jobKey: string,
    clienteId: string,
    prcodemp: number,
    refs: number[],
    substituirExistentes: boolean,
  ) {
    const job = this.refreshJobs.get(jobKey)!
    let ok = 0, skipped = 0, failed = 0
    const errorsByMes: Record<number, string> = {}

    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i]!
      const ano = Math.floor(ref / 100)
      const mes = ref % 100
      const { dataIni, dataFim } = this.monthRange(ano, mes)

      job.progress = Math.round((i / refs.length) * 100)
      job.message = `Importando ${String(mes).padStart(2, '0')}/${ano} (${i + 1}/${refs.length})...`
      job.log.push(`[${new Date().toLocaleTimeString('pt-BR')}] Consultando SCI ref=${ref}...`)

      // Retry logic (3 tentativas)
      let success = false
      let lastError = ''
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const linhas = await this.sciService.buscarBalanceteMes(prcodemp, dataIni, dataFim, ref)

          if (linhas.length === 0) {
            job.log.push(`[${new Date().toLocaleTimeString('pt-BR')}] ref=${ref}: 0 linhas retornadas (pulando)`)
            skipped++
            success = true
            break
          }

          // Persistir no banco
          await this.persistirMes(clienteId, ref, linhas, substituirExistentes)

          job.log.push(`[${new Date().toLocaleTimeString('pt-BR')}] ref=${ref}: ${linhas.length} linhas importadas`)
          ok++
          success = true
          break
        } catch (e) {
          lastError = (e as Error).message
          if (attempt < 2) {
            const wait = 700 * Math.pow(2, attempt)
            job.log.push(`[${new Date().toLocaleTimeString('pt-BR')}] ref=${ref}: tentativa ${attempt + 1} falhou, retry em ${wait}ms...`)
            await new Promise((r) => setTimeout(r, wait))
          }
        }
      }

      if (!success) {
        failed++
        errorsByMes[ref] = lastError
        job.log.push(`[${new Date().toLocaleTimeString('pt-BR')}] ref=${ref}: FALHOU após 3 tentativas — ${lastError}`)
      }
    }

    // Sync categorias (preservar personalizações)
    try {
      await this.syncCategoriasFromLinhas(clienteId, true)
      job.log.push(`[${new Date().toLocaleTimeString('pt-BR')}] Categorias sincronizadas`)
    } catch (e) {
      job.log.push(`[${new Date().toLocaleTimeString('pt-BR')}] Erro ao sincronizar categorias: ${(e as Error).message}`)
    }

    // Update job status
    job.status = failed > 0 && ok === 0 ? 'error' : 'done'
    job.progress = 100
    job.completedAt = new Date()
    job.message = `Concluído: ${ok} importado(s), ${skipped} pulado(s), ${failed} falha(s)`
    ;(job as any).ok = ok
    ;(job as any).skipped = skipped
    ;(job as any).failed = failed
    ;(job as any).errorsByMes = errorsByMes
    ;(job as any).totalMeses = refs.length
  }

  /**
   * Upload de balancete pré-importado (do Launcher local que tem acesso ao
   * SCI Firebird LAN). Path usado pelo `POST /api/bi-sync/upload-balancete`.
   * Espera o mesmo formato de linhas que `sci_balancete.py` retorna.
   */
  async uploadBalanceteMes(
    clienteId: string,
    ref: number,
    linhas: SciBalanceteLinha[],
    substituirExistentes = true,
  ) {
    if (!linhas || linhas.length === 0) {
      return { inserted: 0, skipped: true }
    }
    await this.persistirMes(clienteId, ref, linhas, substituirExistentes)
    return { inserted: linhas.length, skipped: false }
  }

  private async persistirMes(
    clienteId: string,
    ref: number,
    linhas: SciBalanceteLinha[],
    substituirExistentes: boolean,
  ) {
    const periodo = String(ref)

    // Normalizar e deduplicar
    const deduped = new Map<string, {
      conta: string; nomeConta: string
      saldoAnterior: number; debitos: number; creditos: number
      saldoAtual: number; movimento: number
    }>()

    for (const l of linhas) {
      const conta = this.normalizeContaForStorage(l.CLASSIFICACAO)
      if (!conta) continue

      const existing = deduped.get(conta)
      if (existing) {
        // Consolidar duplicatas somando valores
        existing.saldoAnterior += l.BDSALDO_ANTERIOR
        existing.debitos += l.DEBITO
        existing.creditos += l.CREDITO
        existing.saldoAtual += l.BDSALDO_ATUAL
        // Para movimento, usar o menor em valor absoluto (evitar inflação)
        if (Math.abs(l.BDMOVIMENTO) < Math.abs(existing.movimento)) {
          existing.movimento = l.BDMOVIMENTO
        }
      } else {
        deduped.set(conta, {
          conta,
          nomeConta: l.NOME_CONTA,
          saldoAnterior: l.BDSALDO_ANTERIOR,
          debitos: l.DEBITO,
          creditos: l.CREDITO,
          saldoAtual: l.BDSALDO_ATUAL,
          movimento: l.BDMOVIMENTO,
        })
      }
    }

    const rows = Array.from(deduped.values())

    await prisma.$transaction(async (tx) => {
      if (substituirExistentes) {
        await tx.clienteBiLinha.deleteMany({ where: { clienteId, periodo } })
      }

      if (substituirExistentes) {
        // Insert all
        await tx.clienteBiLinha.createMany({
          data: rows.map((r) => ({
            clienteId, periodo,
            conta: r.conta, nomeConta: r.nomeConta,
            saldoAnterior: r.saldoAnterior, debitos: r.debitos,
            creditos: r.creditos, saldoAtual: r.saldoAtual, movimento: r.movimento,
          })),
        })
      } else {
        // Insert only new (skip existing)
        for (const r of rows) {
          await tx.clienteBiLinha.upsert({
            where: { clienteId_periodo_conta: { clienteId, periodo, conta: r.conta } },
            create: {
              clienteId, periodo,
              conta: r.conta, nomeConta: r.nomeConta,
              saldoAnterior: r.saldoAnterior, debitos: r.debitos,
              creditos: r.creditos, saldoAtual: r.saldoAtual, movimento: r.movimento,
            },
            update: {}, // No update — preserve existing
          })
        }
      }

      // Update cache metadata
      await tx.biCacheBalancete.upsert({
        where: { clienteId_ref_fonte: { clienteId, ref, fonte: 'sci' } },
        create: { clienteId, ref, fonte: 'sci', totalLinhas: rows.length },
        update: { totalLinhas: rows.length, atualizadoEm: new Date() },
      })
    })
  }

  // Get refresh status by refInicio/refFim key
  getRefreshStatusByRange(clienteId: string, refInicio: number, refFim: number) {
    const jobKey = `${clienteId}_${refInicio}_${refFim}`
    const job = this.refreshJobs.get(jobKey)
    if (!job) return { status: 'idle' as const, job: null }
    return { status: job.status, job }
  }
}
