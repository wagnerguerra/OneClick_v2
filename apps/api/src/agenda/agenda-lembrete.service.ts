import { Injectable, Inject, OnModuleInit } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { AgendaLembrete, AgendaLembreteCanal } from '@saas/db'
import { EmailService } from '../common/email.service'
import { AgendaLembreteEventsService } from './agenda-lembrete-events.service'

/**
 * Lembretes de eventos da agenda — estilo Google Calendar.
 *
 * Fluxo:
 *   1. Lembrete pertence ao evento (todos participantes recebem o mesmo).
 *   2. Scheduler roda a cada 60s, calcula triggerUtc = (evento.start - minutosAntes)
 *      e dispara quando agora cai numa janela de 60s desse trigger.
 *   3. Anti-duplicação via `ultimoDisparoEm` (≥ 12h evita resetar lembrete ao
 *      reabrir o evento ou em ticks duplicados).
 *
 * Canais:
 *   - POPUP: emite SSE em /api/agenda/lembretes/events (filtra por destinatários)
 *   - EMAIL: envia e-mail simples pra cada participante com email válido
 */
@Injectable()
export class AgendaLembreteService implements OnModuleInit {
  constructor(
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(AgendaLembreteEventsService) private readonly events: AgendaLembreteEventsService,
  ) {}

  onModuleInit() {
    setInterval(() => {
      this.tick().catch(e => console.error('[AgendaLembrete] tick falhou:', e))
    }, 60_000)
    console.log('[AgendaLembrete] Scheduler iniciado (tick 60s)')
  }

  // ============================================================
  // CRUD
  // ============================================================

  async list(eventoId: string): Promise<AgendaLembrete[]> {
    return prisma.agendaLembrete.findMany({
      where: { eventoId },
      orderBy: { minutosAntes: 'asc' },
    })
  }

  /**
   * Sync atômico: substitui TODOS os lembretes do evento pelos novos.
   * Reseta ultimoDisparoEm — usuário pode ter editado pra antecipar/adiar.
   */
  async save(eventoId: string, lembretes: Array<{ canal: AgendaLembreteCanal; minutosAntes: number }>): Promise<AgendaLembrete[]> {
    await prisma.agendaLembrete.deleteMany({ where: { eventoId } })
    if (lembretes.length === 0) return []
    await prisma.agendaLembrete.createMany({
      data: lembretes.map(l => ({ eventoId, canal: l.canal, minutosAntes: l.minutosAntes })),
    })
    return this.list(eventoId)
  }

  // ============================================================
  // Scheduler
  // ============================================================

  /**
   * A cada minuto, processa lembretes pendentes cujo trigger (eventStart - antes)
   * caia entre agora e agora+60s. Cobre os próximos 31 dias (max permitido = 30d
   * = 43200 min) — janela conservadora.
   */
  private async tick() {
    const agoraUtc = new Date()
    const ate31dias = new Date(agoraUtc.getTime() + 31 * 86_400_000)
    // Lembretes ainda não disparados nos últimos 12h, cujos eventos estão num
    // range razoável (próximos 31 dias). Carrega o evento + participantes pra
    // calcular trigger e destinatários.
    const lembretes = await prisma.agendaLembrete.findMany({
      where: {
        evento: {
          isActive: true,
          data: { gte: this.atStartOfDayUtc(agoraUtc), lte: ate31dias },
        },
        OR: [
          { ultimoDisparoEm: null },
          { ultimoDisparoEm: { lt: new Date(agoraUtc.getTime() - 12 * 3_600_000) } },
        ],
      },
      include: {
        evento: {
          select: {
            id: true, titulo: true, data: true, horaInicio: true, diaInteiro: true,
            local: true, criadorId: true,
            participantes: { where: { isActive: true }, select: { usuarioId: true } },
          },
        },
      },
    })

    if (lembretes.length === 0) return

    for (const lembrete of lembretes) {
      try {
        const triggerUtc = this.calcularTrigger(lembrete.evento.data, lembrete.evento.horaInicio, lembrete.evento.diaInteiro, lembrete.minutosAntes)
        if (!triggerUtc) continue

        // Janela: [agora - 30s, agora + 60s] — pega lembretes que "passaram"
        // recentemente também (resiliente a tick atrasado/pulado).
        const deltaMs = agoraUtc.getTime() - triggerUtc.getTime()
        if (deltaMs < -60_000 || deltaMs > 30_000) continue

        await this.dispararLembrete(lembrete)
      } catch (e) {
        console.error(`[AgendaLembrete] Falha disparando ${lembrete.id}:`, (e as Error).message)
      }
    }
  }

