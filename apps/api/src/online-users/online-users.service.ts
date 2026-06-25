import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * Tracking de presença dos usuários e listagem de "online agora".
 *
 * Como funciona:
 *   - Toda request autenticada chama `touch(userId, path, ip)` (via TrpcController)
 *   - Throttle in-memory: só persiste `UPDATE users SET last_activity_at=NOW(),
 *     last_activity_path=?, last_activity_ip=?` se passou >30s da última atualização
 *     pra esse user (evita escrever no banco a cada request)
 *   - `getOnline()` retorna users com `last_activity_at > now - WINDOW_MIN` (5 min)
 */
@Injectable()
export class OnlineUsersService {
  /** Janela "considerado online" — 5 min sem atividade vira "offline". */
  private readonly WINDOW_MIN = 5

  /** Throttle por user: só persiste no banco a cada 30s. */
  private readonly THROTTLE_MS = 30_000
  /** Cache do último estado persistido por user (pra detectar mudança de path). */
  private lastByUser = new Map<string, { ts: number; path: string | null }>()

  /**
   * Atualiza presença do user. Throttled APENAS quando o path não mudou —
   * mudança de página (ex.: navegação Next) sempre persiste na hora pro painel
   * "Usuários online" refletir a aba atual em tempo real.
   *
   * Roda como fire-and-forget (catch silencioso) pra não bloquear a request.
   */
  touch(userId: string, path?: string | null, ip?: string | null): void {
    if (!userId) return
    const now = Date.now()
    const cached = this.lastByUser.get(userId)
    const pathNorm = path ?? null

    // Path mudou → sempre persiste (bypass throttle)
    const pathChanged = cached && cached.path !== pathNorm
    // Throttle: se path igual E < 30s desde a última escrita, skip
    if (cached && !pathChanged && now - cached.ts < this.THROTTLE_MS) return

    this.lastByUser.set(userId, { ts: now, path: pathNorm })

    prisma.user
      .update({
        where: { id: userId },
        data: {
          lastActivityAt: new Date(),
          ...(path !== undefined ? { lastActivityPath: path } : {}),
          ...(ip !== undefined ? { lastActivityIp: ip } : {}),
        },
      })
      .catch((e: Error) => {
        // User pode ter sido deletado entre a auth e o update — silencia P2025
        if (!e.message.includes('P2025')) {
          console.warn('[OnlineUsers] touch falhou:', e.message)
        }
      })
  }

  /**
   * Lista usuários considerados "ativos" — exige atividade nos últimos
   * WINDOW_MIN minutos. O chatStatus manual apenas DECORA (ausente/dnd/online)
   * ou ESCONDE (invisible) — nunca substitui a checagem de atividade.
   *
   * Histórico: a regra anterior tratava chatStatus manual como override do
   * lastActivityAt, então quem clicava "Online" e fechava o browser via crash/
   * sleep/kill (cenários em que beforeunload não dispara) ficava eternamente
   * online porque o chatStatus persistia no banco sem ninguém limpar.
   */
  /**
   * @param empresaId Escopo de tenant:
   *   - `undefined` → global (monitoramento admin: master / Service Manager)
   *   - string/`null` → restringe à empresa do requisitante (chat web).
   *     `null` aplica `empresa_id IS NULL` (default-deny: nunca vaza outra empresa).
   * @param opts.includeSensitive Quando `true`, inclui PII de monitoramento
   *   (e-mail, IP, caminho de navegação, empresa). Reservado ao admin global —
   *   NUNCA deve ir no payload de usuários comuns (rastreamento/LGPD, F-001).
   *   Default `false`: presença mínima (id, nome, avatar, status, atividade).
   */
  async getOnline(empresaId?: string | null, opts?: { includeSensitive?: boolean }) {
    const includeSensitive = opts?.includeSensitive ?? false
    const cutoff = new Date(Date.now() - this.WINDOW_MIN * 60_000)
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        lastActivityAt: { gte: cutoff },
        // 'invisible' = aparece como offline pros outros, mesmo ativo
        NOT: { chatStatus: 'invisible' },
        // Isolamento multi-tenant: só quando há sessão (empresaId !== undefined)
        ...(empresaId !== undefined ? { empresaId } : {}),
      },
      select: {
        id: true,
        name: true,
        image: true,
        lastActivityAt: true,
        chatStatus: true,
        // PII só no monitoramento admin — fora do payload de presença do chat.
        ...(includeSensitive
          ? {
              email: true,
              lastActivityPath: true,
              lastActivityIp: true,
              empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
            }
          : {}),
      },
      orderBy: { lastActivityAt: 'desc' },
    })
    return users
  }
}
