import { Injectable, Logger } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '@saas/db'
import { google, type calendar_v3 } from 'googleapis'

/**
 * Integração com o Google Agenda — paridade com o v1 (crp_calendar/google, 10/2026).
 *
 * Como no v1:
 *  - cada usuário conecta a PRÓPRIA conta (OAuth, tokens em google_calendar_tokens);
 *  - criar/editar/excluir um evento reflete na agenda `primary` do CRIADOR — os
 *    participantes recebem e-mail pelo fluxo da agenda, não convite do Google;
 *  - uma rotina periódica traz da agenda Google os eventos de -7 a +30 dias.
 *
 * Recorrência: no v2 cada ocorrência é uma linha (mesmo `lote`), então cada uma
 * vira um evento próprio no Google, com `googleId` próprio — "só esta / esta e
 * seguintes / todas" é só excluir as linhas certas, sem RRULE.
 */

/** Marca gravada no evento do Google: o que saiu do OneClick não volta como evento novo. */
const PROP_ORIGEM = 'oneclickEventoId'

/** Validade do `state` do OAuth (o usuário tem esse tempo para concluir o consentimento). */
const STATE_TTL_MS = 15 * 60 * 1000

/**
 * Id de evento do Google de verdade (base32hex: a–v, 0–9; instâncias levam
 * `_AAAAMMDDTHHMMSSZ`). Os `google_id` herdados do v1 têm outro formato
 * (`xxxxxx_12345`, 11–12 caracteres) e não existem no Google — tratados como
 * "sem id" para não errar o alvo.
 */
export function ehIdDoGoogle(id: string | null | undefined): id is string {
  if (!id || id.length < 16) return false
  return /^[a-v0-9]+(_[0-9]{8}(T[0-9]{6}Z)?)?$/.test(id)
}

const brDia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const brHora = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
/** "AAAA-MM-DD" de uma coluna DATE (meia-noite UTC do dia-calendário). */
const diaDaColuna = (d: Date) => d.toISOString().slice(0, 10)
const somarDia = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

@Injectable()
export class AgendaGoogleService {
  private readonly logger = new Logger('AgendaGoogle')
  /** Fila única de envio: um evento por vez, para não estourar a cota do Google numa série grande. */
  private fila: Promise<unknown> = Promise.resolve()

