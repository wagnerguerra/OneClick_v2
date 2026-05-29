import { Injectable, Inject, OnModuleInit } from '@nestjs/common'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { prisma } from '@saas/db'
import type { AgendaLembrete, AgendaLembreteCanal } from '@saas/db'
import { EmailService } from '../common/email.service'
import { AgendaLembreteEventsService } from './agenda-lembrete-events.service'

// Logo do sistema embarcada inline em todos e-mails (via cid:logo). Lê uma vez
// no boot do módulo — se o arquivo não existir (dev sem assets), faz fallback
// silencioso pra emoji ⏰.
const LOGO_PATH = path.resolve(process.cwd(), 'assets', 'email-logo.png')
let LOGO_BUFFER: Buffer | null = null
try { LOGO_BUFFER = fs.readFileSync(LOGO_PATH) } catch { /* sem logo */ }

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
            id: true, titulo: true, data: true, horaInicio: true, horaFim: true,
            diaInteiro: true, local: true, link: true, presenca: true,
            descricao: true, criadorId: true,
            criador: { select: { name: true } },
            tipo: { select: { nome: true, cor: true } },
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
      id: string; titulo: string; data: Date; horaInicio: string | null; horaFim: string | null
      diaInteiro: boolean; local: string | null; link: string | null
      presenca: 'PRESENCIAL' | 'ONLINE' | 'HIBRIDO'
      descricao: string | null; criadorId: string
      criador: { name: string | null }
      tipo: { nome: string; cor: string }
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
      // Anexa a logo inline (cid:logo) se disponível
      const attachments = LOGO_BUFFER
        ? [{ filename: 'logo.png', content: LOGO_BUFFER, cid: 'logo' }]
        : undefined
      for (const u of users) {
        if (!u.email) continue
        try {
          await this.emailService.sendMail({
            to: u.email,
            subject: `Lembrete: ${lembrete.evento.titulo}`,
            html: this.renderEmailHtml(lembrete.evento, lembrete.minutosAntes, u.name, !!LOGO_BUFFER),
            attachments,
          })
        } catch (e) {
          console.error(`[AgendaLembrete] Email pra ${u.email} falhou:`, (e as Error).message)
        }
      }
    }

    await prisma.agendaLembrete.update({ where: { id: lembrete.id }, data: { ultimoDisparoEm: new Date() } })
  }

  private renderEmailHtml(
    evento: {
      id: string; titulo: string; data: Date; horaInicio: string | null; horaFim: string | null
      diaInteiro: boolean; local: string | null; link: string | null
      presenca: 'PRESENCIAL' | 'ONLINE' | 'HIBRIDO'
      descricao: string | null
      criador: { name: string | null }
      tipo: { nome: string; cor: string }
    },
    minutosAntes: number,
    nomeUsuario: string | null,
    temLogo: boolean,
  ): string {
    const antecedencia = this.formatarAntecedenciaRica(minutosAntes)
    const dataLong = this.formatarDataExtenso(evento.data)
    const horarioBlock = evento.diaInteiro
      ? 'Dia inteiro'
      : evento.horaInicio && evento.horaFim
        ? `${evento.horaInicio} — ${evento.horaFim}`
        : evento.horaInicio ?? '—'
    const presencaLabel = { PRESENCIAL: 'Presencial', ONLINE: 'Online', HIBRIDO: 'Híbrido' }[evento.presenca]
    const presencaIcon = { PRESENCIAL: '🏢', ONLINE: '💻', HIBRIDO: '🔄' }[evento.presenca]

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.oneclick.central-rnc.com.br'
    const eventoUrl = `${appUrl.replace(/\/$/, '')}/agenda?verEvento=${evento.id}`

    const corTipo = evento.tipo.cor || '#0ea5e9'
    const greeting = nomeUsuario ? `Olá, ${this.escapeHtml(nomeUsuario.split(' ')[0]!)}` : 'Olá'
    const preheader = `${antecedencia.principal} ${antecedencia.unidade.toLowerCase()} · ${evento.titulo}`

    // Sanitiza descrição (strip de tags) e trunca em 240 chars
    const descricaoLimpa = evento.descricao
      ? this.stripHtmlAndTruncate(evento.descricao, 240)
      : null

    const row = (icon: string, label: string, value: string): string => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="32" valign="top" style="padding-top:1px"><span style="font-size:16px;line-height:1">${icon}</span></td>
              <td>
                <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;font-weight:600;margin-bottom:1px">${label}</div>
                <div style="font-size:14px;color:#0f172a;font-weight:500;line-height:1.4">${value}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `

    const rows: string[] = [
      row('📅', 'Data', dataLong),
      row('🕐', 'Horário', horarioBlock),
    ]
    if (evento.local) rows.push(row('📍', 'Local', this.escapeHtml(evento.local)))
    rows.push(row(presencaIcon, 'Modalidade', presencaLabel))
    if (evento.link) {
      rows.push(row('🔗', 'Link da reunião', `<a href="${this.escapeAttr(evento.link)}" style="color:#0ea5e9;text-decoration:none;font-weight:500;word-break:break-all">${this.escapeHtml(evento.link)}</a>`))
    }
    if (evento.criador.name) {
      rows.push(row('👤', 'Criado por', this.escapeHtml(evento.criador.name)))
    }

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<title>Lembrete: ${this.escapeHtml(evento.titulo)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<!-- Preheader (oculto, aparece como preview nos clients) -->
<div style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;color:transparent">${this.escapeHtml(preheader)}</div>

<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9">
  <tr><td align="center" style="padding:32px 16px">
    <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(15,23,42,0.08);overflow:hidden">

      <!-- BRAND BAR (faixa branca com a logo do sistema) -->
      <tr><td style="padding:20px 32px;background:#ffffff;border-bottom:1px solid #e2e8f0">
        ${temLogo
          ? `<img src="cid:logo" alt="OneClick" width="120" style="display:block;height:auto;max-width:160px;border:0;outline:none;text-decoration:none"/>`
          : `<div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">OneClick</div>`}
      </td></tr>

      <!-- HERO -->
      <tr><td style="padding:32px 32px 28px;background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%);text-align:center">
        <div style="display:inline-block;width:56px;height:56px;border-radius:16px;background:rgba(255,255,255,0.22);text-align:center;line-height:56px;font-size:28px;margin-bottom:12px">⏰</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:1.8px;font-weight:700;margin-bottom:8px">Lembrete · Daqui a</div>
        <div style="font-size:42px;line-height:1;font-weight:800;color:#ffffff;letter-spacing:-1px">${antecedencia.principal}</div>
        <div style="font-size:14px;color:rgba(255,255,255,0.9);font-weight:500;margin-top:4px;letter-spacing:0.5px">${antecedencia.unidade}</div>
      </td></tr>

      <!-- TÍTULO + TIPO -->
      <tr><td style="padding:28px 32px 8px">
        <div style="display:inline-block;padding:3px 10px;background:${corTipo}1a;color:${corTipo};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;border-radius:999px;margin-bottom:10px">${this.escapeHtml(evento.tipo.nome)}</div>
        <h1 style="margin:0;font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.4px;line-height:1.25">${this.escapeHtml(evento.titulo)}</h1>
      </td></tr>

      <!-- INFOS -->
      <tr><td style="padding:16px 32px 4px">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          ${rows.join('')}
        </table>
      </td></tr>

      ${descricaoLimpa ? `
      <!-- DESCRIÇÃO -->
      <tr><td style="padding:18px 32px 4px">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;font-weight:600;margin-bottom:6px">Descrição</div>
        <div style="font-size:14px;color:#334155;line-height:1.5;background:#f8fafc;padding:12px 14px;border-radius:8px;border-left:3px solid ${corTipo}">${this.escapeHtml(descricaoLimpa)}</div>
      </td></tr>
      ` : ''}

      <!-- CTA -->
      <tr><td style="padding:24px 32px 28px;text-align:center">
        <a href="${this.escapeAttr(eventoUrl)}" style="display:inline-block;padding:13px 28px;background:#0ea5e9;color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;letter-spacing:0.2px;box-shadow:0 2px 8px rgba(14,165,233,0.3)">Abrir na agenda →</a>
        <div style="margin-top:10px;font-size:11px;color:#94a3b8">ou copie: <a href="${this.escapeAttr(eventoUrl)}" style="color:#64748b;text-decoration:underline">${this.escapeHtml(eventoUrl)}</a></div>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="font-size:12px;color:#64748b;line-height:1.5">
              ${greeting}, este lembrete foi configurado pra disparar com antecedência. Você pode editar ou remover lembretes diretamente no evento.
            </td>
          </tr>
          <tr>
            <td style="padding-top:10px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;margin-top:10px;padding-top:10px">
              OneClick · Agenda Corporativa
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
  }

  /** Quebra a antecedência em "número" + "unidade" pra exibir grande no hero do email. */
  private formatarAntecedenciaRica(min: number): { principal: string; unidade: string } {
    if (min < 60) return { principal: String(min), unidade: min === 1 ? 'minuto' : 'minutos' }
    if (min < 1440) {
      const h = min / 60
      return Number.isInteger(h)
        ? { principal: String(h), unidade: h === 1 ? 'hora' : 'horas' }
        : { principal: `${h.toFixed(1)}`, unidade: 'horas' }
    }
    const d = min / 1440
    if (d >= 7 && Number.isInteger(d / 7)) {
      const sem = d / 7
      return { principal: String(sem), unidade: sem === 1 ? 'semana' : 'semanas' }
    }
    return Number.isInteger(d)
      ? { principal: String(d), unidade: d === 1 ? 'dia' : 'dias' }
      : { principal: `${d.toFixed(1)}`, unidade: 'dias' }
  }

  /** "quinta-feira, 29 de maio de 2026" */
  private formatarDataExtenso(d: Date): string {
    const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
    const dia = d.getUTCDate()
    const mes = meses[d.getUTCMonth()]
    const ano = d.getUTCFullYear()
    const diaSemana = dias[d.getUTCDay()]
    return `${diaSemana}, ${dia} de ${mes} de ${ano}`
  }

  private stripHtmlAndTruncate(html: string, maxLen: number): string {
    const txt = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    if (txt.length <= maxLen) return txt
    return txt.slice(0, maxLen).replace(/\s+\S*$/, '') + '…'
  }

  private escapeAttr(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  }

  private escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  }
}
