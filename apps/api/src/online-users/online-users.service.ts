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
  private lastTouchByUser = new Map<string, number>()

  /**
   * Atualiza presença do user. Throttled — chamadas seguidas no mesmo user
   * dentro de 30s viram no-op (mas o path/ip mais recente é o que persiste
   * quando o throttle libera).
   *
   * Roda como fire-and-forget (catch silencioso) pra não bloquear a request.
   */
  touch(userId: string, path?: string | null, ip?: string | null): void {
    if (!userId) return
    const now = Date.now()
    const last = this.lastTouchByUser.get(userId)
    if (last && now - last < this.THROTTLE_MS) return
    this.lastTouchByUser.set(userId, now)

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

  /** Lista usuários ativos nos últimos WINDOW_MIN minutos. */
  async getOnline() {
    const cutoff = new Date(Date.now() - this.WINDOW_MIN * 60_000)
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        lastActivityAt: { gte: cutoff },
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        lastActivityAt: true,
        lastActivityPath: true,
        lastActivityIp: true,
        empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      },
      orderBy: { lastActivityAt: 'desc' },
    })
    return users
  }
}
