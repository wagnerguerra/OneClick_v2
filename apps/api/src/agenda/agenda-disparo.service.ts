import { Injectable, Inject, OnModuleInit } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { AgendaDisparoConfig } from '@saas/db'
import { EmailService } from '../common/email.service'

/**
 * Disparo automático da "Agenda do Dia" por email — singleton de config + scheduler.
 *
 * Funcionamento:
 *   1. AgendaDisparoConfig (1 linha) guarda: ativo, horário (HH:MM), dias da semana
 *      (0=dom..6=sáb), lista de destinatariosIds (User.id).
 *   2. Scheduler checa a cada minuto: se hoje está nos diasSemana E o horário atual
 *      bate com o configurado, dispara o email pra todos os destinatários.
 *   3. `ultimoDisparoEm` evita reenvio se o scheduler rodar 2x no mesmo minuto.
 *
 * Privacidade:
 *   - Eventos `particular = false`: aparecem no email de TODOS os destinatários
 *   - Eventos `particular = true`: aparecem APENAS no email do criador
 *
 * Segmentação:
 *   - Eventos cujo tipo.nome contém "pessoal" (case-insensitive) OU `particular=true`
 *     vão na seção "Compromissos Pessoais"; demais vão em "Compromissos Corporativos".
 */
@Injectable()
export class AgendaDisparoService implements OnModuleInit {
  private readonly defaults = {
    ativo: false,
    horario: '07:00',
    diasSemana: [1, 2, 3, 4, 5],     // seg-sex
    destinatariosIds: [] as string[],
  }
  constructor(
    @Inject(EmailService) private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    // Checa a cada 60s se está na hora de disparar (granularidade de minuto).
    // Não usa cron lib pra evitar dependência extra.
    setInterval(() => {
      this.tickScheduler().catch(e => console.error('[AgendaDisparo] tick falhou:', e))
    }, 60_000)
    console.log('[AgendaDisparo] Scheduler iniciado (tick 60s)')
  }

  // ============================================================
  // CRUD da config
  // ============================================================

  async get(): Promise<AgendaDisparoConfig> {
    const existing = await prisma.agendaDisparoConfig.findFirst()
    if (existing) return existing
    return prisma.agendaDisparoConfig.create({ data: this.defaults })
  }

  async update(data: Partial<{
    ativo: boolean
    horario: string
    diasSemana: number[]
    destinatariosIds: string[]
  }>): Promise<AgendaDisparoConfig> {
    const existing = await prisma.agendaDisparoConfig.findFirst()
    if (existing) {
      return prisma.agendaDisparoConfig.update({ where: { id: existing.id }, data })
    }
    return prisma.agendaDisparoConfig.create({ data: { ...this.defaults, ...data } })
  }

  // ============================================================
  // Scheduler
  // ============================================================

  /**
   * Roda a cada minuto. Dispara se config.ativo + dia/hora batem.
   *
   * IMPORTANTE: container roda em UTC, mas usuários configuram horário pensando
   * em horário de Brasília. Por isso usamos `getNowBrasilia()` pra extrair
   * hora/dia da semana corretos (mesmo no container UTC).
   */
  private async tickScheduler() {
    const cfg = await prisma.agendaDisparoConfig.findFirst()
    if (!cfg || !cfg.ativo) return
    if (cfg.destinatariosIds.length === 0) return

    const agoraUtc = new Date()
    const agoraBr = this.getNowBrasilia()
    const horaAtualBr = `${String(agoraBr.getHours()).padStart(2, '0')}:${String(agoraBr.getMinutes()).padStart(2, '0')}`
    const diaSemanaBr = agoraBr.getDay()  // 0=dom..6=sab em horário BR

    if (!cfg.diasSemana.includes(diaSemanaBr)) return
    if (horaAtualBr !== cfg.horario) return

    // Anti-duplicação: se já disparou esse minuto (em UTC, comparação literal), pula
    if (cfg.ultimoDisparoEm) {
      const diffMs = agoraUtc.getTime() - new Date(cfg.ultimoDisparoEm).getTime()
      if (diffMs < 60_000) return
    }

    console.log(`[AgendaDisparo] Disparando agenda do dia ${agoraBr.toISOString()} (BR ${horaAtualBr}) pra ${cfg.destinatariosIds.length} destinatário(s)`)
    await prisma.agendaDisparoConfig.update({
      where: { id: cfg.id },
      data: { ultimoDisparoEm: agoraUtc },
    })
    // Data do email = data BR (não UTC) — pra não pegar dia errado depois das 21h
    await this.enviarAgendaDiaParaTodos(this.formatDateKey(agoraBr), cfg.destinatariosIds)
  }

