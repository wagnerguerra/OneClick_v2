import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'

/**
 * Armazena tokens de push (Expo) por usuário no Redis e envia notificações
 * via Expo Push API. Tokens em Redis (não no Postgres) pra evitar mexer na
 * arquitetura schema-per-tenant — token de device é efêmero e global por user.
 *
 * Chave: push:tokens:<userId> = SET de ExpoPushToken.
 *
 * Conexão lazy: não conecta no boot (não derruba a API se o Redis estiver fora);
 * a primeira operação conecta e, se falhar, é tratada com try/catch.
 */
@Injectable()
export class PushService implements OnModuleDestroy {
  private readonly logger = new Logger(PushService.name)
  private readonly redis: Redis
  private static readonly EXPO_URL = 'https://exp.host/--/api/v2/push/send'

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      // Não relança erro de conexão de forma fatal — só loga.
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
    })
    this.redis.on('error', (e) => this.logger.warn(`Redis push indisponível: ${e.message}`))
  }

  async onModuleDestroy() {
    try {
      this.redis.disconnect()
    } catch {
      /* ignora */
    }
  }

  private key(userId: string) {
    return `push:tokens:${userId}`
  }

  /** Registra (idempotente) o token de um device para o usuário. */
  async registerDevice(userId: string, token: string, _platform?: string): Promise<void> {
    if (!this.isExpoToken(token)) return
    try {
      await this.redis.sadd(this.key(userId), token)
    } catch (e) {
      this.logger.warn(`registerDevice falhou: ${(e as Error).message}`)
    }
  }

  /** Remove o token (logout / device trocado). */
  async removeDevice(userId: string, token: string): Promise<void> {
    try {
      await this.redis.srem(this.key(userId), token)
    } catch (e) {
      this.logger.warn(`removeDevice falhou: ${(e as Error).message}`)
    }
  }

  /** Lista os tokens ativos de um usuário. */
  async getTokens(userId: string): Promise<string[]> {
    try {
      return await this.redis.smembers(this.key(userId))
    } catch (e) {
      this.logger.warn(`getTokens falhou: ${(e as Error).message}`)
      return []
    }
  }

  /**
   * Envia uma notificação a todos os devices do usuário. Tokens inválidos
   * (DeviceNotRegistered) são removidos automaticamente. Best-effort: nunca
   * lança — só loga.
   */
  async sendToUser(
    userId: string,
    payload: { title: string; body: string; data?: Record<string, unknown> },
  ): Promise<void> {
    const tokens = await this.getTokens(userId)
    if (tokens.length === 0) return

    const mensagens = tokens.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: 'default' as const,
    }))

    try {
      const resp = await fetch(PushService.EXPO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(mensagens),
      })
      if (!resp.ok) {
        this.logger.warn(`Expo push HTTP ${resp.status}`)
        return
      }
      const json = (await resp.json()) as { data?: Array<{ status: string; details?: { error?: string } }> }
      const tickets = json.data ?? []
      // Poda tokens que o Expo reportou como não registrados.
      await Promise.all(
        tickets.map((t, i) => {
          const tok = tokens[i]
          if (tok && t.status === 'error' && t.details?.error === 'DeviceNotRegistered') {
            return this.removeDevice(userId, tok)
          }
          return undefined
        }),
      )
    } catch (e) {
      this.logger.warn(`sendToUser falhou: ${(e as Error).message}`)
    }
  }

  private isExpoToken(token: string): boolean {
    return typeof token === 'string' && (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
  }
}