  /**
   * Calcula o instante UTC em que o lembrete deve disparar.
   * Eventos com horaInicio: usa o horário literal (interpretado como BR) e
   * converte pra UTC. Eventos de dia inteiro: dispara às 09:00 BR do dia.
   */
  private calcularTrigger(data: Date, horaInicio: string | null, diaInteiro: boolean, minutosAntes: number): Date | null {
    const yyyy = data.getUTCFullYear()
    const mm = String(data.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(data.getUTCDate()).padStart(2, '0')
    const horario = diaInteiro || !horaInicio ? '09:00' : horaInicio
    // Cria como hora BR (UTC-3) → adiciona 3h pra virar UTC
    // Não considera horário de verão (Brasil aboliu em 2019, ok pro nosso caso)
    const eventBrIsoStr = `${yyyy}-${mm}-${dd}T${horario}:00-03:00`
    const eventUtc = new Date(eventBrIsoStr)
    if (isNaN(eventUtc.getTime())) return null
    return new Date(eventUtc.getTime() - minutosAntes * 60_000)
  }

  private atStartOfDayUtc(d: Date): Date {
    const c = new Date(d)
    c.setUTCHours(0, 0, 0, 0)
    return c
  }

  private async dispararLembrete(lembrete: AgendaLembrete & {
    evento: {
      id: string; titulo: string; data: Date; horaInicio: string | null; diaInteiro: boolean
      local: string | null; criadorId: string
      participantes: Array<{ usuarioId: string | null }>
    }
  }) {
    const destinatarios = Array.from(new Set([
      lembrete.evento.criadorId,
      ...lembrete.evento.participantes.map(p => p.usuarioId).filter((id): id is string => !!id),
    ]))
    if (destinatarios.length === 0) {
      await prisma.agendaLembrete.update({ where: { id: lembrete.id }, data: { ultimoDisparoEm: new Date() } })
      return
    }

    const dataStr = lembrete.evento.data.toISOString().slice(0, 10)

    if (lembrete.canal === 'POPUP') {
      this.events.emit({
        eventoId: lembrete.evento.id,
        titulo: lembrete.evento.titulo,
        data: dataStr,
        horaInicio: lembrete.evento.horaInicio,
        diaInteiro: lembrete.evento.diaInteiro,
        local: lembrete.evento.local,
        minutosAntes: lembrete.minutosAntes,
        destinatarios,
      })
    } else {
      // EMAIL: dispara pra cada destinatário com email cadastrado
      const users = await prisma.user.findMany({
        where: { id: { in: destinatarios } },
        select: { email: true, name: true },
      })
      for (const u of users) {
        if (!u.email) continue
        try {
          await this.emailService.sendMail({
            to: u.email,
            subject: `Lembrete: ${lembrete.evento.titulo}`,
            html: this.renderEmailHtml(lembrete.evento, lembrete.minutosAntes, u.name),
          })
        } catch (e) {
          console.error(`[AgendaLembrete] Email pra ${u.email} falhou:`, (e as Error).message)
        }
      }
    }

    await prisma.agendaLembrete.update({ where: { id: lembrete.id }, data: { ultimoDisparoEm: new Date() } })
  }

  private renderEmailHtml(
    evento: { titulo: string; data: Date; horaInicio: string | null; diaInteiro: boolean; local: string | null },
    minutosAntes: number,
    nomeUsuario: string | null,
  ): string {
    const dataFmt = `${String(evento.data.getUTCDate()).padStart(2, '0')}/${String(evento.data.getUTCMonth() + 1).padStart(2, '0')}/${evento.data.getUTCFullYear()}`
    const horarioFmt = evento.diaInteiro ? 'Dia inteiro' : (evento.horaInicio ?? '')
    const antecedencia = this.formatarAntecedencia(minutosAntes)
    return `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb">
        <div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
            <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#0ea5e9,#6366f1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px">⏰</div>
            <div>
              <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Lembrete da agenda</p>
              <p style="margin:0;font-size:16px;font-weight:600;color:#111827">Daqui a ${antecedencia}</p>
            </div>
          </div>
          <h2 style="margin:0 0 12px;font-size:20px;color:#111827">${this.escapeHtml(evento.titulo)}</h2>
          <p style="margin:0 0 4px;color:#374151;font-size:14px"><strong>📅</strong> ${dataFmt}${horarioFmt ? ` · ${horarioFmt}` : ''}</p>
          ${evento.local ? `<p style="margin:0 0 4px;color:#374151;font-size:14px"><strong>📍</strong> ${this.escapeHtml(evento.local)}</p>` : ''}
          ${nomeUsuario ? `<p style="margin:16px 0 0;font-size:12px;color:#9ca3af">Olá, ${this.escapeHtml(nomeUsuario)} — este é um lembrete configurado no evento.</p>` : ''}
        </div>
      </div>
    `
  }

  private formatarAntecedencia(min: number): string {
    if (min < 60) return `${min} minuto${min > 1 ? 's' : ''}`
    if (min < 1440) {
      const h = Math.round(min / 60)
      return `${h} hora${h > 1 ? 's' : ''}`
    }
    const d = Math.round(min / 1440)
    return `${d} dia${d > 1 ? 's' : ''}`
  }

  private escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  }
}
