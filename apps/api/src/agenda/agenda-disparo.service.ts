import { Injectable, Inject, OnModuleInit } from '@nestjs/common'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { prisma } from '@saas/db'
import type { AgendaDisparoConfig } from '@saas/db'
import { EmailService } from '../common/email.service'

// Logo embarcada inline (cid:logo) — mesmo asset usado nos e-mails de lembrete.
const LOGO_PATH = path.resolve(process.cwd(), 'assets', 'email-logo.png')
let LOGO_BUFFER: Buffer | null = null
try { LOGO_BUFFER = fs.readFileSync(LOGO_PATH) } catch { /* sem logo */ }

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
    enviarParaTodos: boolean
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

    const destinatarios = await this.resolverDestinatarios(cfg)
    if (destinatarios.length === 0) return

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

    console.log(`[AgendaDisparo] Disparando agenda do dia ${agoraBr.toISOString()} (BR ${horaAtualBr}) pra ${destinatarios.length} destinatário(s)`)
    await prisma.agendaDisparoConfig.update({
      where: { id: cfg.id },
      data: { ultimoDisparoEm: agoraUtc },
    })
    // Data do email = data BR (não UTC) — pra não pegar dia errado depois das 21h
    await this.enviarAgendaDiaParaTodos(this.formatDateKey(agoraBr), destinatarios)
  }

  /**
   * Resolve lista final de destinatários: se `enviarParaTodos=true`, retorna
   * todos usuários ativos do tenant; senão usa a lista manual em `destinatariosIds`.
   */
  private async resolverDestinatarios(cfg: AgendaDisparoConfig): Promise<string[]> {
    if (cfg.enviarParaTodos) {
      const todos = await prisma.user.findMany({
        where: { isActive: true, email: { not: '' } },
        select: { id: true },
      })
      return todos.map(u => u.id)
    }
    return cfg.destinatariosIds
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

    const html = this.gerarHtmlEmail(dataYyyyMmDd, corporativos, pessoais, user.name, !!LOGO_BUFFER)
    const dataDisplay = this.formatDataBr(eventDate)

    await this.emailService.sendMail({
      to: user.email,
      subject: `Agenda do dia · ${dataDisplay}`,
      html,
      attachments: LOGO_BUFFER ? [{ filename: 'logo.png', content: LOGO_BUFFER, cid: 'logo' }] : undefined,
    })
  }

  // ============================================================
  // Template HTML
  // ============================================================

  /** Gera HTML do email com 2 seções (Corporativos + Pessoais) e cards de eventos. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private gerarHtmlEmail(dataYyyyMmDd: string, corporativos: any[], pessoais: any[], nomeDestinatario: string, temLogo: boolean): string {
    const dataObj = new Date(dataYyyyMmDd)
    const dataDisplay = this.formatDataBr(dataObj)
    const totalEventos = corporativos.length + pessoais.length
    const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
    const diasSemana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
    const diaSemana = diasSemana[dataObj.getUTCDay()]
    const diaNum = dataObj.getUTCDate()
    const mesAbrev = meses[dataObj.getUTCMonth()]
    const anoNum = dataObj.getUTCFullYear()
    const preheader = `${totalEventos} ${totalEventos === 1 ? 'compromisso' : 'compromissos'} hoje · ${dataDisplay}`

    // Saudação contextual conforme hora do disparo (Brasília)
    const horaBr = this.getNowBrasilia().getHours()
    const saudacao = horaBr < 12 ? 'Bom dia' : horaBr < 18 ? 'Boa tarde' : 'Boa noite'

    const renderCard = (ev: typeof corporativos[number]) => {
      const cor = ev.tipo.cor || '#0ea5e9'
      const horarioBlock = ev.diaInteiro
        ? '<span style="font-weight:700;color:#0ea5e9">Dia inteiro</span>'
        : `<div style="font-weight:700;font-size:14px;color:#0f172a;line-height:1.1" class="ev-time">${ev.horaInicio ?? ''}</div>
           <div style="font-weight:500;font-size:11px;color:#94a3b8;line-height:1;margin-top:2px" class="ev-time-end">${ev.horaFim ?? ''}</div>`
      const modalidadeLabel = ev.presenca === 'ONLINE' ? 'Online' : ev.presenca === 'HIBRIDO' ? 'Híbrido' : 'Presencial'
      const modalidadeIcon = ev.presenca === 'ONLINE' ? '💻' : ev.presenca === 'HIBRIDO' ? '🔄' : '🏢'
      const local = ev.salaRef?.nome || ev.sala

      const linhaInfo: string[] = []
      linhaInfo.push(`<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:${cor};color:#ffffff">${this.escape(ev.tipo.nome)}</span>`)
      linhaInfo.push(`<span class="ev-meta" style="font-size:11px;color:#64748b">${modalidadeIcon} ${modalidadeLabel}</span>`)
      if (local) linhaInfo.push(`<span class="ev-meta" style="font-size:11px;color:#64748b">📍 ${this.escape(local)}</span>`)

      const nomes = (ev.participantes as Array<{ usuario?: { name: string } | null; nomeAvulso?: string | null }>)
        .map(p => p.usuario?.name ?? p.nomeAvulso)
        .filter(Boolean)
      const participantesHtml = nomes.length > 0
        ? `<div class="ev-section" style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;font-size:11px;color:#64748b">
             <strong style="color:#475569" class="ev-label">👥 Participantes:</strong> ${nomes.map(n => this.escape(n!)).join(', ')}
           </div>`
        : ''

      const linkHtml = ev.link
        ? `<div class="ev-section" style="margin-top:8px;font-size:11px;color:#64748b">
             <strong style="color:#475569" class="ev-label">🔗 Link:</strong>
             <a href="${this.escapeAttr(ev.link)}" style="color:#0ea5e9;text-decoration:none;word-break:break-all">${this.escape(ev.link)}</a>
           </div>`
        : ''

      const prepItens: string[] = []
      if (ev.salaRef || ev.sala) prepItens.push('Arrumar sala')
      if (ev.equipamentos) prepItens.push('Disponibilizar equipamentos')
      const prepHtml = prepItens.length > 0
        ? `<div class="ev-section" style="margin-top:8px;font-size:11px;color:#64748b">
             <strong style="color:#475569" class="ev-label">📋 Preparação:</strong> ${prepItens.join(' · ')}
           </div>`
        : ''

      const criadorHtml = ev.criador?.name
        ? `<div class="ev-section" style="margin-top:8px;font-size:11px;color:#94a3b8" class="ev-creator">por ${this.escape(ev.criador.name)}</div>`
        : ''

      return `
<table cellpadding="0" cellspacing="0" border="0" width="100%" class="ev-card" style="margin:0 0 10px;background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid ${cor};border-radius:10px;overflow:hidden">
  <tr>
    <td width="68" valign="top" class="ev-time-cell" style="padding:14px 10px 14px 14px;text-align:center;border-right:1px solid #f1f5f9;vertical-align:middle;background:#f8fafc">
      ${horarioBlock}
    </td>
    <td valign="top" style="padding:14px 16px;vertical-align:top">
      <div class="ev-title" style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;line-height:1.3">${this.escape(ev.titulo)}</div>
      <div style="margin-bottom:4px">${linhaInfo.join(' &nbsp; ')}</div>
      ${linkHtml}
      ${prepHtml}
      ${participantesHtml}
      ${criadorHtml}
    </td>
  </tr>
</table>`
    }

    const secao = (titulo: string, icon: string, eventos: typeof corporativos) => eventos.length > 0
      ? `<div class="section-title" style="font-size:13px;font-weight:700;color:#0f172a;margin:22px 0 12px;display:flex;align-items:center;gap:8px">
           <span>${icon}</span>
           <span style="text-transform:uppercase;letter-spacing:0.8px">${titulo}</span>
           <span class="count-badge" style="background:#e2e8f0;color:#475569;font-size:10px;padding:1px 8px;border-radius:999px;font-weight:600">${eventos.length}</span>
         </div>
         ${eventos.map(renderCard).join('')}`
      : ''

    const brandBlock = temLogo
      ? `<img src="cid:logo" alt="OneClick" width="130" style="display:block;height:auto;max-width:160px;border:0;outline:none;text-decoration:none"/>`
      : `<div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.3px" class="brand-text">OneClick</div>`

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Agenda do dia · ${dataDisplay}</title>
<style>
  /* DARK MODE — adapta cores quando o cliente de email suportar prefers-color-scheme.
     Apple Mail / Outlook 2019+ / iOS Mail respeitam. Gmail web (dark mode forçado)
     faz inversão própria que geralmente fica decente porque mantemos fundos brancos
     em containers chave. */
  @media (prefers-color-scheme: dark) {
    body, .bg-page { background: #0f172a !important; }
    .card { background: #1e293b !important; border-color: rgba(255,255,255,0.08) !important; }
    .brand-bar { background: #1e293b !important; border-color: rgba(255,255,255,0.08) !important; }
    .brand-text { color: #f1f5f9 !important; }
    .greeting-eyebrow { color: #94a3b8 !important; }
    .ev-card { background: #1e293b !important; border-color: rgba(255,255,255,0.08) !important; }
    .ev-time-cell { background: #0f172a !important; border-right-color: rgba(255,255,255,0.06) !important; }
    .ev-time { color: #f1f5f9 !important; }
    .ev-time-end { color: #64748b !important; }
    .ev-title { color: #f1f5f9 !important; }
    .ev-meta { color: #94a3b8 !important; }
    .ev-section { border-color: rgba(255,255,255,0.08) !important; color: #94a3b8 !important; }
    .ev-label { color: #cbd5e1 !important; }
    .section-title { color: #f1f5f9 !important; }
    .count-badge { background: rgba(255,255,255,0.08) !important; color: #cbd5e1 !important; }
    .footer-text { color: #64748b !important; }
    .total-text { color: #94a3b8 !important; }
  }
  /* Reset Outlook */
  table { border-collapse: collapse; }
  img { -ms-interpolation-mode: bicubic; }
</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<!-- Preheader oculto (preview no client) -->
<div style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;color:transparent">${this.escape(preheader)}</div>

<table cellpadding="0" cellspacing="0" border="0" width="100%" class="bg-page" style="background:#f1f5f9">
<tr><td align="center" style="padding:32px 16px">
<table cellpadding="0" cellspacing="0" border="0" width="600" class="card" style="max-width:600px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(15,23,42,0.08);overflow:hidden;border:1px solid #e2e8f0">

  <!-- BRAND BAR -->
  <tr><td class="brand-bar" style="padding:20px 28px;background:#ffffff;border-bottom:1px solid #e2e8f0">
    ${brandBlock}
  </td></tr>

  <!-- HERO: data + saudação + título -->
  <tr><td style="padding:28px 28px 24px;background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%);color:#ffffff">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <!-- Tile de data -->
        <td width="74" valign="top" style="padding-right:18px">
          <table cellpadding="0" cellspacing="0" border="0" width="74" style="background:rgba(255,255,255,0.18);border-radius:12px;backdrop-filter:blur(10px)">
            <tr><td style="padding:6px 0;text-align:center;font-size:11px;font-weight:800;color:rgba(255,255,255,0.95);text-transform:uppercase;letter-spacing:2px;background:rgba(255,255,255,0.12);border-radius:12px 12px 0 0">${mesAbrev}</td></tr>
            <tr><td style="padding:8px 0 4px;text-align:center;font-size:32px;font-weight:800;color:#ffffff;line-height:1">${diaNum}</td></tr>
            <tr><td style="padding:0 0 8px;text-align:center;font-size:10px;color:rgba(255,255,255,0.8);letter-spacing:1px">${anoNum}</td></tr>
          </table>
        </td>
        <!-- Texto -->
        <td valign="middle">
          <div style="font-size:11px;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:6px">${saudacao}, ${this.escape(nomeDestinatario.split(' ')[0] || nomeDestinatario)}</div>
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1.15">Sua agenda do dia</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.9);margin-top:6px;text-transform:capitalize">${diaSemana}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- CONTADOR -->
  <tr><td style="padding:18px 28px 0">
    <div class="total-text" style="font-size:13px;color:#475569">
      Você tem <strong style="color:#0ea5e9">${totalEventos}</strong> ${totalEventos === 1 ? 'compromisso' : 'compromissos'} hoje
      ${corporativos.length > 0 && pessoais.length > 0
        ? `<span style="color:#94a3b8"> · ${corporativos.length} corporativo${corporativos.length > 1 ? 's' : ''}, ${pessoais.length} pessoa${pessoais.length > 1 ? 'is' : 'l'}</span>`
        : ''}
    </div>
  </td></tr>

  <!-- LISTAS -->
  <tr><td style="padding:0 28px 24px">
    ${secao('Compromissos corporativos', '💼', corporativos)}
    ${secao('Compromissos pessoais', '🌟', pessoais)}
  </td></tr>

  <!-- FOOTER -->
  <tr><td class="brand-bar" style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
    <p class="footer-text" style="margin:0;font-size:11px;color:#64748b;line-height:1.5">
      E-mail automático da <strong>Agenda Corporativa</strong>. Configure horários e destinatários nas configurações da agenda.
    </p>
    <p class="footer-text" style="margin:8px 0 0;font-size:10px;color:#94a3b8">
      OneClick · Agenda Corporativa
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
  }

  private escapeAttr(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
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

  private escape(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
}
