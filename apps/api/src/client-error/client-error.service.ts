import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import { createHash } from 'crypto'
import { ClientErrorEventsService } from './client-error-events.service'

/**
 * Service que recebe relatos de erros do navegador (window.onerror,
 * unhandledrejection, console.error/warn) e persiste agrupados por hash.
 *
 * Estratégia de dedup: hash = sha1(level + ':' + message + ':' + firstStackLine).
 * Mesmo erro repetindo só incrementa `count` e atualiza `lastSeenAt` — assim
 * 1000 ocorrências do mesmo bug aparecem como 1 linha na UI.
 *
 * Persiste só quando NODE_ENV !== 'production' por enquanto (escopo MVP).
 */
@Injectable()
export class ClientErrorService {
  constructor(
    @Inject(ClientErrorEventsService) private readonly events: ClientErrorEventsService,
  ) {}

  /** Gera hash dedup do erro. Primeira linha do stack vem normalizada (sem
   *  números de linha exatos) pra que mudanças triviais não criem nova entry. */
  private gerarHash(level: string, message: string, stack?: string | null): string {
    const firstLine = (stack ?? '')
      .split('\n')[0]
      ?.replace(/:\d+:\d+/g, ':L:C')
      ?.trim() ?? ''
    return createHash('sha1').update(`${level}:${message}:${firstLine}`).digest('hex').slice(0, 16)
  }

  /** Upsert por hash. Retorna { isNew, log } pra que o caller decida se emite
   *  evento de "novo erro" ou só "ocorrência adicional". */
  async report(data: {
    level: 'ERROR' | 'WARN' | 'REJECTION'
    message: string
    stack?: string | null
    url?: string | null
    userAgent?: string | null
    userId?: string | null
    empresaId?: string | null
    environment?: string
    /// Slug do módulo de origem do erro (ex: 'cnd', 'danfe', 'agendamento').
    /// Derivado da URL no frontend. Null se a página não bater com nenhum.
    modulo?: string | null
  }) {
    const hash = this.gerarHash(data.level, data.message, data.stack)
    const env = data.environment ?? 'development'

    const existing = await prisma.clientErrorLog.findUnique({ where: { hash } })
    let log
    let isNew = false
    if (existing) {
      log = await prisma.clientErrorLog.update({
        where: { hash },
        data: {
          count: { increment: 1 },
          lastSeenAt: new Date(),
          // Atualiza módulo apenas se veio novo e o anterior era null
          ...(data.modulo && !existing.modulo ? { modulo: data.modulo } : {}),
          // Limpa resolvedAt se o erro voltou após ser marcado como resolvido
          ...(existing.resolvedAt ? { resolvedAt: null, resolvedById: null } : {}),
        },
      })
    } else {
      isNew = true
      log = await prisma.clientErrorLog.create({
        data: {
          hash,
          level: data.level,
          message: data.message.slice(0, 5000),
          stack: data.stack?.slice(0, 20000) ?? null,
          url: data.url ?? null,
          userAgent: data.userAgent?.slice(0, 500) ?? null,
          userId: data.userId ?? null,
          empresaId: data.empresaId ?? null,
          environment: env,
          modulo: data.modulo ?? null,
        },
      })
    }
    this.events.emit({ type: isNew ? 'new' : 'occurrence', hash, level: log.level })
    return { isNew, log }
  }

