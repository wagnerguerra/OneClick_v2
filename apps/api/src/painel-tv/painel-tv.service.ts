import { Injectable, Inject } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
import { CrmService } from '../crm/crm.service'
import { OrcamentoService } from '../orcamento/orcamento.service'
import { ContratoService } from '../contrato/contrato.service'
import { HelpdeskService } from '../helpdesk/helpdesk.service'
import { METRIC_BY_ID, catalogForUi, type SourceName } from './metric-catalog'

export interface ResolveCtx {
  empresaId?: string | null
  userId?: string
  isMaster?: boolean
  periodoDias?: number
  janela?: { inicio: Date; fim: Date }
}

function safe<T>(p: Promise<T>): Promise<T | null> {
  return p.then((r) => r).catch(() => null)
}

function mapPainel(r: any) {
  return {
    id: r.id, slug: r.slug, nome: r.nome, accent: r.accent, icon: r.icon ?? null,
    ativo: r.ativo, slideMs: r.slide_ms, periodoDias: r.periodo_dias, ordem: r.ordem,
    empresaId: r.empresa_id ?? null,
  }
}
function mapFolha(r: any) {
  return { id: r.id, painelId: r.painel_id, titulo: r.titulo, ordem: r.ordem, cols: r.cols }
}
function mapBloco(r: any) {
  const cfg = typeof r.config === 'string' ? JSON.parse(r.config || '{}') : (r.config ?? {})
  return { id: r.id, folhaId: r.folha_id, ordem: r.ordem, visual: r.visual, metricId: r.metric_id, config: cfg }
}

@Injectable()
export class PainelTvService {
  constructor(
    @Inject(CrmService) private readonly crm: CrmService,
    @Inject(OrcamentoService) private readonly orcamento: OrcamentoService,
    @Inject(ContratoService) private readonly contrato: ContratoService,
    @Inject(HelpdeskService) private readonly helpdesk: HelpdeskService,
  ) {}

  // ── Catálogo (p/ a UI do builder) ───────────────────────────────
  catalogo() {
    return catalogForUi()
  }