  private async getOAuthClient() {
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_REDIRECT_URI'] } },
    })
    const map = new Map(configs.map(c => [c.key, c.value]))

    const clientId = map.get('GOOGLE_CALENDAR_CLIENT_ID') || process.env.GOOGLE_CALENDAR_CLIENT_ID || ''
    const clientSecret = map.get('GOOGLE_CALENDAR_CLIENT_SECRET') || process.env.GOOGLE_CALENDAR_CLIENT_SECRET || ''
    const redirectUri = map.get('GOOGLE_CALENDAR_REDIRECT_URI') || process.env.GOOGLE_CALENDAR_REDIRECT_URI || ''

    if (!clientId || !clientSecret) throw new Error('Google Agenda não configurado: falta o Client ID/Secret do aplicativo OAuth.')

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  }

  // ── OAuth ───────────────────────────────────────────────

  private segredoState(): string {
    const s = process.env.BETTER_AUTH_SECRET || ''
    if (s.length < 16) throw new Error('BETTER_AUTH_SECRET ausente: não é possível assinar o retorno do Google.')
    return s
  }

  /**
   * `state` assinado (usuário + validade + HMAC). Antes era só o userId: qualquer
   * um montava o retorno com o id de outra pessoa e ligava a PRÓPRIA conta Google
   * à agenda dela — passando a receber os eventos dela.
   */
  private assinarState(userId: string): string {
    const corpo = Buffer.from(`${userId}.${Date.now() + STATE_TTL_MS}`).toString('base64url')
    const sig = createHmac('sha256', this.segredoState()).update(corpo).digest('base64url')
    return `${corpo}.${sig}`
  }

  /** userId do `state`, ou null se adulterado/expirado. */
  verificarState(state: string | undefined | null): string | null {
    if (!state) return null
    const [corpo, sig] = state.split('.')
    if (!corpo || !sig) return null
    const esperado = createHmac('sha256', this.segredoState()).update(corpo).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(esperado)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const [userId, exp] = Buffer.from(corpo, 'base64url').toString('utf8').split('.')
    if (!userId || !exp || Number(exp) < Date.now()) return null
    return userId
  }

  async getAuthUrl(userId: string): Promise<string> {
    const oauth2Client = await this.getOAuthClient()
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state: this.assinarState(userId),
    })
  }

  async handleCallback(code: string, userId: string): Promise<{ success: boolean; message: string }> {
    const oauth2Client = await this.getOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)
    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null

    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM google_calendar_tokens WHERE user_id = $1', userId,
    )
    if (existing.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE google_calendar_tokens SET access_token = $1, refresh_token = COALESCE($2, refresh_token), expires_at = $3, updated_at = NOW() WHERE user_id = $4`,
        tokens.access_token!, tokens.refresh_token ?? null, expiresAt, userId,
      )
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO google_calendar_tokens (user_id, access_token, refresh_token, expires_at) VALUES ($1, $2, $3, $4)`,
        userId, tokens.access_token!, tokens.refresh_token ?? null, expiresAt,
      )
    }
    return { success: true, message: 'Conta Google vinculada com sucesso!' }
  }

  async getConnectionStatus(userId: string): Promise<{ connected: boolean; email?: string; configurado: boolean }> {
    let configurado = true
    try { await this.getOAuthClient() } catch { configurado = false }
    const rows = await prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
      'SELECT user_id FROM google_calendar_tokens WHERE user_id = $1', userId,
    ).catch(() => [] as Array<{ user_id: string }>)
    if (rows.length === 0) return { connected: false, configurado }
    try {
      const oauth2Client = await this.getAuthenticatedClient(userId)
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
      const cal = await calendar.calendarList.get({ calendarId: 'primary' })
      return { connected: true, email: cal.data.id || cal.data.summary || undefined, configurado }
    } catch {
      return { connected: true, configurado }
    }
  }

  async disconnect(userId: string): Promise<void> {
    await prisma.$executeRawUnsafe('DELETE FROM google_calendar_tokens WHERE user_id = $1', userId)
  }

  async temConexao(userId: string): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      'SELECT 1 AS n FROM google_calendar_tokens WHERE user_id = $1 LIMIT 1', userId,
    ).catch(() => [] as Array<{ n: number }>)
    return rows.length > 0
  }

  private async getAuthenticatedClient(userId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ access_token: string; refresh_token: string | null; expires_at: Date | null }>>(
      'SELECT access_token, refresh_token, expires_at FROM google_calendar_tokens WHERE user_id = $1', userId,
    )
    if (rows.length === 0) throw new Error('Google Agenda não vinculado. Conecte sua conta na Agenda.')

    const token = rows[0]!
    const oauth2Client = await this.getOAuthClient()
    oauth2Client.setCredentials({ access_token: token.access_token, refresh_token: token.refresh_token })

    // Renova se expirado/sem validade (tokens migrados do v1 entram vencidos de propósito).
    if (!token.expires_at || new Date(token.expires_at).getTime() < Date.now() + 60000) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken()
        await prisma.$executeRawUnsafe(
          `UPDATE google_calendar_tokens SET access_token = $1, expires_at = $2, updated_at = NOW() WHERE user_id = $3`,
          credentials.access_token!, credentials.expiry_date ? new Date(credentials.expiry_date) : null, userId,
        )
        oauth2Client.setCredentials(credentials)
      } catch {
        throw new Error('Falha ao renovar o acesso ao Google. Reconecte sua conta na Agenda.')
      }
    }
    return oauth2Client
  }

  // ── OneClick → Google ───────────────────────────────────

  /**
   * Cria/atualiza o evento na agenda `primary` de `userId`. Usado pelo envio
   * automático (sempre com o CRIADOR) e pela rota manual.
   */
  async syncToGoogle(eventoId: string, userId: string): Promise<string | null> {
    const evento = await prisma.agendaEvento.findUnique({
      where: { id: eventoId },
      include: { participantes: { where: { isActive: true }, select: { usuarioId: true } } },
    })
    if (!evento || !evento.isActive) return null

    // #HLP0270: evento particular só é exportado pelo criador ou por um participante.
    if (evento.particular
        && evento.criadorId !== userId
        && !evento.participantes.some(p => p.usuarioId === userId)) {
      throw new Error('Você não pode sincronizar um evento particular do qual não participa.')
    }

    const oauth2Client = await this.getAuthenticatedClient(userId)
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const ini = diaDaColuna(evento.data)
    const fim = evento.dataFim ? diaDaColuna(evento.dataFim) : ini
    const corpo: calendar_v3.Schema$Event = {
      summary: evento.titulo,
      description: evento.descricao || undefined,
      location: evento.local || evento.link || undefined,
      // Sem `attendees`, como no v1: os participantes são avisados por e-mail pela
      // agenda; convite do Google iria para fora sem o usuário pedir.
      extendedProperties: { private: { [PROP_ORIGEM]: evento.id } },
      ...(evento.particular ? { visibility: 'private' } : {}),
    }
    if (evento.diaInteiro || !evento.horaInicio) {
      // No Google o fim do dia inteiro é EXCLUSIVO (dia seguinte).
      corpo.start = { date: ini }
      corpo.end = { date: somarDia(fim, 1) }
    } else {
      corpo.start = { dateTime: `${ini}T${evento.horaInicio}:00`, timeZone: 'America/Sao_Paulo' }
      corpo.end = { dateTime: `${fim}T${evento.horaFim || evento.horaInicio}:00`, timeZone: 'America/Sao_Paulo' }
    }

    if (ehIdDoGoogle(evento.googleId)) {
      try {
        await calendar.events.patch({ calendarId: 'primary', eventId: evento.googleId, requestBody: corpo })
        return evento.googleId
      } catch (e) {
        const status = (e as { code?: number }).code
        // 404/410: apagado no Google — recria. Outro erro: não duplica, sobe.
        if (status !== 404 && status !== 410) throw e
      }
    }

    const created = await calendar.events.insert({ calendarId: 'primary', requestBody: corpo })
    const googleId = created.data.id || null
    if (googleId) await prisma.agendaEvento.update({ where: { id: eventoId }, data: { googleId } })
    return googleId
  }

  async deleteFromGoogle(eventoId: string, userId: string): Promise<void> {
    const evento = await prisma.agendaEvento.findUnique({ where: { id: eventoId }, select: { googleId: true } })
    if (!ehIdDoGoogle(evento?.googleId)) return
    try {
      const oauth2Client = await this.getAuthenticatedClient(userId)
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
      await calendar.events.delete({ calendarId: 'primary', eventId: evento!.googleId! })
    } catch {
      // Já apagado no Google, ou conexão perdida — a exclusão no OneClick vale igual.
    }
  }

  /**
   * Envio automático depois de criar/editar/excluir (paridade com o v1). Vai para
   * a agenda do CRIADOR, se ele tiver conectado. Nunca lança e nunca segura a
   * operação da agenda: entra numa fila e só registra falha no log.
   */
  enfileirarEnvio(eventoIds: string[]): void {
    if (eventoIds.length === 0) return
    this.fila = this.fila.then(async () => {
      for (const id of eventoIds) {
        try {
          const ev = await prisma.agendaEvento.findUnique({ where: { id }, select: { criadorId: true, isActive: true, isTarefa: true } })
          if (!ev || ev.isTarefa) continue
          if (!(await this.temConexao(ev.criadorId))) continue
          if (ev.isActive) await this.syncToGoogle(id, ev.criadorId)
          else await this.deleteFromGoogle(id, ev.criadorId)
        } catch (e) {
          this.logger.warn(`Envio ao Google falhou (evento ${id}): ${(e as Error).message}`)
        }
      }
    }).catch(() => undefined)
  }

  // ── Google → OneClick ───────────────────────────────────

  /**
   * Traz da agenda Google os eventos de -daysBack a +daysForward.
   *  - O que saiu do OneClick (marca PROP_ORIGEM) é ignorado: o OneClick é a fonte.
   *  - Casa por `googleId`; sem casar, procura o MESMO compromisso já na agenda
   *    (criador + dia + hora + título) e só VINCULA o id — os eventos que o v1
   *    mandou ao Google têm, no v2, um `google_id` que não é do Google, e sem isso
   *    a primeira importação duplicaria tudo.
   *  - Evento novo nasce na empresa do usuário; cancelado no Google desativa.
   */
  async syncFromGoogle(userId: string, daysBack = 7, daysForward = 30): Promise<{ created: number; updated: number; linked: number; skipped: number; errors: number }> {
    const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { empresaId: true, isActive: true } })
    if (!usuario?.isActive) return { created: 0, updated: 0, linked: 0, skipped: 0, errors: 0 }

    const oauth2Client = await this.getAuthenticatedClient(userId)
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const timeMin = new Date(); timeMin.setDate(timeMin.getDate() - daysBack)
    const timeMax = new Date(); timeMax.setDate(timeMax.getDate() + daysForward)

    const events: calendar_v3.Schema$Event[] = []
    let pageToken: string | undefined
    do {
      const res = await calendar.events.list({
        calendarId: 'primary', timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(),
        maxResults: 250, singleEvents: true, showDeleted: true, pageToken,
      })
      events.push(...(res.data.items || []))
      pageToken = res.data.nextPageToken || undefined
    } while (pageToken && events.length < 2000)

    // Tipo para os eventos vindos do Google — não cria tipo (regra do módulo).
    const googleTipo = await prisma.agendaTipo.findFirst({ where: { nome: 'Google Calendar', isActive: true } })
      ?? await prisma.agendaTipo.findFirst({ where: { isActive: true, ...(usuario.empresaId ? { OR: [{ empresaId: usuario.empresaId }, { empresaId: null }] } : {}) }, orderBy: { createdAt: 'asc' } })
    if (!googleTipo) throw new Error('Nenhum tipo de evento cadastrado na agenda para vincular os eventos do Google.')

    let created = 0, updated = 0, linked = 0, skipped = 0, errors = 0
    for (const g of events) {
      if (!g.id) continue
      if (g.extendedProperties?.private?.[PROP_ORIGEM]) { skipped++; continue }
      try {
        const existing = await prisma.agendaEvento.findFirst({ where: { googleId: g.id, criadorId: userId } })

        if (g.status === 'cancelled') {
          if (existing?.isActive) { await prisma.agendaEvento.update({ where: { id: existing.id }, data: { isActive: false } }); updated++ }
          continue
        }
        if (!g.summary || !(g.start?.date || g.start?.dateTime)) continue

        const diaInteiro = !!g.start?.date
        const inicio = diaInteiro ? new Date(`${g.start!.date!}T00:00:00Z`) : new Date(g.start!.dateTime!)
        const data = diaInteiro ? inicio : new Date(`${brDia(inicio)}T00:00:00Z`)
        const horaInicio = diaInteiro ? null : brHora(inicio)
        const horaFim = diaInteiro ? null : (g.end?.dateTime ? brHora(new Date(g.end.dateTime)) : null)
        const campos = {
          titulo: g.summary,
          descricao: g.description || null,
          data, diaInteiro, horaInicio, horaFim,
          local: g.location || null,
          link: g.hangoutLink || null,
        }

        if (existing) {
          await prisma.agendaEvento.update({ where: { id: existing.id }, data: { ...campos, isActive: true } })
          updated++
          continue
        }

        // Mesmo compromisso já na agenda (veio do v1/importação): só vincula o id.
        const igual = await prisma.agendaEvento.findFirst({
          where: { criadorId: userId, isActive: true, data, horaInicio, titulo: g.summary },
          select: { id: true, googleId: true },
        })
        if (igual) {
          if (!ehIdDoGoogle(igual.googleId)) {
            await prisma.agendaEvento.update({ where: { id: igual.id }, data: { googleId: g.id } })
            linked++
          } else skipped++
          continue
        }

        await prisma.agendaEvento.create({
          data: {
            ...campos, googleId: g.id, tipoId: googleTipo.id, criadorId: userId,
            empresaId: usuario.empresaId ?? null,
            presenca: g.hangoutLink ? 'ONLINE' : 'PRESENCIAL',
            isActive: true, editavel: true, particular: g.visibility === 'private',
          },
        })
        created++
      } catch (e) {
        errors++
        this.logger.warn(`Importação do Google falhou (usuário ${userId}, evento ${g.id}): ${(e as Error).message}`)
      }
    }
    return { created, updated, linked, skipped, errors }
  }
}