  /**
   * Retorna um Date "virtual" cujos getHours/getMinutes/getDay representam o
   * horário de Brasília, mesmo que o processo rode em UTC. Usa Intl pra
   * conversão (sem depender de TZ do sistema).
   */
  private getNowBrasilia(): Date {
    const agora = new Date()
    // Truque comum: converte pra string no TZ BR e parseia de volta como local.
    const brStr = agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
    return new Date(brStr)
  }

  // ============================================================
  // Envio
  // ============================================================

  /** Dispara o email pra cada destinatário (personalizado por causa de eventos particulares). */
  async enviarAgendaDiaParaTodos(data: string, destinatariosIds: string[]): Promise<{ enviados: number; falhas: number }> {
    let enviados = 0, falhas = 0
    for (const userId of destinatariosIds) {
      try {
        await this.enviarAgendaDia(userId, data)
        enviados++
      } catch (e) {
        console.error(`[AgendaDisparo] Falha ao enviar pra ${userId}:`, (e as Error).message)
        falhas++
      }
    }
    return { enviados, falhas }
  }

  /** Envia a "Agenda do Dia" pra UM destinatário (com filtro de privacidade aplicado). */
  async enviarAgendaDia(destinatarioId: string, dataYyyyMmDd: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: destinatarioId },
      select: { id: true, name: true, email: true },
    })
    if (!user?.email) throw new Error(`Destinatário ${destinatarioId} sem email`)

    const eventDate = new Date(dataYyyyMmDd)

    // Busca todos eventos do dia. Aplica filtro de privacidade depois.
    const eventos = await prisma.agendaEvento.findMany({
      where: {
        isActive: true,
        data: eventDate,
      },
      include: {
        tipo: true,
        criador: { select: { id: true, name: true } },
        participantes: {
          where: { isActive: true },
          include: { usuario: { select: { id: true, name: true } } },
        },
        salaRef: { select: { nome: true } },
      },
      orderBy: [{ diaInteiro: 'desc' }, { horaInicio: 'asc' }],
    })

    // Filtro de privacidade: eventos particulares só pro próprio criador
    const visiveis = eventos.filter(ev => !ev.particular || ev.criadorId === destinatarioId)
    if (visiveis.length === 0) {
      console.log(`[AgendaDisparo] ${user.email} — nenhum evento visível em ${dataYyyyMmDd}, pulando`)
      return
    }

    // Segmenta corporativos vs pessoais
    const isPessoal = (ev: typeof visiveis[number]) =>
      ev.particular || ev.tipo.nome.toLowerCase().includes('pessoal')

    const corporativos = visiveis.filter(ev => !isPessoal(ev))
    const pessoais = visiveis.filter(ev => isPessoal(ev))

    const html = this.gerarHtmlEmail(dataYyyyMmDd, corporativos, pessoais, user.name)
    const dataDisplay = this.formatDataBr(eventDate)

    await this.emailService.sendMail({
      to: user.email,
      subject: `AGENDA DO DIA - ${dataDisplay}`,
      html,
    })
  }

  // ============================================================
  // Template HTML
  // ============================================================

  /** Gera HTML do email com 2 seções (Corporativos + Pessoais) e cards de eventos. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private gerarHtmlEmail(dataYyyyMmDd: string, corporativos: any[], pessoais: any[], nomeDestinatario: string): string {
    const dataDisplay = this.formatDataBr(new Date(dataYyyyMmDd))
    const totalEventos = corporativos.length + pessoais.length

    const renderCard = (ev: typeof corporativos[number]) => {
      const cor = ev.tipo.cor || '#94a3b8'
      const bgClaro = this.hexComAlpha(cor, 0.08)
      const horario = ev.diaInteiro
        ? 'Dia inteiro'
        : `${ev.horaInicio ?? ''}<br/>${ev.horaFim ?? ''}`
      const modalidade = ev.presenca === 'ONLINE' ? '(Online)' : ev.presenca === 'HIBRIDO' ? '(Híbrido)' : '(Presencial)'
      const local = ev.salaRef?.nome || ev.sala
      const descricaoLocal = local ? ` a acontecer em ${this.escape(local)}` : ''
      const tipoTexto = `Evento tipo ${this.escape(ev.tipo.nome)} ${modalidade}, agendado por ${this.escape(ev.criador.name)}${descricaoLocal}`

      // "Preparação" derivada de equipamentos/sala
      const prepItens: string[] = []
      if (ev.salaRef || ev.sala) prepItens.push('Arrumar sala')
      if (ev.equipamentos) prepItens.push('Disponibilizar equipamentos')
      const prepHtml = prepItens.length > 0
        ? `<div style="margin-top:8px;font-weight:600;font-size:13px;color:#1f2937">Preparação</div>
           <div style="font-size:13px;color:#6b7280">${prepItens.join('; ')}</div>`
        : ''

      const linkHtml = ev.link
        ? `<div style="margin-top:8px;font-weight:600;font-size:13px;color:#1f2937">Link de reunião online</div>
           <div style="font-size:12px;color:#6b7280;word-break:break-all">${this.escape(ev.link)}</div>`
        : ''

      const nomes = (ev.participantes as Array<{ usuario?: { name: string } | null; nomeAvulso?: string | null }>)
        .map(p => p.usuario?.name ?? p.nomeAvulso)
        .filter(Boolean)
      const participantesHtml = nomes.length > 0
        ? `<div style="margin-top:8px;font-weight:600;font-size:13px;color:#1f2937">Participantes</div>
           <div style="font-size:13px;color:#6b7280">${nomes.map(n => this.escape(n!)).join(', ')}</div>`
        : ''

      return `
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 10px;background:${bgClaro};border-left:4px solid ${cor};border-radius:4px;">
  <tr>
    <td style="padding:12px 14px;width:54px;vertical-align:top;font-family:Arial,sans-serif;font-size:12px;color:#4b5563;line-height:1.4">
      ${horario}
    </td>
    <td style="padding:12px 14px 12px 0;vertical-align:top;font-family:Arial,sans-serif">
      <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:3px">${this.escape(ev.titulo)}</div>
      <div style="font-size:13px;color:#4b5563">${tipoTexto}</div>
      ${prepHtml}
      ${linkHtml}
      ${participantesHtml}
    </td>
  </tr>
</table>`
    }

    const secao = (titulo: string, eventos: typeof corporativos) => eventos.length > 0
      ? `<div style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#111827;margin:18px 0 10px">${titulo}</div>
         ${eventos.map(renderCard).join('')}`
      : ''

    return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb">
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f9fafb">
<tr><td align="center" style="padding:24px 12px">
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border-radius:8px;padding:24px;font-family:Arial,sans-serif">
  <tr><td>
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Bom dia, ${this.escape(nomeDestinatario)}</div>
    <div style="font-size:20px;font-weight:700;color:#0f172a;margin-top:4px">AGENDA DO DIA — ${dataDisplay}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:4px">${totalEventos} evento(s) na agenda</div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
    ${secao('Compromissos Corporativos', corporativos)}
    ${secao('Compromissos Pessoais', pessoais)}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 12px">
    <div style="font-size:11px;color:#9ca3af;text-align:center">
      Email automático da Agenda Corporativa OneClick · Para gerenciar, acesse a agenda no sistema
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
  }

  // ============================================================
  // Helpers
  // ============================================================

  private formatDateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  private formatDataBr(d: Date): string {
    const dia = String(d.getUTCDate()).padStart(2, '0')
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${dia}/${mes}/${d.getUTCFullYear()}`
  }

  private hexComAlpha(hex: string, alpha: number): string {
    // Converte #RRGGBB pra rgba — pra bg dos cards
    const h = hex.replace('#', '')
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
    const r = (bigint >> 16) & 255
    const g = (bigint >> 8) & 255
    const b = bigint & 255
    return `rgba(${r},${g},${b},${alpha})`
  }

  private escape(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
}