  // ── Leitura ─────────────────────────────────────────────────────
  async list() {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT p.*, (SELECT COUNT(*)::int FROM tv_folha f WHERE f.painel_id = p.id) AS folhas_count
       FROM tv_painel p ORDER BY p.ordem ASC, p.created_at ASC`,
    )
    return rows.map((r) => ({ ...mapPainel(r), folhasCount: r.folhas_count ?? 0 }))
  }

  async getById(id: string) {
    return this.loadPainel('id', id)
  }
  async getBySlug(slug: string) {
    return this.loadPainel('slug', slug)
  }

  private async loadPainel(by: 'id' | 'slug', val: string) {
    const prows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM tv_painel WHERE ${by} = $1 LIMIT 1`, val,
    )
    if (!prows.length) return null
    const painel = mapPainel(prows[0])
    const folhaRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM tv_folha WHERE painel_id = $1 ORDER BY ordem ASC, created_at ASC`, painel.id,
    )
    const folhas = folhaRows.map(mapFolha)
    let blocos: any[] = []
    if (folhas.length) {
      const ph = folhas.map((_, i) => `$${i + 1}`).join(',')
      const blocoRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM tv_bloco WHERE folha_id IN (${ph}) ORDER BY ordem ASC, created_at ASC`,
        ...folhas.map((f) => f.id),
      )
      blocos = blocoRows.map(mapBloco)
    }
    return {
      ...painel,
      folhas: folhas.map((f) => ({ ...f, blocos: blocos.filter((b) => b.folhaId === f.id) })),
    }
  }

  // ── Resolução de dados (catálogo) ───────────────────────────────
  async resolve(slug: string, ctx: ResolveCtx) {
    const painel = await this.getBySlug(slug)
    if (!painel) throw new TRPCError({ code: 'NOT_FOUND', message: 'Painel não encontrado' })

    const painelPeriodo = painel.periodoDias ?? 30
    const blocos: any[] = painel.folhas.flatMap((f: any) => f.blocos)
    const now = new Date()
    const DAY = 86400000
    const COMPARABLE_KINDS = ['number', 'currency', 'percent', 'duration', 'rating']
    const isComparavel = (b: any, def: any) =>
      !!b.config?.comparar && !!def?.comparavel && COMPARABLE_KINDS.includes(def.kind)

    // Combos a calcular: janela ATUAL (cur) por (source, período) e janela
    // ANTERIOR (prev) só onde algum bloco pede comparação.
    const cur = new Map<string, { source: SourceName; periodo: number }>()
    const prev = new Map<string, { source: SourceName; periodo: number }>()
    for (const b of blocos) {
      const def = METRIC_BY_ID[b.metricId]
      if (!def) continue
      const periodo = Number(b.config?.periodoDias) || painelPeriodo
      cur.set(`${def.source}|${periodo}`, { source: def.source, periodo })
      if (isComparavel(b, def)) prev.set(`${def.source}|${periodo}`, { source: def.source, periodo })
    }

    const results: Record<string, any> = {}
    await Promise.all([
      ...[...cur.values()].map(async (c) => {
        const janela = { inicio: new Date(now.getTime() - c.periodo * DAY), fim: now }
        results[`cur|${c.source}|${c.periodo}`] = await this.buildSource(c.source, { ...ctx, periodoDias: c.periodo, janela })
      }),
      ...[...prev.values()].map(async (c) => {
        const janela = { inicio: new Date(now.getTime() - 2 * c.periodo * DAY), fim: new Date(now.getTime() - c.periodo * DAY) }
        results[`prev|${c.source}|${c.periodo}`] = await this.buildSource(c.source, { ...ctx, periodoDias: c.periodo, janela })
      }),
    ])

    // Resolve POR BLOCO (chave bloco.id): mesmo metric com período/limite/comparar
    // diferentes gera dados diferentes.
    const data: Record<string, any> = {}
    for (const b of blocos) {
      const def = METRIC_BY_ID[b.metricId]
      if (!def) { data[b.id] = null; continue }
      const periodo = Number(b.config?.periodoDias) || painelPeriodo
      let ex: any
      try { ex = def.extract(results[`cur|${def.source}|${periodo}`]) ?? {} } catch { ex = {} }
      const limite = Number(b.config?.limite) || (def.kind === 'table' ? 9 : 0)
      if (limite > 0) {
        if (Array.isArray(ex.items)) ex.items = ex.items.slice(0, limite)
        if (Array.isArray(ex.rows)) ex.rows = ex.rows.slice(0, limite)
      }
      const payload: any = { kind: def.kind, label: def.label, ...ex }
      if (isComparavel(b, def)) {
        let prevEx: any
        try { prevEx = def.extract(results[`prev|${def.source}|${periodo}`]) ?? {} } catch { prevEx = {} }
        const atual = Number(ex.value)
        const anterior = Number(prevEx.value)
        if (Number.isFinite(atual) && Number.isFinite(anterior)) {
          payload.comparacao = { anterior, variacaoPct: anterior !== 0 ? Math.round(((atual - anterior) / Math.abs(anterior)) * 100) : null }
        }
      }
      data[b.id] = payload
    }
    return { data, periodoDias: painelPeriodo }
  }

  private async buildSource(name: SourceName, ctx: ResolveCtx): Promise<any> {
    const dias = ctx.periodoDias ?? 30
    const fim = ctx.janela?.fim ?? new Date()
    const inicio = ctx.janela?.inicio ?? new Date(fim.getTime() - dias * 86400000)
    const diasJanela = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 86400000))
    if (name === 'comercial') {
      const [crmStats, crmFunil, crmDesempenho, orcStats, orcDash, contratos] = await Promise.all([
        safe(this.crm.getStats(ctx.isMaster ?? false, ctx.empresaId ?? undefined)),
        safe(this.crm.reportFunil(ctx.empresaId ?? undefined, diasJanela, fim)),
        safe(this.crm.reportDesempenho(ctx.empresaId ?? undefined, diasJanela)),
        safe(this.orcamento.getStats(ctx.empresaId ?? undefined)),
        safe(ctx.userId ? this.orcamento.getDashboardStats(ctx.userId, ctx.empresaId ?? undefined) : Promise.resolve(null)),
        safe(this.contrato.reportComercial(ctx.empresaId ?? undefined)),
      ])
      return { crmStats, crmFunil, crmDesempenho: crmDesempenho ?? [], orcStats, orcDash, contratos }
    }
    if (name === 'helpdesk') {
      return safe(this.helpdesk.getDashboard(ctx.empresaId ?? null, { inicio: inicio.toISOString(), fim: fim.toISOString() }))
    }
    return null
  }

  // ── Escrita (CRUD) — master only (gateado no router) ────────────
  async createPainel(d: { slug: string; nome: string; accent?: string; icon?: string | null; slideMs?: number; periodoDias?: number; empresaId?: string | null }) {
    const exists = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM tv_painel WHERE slug = $1 LIMIT 1`, d.slug)
    if (exists.length) throw new TRPCError({ code: 'CONFLICT', message: 'Já existe um painel com esse slug' })
    const id = randomUUID()
    const ordRows = await prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(MAX(ordem),-1)+1 AS ord FROM tv_painel`)
    const ordem = ordRows[0]?.ord ?? 0
    await prisma.$executeRawUnsafe(
      `INSERT INTO tv_painel (id, slug, nome, accent, icon, slide_ms, periodo_dias, ordem, empresa_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CURRENT_TIMESTAMP)`,
      id, d.slug, d.nome, d.accent ?? '#22d3ee', d.icon ?? null, d.slideMs ?? 18000, d.periodoDias ?? 30, ordem, d.empresaId ?? null,
    )
    return this.getById(id)
  }

  async updatePainel(id: string, d: Partial<{ slug: string; nome: string; accent: string; icon: string | null; ativo: boolean; slideMs: number; periodoDias: number; ordem: number }>) {
    const sets: string[] = []
    const params: any[] = []
    const add = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`) }
    if (d.slug !== undefined) add('slug', d.slug)
    if (d.nome !== undefined) add('nome', d.nome)
    if (d.accent !== undefined) add('accent', d.accent)
    if (d.icon !== undefined) add('icon', d.icon)
    if (d.ativo !== undefined) add('ativo', d.ativo)
    if (d.slideMs !== undefined) add('slide_ms', d.slideMs)
    if (d.periodoDias !== undefined) add('periodo_dias', d.periodoDias)
    if (d.ordem !== undefined) add('ordem', d.ordem)
    if (sets.length) {
      params.push(id)
      await prisma.$executeRawUnsafe(`UPDATE tv_painel SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length}`, ...params)
    }
    return this.getById(id)
  }

  async deletePainel(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM tv_painel WHERE id = $1`, id)
    return { ok: true }
  }

  async createFolha(painelId: string, d: { titulo: string; cols?: number }) {
    const id = randomUUID()
    const ordRows = await prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(MAX(ordem),-1)+1 AS ord FROM tv_folha WHERE painel_id = $1`, painelId)
    await prisma.$executeRawUnsafe(
      `INSERT INTO tv_folha (id, painel_id, titulo, ordem, cols, updated_at) VALUES ($1,$2,$3,$4,$5, CURRENT_TIMESTAMP)`,
      id, painelId, d.titulo, ordRows[0]?.ord ?? 0, d.cols ?? 12,
    )
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM tv_folha WHERE id = $1`, id)
    return mapFolha(rows[0])
  }

  async updateFolha(id: string, d: Partial<{ titulo: string; cols: number; ordem: number }>) {
    const sets: string[] = []; const params: any[] = []
    const add = (c: string, v: any) => { params.push(v); sets.push(`${c} = $${params.length}`) }
    if (d.titulo !== undefined) add('titulo', d.titulo)
    if (d.cols !== undefined) add('cols', d.cols)
    if (d.ordem !== undefined) add('ordem', d.ordem)
    if (sets.length) { params.push(id); await prisma.$executeRawUnsafe(`UPDATE tv_folha SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length}`, ...params) }
    return { ok: true }
  }

  async deleteFolha(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM tv_folha WHERE id = $1`, id)
    return { ok: true }
  }

  async reorder(tabela: 'tv_folha' | 'tv_bloco', ids: string[]) {
    for (let i = 0; i < ids.length; i++) {
      await prisma.$executeRawUnsafe(`UPDATE ${tabela} SET ordem = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, i, ids[i])
    }
    return { ok: true }
  }

  async createBloco(folhaId: string, d: { visual: string; metricId: string; config?: any }) {
    const id = randomUUID()
    const ordRows = await prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(MAX(ordem),-1)+1 AS ord FROM tv_bloco WHERE folha_id = $1`, folhaId)
    await prisma.$executeRawUnsafe(
      `INSERT INTO tv_bloco (id, folha_id, ordem, visual, metric_id, config, updated_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb, CURRENT_TIMESTAMP)`,
      id, folhaId, ordRows[0]?.ord ?? 0, d.visual, d.metricId, JSON.stringify(d.config ?? {}),
    )
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM tv_bloco WHERE id = $1`, id)
    return mapBloco(rows[0])
  }

  async updateBloco(id: string, d: Partial<{ visual: string; metricId: string; config: any; ordem: number }>) {
    const sets: string[] = []; const params: any[] = []
    const add = (c: string, v: any) => { params.push(v); sets.push(`${c} = $${params.length}`) }
    if (d.visual !== undefined) add('visual', d.visual)
    if (d.metricId !== undefined) add('metric_id', d.metricId)
    if (d.ordem !== undefined) add('ordem', d.ordem)
    if (d.config !== undefined) { params.push(JSON.stringify(d.config)); sets.push(`config = $${params.length}::jsonb`) }
    if (sets.length) { params.push(id); await prisma.$executeRawUnsafe(`UPDATE tv_bloco SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length}`, ...params) }
    return { ok: true }
  }

  async deleteBloco(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM tv_bloco WHERE id = $1`, id)
    return { ok: true }
  }
}