  async list(input: {
    page?: number
    limit?: number
    search?: string
    level?: 'ERROR' | 'WARN' | 'REJECTION'
    resolved?: 'all' | 'open' | 'resolved'
    environment?: string
    modulo?: string
  }) {
    const page = input.page ?? 1
    const limit = input.limit ?? 30
    const where: any = {
      ...(input.level ? { level: input.level } : {}),
      ...(input.environment ? { environment: input.environment } : {}),
      ...(input.modulo ? { modulo: input.modulo } : {}),
      ...(input.resolved === 'open' ? { resolvedAt: null }
        : input.resolved === 'resolved' ? { resolvedAt: { not: null } }
        : {}),
      ...(input.search
        ? { OR: [
            { message: { contains: input.search, mode: 'insensitive' } },
            { stack:   { contains: input.search, mode: 'insensitive' } },
            { url:     { contains: input.search, mode: 'insensitive' } },
          ] }
        : {}),
    }
    const [total, data] = await Promise.all([
      prisma.clientErrorLog.count({ where }),
      prisma.clientErrorLog.findMany({
        where,
        include: {
          user:       { select: { id: true, name: true, image: true } },
          resolvedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ resolvedAt: 'asc' }, { lastSeenAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])
    return {
      data, total, page, limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    }
  }

  async getById(id: string) {
    return prisma.clientErrorLog.findUnique({
      where: { id },
      include: {
        user:       { select: { id: true, name: true, image: true, email: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    })
  }

  async getStats(environment?: string) {
    const where = environment ? { environment } : {}
    const [total, abertos, errors, warns, rejections, ultimos24h] = await Promise.all([
      prisma.clientErrorLog.count({ where }),
      prisma.clientErrorLog.count({ where: { ...where, resolvedAt: null } }),
      prisma.clientErrorLog.count({ where: { ...where, level: 'ERROR',     resolvedAt: null } }),
      prisma.clientErrorLog.count({ where: { ...where, level: 'WARN',      resolvedAt: null } }),
      prisma.clientErrorLog.count({ where: { ...where, level: 'REJECTION', resolvedAt: null } }),
      prisma.clientErrorLog.count({
        where: { ...where, lastSeenAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      }),
    ])
    return { total, abertos, errors, warns, rejections, ultimos24h }
  }

  async markResolved(id: string, userId?: string) {
    const log = await prisma.clientErrorLog.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedById: userId ?? null },
    })
    this.events.emit({ type: 'resolved', hash: log.hash, level: log.level })
    return log
  }

  async markUnresolved(id: string) {
    const log = await prisma.clientErrorLog.update({
      where: { id },
      data: { resolvedAt: null, resolvedById: null },
    })
    this.events.emit({ type: 'reopened', hash: log.hash, level: log.level })
    return log
  }

  async markAllResolved(userId?: string) {
    const result = await prisma.clientErrorLog.updateMany({
      where: { resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedById: userId ?? null },
    })
    this.events.emit({ type: 'bulk_resolved', hash: '*', level: 'ERROR' })
    return { count: result.count }
  }

  async deleteResolved() {
    const result = await prisma.clientErrorLog.deleteMany({
      where: { resolvedAt: { not: null } },
    })
    this.events.emit({ type: 'bulk_resolved', hash: '*', level: 'ERROR' })
    return { count: result.count }
  }

  // ─────────────────────────────────────────────────────────────
  // Banco de bugs — consulta e análise (anotações, tendência, top)
  //
  // Colunas `notas`, `notas_updated_at`, `notas_updated_by_id` foram
  // adicionadas via ALTER TABLE — não estão no schema.prisma ainda, daí
  // o uso de $queryRawUnsafe / $executeRawUnsafe. Quando alguém regenerar
  // o client com essas colunas no schema, dá pra migrar pra Prisma typed.
  // ─────────────────────────────────────────────────────────────

  /** Atualiza notas livres do erro (Markdown ou texto). */
  async updateNotas(id: string, notas: string, userId?: string | null) {
    await prisma.$executeRawUnsafe(
      `UPDATE client_error_logs SET notas = $1, notas_updated_at = NOW(), notas_updated_by_id = $2 WHERE id = $3`,
      notas || null, userId ?? null, id,
    )
    return { ok: true }
  }

  /** Retorna notas + meta do autor pra um erro. */
  async getNotas(id: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{
      notas: string | null
      notas_updated_at: Date | null
      autor_name: string | null
    }>>(
      `SELECT l.notas, l.notas_updated_at, u.name as autor_name
       FROM client_error_logs l
       LEFT JOIN users u ON u.id = l.notas_updated_by_id
       WHERE l.id = $1 LIMIT 1`,
      id,
    )
    const r = rows[0]
    return {
      notas: r?.notas ?? '',
      atualizadoEm: r?.notas_updated_at ?? null,
      autor: r?.autor_name ?? null,
    }
  }

  /** Tendência de erros por dia, separado por nível. Padrão: últimos 30 dias. */
  async getTrend(dias = 30) {
    const rows = await prisma.$queryRawUnsafe<Array<{
      dia: Date
      level: string
      total: bigint
    }>>(
      `SELECT
         date_trunc('day', last_seen_at) AS dia,
         level,
         SUM(count)::bigint AS total
       FROM client_error_logs
       WHERE last_seen_at >= NOW() - INTERVAL '${Math.max(1, Math.min(365, dias))} days'
       GROUP BY 1, 2
       ORDER BY 1 ASC`,
    )
    return rows.map(r => ({
      dia: r.dia.toISOString().slice(0, 10),
      level: r.level,
      total: Number(r.total),
    }))
  }

  /** Top N erros mais frequentes (ordena por count desc), sempre considerando todos. */
  async getTopByFrequency(limit = 10) {
    const lim = Math.max(1, Math.min(100, limit))
    return prisma.clientErrorLog.findMany({
      orderBy: { count: 'desc' },
      take: lim,
      select: {
        id: true, hash: true, level: true, message: true, url: true,
        count: true, firstSeenAt: true, lastSeenAt: true, resolvedAt: true,
      },
    })
  }

  /** Agrupamento por URL/rota — quais páginas geram mais erros.
   *  Normaliza pathnames removendo query string e IDs numéricos/cuids. */
  async getByUrl(limit = 20) {
    const lim = Math.max(1, Math.min(100, limit))
    const rows = await prisma.$queryRawUnsafe<Array<{
      rota: string
      erros_unicos: bigint
      ocorrencias: bigint
      abertos: bigint
    }>>(
      `SELECT
         -- Extrai pathname (sem protocolo/host/query) e normaliza IDs (cuid e numérico)
         regexp_replace(
           regexp_replace(
             regexp_replace(
               COALESCE(substring(url FROM 'https?://[^/]+(/[^?#]*)'), url, '(sem url)'),
               '/cm[a-z0-9]{20,}', '/[id]', 'g'
             ),
             '/[0-9]+(?=/|$)', '/[id]', 'g'
           ),
           '/+', '/', 'g'
         ) AS rota,
         COUNT(*)::bigint                                     AS erros_unicos,
         SUM(count)::bigint                                   AS ocorrencias,
         COUNT(*) FILTER (WHERE resolved_at IS NULL)::bigint  AS abertos
       FROM client_error_logs
       WHERE url IS NOT NULL
       GROUP BY 1
       ORDER BY ocorrencias DESC
       LIMIT ${lim}`,
    )
    return rows.map(r => ({
      rota: r.rota,
      errosUnicos: Number(r.erros_unicos),
      ocorrencias: Number(r.ocorrencias),
      abertos: Number(r.abertos),
    }))
  }
}
