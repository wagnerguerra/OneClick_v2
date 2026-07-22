import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { google } from 'googleapis'

@Injectable()
export class AgendaGoogleService {

  private async getOAuthClient() {
    // Read GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_REDIRECT_URI
    // from SystemConfig table (prisma.systemConfig), fallback to process.env
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_REDIRECT_URI'] } },
    })
    const map = new Map(configs.map(c => [c.key, c.value]))

    const clientId = map.get('GOOGLE_CALENDAR_CLIENT_ID') || process.env.GOOGLE_CALENDAR_CLIENT_ID || ''
    const clientSecret = map.get('GOOGLE_CALENDAR_CLIENT_SECRET') || process.env.GOOGLE_CALENDAR_CLIENT_SECRET || ''
    const redirectUri = map.get('GOOGLE_CALENDAR_REDIRECT_URI') || process.env.GOOGLE_CALENDAR_REDIRECT_URI || ''

    if (!clientId || !clientSecret) throw new Error('Google Calendar nao configurado. Preencha Client ID e Client Secret em Configuracoes.')

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  }

  // Get OAuth URL for user to authorize
  async getAuthUrl(userId: string): Promise<string> {
    const oauth2Client = await this.getOAuthClient()
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state: userId, // pass userId to identify user in callback
    })
  }

  // Handle OAuth callback - exchange code for tokens and store them
  async handleCallback(code: string, userId: string): Promise<{ success: boolean; message: string }> {
    const oauth2Client = await this.getOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)

    // Tabela google_calendar_tokens criada no deploy (add_google_calendar_tokens.sql) —
    // schema não nasce mais em runtime. [QA #8]
    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null

    // Upsert
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM google_calendar_tokens WHERE user_id = $1', userId
    )

    if (existing.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE google_calendar_tokens SET access_token = $1, refresh_token = COALESCE($2, refresh_token), expires_at = $3, updated_at = NOW() WHERE user_id = $4`,
        tokens.access_token!, tokens.refresh_token ?? null, expiresAt, userId
      )
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO google_calendar_tokens (user_id, access_token, refresh_token, expires_at) VALUES ($1, $2, $3, $4)`,
        userId, tokens.access_token!, tokens.refresh_token ?? null, expiresAt
      )
    }

    return { success: true, message: 'Conta Google vinculada com sucesso!' }
  }

  // Check if user has Google Calendar connected
  async getConnectionStatus(userId: string): Promise<{ connected: boolean; email?: string }> {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ access_token: string; refresh_token: string | null }>>(
        'SELECT access_token, refresh_token FROM google_calendar_tokens WHERE user_id = $1', userId
      )
      if (rows.length === 0) return { connected: false }

      // Try to get user email from Google
      try {
        const oauth2Client = await this.getOAuthClient()
        oauth2Client.setCredentials({ access_token: rows[0]!.access_token, refresh_token: rows[0]!.refresh_token })
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
        const cal = await calendar.calendarList.get({ calendarId: 'primary' })
        return { connected: true, email: cal.data.summary || undefined }
      } catch {
        return { connected: true }
      }
    } catch {
      return { connected: false }
    }
  }

  // Disconnect Google Calendar
  async disconnect(userId: string): Promise<void> {
    await prisma.$executeRawUnsafe('DELETE FROM google_calendar_tokens WHERE user_id = $1', userId)
  }

  // Get authenticated client for a user (refresh token if needed)
  private async getAuthenticatedClient(userId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ access_token: string; refresh_token: string | null; expires_at: Date | null }>>(
      'SELECT access_token, refresh_token, expires_at FROM google_calendar_tokens WHERE user_id = $1', userId
    )
    if (rows.length === 0) throw new Error('Google Calendar nao vinculado. Vincule sua conta nas configuracoes.')

    const token = rows[0]!
    const oauth2Client = await this.getOAuthClient()
    oauth2Client.setCredentials({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
    })

    // Refresh if expired
    if (token.expires_at && new Date(token.expires_at).getTime() < Date.now() + 60000) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken()
        await prisma.$executeRawUnsafe(
          `UPDATE google_calendar_tokens SET access_token = $1, expires_at = $2, updated_at = NOW() WHERE user_id = $3`,
          credentials.access_token!, credentials.expiry_date ? new Date(credentials.expiry_date) : null, userId
        )
        oauth2Client.setCredentials(credentials)
      } catch {
        throw new Error('Falha ao renovar token do Google. Revincule sua conta.')
      }
    }

    return oauth2Client
  }

  // Sync event TO Google Calendar (create or update)
  async syncToGoogle(eventoId: string, userId: string): Promise<string | null> {
    const evento = await prisma.agendaEvento.findUnique({
      where: { id: eventoId },
      include: {
        tipo: { select: { nome: true } },
        participantes: {
          where: { isActive: true, usuarioId: { not: null } },
          include: { usuario: { select: { email: true } } },
        },
      },
    })
    if (!evento) return null

    // #HLP0270: evento particular só pode ser exportado pelo criador ou por um
    // participante — senão qualquer um sincronizaria um compromisso privado alheio
    // para a própria agenda Google e o leria lá.
    if (evento.particular
        && evento.criadorId !== userId
        && !evento.participantes.some(p => p.usuarioId === userId)) {
      throw new Error('Você não pode sincronizar um evento particular do qual não participa.')
    }

    const oauth2Client = await this.getAuthenticatedClient(userId)
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const dataStr = new Date(evento.data).toISOString().split('T')[0]!

    const googleEvent: Record<string, unknown> = {
      summary: evento.titulo,
      description: evento.descricao || undefined,
      location: evento.local || undefined,
    }

    if (evento.diaInteiro) {
      googleEvent.start = { date: dataStr }
      googleEvent.end = { date: dataStr }
    } else {
      googleEvent.start = { dateTime: `${dataStr}T${evento.horaInicio || '09:00'}:00`, timeZone: 'America/Sao_Paulo' }
      googleEvent.end = { dateTime: `${dataStr}T${evento.horaFim || '10:00'}:00`, timeZone: 'America/Sao_Paulo' }
    }

    // Add attendees
    const attendees = evento.participantes
      .map(p => p.usuario?.email)
      .filter((e): e is string => !!e)
      .map(email => ({ email }))
    if (attendees.length > 0) googleEvent.attendees = attendees

    // If event already has googleId, update it
    if (evento.googleId) {
      try {
        await calendar.events.update({
          calendarId: 'primary',
          eventId: evento.googleId,
          requestBody: googleEvent as never,
        })
        return evento.googleId
      } catch {
        // If update fails (event deleted from Google), create new
      }
    }

    // Create new event in Google
    const created = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: googleEvent as never,
    })

    const googleId = created.data.id || null
    if (googleId) {
      await prisma.agendaEvento.update({
        where: { id: eventoId },
        data: { googleId },
      })
    }

    return googleId
  }

  // Delete event from Google Calendar
  async deleteFromGoogle(eventoId: string, userId: string): Promise<void> {
    const evento = await prisma.agendaEvento.findUnique({
      where: { id: eventoId },
      select: { googleId: true },
    })
    if (!evento?.googleId) return

    try {
      const oauth2Client = await this.getAuthenticatedClient(userId)
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: evento.googleId,
      })
    } catch {
      // Event may already be deleted from Google
    }
  }

  // Sync FROM Google Calendar (import events)
  async syncFromGoogle(userId: string, daysBack = 7, daysForward = 30): Promise<{ created: number; updated: number; errors: number }> {
    const oauth2Client = await this.getAuthenticatedClient(userId)
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const timeMin = new Date()
    timeMin.setDate(timeMin.getDate() - daysBack)
    const timeMax = new Date()
    timeMax.setDate(timeMax.getDate() + daysForward)

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 250,
      singleEvents: true,
      orderBy: 'startTime',
    })

    const events = res.data.items || []
    let created = 0, updated = 0, errors = 0

    // Tipo para eventos do Google — NÃO cria tipo novo (o sistema não deve gerar tipos
    // de evento automaticamente). Usa "Google Calendar" se existir, senão o 1º tipo ativo.
    let googleTipo = await prisma.agendaTipo.findFirst({
      where: { nome: 'Google Calendar', isActive: true },
    })
    if (!googleTipo) {
      googleTipo = await prisma.agendaTipo.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      })
    }
    if (!googleTipo) {
      throw new Error('Nenhum tipo de evento cadastrado na agenda para vincular os eventos do Google.')
    }

    for (const gEvent of events) {
      if (!gEvent.id || !gEvent.summary) continue

      try {
        const existing = await prisma.agendaEvento.findFirst({
          where: { googleId: gEvent.id, criadorId: userId },
        })

        const isDayEvent = !!gEvent.start?.date
        const startInstant = isDayEvent
          ? new Date(gEvent.start!.date!)
          : new Date(gEvent.start!.dateTime!)

        // [QA #5] Converte pra data/hora de BRASÍLIA seguindo a convenção do módulo
        // (data = meia-noite UTC do dia-calendário; hora = string HH:MM local BR).
        // Antes usava toTimeString() (timezone do SERVIDOR — UTC no docker), que
        // deslocava os horários em 3h e podia mudar o dia do evento.
        const brDia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
        const brHora = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)

        const eventData = {
          titulo: gEvent.summary,
          descricao: gEvent.description || null,
          data: isDayEvent ? startInstant : new Date(brDia(startInstant)),
          diaInteiro: isDayEvent,
          horaInicio: isDayEvent ? null : brHora(startInstant),
          horaFim: isDayEvent ? null : (gEvent.end?.dateTime ? brHora(new Date(gEvent.end.dateTime)) : null),
          local: gEvent.location || null,
          link: gEvent.hangoutLink || null,
          googleId: gEvent.id,
          tipoId: googleTipo.id,
          criadorId: userId,
          presenca: gEvent.hangoutLink ? 'ONLINE' as const : 'PRESENCIAL' as const,
        }

        if (existing) {
          await prisma.agendaEvento.update({
            where: { id: existing.id },
            data: eventData,
          })
          updated++
        } else {
          await prisma.agendaEvento.create({
            data: { ...eventData, isActive: true, editavel: true, particular: false },
          })
          created++
        }
      } catch {
        errors++
      }
    }

    return { created, updated, errors }
  }
}
