import { Injectable, Inject, OnModuleInit } from '@nestjs/common'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { prisma } from '@saas/db'
import type { AgendaDisparoConfig } from '@saas/db'
import { EmailService } from '../common/email.service'
import { AgendaEmailTemplateService } from './agenda-email-template.service'
import { GrupoObrigacaoService } from '../grupo-obrigacao/grupo-obrigacao.service'

// Pseudo-tipo (não é AgendaTipo real): id sentinela que, quando atribuído a um
// grupo do e-mail, faz os vencimentos de obrigações acessórias do dia entrarem
// naquele grupo. Ver agenda/configuracoes (pill "Obrigação acessória").
const TIPO_OBRIGACAO_ACESSORIA = 'OBRIGACAO_ACESSORIA'

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
    @Inject(AgendaEmailTemplateService) private readonly templateService: AgendaEmailTemplateService,
    @Inject(GrupoObrigacaoService) private readonly grupoObrigacaoService: GrupoObrigacaoService,
  ) {}

  // Cache dos vencimentos do dia (mesmo dia → mesma lista pra todos os
  // destinatários). Evita recomputar a recorrência por usuário no disparo.
  private vencCache: { dia: string; itens: Array<{ clienteNome: string; obrigacaoNome: string; categoria: string | null }> } | null = null

  private async vencimentosDoDia(dataYyyyMmDd: string) {
    if (this.vencCache?.dia === dataYyyyMmDd) return this.vencCache.itens
    const itens = await this.grupoObrigacaoService.getVencimentosDoDia(new Date(dataYyyyMmDd)).catch(() => [])
    this.vencCache = { dia: dataYyyyMmDd, itens }
    return itens
  }

  private diaSemanaExt(d: Date): string {
    return ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][d.getUTCDay()]
  }

  onModuleInit() {
    // SÓ dispara em produção (a VPS). Em dev/local o SMTP é o mesmo de produção,
    // então uma API local rodando mandaria a "Agenda do dia" REAL pra todos os
    // destinatários. Gateado por NODE_ENV (prod seta NODE_ENV=production no Docker).
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[AgendaDisparo] Scheduler DESATIVADO fora de produção (NODE_ENV=${process.env.NODE_ENV ?? 'undefined'}) — só a VPS envia a agenda do dia.`)
      return
    }
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
   *
   * Catch-up: se o container for reiniciado depois do horário do dia (ex.: deploy
   * às 10h e o horário configurado é 8h), no primeiro tick após o restart a
   * lógica "horário já passou hoje E ainda não disparou hoje" dispara igualmente,
   * pra não pular o dia inteiro.
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
    const dataHojeBrKey = this.formatDateKey(agoraBr)

    if (!cfg.diasSemana.includes(diaSemanaBr)) return

    // Já disparou hoje (comparando data BR, não UTC)? Não dispara de novo.
    if (cfg.ultimoDisparoEm) {
      const ultDispBr = this.toBrasilia(new Date(cfg.ultimoDisparoEm))
      if (this.formatDateKey(ultDispBr) === dataHojeBrKey) return
    }

    // Dispara se o relógio bate exatamente o horário OU se já passou
    // (string HH:MM permite comparação lexicográfica): catch-up depois de
    // restart.
    if (horaAtualBr < cfg.horario) return

    // Reivindicação ATÔMICA do disparo do dia: o updateMany só afeta a linha se
    // `ultimoDisparoEm` ainda for o valor lido (ou null). Se outra instância já
    // reivindicou (corrida), count=0 e esta instância NÃO envia. Evita duplicar
    // mesmo com múltiplas instâncias.
    const claim = await prisma.agendaDisparoConfig.updateMany({
      where: { id: cfg.id, ultimoDisparoEm: cfg.ultimoDisparoEm },
      data: { ultimoDisparoEm: agoraUtc },
    })
    if (claim.count === 0) return
    console.log(`[AgendaDisparo] Disparando agenda do dia ${dataHojeBrKey} (BR ${horaAtualBr}, configurado ${cfg.horario}) pra ${destinatarios.length} destinatário(s)`)
    await this.enviarAgendaDiaParaTodos(dataHojeBrKey, destinatarios, 'auto', null)
  }

  /**
   * Resolve lista final de destinatários: se `enviarParaTodos=true`, retorna
   * todos usuários ativos do tenant; senão usa a lista manual em `destinatariosIds`.
   */
  private async resolverDestinatarios(cfg: AgendaDisparoConfig): Promise<string[]> {
    if (cfg.enviarParaTodos) {
      // Isolamento multi-tenant: só colaboradores da empresa dona da config.
      // Sem empresa (config legada não migrada) → default-deny.
      const todos = await prisma.user.findMany({
        where: { isActive: true, email: { not: '' }, empresaId: cfg.empresaId ?? null },
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
    return this.toBrasilia(new Date())
  }

  /** Saudação conforme a hora de Brasília (pro hero do modelo configurável). */
  private saudacaoAgora(): string {
    const h = this.getNowBrasilia().getHours()
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  }

  /**
   * Converte um Date UTC pra um Date "virtual" cujos getHours/getDay/etc.
   * retornam o equivalente em BR. Usa Intl.formatToParts pra evitar
   * ambiguidade de formato (toLocaleString('en-US') usa 12h AM/PM e a
   * reparseagem é frágil).
   */
  private toBrasilia(date: Date): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(date)
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
    // Reconstrói como string ISO com 'Z' final — o Date interpreta como UTC,
    // então getHours/getDay no container UTC retornam exatamente os números BR.
    let hour = get('hour')
    if (hour === '24') hour = '00' // edge case Intl em meia-noite
    return new Date(`${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}Z`)
  }

  // ============================================================
  // Envio
  // ============================================================

  /**
   * Dispara o email pra cada destinatário e GRAVA um log do disparo (audit).
   * @param modo  'auto' (scheduler), 'teste' (botão UI) ou 'reenvio' (botão histórico)
   * @param triggeredBy userId do operador (null pro automático)
   */
  async enviarAgendaDiaParaTodos(
    data: string,
    destinatariosIds: string[],
    modo: 'auto' | 'teste' | 'reenvio' = 'auto',
    triggeredBy: string | null = null,
  ): Promise<{ enviados: number; falhas: number; logId: string }> {
    let enviados = 0, falhas = 0
    const sucesso: string[] = []
    const erros: Array<{ userId: string; email?: string; motivo: string }> = []
    for (const userId of destinatariosIds) {
      try {
        await this.enviarAgendaDia(userId, data)
        enviados++
        sucesso.push(userId)
      } catch (e) {
        console.error(`[AgendaDisparo] Falha ao enviar pra ${userId}:`, (e as Error).message)
        falhas++
        erros.push({ userId, motivo: (e as Error).message })
      }
    }
    // Grava o log do disparo. dataReferencia é DATE — passa string yyyy-MM-dd
    // direto, sem timezone, pra evitar drift.
    const log = await prisma.agendaDisparoLog.create({
      data: {
        dataReferencia: new Date(data + 'T00:00:00.000Z'),
        modo,
        enviados,
        falhas,
        destinatarios: sucesso,
        erros: erros.length > 0 ? (erros as object) : undefined,
        triggeredBy,
      },
    })
    return { enviados, falhas, logId: log.id }
  }

  // ============================================================
  // Histórico + reenvio
  // ============================================================

  async listLogs(limit = 30): Promise<Array<{
    id: string; disparadoEm: Date; dataReferencia: Date; modo: string
    enviados: number; falhas: number; destinatarios: string[]
    erros: unknown; triggeredBy: string | null
    triggeredByUser: { id: string; name: string | null } | null
  }>> {
    const logs = await prisma.agendaDisparoLog.findMany({
      orderBy: { disparadoEm: 'desc' },
      take: limit,
    })
    if (logs.length === 0) return []
    const userIds = Array.from(new Set(logs.map(l => l.triggeredBy).filter((id): id is string => !!id)))
    const users = userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : []
    const userMap = new Map(users.map(u => [u.id, u]))
    return logs.map(l => ({
      ...l,
      triggeredByUser: l.triggeredBy ? (userMap.get(l.triggeredBy) ?? null) : null,
    }))
  }

  /**
   * Reenvia o disparo de um log antigo. Usa a `dataReferencia` original
   * (não a data atual) e os destinatários ATUAIS conforme a config — assim
   * pega novos usuários que entraram depois do disparo original.
   */
  async reenviar(logId: string, triggeredBy: string): Promise<{ enviados: number; falhas: number; logId: string }> {
    const log = await prisma.agendaDisparoLog.findUniqueOrThrow({ where: { id: logId } })
    const cfg = await this.get()
    const destinatarios = await this.resolverDestinatarios(cfg)
    if (destinatarios.length === 0) throw new Error('Nenhum destinatário configurado')
    const dataRef = log.dataReferencia.toISOString().slice(0, 10)
    return this.enviarAgendaDiaParaTodos(dataRef, destinatarios, 'reenvio', triggeredBy)
  }

  /** Envia a "Agenda do Dia" pra UM destinatário (com filtro de privacidade aplicado). */
  async enviarAgendaDia(destinatarioId: string, dataYyyyMmDd: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: destinatarioId },
      select: { id: true, name: true, email: true, empresaId: true, isMaster: true },
    })
    if (!user?.email) throw new Error(`Destinatário ${destinatarioId} sem email`)

    // Convenção do módulo: AgendaEvento.data é gravado como meia-noite UTC do
    // dia-calendário (create usa new Date('YYYY-MM-DD')) — este parse casa 1:1. [QA #5]
    const eventDate = new Date(dataYyyyMmDd)

    // Busca eventos do dia DA EMPRESA do destinatário (isolamento multi-tenant —
    // mesma regra do listEventos: não-master só vê a própria empresa; master vê tudo).
    // Filtro de privacidade (particular) aplicado depois. [QA #1]
    const eventos = await prisma.agendaEvento.findMany({
      where: {
        isActive: true,
        data: eventDate,
        ...(!user.isMaster && user.empresaId ? { empresaId: user.empresaId } : {}),
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
    const visiveisEventos = eventos.filter(ev => !ev.particular || ev.criadorId === destinatarioId)

    const dataDisplay = this.formatDataBr(eventDate)
    const diaSemana = this.diaSemanaExt(eventDate)

    // Modelo configurável (PARALELO): só usa quando `ativo`; senão mantém o HTML atual (fallback).
    // [QA #7] Template da EMPRESA do destinatário, com fallback pro global (NULL).
    const tpl = await this.templateService.getTemplate(user.empresaId ?? null).catch(() => null)

    // Vencimentos de obrigação acessória do dia → pseudo-eventos, SÓ quando o
    // template está ativo E algum grupo tem o badge OBRIGACAO_ACESSORIA. Eles
    // caem nesse grupo no render (mesmo mecanismo de tiposIds dos tipos reais).
    const grupoVenc = tpl?.template.ativo
      ? tpl.grupos.find(g => (g.tiposIds || []).includes(TIPO_OBRIGACAO_ACESSORIA))
      : undefined
    const pseudoVenc = grupoVenc
      ? (await this.vencimentosDoDia(dataYyyyMmDd)).map((vc, i) => ({
          id: `venc-${i}`,
          titulo: `${vc.obrigacaoNome} — ${vc.clienteNome}`,
          tipoId: TIPO_OBRIGACAO_ACESSORIA,
          tipo: { id: TIPO_OBRIGACAO_ACESSORIA, nome: vc.categoria || 'Obrigação acessória', cor: grupoVenc.cor },
          diaInteiro: true, horaInicio: null, horaFim: null,
          particular: false, criadorId: null, criador: null,
          participantes: [], salaRef: null, sala: null, presenca: 'PRESENCIAL',
          link: null, contato: null, descricao: null,
        }))
      : []

    const visiveis = [...visiveisEventos, ...pseudoVenc]
    if (visiveis.length === 0) {
      console.log(`[AgendaDisparo] ${user.email} — nada visível em ${dataYyyyMmDd}, pulando`)
      return
    }

    let html: string
    let subject = `Agenda do dia · ${dataDisplay}`
    // Só anexa a logo embutida (cid:logo) quando o HTML realmente a usa — ou seja,
    // no modelo configurável SEM logo enviada, ou no template legado. Com logo
    // própria (logoUrl), o render usa a URL e o anexo não deve ir (vira "1 anexo").
    let usaCidLogo = false
    if (tpl?.template.ativo) {
      html = this.templateService.render(tpl.template, tpl.grupos, visiveis, { usuarioNome: user.name, dataDisplay, diaSemana, temLogo: !!LOGO_BUFFER, saudacao: this.saudacaoAgora() })
      usaCidLogo = !tpl.template.logoUrl && !!LOGO_BUFFER
      const s = this.templateService.renderAssunto(tpl.template, { dataDisplay, diaSemana })
      if (s) subject = s
    } else {
      const isPessoal = (ev: typeof visiveisEventos[number]) =>
        ev.particular || ev.tipo.nome.toLowerCase().includes('pessoal')
      const corporativos = visiveisEventos.filter(ev => !isPessoal(ev))
      const pessoais = visiveisEventos.filter(ev => isPessoal(ev))
      html = this.gerarHtmlEmail(dataYyyyMmDd, corporativos, pessoais, user.name, !!LOGO_BUFFER)
      usaCidLogo = !!LOGO_BUFFER
    }

    await this.emailService.sendMail({
      to: user.email,
      subject,
      html,
      attachments: usaCidLogo ? [{ filename: 'logo.png', content: LOGO_BUFFER!, cid: 'logo' }] : undefined,
    })
  }

  // ============================================================
  // Modelo de e-mail configurável — delegação + preview/teste
  // ============================================================
  getEmailTemplate() { return this.templateService.getTemplate(null) }
  saveEmailTemplate(patch: Record<string, unknown>) { return this.templateService.saveTemplate(null, patch) }
  cardHtmlPadrao() { return { html: this.templateService.defaultCardHtml() } }
  cabecalhoPadrao() { return { html: this.templateService.defaultHeaderHtml() } }

  /** Config de agrupamento (grupos por tipo + catch-all) — leve, pra UI agrupar o
   *  resumo do dia igual ao e-mail. Sem dados sensíveis. */
  async getAgrupamento() {
    const { template, grupos } = await this.templateService.getTemplate(null)
    return {
      grupos: grupos.map(g => ({ nome: g.nome, cor: g.cor, icone: g.icone || '📅', ordem: g.ordem, tiposIds: g.tiposIds || [] })),
      nomeGrupoOutros: template.nomeGrupoOutros || 'Outros',
      mostrarOutros: template.mostrarOutros !== false,
    }
  }
  saveEmailGrupos(grupos: Array<{ nome: string; cor: string; icone?: string; incluiParticulares: boolean; tiposIds: string[] }>) {
    return this.templateService.saveGrupos(null, grupos.map((g, i) => ({ icone: '', ...g, ordem: i })))
  }

  /** Renderiza o modelo configurável com os eventos do dia (ou exemplo) — pro preview no painel.
   *  Aceita `override` (template+grupos do editor) pra prévia AO VIVO do estado não-salvo. */
  async previewEmailModelo(
    userId: string,
    dataYyyyMmDd?: string,
    override?: { template?: Record<string, unknown>; grupos?: Array<Record<string, unknown>> },
  ): Promise<{ html: string; assunto: string }> {
    const saved = await this.templateService.getTemplate(null)
    const template = override?.template ? { ...saved.template, ...override.template } as typeof saved.template : saved.template
    const grupos = override?.grupos
      ? override.grupos.map((g, i) => ({ id: `tmp-${i}`, ordem: i, nome: '', cor: '#38bdf8', icone: '', incluiParticulares: false, tiposIds: [], ...g })) as typeof saved.grupos
      : saved.grupos
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    const dia = dataYyyyMmDd || this.formatDateKey(this.getNowBrasilia())
    const eventDate = new Date(dia)
    const eventos = await prisma.agendaEvento.findMany({
      where: { isActive: true, data: eventDate },
      include: {
        tipo: true,
        criador: { select: { id: true, name: true } },
        salaRef: { select: { nome: true } },
        participantes: { where: { isActive: true }, include: { usuario: { select: { id: true, name: true } } } },
      },
      orderBy: [{ diaInteiro: 'desc' }, { horaInicio: 'asc' }],
    })
    const visiveis = eventos.filter(ev => !ev.particular || ev.criadorId === userId)
    const dataDisplay = this.formatDataBr(eventDate)
    const diaSemana = this.diaSemanaExt(eventDate)
    const html = this.templateService.render(template, grupos, visiveis, { usuarioNome: user?.name ?? 'Você', dataDisplay, diaSemana, temLogo: false, saudacao: this.saudacaoAgora(), preview: true })
    return { html, assunto: this.templateService.renderAssunto(template, { dataDisplay, diaSemana }) }
  }

  /** Envia um teste do modelo configurável pro próprio usuário (independe do `ativo`). */
  async enviarTesteModelo(userId: string): Promise<{ ok: boolean }> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
    if (!user?.email) throw new Error('Seu usuário não tem e-mail cadastrado')
    const { template, grupos } = await this.templateService.getTemplate(null)
    const dia = this.formatDateKey(this.getNowBrasilia())
    const eventDate = new Date(dia)
    const eventos = await prisma.agendaEvento.findMany({
      where: { isActive: true, data: eventDate },
      include: {
        tipo: true,
        criador: { select: { id: true, name: true } },
        salaRef: { select: { nome: true } },
        participantes: { where: { isActive: true }, include: { usuario: { select: { id: true, name: true } } } },
      },
      orderBy: [{ diaInteiro: 'desc' }, { horaInicio: 'asc' }],
    })
    const visiveis = eventos.filter(ev => !ev.particular || ev.criadorId === userId)
    const dataDisplay = this.formatDataBr(eventDate)
    const diaSemana = this.diaSemanaExt(eventDate)
    const html = this.templateService.render(template, grupos, visiveis, { usuarioNome: user.name, dataDisplay, diaSemana, temLogo: !!LOGO_BUFFER, saudacao: this.saudacaoAgora() })
    const usaCidLogo = !template.logoUrl && !!LOGO_BUFFER
    await this.emailService.sendMail({
      to: user.email,
      subject: `[TESTE] ${this.templateService.renderAssunto(template, { dataDisplay, diaSemana })}`,
      html,
      attachments: usaCidLogo ? [{ filename: 'logo.png', content: LOGO_BUFFER!, cid: 'logo' }] : undefined,
    })
    return { ok: true }
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
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.oneclick.central-rnc.com.br').replace(/\/$/, '')
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

      // Pill da categoria — escolhe cor do texto (branco/escuro) com base no brilho
      // do background pra garantir legibilidade mesmo quando o tipo tem cor pastel.
      const textoNaPill = this.contrastarTexto(cor)
      const corEscura = this.escurecer(cor, 0.25)
      const linhaInfo: string[] = []
      linhaInfo.push(`<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;background:${cor};color:${textoNaPill};border:1px solid ${corEscura};box-shadow:0 1px 2px rgba(15,23,42,0.08)">${this.escape(ev.tipo.nome)}</span>`)
      linhaInfo.push(`<span class="ev-meta" style="font-size:11px;color:#64748b">${modalidadeIcon} ${modalidadeLabel}</span>`)
      if (local) linhaInfo.push(`<span class="ev-meta" style="font-size:11px;color:#64748b">📍 ${this.escape(local)}</span>`)

      const nomes = (ev.participantes as Array<{ usuario?: { name: string } | null; nomeAvulso?: string | null }>)
        .map(p => p.usuario?.name ?? p.nomeAvulso)
        .filter(Boolean)
      // Participantes: cada nome vira pill discreta pra não virar parede de texto
      // grudada com "por <criador>" embaixo.
      const participantesHtml = nomes.length > 0
        ? `<div class="ev-section" style="margin-top:12px;padding-top:10px;border-top:1px dashed #e2e8f0">
             <div class="ev-label" style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">👥 Participantes</div>
             <div style="line-height:1.9">${nomes.map(n => `<span class="ev-chip" style="display:inline-block;padding:2px 9px;margin:0 4px 4px 0;border-radius:999px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:500;border:1px solid #e2e8f0">${this.escape(n!)}</span>`).join('')}</div>
           </div>`
        : ''

      const linkHtml = ev.link
        ? `<div class="ev-section" style="margin-top:10px;font-size:11px;color:#64748b">
             <strong style="color:#475569" class="ev-label">🔗 Link:</strong>
             <a href="${this.escapeAttr(ev.link)}" style="color:#0ea5e9;text-decoration:none;word-break:break-all">${this.escape(ev.link)}</a>
           </div>`
        : ''

      const prepItens: string[] = []
      if (ev.arrumarSala) prepItens.push('Arrumar sala')
      if (ev.equipamentos) prepItens.push('Disponibilizar equipamentos')
      const prepHtml = prepItens.length > 0
        ? `<div class="ev-section" style="margin-top:8px;font-size:11px;color:#64748b">
             <strong style="color:#475569" class="ev-label">📋 Preparação:</strong> ${prepItens.join(' · ')}
           </div>`
        : ''

      // Linha do criador separada visualmente — fica isolada no rodapé do card
      const criadorHtml = ev.criador?.name
        ? `<div class="ev-creator" style="margin-top:12px;padding-top:8px;border-top:1px solid #f1f5f9;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Agendado por ${this.escape(ev.criador.name)}</div>`
        : ''

      // Wrapper externo com bgcolor cinza + 1px padding cria efeito visual de
      // "borda" que sobrevive a qualquer sanitizacao de CSS (Gmail, Outlook).
      // Faixa lateral colorida vem como td separada de 4px largura.
      return `
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px">
  <tr><td bgcolor="#cbd5e1" class="ev-border" style="background-color:#cbd5e1;padding:1px;border-radius:10px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" class="ev-card" style="background:#ffffff;border-radius:9px;overflow:hidden">
      <tr>
        <td width="4" bgcolor="${cor}" style="background-color:${cor};width:4px;padding:0;line-height:0;font-size:0">&nbsp;</td>
        <td width="68" valign="middle" class="ev-time-cell" style="padding:14px 10px 14px 14px;text-align:center;border-right:1px solid #f1f5f9;vertical-align:middle;background:#f8fafc">
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
    </table>
  </td></tr>
</table>`
    }

    const secao = (titulo: string, icon: string, eventos: typeof corporativos) => eventos.length > 0
      ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 12px">
           <tr>
             <td valign="middle" style="padding-right:10px;font-size:16px;line-height:1">${icon}</td>
             <td valign="middle" class="section-title" style="padding-right:10px;font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.8px;line-height:1">${titulo}</td>
             <td valign="middle"><span class="count-badge" style="display:inline-block;background:#e2e8f0;color:#475569;font-size:10px;padding:2px 9px;border-radius:999px;font-weight:700;line-height:1.4">${eventos.length}</span></td>
           </tr>
         </table>
         ${eventos.map(renderCard).join('')}`
      : ''

    const brandBlock = temLogo
      ? `<img src="cid:logo" alt="OneClick" width="130" style="display:block;margin:0 auto;height:auto;max-width:160px;border:0;outline:none;text-decoration:none"/>`
      : `<div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;text-align:center" class="brand-text">OneClick</div>`

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
    .ev-border { background-color: #334155 !important; }
    .ev-card { background: #1e293b !important; }
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
    .ev-chip { background: rgba(255,255,255,0.06) !important; color: #cbd5e1 !important; border-color: rgba(255,255,255,0.08) !important; }
    .ev-creator { border-color: rgba(255,255,255,0.06) !important; color: #64748b !important; }
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

  <!-- BRAND BAR — logo centralizada -->
  <tr><td class="brand-bar" align="center" style="padding:20px 28px;background:#ffffff;border-bottom:1px solid #e2e8f0;text-align:center">
    ${brandBlock}
  </td></tr>

  <!-- HERO com marca d'agua SVG (URL publica). Fallback: gradient sozinho
       na primeira declaracao sobrevive caso o cliente sanitize background-image. -->
  <tr><td style="padding:28px 28px 24px;color:#ffffff;background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%);background-image:url(${appUrl}/email-bg-agenda.svg),linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%);background-repeat:repeat,no-repeat;background-size:260px 260px,100% 100%">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <!-- Tile de data — fundo branco sólido pra contraste forte sobre o azul -->
        <td width="78" valign="top" style="padding-right:18px">
          <table cellpadding="0" cellspacing="0" border="0" width="78" style="background:#ffffff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.18);overflow:hidden">
            <tr><td style="padding:5px 0;text-align:center;font-size:11px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:2px;background:#0f172a">${mesAbrev}</td></tr>
            <tr><td style="padding:8px 0 2px;text-align:center;font-size:34px;font-weight:800;color:#0f172a;line-height:1">${diaNum}</td></tr>
            <tr><td style="padding:0 0 8px;text-align:center;font-size:10px;color:#64748b;letter-spacing:1px;font-weight:600">${anoNum}</td></tr>
          </table>
        </td>
        <!-- Texto -->
        <td valign="middle">
          <div style="font-size:11px;color:rgba(255,255,255,0.95);text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:6px">${saudacao}, ${this.escape(nomeDestinatario.split(' ')[0] || nomeDestinatario)}</div>
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1.15">Sua agenda do dia</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.9);margin-top:6px;text-transform:capitalize">${diaSemana}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- CONTADOR -->
  <tr><td style="padding:18px 28px 0">
    <div class="total-text" style="font-size:13px;color:#475569">
      Há <strong style="color:#0ea5e9">${totalEventos}</strong> ${totalEventos === 1 ? 'compromisso' : 'compromissos'} hoje
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

  /** Retorna `#0f172a` (escuro) ou `#ffffff` (branco) conforme o brilho do fundo,
   *  pra a pill da categoria ficar legível mesmo quando o tipo tem cor pastel. */
  private contrastarTexto(hex: string): string {
    const rgb = this.hexToRgb(hex)
    if (!rgb) return '#ffffff'
    // Luminância percebida (Rec. 601)
    const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
    return lum > 0.62 ? '#0f172a' : '#ffffff'
  }

  /** Versão escurecida da cor (multiplica componentes por 1 - amount). Usada
   *  como borda da pill pra dar definição contra fundos claros. */
  private escurecer(hex: string, amount: number): string {
    const rgb = this.hexToRgb(hex)
    if (!rgb) return hex
    const f = Math.max(0, 1 - amount)
    const r = Math.round(rgb.r * f)
    const g = Math.round(rgb.g * f)
    const b = Math.round(rgb.b * f)
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const h = hex.replace('#', '')
    const expanded = h.length === 3 ? h.split('').map(c => c + c).join('') : h
    if (expanded.length !== 6) return null
    const n = parseInt(expanded, 16)
    if (Number.isNaN(n)) return null
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
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
