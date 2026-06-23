import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { CreateOrcamentoInput, UpdateOrcamentoInput, ListOrcamentoInput, CreateOrcamentoItemInput, UpdateOrcamentoItemInput } from '@saas/types'
import { ORCAMENTO_ALLOWED_TRANSITIONS, ORCAMENTO_STATUS_LABELS, ORCAMENTO_STATUS_ORDER, isOrcamentoTransitionAllowed } from '@saas/types'
import { EmailService } from '../common/email.service'
import { PesquisaService } from '../pesquisa/pesquisa.service'
import { ServicoService } from '../servico/servico.service'
import { ProcessoService } from '../processo/processo.service'
import { NotificationService } from '../notification/notification.service'
import { OrcamentoEventsService } from './orcamento-events.service'

// Re-export para compat com chamadas internas (regras vivem em @saas/types).
// Tipagem `Record<string, string>` para suportar lookup com `string` nas funções.
const STATUS_ORDER = ORCAMENTO_STATUS_ORDER
const STATUS_LABELS: Record<string, string> = ORCAMENTO_STATUS_LABELS
const isAllowedTransition = isOrcamentoTransitionAllowed
// referenciado em comentários e debug; usado indireto via isOrcamentoTransitionAllowed
void ORCAMENTO_ALLOWED_TRANSITIONS

// Mapeia status → campo de data dedicada. Usado para:
//   1) gravar dt<X> = agora na PRIMEIRA vez que o status acontece
//   2) checar se a transição é "primeira vez" (idempotência de side-effects)
//   3) limpar datas no Reabrir (status posteriores ao alvo são zerados)
const STATUS_DATE_FIELD: Record<string, string> = {
  ENVIADO: 'dtEnviado',
  APROVADO: 'dtAprovado',
  LIBERADO: 'dtLiberado',
  FINALIZADO: 'dtFinalizado',
  ENCERRADO: 'dtEncerrado',
}

@Injectable()
export class OrcamentoService {
  constructor(
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => PesquisaService))
    private readonly pesquisaService: PesquisaService,
    @Inject(forwardRef(() => ServicoService))
    private readonly servicoService: ServicoService,
    private readonly processoService: ProcessoService,
    private readonly notificationService: NotificationService,
    private readonly events: OrcamentoEventsService,
  ) {}

  /** Helper interno — emite evento SSE pra todos os clientes conectados. */
  private emitEvent(
    type: 'kanban' | 'dados-gerais' | 'itens' | 'evento',
    ctx: { orcamentoId: string; empresaId?: string | null; actorUserId?: string | null },
  ) {
    this.events.emit({
      type,
      orcamentoId: ctx.orcamentoId,
      empresaId: ctx.empresaId ?? null,
      actorUserId: ctx.actorUserId ?? null,
    })
  }

  // ── CRUD ──────────────────────────────────────────────────

  async list(input: ListOrcamentoInput, isMaster: boolean, empresaId?: string, userId?: string) {
    const where: any = { arquivado: input.arquivado ?? false }
    if (!isMaster && empresaId) where.empresaId = empresaId
    if (input.status) where.status = input.status
    if (input.clienteId) where.clienteId = input.clienteId
    // Filtro de auditoria: somente orcamentos que ja foram reabertos pelo menos uma vez
    if (input.comReaberturas) where.reaberturasCount = { gt: 0 }
    if (input.search) {
      const term = input.search.trim()
      const termLower = term.toLowerCase()
      const numStr = term.replace(/[^0-9]/g, '') // dígitos: número do orçamento / CNPJ
      // Busca abrangente — cobre tudo o que aparece no card do orçamento:
      // número, cliente, responsável/solicitante, itens (serviços), status,
      // contatos, e-mails, observações e texto interno.
      const or: any[] = [
        { id: { contains: term } },
        { observacoes: { contains: term, mode: 'insensitive' } },
        { textoInterno: { contains: term, mode: 'insensitive' } },
        { contatos: { contains: term, mode: 'insensitive' } },
        { emailsContatos: { contains: term, mode: 'insensitive' } },
        // Descrição dos itens (serviços/taxas/despesas listados no card)
        { itens: { some: { descricao: { contains: term, mode: 'insensitive' } } } },
      ]
      // Número do orçamento (campo Int): aceita "42", "#0042", etc.
      if (numStr) {
        const n = parseInt(numStr, 10)
        if (!Number.isNaN(n) && n > 0) or.push({ numero: n })
      }
      // Status (badge do card): casa pelo rótulo em PT ("aprovado", "enviado"...)
      if (termLower.length >= 3) {
        const STATUS_LABELS: Record<string, string> = {
          NOVO: 'novo', A_ENVIAR: 'a enviar', ENVIADO: 'enviado', APROVADO: 'aprovado',
          REPROVADO: 'reprovado', LIBERADO: 'liberado', FINALIZADO: 'finalizado',
          ENCERRADO: 'encerrado', EM_REVISAO: 'em revisão', PARALISADO: 'paralisado',
        }
        const statusMatch = Object.entries(STATUS_LABELS)
          .filter(([, l]) => l.includes(termLower))
          .map(([v]) => v)
        if (statusMatch.length > 0) or.push({ status: { in: statusMatch } })
      }
      // Cliente (nome / fantasia / CNPJ) — pré-busca os IDs (escopo da empresa)
      const clienteOr: any[] = [
        { razaoSocial: { contains: term, mode: 'insensitive' } },
        { nomeFantasia: { contains: term, mode: 'insensitive' } },
      ]
      if (numStr) clienteOr.push({ documento: { contains: numStr } })
      // Responsável / solicitante (nome) — pré-busca usuários por nome
      const [clientes, usuarios] = await Promise.all([
        prisma.cliente.findMany({
          where: { ...(!isMaster && empresaId ? { empresaId } : {}), OR: clienteOr },
          select: { id: true },
          take: 300,
        }).catch(() => [] as { id: string }[]),
        prisma.user.findMany({
          where: { name: { contains: term, mode: 'insensitive' } },
          select: { id: true },
          take: 300,
        }).catch(() => [] as { id: string }[]),
      ])
      if (clientes.length > 0) or.push({ clienteId: { in: clientes.map(c => c.id) } })
      if (usuarios.length > 0) {
        const ids = usuarios.map(u => u.id)
        or.push({ responsavelId: { in: ids } }, { solicitanteId: { in: ids } })
      }
      where.OR = or
    }

    // Escopo de listagem — espelha legado modal-prm-orcamentos.asp acesso (1-4)
    // Master/EmpresaMaster ignoram escopo (vêem tudo)
    if (!isMaster && input.scope && input.scope !== 'todos' && userId) {
      if (input.scope === 'proprios') {
        where.AND = [...(where.AND ?? []), { OR: [{ solicitanteId: userId }, { responsavelId: userId }] }]
      } else if (input.scope === 'financeiro') {
        // Orcamentos aprovados aguardando liberacao do financeiro
        where.status = 'APROVADO'
      } else if (input.scope === 'area') {
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { areaId: true },
        }).catch(() => null)
        const areaId = u?.areaId ?? null
        if (areaId) {
          const area = await prisma.area.findUnique({ where: { id: areaId }, select: { name: true } }).catch(() => null)
          if (area?.name) where.area = area.name
        }
      }
    }

    const limit = input.limit || 20
    const page = input.page || 1
    const [data, total] = await Promise.all([
      prisma.orcamento.findMany({
        where,
        include: {
          _count: { select: { itens: true, mensagens: true, arquivos: true } },
          // Preview dos 2 primeiros itens para exibicao nos cards do kanban
          itens: { take: 2, select: { id: true, descricao: true, tipo: true }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: input.sortKey
          ? [{ [input.sortKey]: input.sortDir ?? 'asc' } as any, { createdAt: 'desc' }]
          : [{ ordem: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.orcamento.count({ where }),
    ])

    // Enriquecer com dados de usuarios (responsavel, solicitante)
    const userIds = [...new Set([
      ...data.map(o => o.responsavelId),
      ...data.map(o => o.solicitanteId),
    ].filter(Boolean))] as string[]
    const users = userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } }).catch(() => [])
      : []
    const userMap = new Map(users.map(u => [u.id, u]))

    // Indicador de pesquisa respondida (kanban) — quais orçamentos têm envio respondido.
    const orcIds = data.map(o => o.id)
    const respondidas = orcIds.length
      ? await prisma.$queryRawUnsafe<{ orcamentoId: string }[]>(
          `SELECT DISTINCT orcamento_id AS "orcamentoId" FROM pesquisa_envio WHERE respondida_em IS NOT NULL AND orcamento_id IN (${orcIds.map((_, i) => `$${i + 1}`).join(',')})`,
          ...orcIds,
        ).catch(() => [] as { orcamentoId: string }[])
      : []
    const respSet = new Set(respondidas.map(r => r.orcamentoId))

    const enriched = data.map(o => ({
      ...o,
      responsavel: o.responsavelId ? userMap.get(o.responsavelId) || null : null,
      solicitante: o.solicitanteId ? userMap.get(o.solicitanteId) || null : null,
      pesquisaRespondida: respSet.has(o.id),
    }))

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getById(id: string, ctx?: { userId?: string; isMaster?: boolean; isFinanceiro?: boolean }) {
    const orc = await prisma.orcamento.findUnique({
      where: { id },
      include: {
        itens: { orderBy: { createdAt: 'asc' } },
        mensagens: { orderBy: { createdAt: 'desc' } },
        arquivos: { orderBy: { createdAt: 'desc' } },
        eventos: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!orc) return null

    const cliente = orc.clienteId
      ? await prisma.cliente.findUnique({
          where: { id: orc.clienteId },
          select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true, tipoDocumento: true, email: true, telefone: true },
        }).catch(() => null)
      : null

    const empresa = orc.empresaId
      ? await prisma.empresa.findUnique({
          where: { id: orc.empresaId },
          select: { id: true, razaoSocial: true, nomeFantasia: true, logoUrl: true, cnpj: true, telefone: true, email: true, site: true },
        }).catch(() => null)
      : null

    // Enriquecer solicitante, responsavel, autores das mensagens e atores dos
    // eventos (nome + avatar) — a timeline precisa de "quem movimentou".
    const userIds = [
      orc.solicitanteId,
      orc.responsavelId,
      ...orc.mensagens.map(m => m.userId),
      ...orc.eventos.map(e => e.userId),
    ].filter(Boolean) as string[]
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...new Set(userIds)] } },
          select: { id: true, name: true, email: true, image: true },
        }).catch(() => [])
      : []
    const userMap = new Map(users.map(u => [u.id, u]))
    const solicitante = orc.solicitanteId ? userMap.get(orc.solicitanteId) || null : null
    const responsavel = orc.responsavelId ? userMap.get(orc.responsavelId) || null : null

    // Filtrar mensagens conforme visibilidade + anexar usuario (autor)
    const mensagensFiltradas = this.filtrarMensagensVisiveis(orc.mensagens, ctx?.userId, ctx?.isFinanceiro, ctx?.isMaster)
    const mensagens = mensagensFiltradas.map(m => ({
      ...m,
      usuario: m.userId ? userMap.get(m.userId) || null : null,
    }))

    // Eventos da timeline com o ator (quem moveu) anexado
    const eventos = orc.eventos.map(e => ({
      ...e,
      usuario: e.userId ? userMap.get(e.userId) || null : null,
    }))

    return { ...orc, mensagens, eventos, cliente, empresa, solicitante, responsavel }
  }

  async getByToken(token: string) {
    const orc = await prisma.orcamento.findUnique({
      where: { token },
      include: { itens: { orderBy: { createdAt: 'asc' } } },
    })
    if (!orc) return null

    // Enriquecer com cliente
    const cliente = orc.clienteId
      ? await prisma.cliente.findUnique({
          where: { id: orc.clienteId },
          select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true, tipoDocumento: true, email: true, telefone: true },
        }).catch(() => null)
      : null

    // Enriquecer com empresa (nome, logo)
    const empresa = orc.empresaId
      ? await prisma.empresa.findUnique({
          where: { id: orc.empresaId },
          select: { id: true, razaoSocial: true, nomeFantasia: true, logoUrl: true, cnpj: true, telefone: true, email: true, site: true },
        }).catch(() => null)
      : null

    // Configuracoes da empresa (texto de apresentacao, etc.)
    const config = await this.getConfig(orc.empresaId || undefined)

    return { ...orc, cliente, empresa, config }
  }

  async create(input: CreateOrcamentoInput, userId?: string, empresaId?: string) {
    // Calcula o numero do novo orcamento respeitando o "numero_inicial" da config da empresa.
    // Logica: max(numeroInicial, ultimoNumero + 1). Se ainda nao ha orcamentos, usa numeroInicial direto.
    const config = await this.getConfig(empresaId).catch(() => null)
    const numeroInicial = Math.max(1, config?.numeroInicial ?? 1)
    const lastOrc = await prisma.orcamento.findFirst({
      where: empresaId ? { empresaId } : {},
      orderBy: { numero: 'desc' },
      select: { numero: true },
    }).catch(() => null)
    const proximoNumero = Math.max(numeroInicial, (lastOrc?.numero ?? 0) + 1)

    // "Texto para o Cliente" (textoCorpoCliente) herda o "Detalhamento para impressão"
    // (config.textoPadrao) por padrão — usuário pode editar depois nos detalhes.
    const textoCorpoClienteDefault = (input as any).textoCorpoCliente ?? config?.textoPadrao ?? null
    const orc = await prisma.orcamento.create({
      data: {
        numero: proximoNumero,
        clienteId: input.clienteId || null,
        oportunidadeId: input.oportunidadeId || null,
        responsavelId: input.responsavelId || userId || null,
        solicitanteId: input.solicitanteId || userId || null,
        tipo: input.tipo || null,
        area: input.area || null,
        validadeDias: input.validadeDias || 90,
        contatos: input.contatos || null,
        emailsContatos: input.emailsContatos || null,
        observacoes: input.observacoes || null,
        descontoPct: input.descontoPct ?? null,
        descontoValor: input.descontoValor ?? null,
        formaPagamento: input.formaPagamento || null,
        textoInterno: input.textoInterno || null,
        textoCorpoCliente: textoCorpoClienteDefault || null,
        empresaId: empresaId || null,
      },
    })
    await this.addEvento(orc.id, userId, 'created', null, null, 'Orcamento criado')
    if (input.descontoPct || input.descontoValor) {
      await this.recalcularTotais(orc.id)
    }
    this.emitEvent('kanban', { orcamentoId: orc.id, empresaId: orc.empresaId, actorUserId: userId })
    // Notifica os e-mails de "Notificar novos orçamentos para" (config emailNovo).
    // Vale p/ TODO orçamento criado de fato (form manual + balão "Solicitar"),
    // mas NÃO p/ duplicação (que usa prisma.orcamento.create direto).
    void this.notificarNovoOrcamento(orc.id, userId, empresaId)
    return orc
  }

  /**
   * Envia e-mail aos destinatários de "Notificar novos orçamentos para"
   * (config `emailNovo`) sempre que um orçamento é criado. Fire-and-forget —
   * falha de e-mail não quebra a criação.
   */
  private async notificarNovoOrcamento(orcId: string, userId?: string, empresaId?: string) {
    try {
      const config = await this.getConfig(empresaId)
      const dest = this.parseEmails(config.emailNovo)
      if (!dest.length) return
      const orc = await prisma.orcamento.findUnique({ where: { id: orcId } })
      if (!orc) return
      const [empresa, cliente, user] = await Promise.all([
        orc.empresaId ? prisma.empresa.findUnique({ where: { id: orc.empresaId }, select: { razaoSocial: true, nomeFantasia: true, logoUrl: true } }).catch(() => null) : null,
        orc.clienteId ? prisma.cliente.findUnique({ where: { id: orc.clienteId }, select: { razaoSocial: true } }).catch(() => null) : null,
        userId ? prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null) : null,
      ])
      const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || 'Empresa'
      const clienteNome = cliente?.razaoSocial || 'Cliente não informado'
      const numero = `#${String(orc.numero).padStart(4, '0')}`
      const autor = user?.name || 'um colaborador'
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const link = `${baseUrl}/orcamentos/${orcId}`
      const html = this.buildEmailLayout({
        empresaNome,
        logoUrl: empresa?.logoUrl,
        preheader: `Novo orçamento ${numero} criado por ${autor}.`,
        heroAccent: '#fb7185',
        heroTitle: 'Novo orçamento',
        heroSubtitle: `${numero} · ${clienteNome}`,
        bodyHtml: `
          <p>Um novo orçamento foi criado por <strong>${autor}</strong>.</p>
          <p><strong>Cliente:</strong> ${clienteNome}</p>
          ${orc.textoInterno ? `<div style="background:#f8fafc;border-left:3px solid #fb7185;padding:12px 16px;margin:14px 0;border-radius:4px;font-size:13px;">${orc.textoInterno}</div>` : ''}
        `,
        ctaLabel: 'Abrir orçamento',
        ctaUrl: link,
      })
      await this.emailService.sendMail({ to: [...new Set(dest)], subject: `Novo orçamento ${numero} · ${clienteNome}`, html })
      await this.addEvento(orcId, userId, 'notificacao', null, null, `Notificação de novo orçamento para ${dest.length} destinatário(s): ${dest.join(', ')}`)
    } catch (e) {
      console.warn('[Orcamento] Falha ao notificar novo orçamento:', (e as Error).message)
    }
  }

  /**
   * Solicitação de orçamento (balão "Fale com a TI") — qualquer usuário autenticado
   * pede um orçamento ao comercial sem precisar de permissão de escrita no módulo.
   * Cria um orçamento NOVO, sem responsável (o comercial assume), com o usuário
   * como solicitante. Cliente pode ser um cadastro existente OU um nome avulso
   * (prospect ainda não cadastrado) — nesse caso vai no início do detalhamento.
   */
  /**
   * Encontra um cliente pela razão social (escopo da empresa) ou cria um novo
   * como lead/prospect — mesmo comportamento do CRM (crm.service.ts create()).
   * Usado pelo balão "Solicitar orçamento" e pela edição de cliente no detalhe
   * do orçamento. Retorna o cliente, ou null se a criação falhar.
   */
  async encontrarOuCriarClientePorNome(
    nome: string,
    empresaId?: string,
  ): Promise<{ id: string; razaoSocial: string; documento: string } | null> {
    const nomeTrim = (nome || '').trim()
    if (!nomeTrim) return null
    const existente = await prisma.cliente.findFirst({
      where: { razaoSocial: { equals: nomeTrim, mode: 'insensitive' }, ...(empresaId ? { empresaId } : {}) },
      select: { id: true, razaoSocial: true, documento: true },
    }).catch(() => null)
    if (existente) return existente
    return prisma.cliente.create({
      data: {
        razaoSocial: nomeTrim,
        documento: '',
        tipoDocumento: 'CNPJ',
        isLead: true,
        situacao: 'PROSPECT',
        status: 'ATIVA',
        origem: 'Cadastro via orçamento',
        empresaId: empresaId || null,
      },
      select: { id: true, razaoSocial: true, documento: true },
    }).catch((e: Error) => { console.error('[Orcamento] Falha ao cadastrar cliente:', e.message); return null })
  }

  async solicitar(
    input: {
      clienteId?: string | null; clienteNome?: string | null; detalhamento: string; areaIds?: string[]
      anexos?: Array<{ fileName: string; fileUrl: string; fileSize?: number; mimeType?: string }>
    },
    userId?: string,
    empresaId?: string,
  ) {
    // `detalhamento` vem como HTML (RichEditor) e alimenta o "Texto Interno"
    // do orçamento (aba Textos no detalhe).
    const det = (input.detalhamento || '').trim()

    // Cliente digitado mas não selecionado → vincula a um existente (mesma razão
    // social) ou CRIA um novo como lead/prospect — mesmo comportamento do CRM.
    // Antes só guardava o nome no texto.
    let clienteId = input.clienteId || null
    let obs = det
    if (!clienteId && input.clienteNome?.trim()) {
      const c = await this.encontrarOuCriarClientePorNome(input.clienteNome, empresaId)
      if (c) clienteId = c.id
      // Se não conseguiu vincular/criar, ao menos registra o nome no texto.
      else obs = `<p><b>Cliente informado:</b> ${input.clienteNome.trim()}</p>${det}`
    }

    const orc = await this.create(
      { clienteId, textoInterno: obs, solicitanteId: userId } as any,
      userId,
      empresaId,
    )
    // Solicitação chega sem responsável — fica disponível pro comercial assumir.
    await prisma.orcamento.update({ where: { id: orc.id }, data: { responsavelId: null } }).catch(() => {})
    await this.addEvento(orc.id, userId, 'created', null, null, 'Solicitação de orçamento (balão Solicitar Novo)')
    // Anexos enviados no balão → vira OrcamentoArquivo.
    if (input.anexos?.length) {
      await prisma.orcamentoArquivo.createMany({
        data: input.anexos.map(a => ({
          orcamentoId: orc.id, fileName: a.fileName, fileUrl: a.fileUrl,
          fileSize: a.fileSize ?? null, mimeType: a.mimeType ?? null, userId: userId ?? null,
        })),
      }).catch((e: Error) => console.error('[Orcamento] Falha ao anexar arquivos na solicitação:', e.message))
    }
    // Vincula áreas selecionadas + notifica os responsáveis por detalhar.
    if (input.areaIds?.length) {
      await this.vincularAreas(orc.id, input.areaIds, userId, empresaId).catch((e: Error) => {
        console.error('[Orcamento] Falha ao vincular áreas na solicitação:', e.message)
      })
    }
    return { id: orc.id, numero: orc.numero }
  }

  /**
   * Busca leve de clientes para o seletor da solicitação de orçamento.
   * protectedProcedure (qualquer usuário logado) — retorna campos mínimos,
   * sempre no escopo da empresa do usuário (master vê todos).
   */
  async buscarClientesParaSolicitacao(search: string | undefined, isMaster: boolean, empresaId?: string) {
    // Alinha com a lista de clientes: não oferece clientes INATIVA nem
    // soft-deletados pra abrir orçamento (era o que trazia a duplicata inativa
    // que some do cadastro).
    const where: any = { deletedAt: null, status: { not: 'INATIVA' } }
    if (!isMaster && empresaId) where.empresaId = empresaId
    if (search && search.trim()) {
      const term = search.trim()
      const num = term.replace(/[^0-9]/g, '')
      where.OR = [
        { razaoSocial: { contains: term, mode: 'insensitive' } },
        { nomeFantasia: { contains: term, mode: 'insensitive' } },
        ...(num ? [{ documento: { contains: num } }] : []),
      ]
    }
    return prisma.cliente.findMany({
      where,
      select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
      take: 20,
    })
  }

  // ===================================================================
  // ORÇAMENTO MULTIÁREA — detalhamento por área (config + vínculo + prazos)
  // ===================================================================

  private async ensureOrcamentoConfig(empresaId?: string | null) {
    let cfg = await prisma.orcamentoConfig.findFirst({ where: { empresaId: empresaId ?? null } })
    if (!cfg) cfg = await prisma.orcamentoConfig.create({ data: { empresaId: empresaId ?? null, canais: { sino: true, email: true, push: false } } })
    return cfg
  }

  /** Calcula prazo a partir de `base`, em dias corridos ou úteis. */
  private calcularPrazo(base: Date, dias: number, uteis: boolean): Date {
    const d = new Date(base)
    if (!uteis) { d.setDate(d.getDate() + dias); return d }
    let restantes = Math.max(0, dias)
    while (restantes > 0) { d.setDate(d.getDate() + 1); const dow = d.getDay(); if (dow !== 0 && dow !== 6) restantes-- }
    return d
  }

  /** UserIds do comercial (área comercial: líder + membros). Vazio se não config. */
  private async resolverComercial(areaComercialId: string | null | undefined): Promise<string[]> {
    if (!areaComercialId) return []
    const [area, membros] = await Promise.all([
      prisma.area.findUnique({ where: { id: areaComercialId }, select: { leaderId: true } }),
      prisma.user.findMany({ where: { areaId: areaComercialId, isActive: true }, select: { id: true } }),
    ])
    return [...new Set([...(area?.leaderId ? [area.leaderId] : []), ...membros.map(m => m.id)])]
  }

  /** Config + áreas habilitadas (nomes resolvidos) + áreas disponíveis pra UI de config. */
  async getConfigAreas(empresaId?: string | null) {
    const cfg = await this.ensureOrcamentoConfig(empresaId)
    const habil = await prisma.orcamentoAreaHabilitada.findMany({ where: { empresaId: empresaId ?? null }, orderBy: { ordem: 'asc' } })
    const areas = await prisma.area.findMany({
      where: { isActive: true, ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}) },
      select: { id: true, name: true, leaderId: true }, orderBy: { name: 'asc' },
    })
    const leaderIds = areas.map(a => a.leaderId).filter(Boolean) as string[]
    const subIds = habil.map(h => h.substitutoId).filter(Boolean) as string[]
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set([...leaderIds, ...subIds])] } }, select: { id: true, name: true } })
    const uName = new Map(users.map(u => [u.id, u.name]))
    const areaMap = new Map(areas.map(a => [a.id, a]))
    return {
      config: {
        prazoRespostaDias: cfg.prazoRespostaDias,
        prazoEmDiasUteis: cfg.prazoEmDiasUteis,
        canais: (cfg.canais as any) ?? { sino: true, email: true, push: false },
        avisarComercialAtraso: cfg.avisarComercialAtraso,
        areaComercialId: cfg.areaComercialId,
      },
      areasDisponiveis: areas.map(a => ({ id: a.id, nome: a.name, leaderId: a.leaderId, leaderNome: a.leaderId ? uName.get(a.leaderId) ?? null : null })),
      habilitadas: habil.map(h => {
        const a = areaMap.get(h.areaId)
        return { areaId: h.areaId, nome: a?.name ?? '(área removida)', ordem: h.ordem, leaderId: a?.leaderId ?? null, leaderNome: a?.leaderId ? uName.get(a.leaderId) ?? null : null, substitutoId: h.substitutoId, substitutoNome: h.substitutoId ? uName.get(h.substitutoId) ?? null : null }
      }),
    }
  }

  /** Salva config + substitui o conjunto de áreas habilitadas. */
  async saveConfigAreas(input: {
    config: { prazoRespostaDias: number; prazoEmDiasUteis: boolean; canais: { sino: boolean; email: boolean; push: boolean }; avisarComercialAtraso: boolean; areaComercialId?: string | null }
    areas: Array<{ areaId: string; substitutoId?: string | null }>
  }, empresaId?: string | null) {
    const cfg = await this.ensureOrcamentoConfig(empresaId)
    await prisma.orcamentoConfig.update({ where: { id: cfg.id }, data: {
      prazoRespostaDias: input.config.prazoRespostaDias,
      prazoEmDiasUteis: input.config.prazoEmDiasUteis,
      canais: input.config.canais,
      avisarComercialAtraso: input.config.avisarComercialAtraso,
      areaComercialId: input.config.areaComercialId ?? null,
    } })
    await prisma.orcamentoAreaHabilitada.deleteMany({ where: { empresaId: empresaId ?? null } })
    if (input.areas.length) {
      await prisma.orcamentoAreaHabilitada.createMany({
        data: input.areas.map((a, i) => ({ empresaId: empresaId ?? null, areaId: a.areaId, substitutoId: a.substitutoId ?? null, ordem: i })),
      })
    }
    return { ok: true }
  }

  /** Áreas selecionáveis (pills) em novos orçamentos. */
  async listAreasSelecionaveis(empresaId?: string | null) {
    const habil = await prisma.orcamentoAreaHabilitada.findMany({ where: { empresaId: empresaId ?? null, ativo: true }, orderBy: { ordem: 'asc' } })
    if (!habil.length) return []
    const areas = await prisma.area.findMany({ where: { id: { in: habil.map(h => h.areaId) }, isActive: true }, select: { id: true, name: true } })
    const map = new Map(areas.map(a => [a.id, a.name]))
    return habil.filter(h => map.has(h.areaId)).map(h => ({ areaId: h.areaId, nome: map.get(h.areaId)! }))
  }

  /** Vincula áreas a um orçamento (cria OrcamentoArea + notifica líder/substituto). */
  async vincularAreas(orcamentoId: string, areaIds: string[], _userId?: string, empresaId?: string | null) {
    if (!areaIds?.length) return
    const cfg = await this.ensureOrcamentoConfig(empresaId)
    const [habil, areas, orc] = await Promise.all([
      prisma.orcamentoAreaHabilitada.findMany({ where: { areaId: { in: areaIds } } }),
      prisma.area.findMany({ where: { id: { in: areaIds } }, select: { id: true, name: true, leaderId: true } }),
      prisma.orcamento.findUnique({ where: { id: orcamentoId }, select: { numero: true } }),
    ])
    const subByArea = new Map(habil.map(h => [h.areaId, h.substitutoId]))
    const prazo = this.calcularPrazo(new Date(), cfg.prazoRespostaDias, cfg.prazoEmDiasUteis)
    for (const a of areas) {
      const exists = await prisma.orcamentoArea.findUnique({ where: { orcamentoId_areaId: { orcamentoId, areaId: a.id } } }).catch(() => null)
      if (exists) continue
      const oa = await prisma.orcamentoArea.create({ data: {
        orcamentoId, areaId: a.id, responsavelId: a.leaderId ?? null, substitutoId: subByArea.get(a.id) ?? null,
        prazoOriginal: prazo, prazo,
      } })
      await this.notificarAreaPendente(oa.id, a.id, a.name, a.leaderId ?? null, subByArea.get(a.id) ?? null, oa.prazo, orc?.numero ?? 0, cfg).catch(() => {})
    }
  }

  /** Notifica (sino + e-mail) os responsáveis por detalhar uma área. */
  private async notificarAreaPendente(oaId: string, _areaId: string, areaNome: string, leaderId: string | null, substitutoId: string | null, prazo: Date, numero: number, cfg: { canais: unknown; areaComercialId: string | null }) {
    const canais = (cfg.canais as any) ?? { sino: true, email: true }
    let destinatarios = [leaderId, substitutoId].filter(Boolean) as string[]
    if (!destinatarios.length) destinatarios = await this.resolverComercial(cfg.areaComercialId) // sem líder/substituto → comercial
    destinatarios = [...new Set(destinatarios)]
    if (!destinatarios.length) return
    const link = `/orcamentos/${(await prisma.orcamentoArea.findUnique({ where: { id: oaId }, select: { orcamentoId: true } }))?.orcamentoId ?? ''}`
    const titulo = `Detalhe a área ${areaNome} no orçamento #${numero}`
    const prazoStr = prazo.toLocaleDateString('pt-BR')
    const mensagem = `Você foi indicado para detalhar a parte de ${areaNome}. Prazo: ${prazoStr}.`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    for (const uid of destinatarios) {
      if (canais.sino !== false) await this.notificationService.criar({ userId: uid, titulo, mensagem, tipo: 'warning', link, origem: 'orcamento' }).catch(() => {})
      if (canais.email) {
        const u = await prisma.user.findUnique({ where: { id: uid }, select: { email: true, name: true } }).catch(() => null)
        if (u?.email) this.emailService.sendMail({ to: u.email, subject: titulo, html: `<p>Olá, ${u.name ?? ''}.</p><p>${mensagem}</p><p><a href="${appUrl}${link}">Abrir orçamento</a></p>` }).catch(() => {})
      }
    }
    await prisma.orcamentoArea.update({ where: { id: oaId }, data: { notificadoEm: new Date() } })
  }

  async listAreasDoOrcamento(orcamentoId: string) {
    const rows = await prisma.orcamentoArea.findMany({ where: { orcamentoId }, orderBy: { createdAt: 'asc' } })
    if (!rows.length) return []
    const areaIds = [...new Set(rows.map(r => r.areaId))]
    const userIds = [...new Set(rows.flatMap(r => [r.responsavelId, r.substitutoId, r.respondidoPor]).filter(Boolean) as string[])]
    const [areas, users] = await Promise.all([
      prisma.area.findMany({ where: { id: { in: areaIds } }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } }),
    ])
    const aMap = new Map(areas.map(a => [a.id, a.name]))
    const uMap = new Map(users.map(u => [u.id, u]))
    return rows.map(r => ({
      id: r.id, areaId: r.areaId, areaNome: aMap.get(r.areaId) ?? '(área)', status: r.status,
      prazo: r.prazo, prazoOriginal: r.prazoOriginal, prorrogado: r.prorrogado, prorrogadoEm: r.prorrogadoEm,
      justificativaProrrogacao: r.justificativaProrrogacao, detalhe: r.detalhe, valor: r.valor,
      responsavel: r.responsavelId ? uMap.get(r.responsavelId) ?? null : null,
      substituto: r.substitutoId ? uMap.get(r.substitutoId) ?? null : null,
      respondidoPor: r.respondidoPor ? uMap.get(r.respondidoPor) ?? null : null,
      respondidoEm: r.respondidoEm,
    }))
  }

  private async podeGerenciarArea(userId: string, oa: { areaId: string; responsavelId: string | null; substitutoId: string | null }): Promise<boolean> {
    if (oa.responsavelId === userId || oa.substitutoId === userId) return true
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { isMaster: true, isEmpresaMaster: true, areaId: true } })
    if (u?.isMaster || u?.isEmpresaMaster) return true
    return u?.areaId === oa.areaId // membro da área
  }

  async detalharArea(id: string, data: { detalhe: string; valor?: number | null }, userId: string) {
    const oa = await prisma.orcamentoArea.findUniqueOrThrow({ where: { id } })
    if (!(await this.podeGerenciarArea(userId, oa))) throw new Error('Você não tem permissão para detalhar esta área.')
    const updated = await prisma.orcamentoArea.update({ where: { id }, data: {
      detalhe: data.detalhe, valor: data.valor ?? null, status: 'DETALHADO', respondidoPor: userId, respondidoEm: new Date(), notificadoAtrasoEm: null,
    } })
    await this.addEvento(oa.orcamentoId, userId, 'updated', null, null, `Detalhamento da área registrado`).catch(() => {})
    return updated
  }

  async prorrogarArea(id: string, data: { dias: number; justificativa: string }, userId: string) {
    const oa = await prisma.orcamentoArea.findUniqueOrThrow({ where: { id } })
    if (!(await this.podeGerenciarArea(userId, oa))) throw new Error('Você não tem permissão para prorrogar esta área.')
    if (oa.prorrogado) throw new Error('Esta área já foi prorrogada uma vez — não é possível prorrogar de novo.')
    if (!data.justificativa?.trim()) throw new Error('Informe uma justificativa para a prorrogação.')
    const novoPrazo = this.calcularPrazo(oa.prazo > new Date() ? oa.prazo : new Date(), Math.max(1, data.dias), false)
    return prisma.orcamentoArea.update({ where: { id }, data: {
      prazo: novoPrazo, prorrogado: true, prorrogadoEm: new Date(), justificativaProrrogacao: data.justificativa.trim(),
      status: oa.status === 'ATRASADO' ? 'PENDENTE' : oa.status, notificadoAtrasoEm: null,
    } })
  }

  /** Chamado pelo scheduler: marca áreas vencidas como ATRASADO e avisa o comercial. */
  async verificarAtrasosAreas() {
    const agora = new Date()
    const vencidas = await prisma.orcamentoArea.findMany({ where: { status: 'PENDENTE', prazo: { lt: agora }, notificadoAtrasoEm: null } })
    for (const oa of vencidas) {
      await prisma.orcamentoArea.update({ where: { id: oa.id }, data: { status: 'ATRASADO', notificadoAtrasoEm: agora } })
      const orc = await prisma.orcamento.findUnique({ where: { id: oa.orcamentoId }, select: { numero: true, empresaId: true, solicitanteId: true } })
      const cfg = await this.ensureOrcamentoConfig(orc?.empresaId)
      if (!cfg.avisarComercialAtraso) continue
      let dest = await this.resolverComercial(cfg.areaComercialId)
      if (!dest.length && orc?.solicitanteId) dest = [orc.solicitanteId]
      if (!dest.length) continue
      const area = await prisma.area.findUnique({ where: { id: oa.areaId }, select: { name: true } })
      const titulo = `Área ${area?.name ?? ''} em atraso no orçamento #${orc?.numero ?? ''}`
      const link = `/orcamentos/${oa.orcamentoId}`
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
      const canais = (cfg.canais as any) ?? { sino: true, email: true }
      for (const uid of [...new Set(dest)]) {
        if (canais.sino !== false) await this.notificationService.criar({ userId: uid, titulo, mensagem: 'O prazo de detalhamento desta área venceu.', tipo: 'error', link, origem: 'orcamento' }).catch(() => {})
        if (canais.email) {
          const u = await prisma.user.findUnique({ where: { id: uid }, select: { email: true, name: true } }).catch(() => null)
          if (u?.email) this.emailService.sendMail({ to: u.email, subject: titulo, html: `<p>${titulo}.</p><p><a href="${appUrl}${link}">Abrir orçamento</a></p>` }).catch(() => {})
        }
      }
    }
    return { processados: vencidas.length }
  }

  // Status a partir dos quais o orcamento e congelado para alteracoes.
  // Para editar, usuario precisa duplicar o orcamento (status NOVO na copia).
  private static readonly STATUS_BLOQUEIA_EDICAO: ReadonlySet<string> = new Set([
    'APROVADO', 'LIBERADO', 'FINALIZADO', 'ENCERRADO',
  ])

  /**
   * Garante que o orcamento esta em um status que permite alteracoes.
   * Lanca erro se estiver em APROVADO+ (caminho: duplicar -> editar copia).
   */
  private async assertEditable(id: string): Promise<void> {
    const orc = await prisma.orcamento.findUnique({ where: { id }, select: { status: true } })
    if (!orc) throw new Error('Orçamento não encontrado')
    if (OrcamentoService.STATUS_BLOQUEIA_EDICAO.has(orc.status)) {
      throw new Error(
        `Orçamento ${ORCAMENTO_STATUS_LABELS[orc.status] || orc.status} não pode ser alterado. ` +
        `Para editar, duplique o orçamento (a cópia voltará ao status Novo).`
      )
    }
  }

  async update(id: string, input: UpdateOrcamentoInput, userId?: string) {
    await this.assertEditable(id)
    const orc = await prisma.orcamento.update({ where: { id }, data: input as any })
    await this.recalcularTotais(id)
    this.emitEvent('dados-gerais', { orcamentoId: id, empresaId: orc.empresaId, actorUserId: userId })
    return orc
  }

  /**
   * Atualiza apenas o texto interno — permitido mesmo em orcamentos congelados
   * (APROVADO+) pois e uma anotacao da equipe, nao altera valores ou escopo.
   */
  async updateTextoInterno(id: string, textoInterno: string | null, userId?: string) {
    void userId
    const orc = await prisma.orcamento.update({ where: { id }, data: { textoInterno } })
    this.emitEvent('dados-gerais', { orcamentoId: id, empresaId: orc.empresaId, actorUserId: userId })
    return orc
  }

  async delete(id: string, opts?: { cascataDoCrm?: boolean }) {
    // Proteção: orçamento vindo de um card do CRM só pode ser deletado quando
    // o próprio card for excluído (que faz a cascata via flag interna). Caso
    // contrário, o usuário receberia "órfãos" no Kanban apontando pra orçamentos
    // que não existem mais.
    if (!opts?.cascataDoCrm) {
      const orc = await prisma.orcamento.findUnique({
        where: { id },
        select: { oportunidadeId: true, numero: true },
      })
      if (orc?.oportunidadeId) {
        const oportunidadeExiste = await prisma.oportunidade.findUnique({
          where: { id: orc.oportunidadeId },
          select: { id: true },
        })
        if (oportunidadeExiste) {
          throw new Error(
            `Este orçamento #${orc.numero} foi criado por um card do CRM. ` +
            `Exclua o card no Kanban primeiro — ele removerá o orçamento em cascata.`,
          )
        }
      }
    }
    const deleted = await prisma.orcamento.delete({ where: { id } })
    this.emitEvent('kanban', { orcamentoId: id, empresaId: deleted.empresaId })
    return deleted
  }

  async duplicar(id: string, userId?: string, empresaId?: string) {
    const original = await prisma.orcamento.findUnique({ where: { id }, include: { itens: true } })
    if (!original) throw new Error('Orcamento nao encontrado')

    const novo = await prisma.orcamento.create({
      data: {
        clienteId: original.clienteId,
        oportunidadeId: original.oportunidadeId,
        responsavelId: original.responsavelId,
        solicitanteId: original.solicitanteId,
        tipo: original.tipo,
        area: original.area,
        validadeDias: original.validadeDias,
        contatos: original.contatos,
        emailsContatos: original.emailsContatos,
        observacoes: original.observacoes,
        descontoPct: original.descontoPct,
        descontoValor: original.descontoValor,
        formaPagamento: original.formaPagamento,
        textoInterno: original.textoInterno,
        textoCorpoCliente: original.textoCorpoCliente,
        empresaId: empresaId || original.empresaId,
        status: 'NOVO',
      },
    })

    if (original.itens.length > 0) {
      await prisma.orcamentoItem.createMany({
        data: original.itens.map(item => ({
          orcamentoId: novo.id,
          tipo: item.tipo,
          descricao: item.descricao,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          catalogoId: item.catalogoId,
        })),
      })
      await this.recalcularTotais(novo.id)
    }

    await this.addEvento(novo.id, userId, 'created', null, null, `Duplicado do orcamento #${original.numero}`)
    this.emitEvent('kanban', { orcamentoId: novo.id, empresaId: novo.empresaId, actorUserId: userId })
    return novo
  }

  async arquivar(id: string, userId?: string) {
    const orc = await prisma.orcamento.update({
      where: { id },
      data: { arquivado: true, arquivadoEm: new Date(), arquivadoPor: userId || null },
    })
    this.emitEvent('kanban', { orcamentoId: id, empresaId: orc.empresaId, actorUserId: userId })
    return orc
  }

  // ── Status Workflow ───────────────────────────────────────

  async changeStatus(id: string, novoStatus: string, userId?: string, opts?: { skipNotifications?: boolean; notificarCliente?: boolean }) {
    const orc = await prisma.orcamento.findUnique({ where: { id } })
    if (!orc) throw new Error('Orçamento não encontrado')

    const statusAtual = orc.status
    if (STATUS_ORDER.indexOf(novoStatus as any) < 0) throw new Error(`Status inválido: ${novoStatus}`)
    if (statusAtual === novoStatus) return orc // no-op

    // ── Guard: validar transição contra o mapa forward-only ──
    if (!isAllowedTransition(statusAtual, novoStatus)) {
      const labelDe = STATUS_LABELS[statusAtual] || statusAtual
      const labelPara = STATUS_LABELS[novoStatus] || novoStatus
      throw new Error(
        `Não é permitido mover de "${labelDe}" para "${labelPara}". ` +
        `Para voltar a status anteriores, use a opção "Reabrir orçamento" no menu de ações.`
      )
    }

    // ── Guard: orçamento sem itens não pode ser enviado ──
    // Sem itens, o cliente recebe uma proposta vazia (sem totais, sem escopo).
    // Bloquear na transição para ENVIADO; demais status posteriores ficam
    // protegidos automaticamente pelo encadeamento da FSM.
    if (novoStatus === 'ENVIADO') {
      const itensCount = await prisma.orcamentoItem.count({ where: { orcamentoId: id } })
      if (itensCount === 0) {
        throw new Error(
          'Não é possível enviar um orçamento sem itens. ' +
          'Adicione ao menos um serviço, taxa ou despesa antes de prosseguir.'
        )
      }
    }

    // ── Idempotência: status já tem data dedicada gravada? ──
    // Se sim, side-effects (email, pesquisa) já dispararam alguma vez —
    // silenciar aqui evita duplicatas quando status retorna após Reabrir.
    const campoData = STATUS_DATE_FIELD[novoStatus]
    const isFirstTransition = !campoData || !(orc as any)[campoData]

    const data: any = { status: novoStatus as any }
    const agora = new Date()
    if (campoData && isFirstTransition) {
      data[campoData] = agora
    }

    const updated = await prisma.orcamento.update({ where: { id }, data })

    // Notificações do sino de "novo orçamento criado pelo CRM" só fazem sentido
    // enquanto o orçamento está em NOVO. Ao sair desse status (Comercial pegou
    // e moveu pra ENVIADO/etc), removemos do sino de todos os destinatários.
    if (statusAtual === 'NOVO' && novoStatus !== 'NOVO') {
      void this.notificationService.removerPorLink(`/orcamentos/${id}`)
    }

    await this.addEvento(
      id, userId, 'status_change', statusAtual, novoStatus,
      isFirstTransition
        ? `Status alterado de ${STATUS_LABELS[statusAtual] || statusAtual} para ${STATUS_LABELS[novoStatus] || novoStatus}`
        : `Status restaurado para ${STATUS_LABELS[novoStatus] || novoStatus} (sem reenvio de notificação — marco já havia sido alcançado)`,
    )

    // (A pesquisa de satisfação agora é enviada MANUALMENTE pelo comercial —
    //  sem disparo automático no FINALIZADO.)

    // Trigger: ao APROVAR pela primeira vez, cria automaticamente uma ServicoExecucao
    // para CADA item de tipo SERVICO do orçamento (catalogoId aponta para Servico template).
    // O responsável da execução é o mesmo do orçamento.
    if (novoStatus === 'APROVADO' && isFirstTransition && orc.clienteId) {
      try {
        // Carrega itens do orçamento com tipo SERVICO + catalogoId preenchido
        const itensServico = await prisma.orcamentoItem.findMany({
          where: { orcamentoId: id, tipo: 'SERVICO', catalogoId: { not: null } },
          select: { id: true, catalogoId: true, descricao: true },
        })

        // Filtra somente os catalogoIds que efetivamente existem como Servico template
        // (catalogo unificado mistura Servico + ServicoCatalogo; só Servico gera execução).
        const catalogoIds = itensServico.map(i => i.catalogoId).filter((s): s is string => !!s)
        const servicosValidos = catalogoIds.length > 0
          ? await prisma.servico.findMany({
              where: { id: { in: catalogoIds }, ativo: true },
              select: { id: true, nome: true },
            })
          : []
        const servicoMap = new Map(servicosValidos.map(s => [s.id, s]))

        // Para a notificação pessoal — busca razão social do cliente uma vez
        const clienteInfo = await prisma.cliente.findUnique({
          where: { id: orc.clienteId },
          select: { razaoSocial: true },
        }).catch(() => null)
        const clienteNome = clienteInfo?.razaoSocial || 'cliente'

        let criadas = 0
        const servicosCriadosNomes: string[] = []
        for (const item of itensServico) {
          if (!item.catalogoId || !servicoMap.has(item.catalogoId)) continue
          const svc = servicoMap.get(item.catalogoId)!
          try {
            // Cria o Processo agregador (Fase 3). Mesmo serviços sem encadeamento
            // ficam num processo de 1 execução só — uniformiza a UI e prepara o
            // futuro caso onde o template ganhe sucessores e execuções existentes
            // já fiquem agrupadas.
            const proc = await this.processoService.create(
              {
                nome: `${svc.nome} — ${clienteNome}`,
                clienteId: orc.clienteId,
                servicoRaizId: item.catalogoId,
                orcamentoId: orc.id,
                responsavelId: orc.responsavelId || undefined,
              },
              orc.empresaId || undefined,
              userId,
            )

            // Cria a execução-raiz vinculada ao processo. Sem predecessor —
            // por isso é ela quem finaliza o orçamento ao concluir (decisão 1a).
            //
            // IMPORTANTE: NÃO passar `responsavelId` aqui. A regra de atribuição
            // é configurada na pill "Identificação" do serviço-template
            // (Colaboradores / Setores / Resp. do orçamento / Resp. cliente na
            // área). `createExecucao` chama `resolverCandidatos` que consulta
            // essas 4 fontes. Forçar o responsável do orçamento aqui ignora a
            // configuração — mesmo bug que vimos no fluxo Constituição de Empresa.
            await this.servicoService.createExecucao(
              {
                servicoId: item.catalogoId,
                clienteId: orc.clienteId,
                orcamentoId: orc.id,
              },
              orc.empresaId || undefined,
              { processoId: proc.id, statusInicial: 'EM_ANDAMENTO' },
            )

            criadas++
            servicosCriadosNomes.push(svc.nome)
          } catch (e) {
            console.warn('[Orcamento] Falha ao criar processo/execucao para item:', item.descricao, (e as Error).message)
          }
        }

        if (criadas > 0) {
          await this.addEvento(
            id, userId, 'servico_iniciado', null, null,
            `${criadas} processo${criadas > 1 ? 's' : ''} de serviço iniciado${criadas > 1 ? 's' : ''} automaticamente`,
          )

          // Notificação pessoal: avisa o responsável dos serviços (sino global).
          // Pula se o próprio responsável fez a aprovação (já sabe do que criou).
          if (orc.responsavelId && orc.responsavelId !== userId) {
            const titulo = criadas === 1
              ? 'Novo serviço atribuído a você'
              : `${criadas} novos serviços atribuídos a você`
            const mensagem = criadas === 1
              ? `${clienteNome} — ${servicosCriadosNomes[0]}`
              : `${clienteNome} — ${servicosCriadosNomes.slice(0, 3).join(', ')}${criadas > 3 ? ` e mais ${criadas - 3}` : ''}`
            this.notificationService.criar({
              userId: orc.responsavelId,
              titulo,
              mensagem,
              tipo: 'info',
              link: '/meus-servicos',
              origem: 'servicos',
              empresaId: orc.empresaId || null,
            }).catch(e => {
              console.warn('[Orcamento] Falha ao criar notificação para responsável:', (e as Error).message)
            })
          }
        }
      } catch (e) {
        console.warn('[Orcamento] Falha ao processar criação de execuções de serviço:', (e as Error).message)
      }
    }

    // Notificações: somente na primeira ocorrência da transição (idempotente).
    // Repor status após Reabrir não dispara email novo a menos que o Reabrir
    // tenha limpado a data dedicada (cenário legítimo de reprocessamento).
    // `opts.skipNotifications` = pula e-mails — usado por triggers automáticos internos
    // (ex: cascata da execução raiz finalizando o orcamento via APROVADO→LIBERADO transparente).
    if (isFirstTransition && !opts?.skipNotifications) {
      this.notificarMudancaStatus(id, statusAtual, novoStatus, userId, { notificarCliente: opts?.notificarCliente }).catch(e => {
        console.warn('[Orcamento] Falha ao enviar notificacao de status:', (e as Error).message)
      })
    }

    // Trigger ao ENCERRAR como cancelamento (recusa direta antes de aprovação) —
    // grava data de cancelamento se aplicável e ainda não definida.
    if (novoStatus === 'ENCERRADO' && (statusAtual === 'NOVO' || statusAtual === 'A_ENVIAR' || statusAtual === 'ENVIADO')) {
      if (!orc.dtCancelado) {
        await prisma.orcamento.update({ where: { id }, data: { dtCancelado: new Date() } })
      }
    }

    this.emitEvent('kanban', { orcamentoId: id, empresaId: updated.empresaId, actorUserId: userId })
    return updated
  }

  // ── Paralizacao / Retomada ────────────────────────────────

  async paralizar(id: string, motivo: string, userId?: string) {
    const orc = await prisma.orcamento.findUnique({ where: { id } })
    if (!orc) throw new Error('Orcamento nao encontrado')
    if (orc.paralizado) throw new Error('Orcamento ja esta paralizado')

    const updated = await prisma.orcamento.update({
      where: { id },
      data: {
        paralizado: true,
        paralizadoEm: new Date(),
        paralizadoPor: userId || null,
        paralizadoMotivo: motivo,
      },
    })
    await this.addEvento(id, userId, 'paralizacao', null, null, `Orcamento paralizado: ${motivo}`)
    this.emitEvent('kanban', { orcamentoId: id, empresaId: updated.empresaId, actorUserId: userId })
    return updated
  }

  async retomar(id: string, userId?: string) {
    const orc = await prisma.orcamento.findUnique({ where: { id } })
    if (!orc) throw new Error('Orcamento nao encontrado')
    if (!orc.paralizado) throw new Error('Orcamento nao esta paralizado')

    const updated = await prisma.orcamento.update({
      where: { id },
      data: { paralizado: false, paralizadoEm: null, paralizadoPor: null, paralizadoMotivo: null },
    })
    await this.addEvento(id, userId, 'retomada', null, null, 'Orcamento retomado')
    this.emitEvent('kanban', { orcamentoId: id, empresaId: updated.empresaId, actorUserId: userId })
    return updated
  }

  // ── Reabertura (regressão controlada de status) ──────────────
  //
  // Único caminho permitido para voltar a um status anterior. Por padrão limpa
  // as datas dos marcos posteriores ao novoStatus para que side-effects
  // (e-mails, pesquisa) re-disparem legitimamente quando o orçamento avançar
  // de novo. Quando `manterDatas=true`, preserva as datas dos marcos positivos
  // (Enviado/Aprovado/Liberado/Finalizado) — útil em correções administrativas
  // onde os marcos efetivamente aconteceram. dtCancelado/dtEncerrado são
  // sempre limpos pois a reabertura desfaz qualquer encerramento.
  async reabrir(id: string, novoStatus: string, motivo?: string, userId?: string, manterDatas?: boolean) {
    const orc = await prisma.orcamento.findUnique({ where: { id } })
    if (!orc) throw new Error('Orçamento não encontrado')

    const idxAtual = STATUS_ORDER.indexOf(orc.status as any)
    const idxNovo = STATUS_ORDER.indexOf(novoStatus as any)
    if (idxNovo < 0 || novoStatus === 'ENCERRADO') {
      throw new Error(`Status inválido para reabertura: ${novoStatus}`)
    }
    if (idxNovo >= idxAtual) {
      throw new Error(
        `Reabertura serve apenas para voltar a status anteriores. ` +
        `Para avançar de "${STATUS_LABELS[orc.status] || orc.status}", use o fluxo normal do kanban.`
      )
    }

    // dtCancelado/dtEncerrado sempre limpos — o orcamento esta sendo reaberto.
    // Marcos positivos posteriores ao novoStatus sao limpos por padrao, ou
    // preservados quando manterDatas=true.
    const data: any = {
      status: novoStatus as any,
      dtCancelado: null,
      dtEncerrado: null,
      reaberturasCount: { increment: 1 },
    }
    if (!manterDatas) {
      const camposPosterior: Record<string, string[]> = {
        NOVO: ['dtEnviado', 'dtAprovado', 'dtLiberado', 'dtFinalizado'],
        A_ENVIAR: ['dtEnviado', 'dtAprovado', 'dtLiberado', 'dtFinalizado'],
        ENVIADO: ['dtAprovado', 'dtLiberado', 'dtFinalizado'],
        APROVADO: ['dtLiberado', 'dtFinalizado'],
        LIBERADO: ['dtFinalizado'],
      }
      for (const campo of (camposPosterior[novoStatus] || [])) {
        data[campo] = null
      }
    }

    const updated = await prisma.orcamento.update({ where: { id }, data })

    const labelDe = STATUS_LABELS[orc.status] || orc.status
    const labelPara = STATUS_LABELS[novoStatus] || novoStatus
    const sufixoDatas = manterDatas ? ' (datas dos marcos preservadas)' : ''
    const descricao = motivo
      ? `Reaberto de ${labelDe} para ${labelPara}${sufixoDatas}. Motivo: ${motivo}`
      : `Reaberto de ${labelDe} para ${labelPara}${sufixoDatas}`
    await this.addEvento(id, userId, 'reabertura', orc.status, novoStatus, descricao)
    this.emitEvent('kanban', { orcamentoId: id, empresaId: updated.empresaId, actorUserId: userId })
    return updated
  }

  // ── Edicao manual de datas ─────────────────────────────────

  // ── Helpers expostos ───────────────────────────────────────

  async listUsuarios(empresaId?: string) {
    const where: any = {}
    if (empresaId) where.empresaId = empresaId
    return prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, image: true },
      orderBy: { name: 'asc' },
    })
  }

  // ── Formas de pagamento ──────────────────────────────────
  // Lista gerenciável (opcoes_cadastro, tipo FORMA_PAGAMENTO) — espelha o
  // "Gerenciar Formas de Pagamento" do módulo legado (tabela com_orc_ven).
  // Inclui as globais (empresa_id NULL) e as da empresa do usuário.
  async listFormasPagamento(empresaId?: string) {
    return prisma.opcaoCadastro.findMany({
      where: {
        tipo: 'FORMA_PAGAMENTO',
        ativo: true,
        OR: [{ empresaId: null }, ...(empresaId ? [{ empresaId }] : [])],
      },
      select: { id: true, valor: true, ordem: true },
      orderBy: [{ ordem: 'asc' }, { valor: 'asc' }],
    })
  }

  async createFormaPagamento(valor: string, empresaId?: string) {
    const max = await prisma.opcaoCadastro.aggregate({
      where: { tipo: 'FORMA_PAGAMENTO' },
      _max: { ordem: true },
    })
    return prisma.opcaoCadastro.create({
      data: { tipo: 'FORMA_PAGAMENTO', valor, ordem: (max._max.ordem ?? 0) + 1, empresaId: empresaId ?? null },
      select: { id: true, valor: true, ordem: true },
    })
  }

  async updateFormaPagamento(id: string, valor?: string, ordem?: number, ativo?: boolean) {
    return prisma.opcaoCadastro.update({
      where: { id },
      data: {
        ...(valor !== undefined ? { valor } : {}),
        ...(ordem !== undefined ? { ordem } : {}),
        ...(ativo !== undefined ? { ativo } : {}),
      },
      select: { id: true, valor: true, ordem: true, ativo: true },
    })
  }

  async deleteFormaPagamento(id: string) {
    await prisma.opcaoCadastro.delete({ where: { id } })
    return { ok: true }
  }

  async listOrcamentosDoCliente(clienteId: string, excluirId?: string) {
    return prisma.orcamento.findMany({
      where: { clienteId, ...(excluirId ? { id: { not: excluirId } } : {}) },
      select: {
        id: true, numero: true, status: true, totalGeral: true, createdAt: true,
        arquivado: true, tipo: true,
        // Preview do primeiro item do tipo SERVICO para identificar qual servico foi orçado
        itens: {
          where: { tipo: 'SERVICO' },
          select: { descricao: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  }

  async trocarResponsavel(id: string, responsavelId: string | null, userId?: string) {
    const orc = await prisma.orcamento.findUnique({ where: { id } })
    if (!orc) throw new Error('Orcamento nao encontrado')
    const updated = await prisma.orcamento.update({ where: { id }, data: { responsavelId } })
    let nomeNovo = 'Sem responsavel'
    if (responsavelId) {
      const u = await prisma.user.findUnique({ where: { id: responsavelId }, select: { name: true } }).catch(() => null)
      nomeNovo = u?.name || responsavelId
    }
    await this.addEvento(id, userId, 'edicao', null, null, `Responsavel alterado para "${nomeNovo}"`)
    this.emitEvent('dados-gerais', { orcamentoId: id, empresaId: updated.empresaId, actorUserId: userId })
    return updated
  }

  async trocarSolicitante(id: string, solicitanteId: string | null, userId?: string) {
    const orc = await prisma.orcamento.findUnique({ where: { id } })
    if (!orc) throw new Error('Orcamento nao encontrado')
    const updated = await prisma.orcamento.update({ where: { id }, data: { solicitanteId } })
    let nomeNovo = 'Sem solicitante'
    if (solicitanteId) {
      const u = await prisma.user.findUnique({ where: { id: solicitanteId }, select: { name: true } }).catch(() => null)
      nomeNovo = u?.name || solicitanteId
    }
    await this.addEvento(id, userId, 'edicao', null, null, `Solicitante alterado para "${nomeNovo}"`)
    this.emitEvent('dados-gerais', { orcamentoId: id, empresaId: updated.empresaId, actorUserId: userId })
    return updated
  }

  async editarData(id: string, campo: string, valor: string | null, userId?: string) {
    const camposPermitidos = ['dtEnviado', 'dtAprovado', 'dtLiberado', 'dtFinalizado', 'dtEncerrado', 'dtCancelado']
    if (!camposPermitidos.includes(campo)) throw new Error(`Campo nao permitido: ${campo}`)

    const data: any = { [campo]: valor ? new Date(valor) : null }
    const updated = await prisma.orcamento.update({ where: { id }, data })

    const labels: Record<string, string> = {
      dtEnviado: 'data de envio',
      dtAprovado: 'data de aprovacao',
      dtLiberado: 'data de liberacao',
      dtFinalizado: 'data de finalizacao',
      dtEncerrado: 'data de encerramento',
      dtCancelado: 'data de cancelamento',
    }
    await this.addEvento(id, userId, 'edicao_data', null, null, `${labels[campo]} ${valor ? 'definida para ' + new Date(valor).toLocaleDateString('pt-BR') : 'removida'}`)
    this.emitEvent('dados-gerais', { orcamentoId: id, empresaId: updated.empresaId, actorUserId: userId })
    return updated
  }

  // ── Templates de email ─────────────────────────────────────
  //
  // Design system:
  // - Tons de verde (Cadastros): #10b981 (emerald-500), #059669 (emerald-600), #ecfdf5 (emerald-50)
  // - Status colors: aprovado verde, recusado rose, neutro slate
  // - Layout: max-width 600px, inline CSS, tabelas para Outlook compat
  // - Logo: usa empresa.logoUrl quando existe; senao mostra nomeFantasia em texto grande
  // - Pre-header (preview text): aparece na lista de inbox antes do usuario abrir

  private parseEmails(s: string | null | undefined): string[] {
    if (!s) return []
    return s.split(/[,;]/).map(e => e.trim()).filter(Boolean)
  }

  private formatCurrency(v: number | string | null | undefined): string {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0))
    return (isNaN(n) ? 0 : n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  private formatCnpjCpf(doc: string | null | undefined): string {
    if (!doc) return ''
    const d = doc.replace(/\D/g, '')
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
    return doc
  }

  /** Wrapper principal do email — header com logo, hero opcional, body, footer.
   *
   * @param params.empresaNome     nome de exibicao da empresa (header e footer)
   * @param params.logoUrl         URL absoluta da logomarca (placeholder caso nao haja)
   * @param params.preheader       texto que aparece no preview do inbox
   * @param params.heroAccent      cor de destaque do hero (badge de status)
   * @param params.heroTitle       titulo grande na cor de destaque
   * @param params.heroSubtitle    subtitulo abaixo do titulo (numero do orcamento, etc)
   * @param params.bodyHtml        conteudo principal (paragrafos + tabela de resumo)
   * @param params.ctaLabel        texto do botao CTA (opcional)
   * @param params.ctaUrl          URL do botao CTA (opcional)
   */
  private buildEmailLayout(params: {
    empresaNome: string
    logoUrl: string | null | undefined
    preheader: string
    heroAccent: string
    heroTitle: string
    heroSubtitle?: string
    bodyHtml: string
    ctaLabel?: string
    ctaUrl?: string
    footerExtra?: string
  }): string {
    const {
      empresaNome, logoUrl, preheader, heroAccent, heroTitle, heroSubtitle,
      bodyHtml, ctaLabel, ctaUrl, footerExtra,
    } = params

    // Logomarca: se houver URL → img; senao → texto branco grande sobre faixa verde
    const logoBlock = logoUrl
      ? `<img src="${logoUrl}" alt="${empresaNome}" style="max-height:48px;max-width:200px;display:inline-block;border:0;outline:none;text-decoration:none;" />`
      : `<span style="display:inline-block;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${empresaNome}</span>`

    const ctaBlock = ctaLabel && ctaUrl
      ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 8px;">
        <tr>
          <td align="center" bgcolor="#10b981" style="border-radius:8px;background:#10b981;">
            <a href="${ctaUrl}" style="display:inline-block;padding:14px 36px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              ${ctaLabel}
            </a>
          </td>
        </tr>
      </table>`
      : ''

    return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${heroTitle}</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; padding: 0 !important; }
    .px-32 { padding-left: 20px !important; padding-right: 20px !important; }
    .hero-title { font-size: 22px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#1f2937;">
  <!-- Pre-header (oculto, aparece na preview do inbox) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f3f4f6;">${preheader}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">

          <!-- Header verde com logo -->
          <tr>
            <td bgcolor="#10b981" align="center" style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:28px 32px;">
              ${logoBlock}
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td class="px-32" style="padding:36px 32px 16px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${heroAccent};">${empresaNome}</p>
              <h1 class="hero-title" style="margin:0;font-size:26px;font-weight:700;color:#0f172a;line-height:1.25;">${heroTitle}</h1>
              ${heroSubtitle ? `<p style="margin:8px 0 0;font-size:14px;color:#6b7280;">${heroSubtitle}</p>` : ''}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="px-32" style="padding:8px 32px 32px;font-size:14px;line-height:1.6;color:#374151;">
              ${bodyHtml}
              ${ctaBlock}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:#e5e7eb;margin:0;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="px-32" style="padding:20px 32px 28px;text-align:center;font-size:12px;color:#9ca3af;line-height:1.6;">
              ${footerExtra ? `<p style="margin:0 0 8px;color:#6b7280;">${footerExtra}</p>` : ''}
              <p style="margin:0;">Este é um e-mail automático. Por favor, não responda diretamente a esta mensagem.</p>
              <p style="margin:8px 0 0;font-weight:600;color:#10b981;">${empresaNome} &middot; ${new Date().getFullYear()}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  }

  /** Tabela de resumo do orcamento — usada nos emails internos e ao cliente.
   * Inclui dados do cliente (razao social + CNPJ), numero, validade, totais.
   */
  private buildOrcamentoSummaryTable(data: {
    numero: string
    clienteRazao: string
    clienteDoc?: string | null
    criadoEm: Date
    validadeDias: number
    formaPagamento?: string | null
    responsavelNome?: string | null
  }): string {
    const docFmt = this.formatCnpjCpf(data.clienteDoc || '')
    const dataFmt = data.criadoEm.toLocaleDateString('pt-BR')
    return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;margin:20px 0;">
      <tr>
        <td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px;color:#374151;">
            <tr>
              <td style="padding:6px 0;color:#6b7280;width:140px;">Orçamento:</td>
              <td style="padding:6px 0;font-weight:700;color:#0f172a;font-family:'Courier New',monospace;">${data.numero}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6b7280;">Cliente:</td>
              <td style="padding:6px 0;font-weight:600;color:#0f172a;">${data.clienteRazao}</td>
            </tr>
            ${docFmt ? `
            <tr>
              <td style="padding:6px 0;color:#6b7280;">CNPJ/CPF:</td>
              <td style="padding:6px 0;color:#374151;font-family:'Courier New',monospace;">${docFmt}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:6px 0;color:#6b7280;">Emitido em:</td>
              <td style="padding:6px 0;color:#374151;">${dataFmt}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6b7280;">Validade:</td>
              <td style="padding:6px 0;color:#374151;"><strong>${data.validadeDias}</strong> dias</td>
            </tr>
            ${data.formaPagamento ? `
            <tr>
              <td style="padding:6px 0;color:#6b7280;">Pagamento:</td>
              <td style="padding:6px 0;color:#374151;">${data.formaPagamento}</td>
            </tr>` : ''}
            ${data.responsavelNome ? `
            <tr>
              <td style="padding:6px 0;color:#6b7280;">Responsável:</td>
              <td style="padding:6px 0;color:#374151;">${data.responsavelNome}</td>
            </tr>` : ''}
          </table>
        </td>
      </tr>
    </table>`
  }

  /** Tabela de itens do orcamento — agrupa por tipo e mostra subtotal por linha. */
  private buildItensTable(itens: Array<{ tipo: string; descricao: string; quantidade: number; valorUnitario: number | string | { toNumber: () => number } }>): string {
    if (!itens.length) return ''
    const tipoLabel: Record<string, string> = { SERVICO: 'Serviço', TAXA: 'Taxa', DESPESA: 'Despesa' }
    const tipoColor: Record<string, string> = { SERVICO: '#10b981', TAXA: '#f59e0b', DESPESA: '#ef4444' }

    const rows = itens.map((it) => {
      const unit = typeof it.valorUnitario === 'object' && it.valorUnitario !== null && 'toNumber' in it.valorUnitario
        ? (it.valorUnitario as { toNumber: () => number }).toNumber()
        : Number(it.valorUnitario || 0)
      const total = unit * (it.quantidade || 0)
      const tip = it.tipo as string
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:11px;">
          <span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${tipoColor[tip] || '#94a3b8'}1a;color:${tipoColor[tip] || '#94a3b8'};font-weight:600;text-transform:uppercase;">${tipoLabel[tip] || tip}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#0f172a;">${it.descricao}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;color:#6b7280;">${it.quantidade}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#374151;font-variant-numeric:tabular-nums;">${this.formatCurrency(unit)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#0f172a;font-variant-numeric:tabular-nums;">${this.formatCurrency(total)}</td>
      </tr>`
    }).join('')

    return `
    <h3 style="margin:24px 0 12px;font-size:14px;font-weight:700;color:#0f172a;">Itens do orçamento</h3>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:13px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th align="left" style="padding:10px 12px;font-weight:600;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Tipo</th>
          <th align="left" style="padding:10px 12px;font-weight:600;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Descrição</th>
          <th align="center" style="padding:10px 12px;font-weight:600;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Qtd</th>
          <th align="right" style="padding:10px 12px;font-weight:600;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Unitário</th>
          <th align="right" style="padding:10px 12px;font-weight:600;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
  }

  /** Bloco de totais — quebrado por categoria + desconto + total geral em destaque verde. */
  private buildTotaisBlock(orc: {
    descontoPct?: number | string | null | { toNumber: () => number }
    descontoValor?: number | string | null | { toNumber: () => number }
    totalServicos: number | string | { toNumber: () => number }
    totalTaxas: number | string | { toNumber: () => number }
    totalDespesas: number | string | { toNumber: () => number }
    totalGeral: number | string | { toNumber: () => number }
  }): string {
    const num = (v: unknown): number => {
      if (typeof v === 'number') return v
      if (v && typeof v === 'object' && 'toNumber' in v) return (v as { toNumber: () => number }).toNumber()
      return parseFloat(String(v ?? 0)) || 0
    }
    const tServ = num(orc.totalServicos)
    const tTax = num(orc.totalTaxas)
    const tDesp = num(orc.totalDespesas)
    const desc = num(orc.descontoValor) || (num(orc.descontoPct) > 0 ? (tServ + tTax + tDesp) * num(orc.descontoPct) / 100 : 0)
    const total = num(orc.totalGeral)

    const linha = (label: string, valor: number, color = '#374151') => `
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">${label}</td>
        <td style="padding:8px 0;text-align:right;color:${color};font-size:13px;font-variant-numeric:tabular-nums;">${this.formatCurrency(valor)}</td>
      </tr>`

    return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0 4px;">
      ${tServ > 0 ? linha('Serviços', tServ) : ''}
      ${tTax > 0 ? linha('Taxas', tTax) : ''}
      ${tDesp > 0 ? linha('Despesas', tDesp) : ''}
      ${desc > 0 ? linha('Desconto', -desc, '#f59e0b') : ''}
      <tr>
        <td colspan="2" style="padding:6px 0 0;"><div style="height:1px;background:#e5e7eb;"></div></td>
      </tr>
      <tr>
        <td style="padding:14px 0 0;font-size:15px;font-weight:700;color:#0f172a;">Total geral</td>
        <td style="padding:14px 0 0;text-align:right;font-size:20px;font-weight:800;color:#10b981;font-variant-numeric:tabular-nums;">${this.formatCurrency(total)}</td>
      </tr>
    </table>`
  }

  /** Envia notificacoes por email conforme transicao de status do orcamento.
   *
   * Regras:
   * - A_ENVIAR/NOVO -> ENVIADO: proposta ao cliente (cliente.email + emailsContatos)
   *                              + notificacao interna (emailComercial + emailFinanceiro)
   * - -> APROVADO: emailComercial + emailFinanceiro
   * - ENVIADO/NOVO/A_ENVIAR -> ENCERRADO (recusa): emailComercial + emailFinanceiro
   * - -> LIBERADO: emailComercial + email do responsavel
   * - -> FINALIZADO: emailComercial
   * Email de pesquisa ao cliente em FINALIZADO e enviado pelo PesquisaService (best-effort).
   */
  async notificarMudancaStatus(id: string, statusAtual: string, novoStatus: string, userId?: string, opts?: { notificarCliente?: boolean }) {
    if (statusAtual === novoStatus) return
    // notificarCliente=false → não dispara o e-mail de proposta pro cliente (decisão do operador).
    const notificarCliente = opts?.notificarCliente !== false

    const orc = await prisma.orcamento.findUnique({ where: { id } })
    if (!orc) return
    // Itens em consulta separada para evitar inferencia complexa de Prisma include
    const itens = await prisma.orcamentoItem.findMany({
      where: { orcamentoId: id },
      orderBy: { createdAt: 'asc' },
    }).catch(() => [])

    const config = await this.getConfig(orc.empresaId || undefined)
    const empresa = orc.empresaId
      ? await prisma.empresa.findUnique({ where: { id: orc.empresaId }, select: { razaoSocial: true, nomeFantasia: true, logoUrl: true } }).catch(() => null)
      : null
    const cliente = orc.clienteId
      ? await prisma.cliente.findUnique({ where: { id: orc.clienteId }, select: { razaoSocial: true, documento: true, email: true } }).catch(() => null)
      : null
    const responsavel = orc.responsavelId
      ? await prisma.user.findUnique({ where: { id: orc.responsavelId }, select: { name: true, email: true } }).catch(() => null)
      : null
    const usuario = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null)
      : null

    const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || 'Empresa'
    const clienteNome = cliente?.razaoSocial || 'Cliente'
    const numero = `#${String(orc.numero).padStart(4, '0')}`
    const usuarioNome = usuario?.name || 'Sistema'

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const linkPublico = `${baseUrl}/orcamento/${orc.token}`
    const linkInterno = `${baseUrl}/orcamentos/${id}`

    const emailFinanceiro = this.parseEmails(config.emailFinanceiro)
    const emailComercial = this.parseEmails(config.emailComercial)
    const emailsContatos = this.parseEmails(orc.emailsContatos)

    // Resumo padronizado (header + cliente + datas) reusado em todos os emails
    const summaryTable = this.buildOrcamentoSummaryTable({
      numero,
      clienteRazao: clienteNome,
      clienteDoc: cliente?.documento,
      criadoEm: orc.createdAt,
      validadeDias: orc.validadeDias,
      formaPagamento: orc.formaPagamento,
      responsavelNome: responsavel?.name,
    })
    const itensTable = this.buildItensTable(itens.map(i => ({
      tipo: i.tipo, descricao: i.descricao, quantidade: Number(i.quantidade),
      valorUnitario: i.valorUnitario as unknown as { toNumber: () => number },
    })))
    const totaisBlock = this.buildTotaisBlock({
      descontoPct: orc.descontoPct as unknown as { toNumber: () => number } | null,
      descontoValor: orc.descontoValor as unknown as { toNumber: () => number } | null,
      totalServicos: orc.totalServicos as unknown as { toNumber: () => number },
      totalTaxas: orc.totalTaxas as unknown as { toNumber: () => number },
      totalDespesas: orc.totalDespesas as unknown as { toNumber: () => number },
      totalGeral: orc.totalGeral as unknown as { toNumber: () => number },
    })

    // Helper para enviar email com layout padrao
    const enviarEmail = async (params: {
      to: string[]
      subject: string
      preheader: string
      heroAccent: string
      heroTitle: string
      heroSubtitle?: string
      bodyHtml: string
      ctaLabel?: string
      ctaUrl?: string
      tipoEvento: string
    }) => {
      const dest = [...new Set(params.to.filter(Boolean))]
      if (dest.length === 0) return 0
      const html = this.buildEmailLayout({
        empresaNome,
        logoUrl: empresa?.logoUrl,
        preheader: params.preheader,
        heroAccent: params.heroAccent,
        heroTitle: params.heroTitle,
        heroSubtitle: params.heroSubtitle,
        bodyHtml: params.bodyHtml,
        ctaLabel: params.ctaLabel,
        ctaUrl: params.ctaUrl,
      })
      try {
        await this.emailService.sendMail({ to: dest, subject: params.subject, html })
        await this.addEvento(id, userId, 'notificacao', null, null, `${params.tipoEvento} para ${dest.length} destinatário(s): ${dest.join(', ')}`)
        return dest.length
      } catch (e) {
        console.warn('[Orcamento] Falha ao enviar email:', (e as Error).message)
        return 0
      }
    }

    // ── A_ENVIAR/NOVO -> ENVIADO ──
    if (novoStatus === 'ENVIADO' && (statusAtual === 'A_ENVIAR' || statusAtual === 'NOVO')) {
      // 1. Email para o cliente (proposta + link publico)
      const destinatariosCliente = [
        ...(cliente?.email ? [cliente.email] : []),
        ...emailsContatos,
      ]
      if (notificarCliente && destinatariosCliente.length > 0) {
        await enviarEmail({
          to: destinatariosCliente,
          subject: `Proposta comercial ${numero} · ${empresaNome}`,
          preheader: `Sua proposta comercial ${numero} está pronta. Validade: ${orc.validadeDias} dias.`,
          heroAccent: '#10b981',
          heroTitle: `Sua proposta comercial está pronta`,
          heroSubtitle: `Orçamento ${numero} · Validade de ${orc.validadeDias} dias`,
          bodyHtml: `
            <p>Prezado(a) <strong>${clienteNome}</strong>,</p>
            <p>A <strong>${empresaNome}</strong> tem o prazer de enviar a proposta comercial abaixo para sua avaliação. Clique no botão para visualizar e aprovar diretamente.</p>
            ${config.textoApresentacao ? `<div style="background:#ecfdf5;border-left:3px solid #10b981;padding:14px 18px;margin:18px 0;border-radius:4px;color:#065f46;font-size:13px;">${config.textoApresentacao}</div>` : ''}
            ${summaryTable}
            ${itensTable}
            ${totaisBlock}
          `,
          ctaLabel: 'Ver e aprovar proposta',
          ctaUrl: linkPublico,
          tipoEvento: 'Proposta enviada ao cliente',
        })
      }

      // 2. Notificacao interna (comercial + financeiro)
      await enviarEmail({
        to: [...emailComercial, ...emailFinanceiro],
        subject: `[Interno] Orçamento ${numero} enviado ao cliente`,
        preheader: `Orçamento ${numero} (${clienteNome}) foi enviado pelo ${usuarioNome}.`,
        heroAccent: '#10b981',
        heroTitle: `Orçamento enviado ao cliente`,
        heroSubtitle: `${numero} · ${clienteNome}`,
        bodyHtml: `
          <p>O orçamento <strong>${numero}</strong> foi enviado para <strong>${clienteNome}</strong> por <strong>${usuarioNome}</strong>.</p>
          ${summaryTable}
          ${itensTable}
          ${totaisBlock}
        `,
        ctaLabel: 'Abrir no sistema',
        ctaUrl: linkInterno,
        tipoEvento: 'Notificação de envio',
      })
      return
    }

    // ── -> APROVADO ──
    if (novoStatus === 'APROVADO') {
      await enviarEmail({
        to: [...emailComercial, ...emailFinanceiro],
        subject: `✓ Orçamento ${numero} aprovado · ${clienteNome}`,
        preheader: `Boas notícias! ${clienteNome} aprovou o orçamento ${numero}.`,
        heroAccent: '#10b981',
        heroTitle: `Orçamento aprovado!`,
        heroSubtitle: `${numero} · ${clienteNome}`,
        bodyHtml: `
          <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px 20px;margin:0 0 18px;">
            <p style="margin:0;color:#065f46;font-weight:600;font-size:14px;">🎉 O cliente aprovou a proposta. Próximo passo: liberar para execução.</p>
          </div>
          <p>O orçamento <strong>${numero}</strong> para <strong>${clienteNome}</strong> foi aprovado.</p>
          ${summaryTable}
          ${itensTable}
          ${totaisBlock}
        `,
        ctaLabel: 'Abrir orçamento',
        ctaUrl: linkInterno,
        tipoEvento: 'Notificação de aprovação',
      })
      return
    }

    // ── ENVIADO/NOVO/A_ENVIAR -> ENCERRADO (recusa) ──
    if (novoStatus === 'ENCERRADO' && (statusAtual === 'ENVIADO' || statusAtual === 'NOVO' || statusAtual === 'A_ENVIAR')) {
      await enviarEmail({
        to: [...emailComercial, ...emailFinanceiro],
        subject: `Orçamento ${numero} recusado · ${clienteNome}`,
        preheader: `O orçamento ${numero} foi recusado/encerrado pelo cliente.`,
        heroAccent: '#ef4444',
        heroTitle: `Orçamento recusado`,
        heroSubtitle: `${numero} · ${clienteNome}`,
        bodyHtml: `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin:0 0 18px;">
            <p style="margin:0;color:#991b1b;font-weight:600;font-size:14px;">O orçamento foi recusado/encerrado. Considere agendar follow-up para entender os motivos.</p>
          </div>
          ${summaryTable}
          ${itensTable}
          ${totaisBlock}
        `,
        ctaLabel: 'Abrir orçamento',
        ctaUrl: linkInterno,
        tipoEvento: 'Notificação de recusa',
      })
      return
    }

    // ── -> LIBERADO ──
    if (novoStatus === 'LIBERADO') {
      const destinatarios = [...emailComercial]
      if (responsavel?.email) destinatarios.push(responsavel.email)
      await enviarEmail({
        to: destinatarios,
        subject: `▶ Orçamento ${numero} liberado para execução`,
        preheader: `Orçamento ${numero} liberado por ${usuarioNome}. Início da execução.`,
        heroAccent: '#059669',
        heroTitle: `Liberado para execução`,
        heroSubtitle: `${numero} · ${clienteNome}`,
        bodyHtml: `
          <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px 20px;margin:0 0 18px;">
            <p style="margin:0;color:#065f46;font-weight:600;font-size:14px;">▶ A execução pode começar. ${responsavel?.name ? `Responsável designado: <strong>${responsavel.name}</strong>.` : 'Designe um responsável quando puder.'}</p>
          </div>
          <p>O orçamento <strong>${numero}</strong> foi liberado por <strong>${usuarioNome}</strong>.</p>
          ${summaryTable}
          ${itensTable}
          ${totaisBlock}
        `,
        ctaLabel: 'Abrir orçamento',
        ctaUrl: linkInterno,
        tipoEvento: 'Notificação de liberação',
      })
      return
    }

    // ── -> FINALIZADO ──
    if (novoStatus === 'FINALIZADO') {
      await enviarEmail({
        to: emailComercial,
        subject: `✓ Orçamento ${numero} finalizado · ${clienteNome}`,
        preheader: `Execução concluída. Pesquisa de satisfação será enviada automaticamente.`,
        heroAccent: '#0f766e',
        heroTitle: `Orçamento finalizado`,
        heroSubtitle: `${numero} · ${clienteNome}`,
        bodyHtml: `
          <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px 20px;margin:0 0 18px;">
            <p style="margin:0;color:#115e59;font-weight:600;font-size:14px;">✓ A execução foi concluída. A pesquisa de satisfação será enviada ao cliente automaticamente.</p>
          </div>
          ${summaryTable}
          ${itensTable}
          ${totaisBlock}
        `,
        ctaLabel: 'Abrir orçamento',
        ctaUrl: linkInterno,
        tipoEvento: 'Notificação de finalização',
      })
      return
    }
  }

  async enviarOrcamento(id: string, opcoes: { destinatarios?: string[]; mensagem?: string } = {}, userId?: string) {
    const orc = await prisma.orcamento.findUnique({
      where: { id },
      include: { itens: true },
    })
    if (!orc) throw new Error('Orcamento nao encontrado')

    const cliente = orc.clienteId
      ? await prisma.cliente.findUnique({ where: { id: orc.clienteId }, select: { razaoSocial: true, email: true } }).catch(() => null)
      : null

    const empresa = orc.empresaId
      ? await prisma.empresa.findUnique({ where: { id: orc.empresaId }, select: { razaoSocial: true, nomeFantasia: true, logoUrl: true } }).catch(() => null)
      : null

    const config = await this.getConfig(orc.empresaId || undefined)

    // Definir destinatarios: lista customizada OU fallback (cliente + emailsContatos + comercial).
    // Operador pode forçar "sem destinatário" passando destinatarios=[] explicitamente —
    // nesse caso só muda status pra ENVIADO sem disparar e-mail (#HLP0086).
    // Quando destinatarios=undefined, aplica o fallback como sempre.
    const operadorForcouVazio = Array.isArray(opcoes.destinatarios) && opcoes.destinatarios.length === 0
    const emails = new Set<string>()
    if (!operadorForcouVazio) {
      if (opcoes.destinatarios?.length) {
        for (const e of opcoes.destinatarios) if (e.trim()) emails.add(e.trim())
      } else {
        if (cliente?.email) emails.add(cliente.email)
        if (orc.emailsContatos) {
          for (const e of orc.emailsContatos.split(/[,;]/).map(s => s.trim()).filter(Boolean)) emails.add(e)
        }
        if (config.emailComercial) {
          for (const e of config.emailComercial.split(/[,;]/).map(s => s.trim()).filter(Boolean)) emails.add(e)
        }
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const linkPublico = `${baseUrl}/orcamentos/publico/${orc.token}`
    const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || 'Empresa'
    const clienteNome = cliente?.razaoSocial || 'Cliente'

    // Corpo do email
    const html = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8" /></head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
        <div style="background: #fff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          ${empresa?.logoUrl ? `<div style="text-align:center; margin-bottom: 24px;"><img src="${empresa.logoUrl}" alt="${empresaNome}" style="max-height: 60px;" /></div>` : ''}
          <h2 style="color: #fb7185; margin: 0 0 16px 0; font-size: 22px;">Proposta Comercial #${String(orc.numero).padStart(4, '0')}</h2>
          <p style="color: #444; line-height: 1.6;">Prezado(a) <strong>${clienteNome}</strong>,</p>
          <p style="color: #444; line-height: 1.6;">A <strong>${empresaNome}</strong> tem o prazer de enviar a proposta comercial em anexo para sua avaliacao.</p>
          ${opcoes.mensagem ? `<div style="background: #fff5f7; border-left: 3px solid #fb7185; padding: 12px 16px; margin: 16px 0; color: #555; line-height: 1.6;">${opcoes.mensagem}</div>` : ''}
          ${config.textoApresentacao ? `<div style="color: #555; line-height: 1.6; margin: 16px 0;">${config.textoApresentacao}</div>` : ''}
          <div style="text-align: center; margin: 32px 0;">
            <a href="${linkPublico}" style="display: inline-block; background: #fb7185; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">Ver Proposta</a>
          </div>
          <p style="color: #777; font-size: 13px; line-height: 1.6;">Validade da proposta: <strong>${orc.validadeDias} dias</strong></p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px; text-align: center;">${empresaNome} &middot; ${new Date().getFullYear()}</p>
        </div>
      </body></html>
    `

    // Dispara e-mail só se houver destinatário. Sem destinatário, segue o
    // resto do fluxo (status + evento + return) sem chamar o emailService.
    if (emails.size > 0) {
      await this.emailService.sendMail({
        to: [...emails],
        subject: `Proposta Comercial #${String(orc.numero).padStart(4, '0')} - ${empresaNome}`,
        html,
      })
    }

    // Atualizar status para ENVIADO se ainda nao estiver
    if (orc.status !== 'ENVIADO') {
      await prisma.orcamento.update({ where: { id }, data: { status: 'ENVIADO' } })
    }

    const descricaoEvento = emails.size > 0
      ? `Orcamento enviado para: ${[...emails].join(', ')}`
      : 'Orcamento marcado como enviado (sem e-mail disparado)'
    await this.addEvento(id, userId, 'envio', null, null, descricaoEvento)

    return { ok: true, destinatarios: [...emails], linkPublico }
  }

  async reordenar(ids: string[]) {
    await Promise.all(ids.map((id, idx) =>
      prisma.orcamento.update({ where: { id }, data: { ordem: idx } })
    ))
    return { ok: true }
  }

  // ── Decisao do Cliente (publico) ──────────────────────────

  async registrarDecisao(token: string, decisao: { tipo: string; nome: string; cpf?: string; observacao?: string }) {
    const orc = await prisma.orcamento.findUnique({ where: { token } })
    if (!orc) throw new Error('Orcamento nao encontrado')
    if (orc.decisaoTipo) throw new Error('Decisao ja registrada')

    const novoStatus = decisao.tipo === 'APROVADO' ? 'APROVADO' : 'ENCERRADO'

    return prisma.orcamento.update({
      where: { token },
      data: {
        decisaoTipo: decisao.tipo,
        decisaoEm: new Date(),
        decisaoNome: decisao.nome,
        decisaoCpf: decisao.cpf || null,
        decisaoObs: decisao.observacao || null,
        status: novoStatus as any,
      },
    })
  }

  // ── Itens ─────────────────────────────────────────────────

  async addItem(input: CreateOrcamentoItemInput) {
    await this.assertEditable(input.orcamentoId)
    const item = await prisma.orcamentoItem.create({
      data: {
        orcamentoId: input.orcamentoId,
        tipo: input.tipo,
        descricao: input.descricao,
        quantidade: input.quantidade,
        valorUnitario: input.valorUnitario,
        catalogoId: input.catalogoId || null,
        catalogoTextoId: input.catalogoTextoId || null,
        situacao: input.situacao || 'A_FAZER',
      },
    })
    await this.recalcularTotais(input.orcamentoId)
    await this.emitItemEvent(input.orcamentoId)
    return item
  }

  async updateItem(id: string, data: UpdateOrcamentoItemInput) {
    const item = await prisma.orcamentoItem.findUnique({ where: { id }, select: { orcamentoId: true } })
    if (!item) throw new Error('Item não encontrado')
    await this.assertEditable(item.orcamentoId)
    const updated = await prisma.orcamentoItem.update({ where: { id }, data: data as any })
    await this.recalcularTotais(updated.orcamentoId)
    await this.emitItemEvent(updated.orcamentoId)
    return updated
  }

  async removeItem(id: string) {
    const item = await prisma.orcamentoItem.findUnique({ where: { id } })
    if (!item) throw new Error('Item nao encontrado')
    await this.assertEditable(item.orcamentoId)
    await prisma.orcamentoItem.delete({ where: { id } })
    await this.recalcularTotais(item.orcamentoId)
    await this.emitItemEvent(item.orcamentoId)
  }

  /** Helper — pega empresaId do orçamento e emite evento `itens`. */
  private async emitItemEvent(orcamentoId: string) {
    const orc = await prisma.orcamento.findUnique({
      where: { id: orcamentoId },
      select: { empresaId: true },
    }).catch(() => null)
    this.emitEvent('itens', { orcamentoId, empresaId: orc?.empresaId ?? null })
  }

  // ── Recalcular Totais ─────────────────────────────────────

  private async recalcularTotais(orcamentoId: string) {
    const orc = await prisma.orcamento.findUnique({ where: { id: orcamentoId }, include: { itens: true } })
    if (!orc) return

    let totalServicos = 0, totalTaxas = 0, totalDespesas = 0
    for (const item of orc.itens) {
      const subtotal = Number(item.quantidade) * Number(item.valorUnitario)
      if (item.tipo === 'SERVICO') totalServicos += subtotal
      else if (item.tipo === 'TAXA') totalTaxas += subtotal
      else if (item.tipo === 'DESPESA') totalDespesas += subtotal
    }

    const descontoPct = Number(orc.descontoPct || 0)
    const descontoFixo = Number(orc.descontoValor || 0)
    const descontoAplicado = Math.round((totalServicos * descontoPct / 100 + descontoFixo) * 100) / 100
    const totalGeral = Math.round((totalServicos + totalTaxas + totalDespesas - descontoAplicado) * 100) / 100

    await prisma.orcamento.update({
      where: { id: orcamentoId },
      data: {
        totalServicos: Math.round(totalServicos * 100) / 100,
        totalTaxas: Math.round(totalTaxas * 100) / 100,
        totalDespesas: Math.round(totalDespesas * 100) / 100,
        descontoAplicado,
        totalGeral: Math.max(0, totalGeral),
      },
    })
  }

  // ── Mensagens ─────────────────────────────────────────────

  async addMensagem(
    orcamentoId: string,
    userId: string,
    mensagem: string,
    opts?: { acessoUsuarios?: string[]; notificarUsuarios?: string[]; restritoFinanceiro?: boolean; parentId?: string },
  ) {
    const created = await prisma.orcamentoMensagem.create({
      data: {
        orcamentoId,
        userId,
        mensagem,
        acessoUsuarios: opts?.acessoUsuarios || [],
        restritoFinanceiro: opts?.restritoFinanceiro ?? false,
        parentId: opts?.parentId || null,
      },
    })

    // Notificacao opcional: envia email aos usuarios escolhidos com o conteudo da mensagem
    const ids = (opts?.notificarUsuarios || []).filter(Boolean)
    if (ids.length > 0) {
      // Fire-and-forget: nao bloqueia a criacao da mensagem se email falhar
      this.enviarNotificacaoMensagem(orcamentoId, mensagem, ids, userId).catch(e => {
        console.warn('[Orcamento] Falha ao notificar mensagem:', (e as Error).message)
      })
    }

    return created
  }

  /**
   * Envia o conteudo HTML da mensagem por email aos usuarios selecionados.
   * Usa o mesmo layout padrao dos demais emails do modulo (verde + branding da empresa).
   */
  private async enviarNotificacaoMensagem(orcamentoId: string, mensagemHtml: string, userIds: string[], autorId?: string) {
    const orc = await prisma.orcamento.findUnique({ where: { id: orcamentoId } })
    if (!orc) return

    const [destinatarios, autor, empresa, cliente] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      }),
      autorId
        ? prisma.user.findUnique({ where: { id: autorId }, select: { name: true } }).catch(() => null)
        : Promise.resolve(null),
      orc.empresaId
        ? prisma.empresa.findUnique({ where: { id: orc.empresaId }, select: { razaoSocial: true, nomeFantasia: true, logoUrl: true } }).catch(() => null)
        : Promise.resolve(null),
      orc.clienteId
        ? prisma.cliente.findUnique({ where: { id: orc.clienteId }, select: { razaoSocial: true } }).catch(() => null)
        : Promise.resolve(null),
    ])

    const emails = destinatarios.map(d => d.email).filter((e): e is string => !!e)
    if (emails.length === 0) return

    const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || 'Empresa'
    const clienteNome = cliente?.razaoSocial || 'Cliente'
    const numero = `#${String(orc.numero).padStart(4, '0')}`
    const autorNome = autor?.name || 'Sistema'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const linkInterno = `${baseUrl}/orcamentos/${orcamentoId}`

    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
        <strong>${autorNome}</strong> deixou uma nova mensagem no orçamento <strong>${numero}</strong> do cliente <strong>${clienteNome}</strong>:
      </p>
      <div style="margin:18px 0;padding:16px 18px;background:#f9fafb;border-left:4px solid #10b981;border-radius:6px;font-size:14px;line-height:1.6;color:#1f2937;">
        ${mensagemHtml}
      </div>
      <p style="margin:14px 0 0;font-size:13px;color:#6b7280;">Acesse o orçamento para responder ou acompanhar.</p>
    `

    const html = this.buildEmailLayout({
      empresaNome,
      logoUrl: empresa?.logoUrl,
      preheader: `Nova mensagem em ${numero} — ${clienteNome}`,
      heroAccent: '#10b981',
      heroTitle: 'Nova mensagem',
      heroSubtitle: `${numero} • ${clienteNome}`,
      bodyHtml,
      ctaLabel: 'Abrir orçamento',
      ctaUrl: linkInterno,
    })

    try {
      await this.emailService.sendMail({
        to: emails,
        subject: `Nova mensagem em ${numero} — ${clienteNome}`,
        html,
      })
      await this.addEvento(
        orcamentoId, autorId, 'notificacao_mensagem', null, null,
        `Mensagem notificada para ${emails.length} usuário(s): ${emails.join(', ')}`,
      )
    } catch (e) {
      console.warn('[Orcamento] Falha ao enviar notificacao de mensagem:', (e as Error).message)
    }
  }

  async updateMensagemAcesso(id: string, opts: { acessoUsuarios?: string[]; restritoFinanceiro?: boolean }) {
    return prisma.orcamentoMensagem.update({
      where: { id },
      data: {
        ...(opts.acessoUsuarios !== undefined ? { acessoUsuarios: opts.acessoUsuarios } : {}),
        ...(opts.restritoFinanceiro !== undefined ? { restritoFinanceiro: opts.restritoFinanceiro } : {}),
      },
    })
  }

  async editMensagem(id: string, mensagem: string, ctx: { userId?: string; isMaster?: boolean }) {
    const msg = await prisma.orcamentoMensagem.findUnique({ where: { id } })
    if (!msg) throw new Error('Mensagem não encontrada')
    // Apenas autor ou Master pode editar
    if (!ctx.isMaster && msg.userId !== ctx.userId) {
      throw new Error('Você só pode editar suas próprias mensagens')
    }
    return prisma.orcamentoMensagem.update({
      where: { id },
      data: { mensagem, editadoEm: new Date() },
    })
  }

  async deleteMensagem(id: string, ctx?: { userId?: string; isMaster?: boolean }) {
    if (ctx) {
      const msg = await prisma.orcamentoMensagem.findUnique({ where: { id } })
      if (!msg) throw new Error('Mensagem não encontrada')
      if (!ctx.isMaster && msg.userId !== ctx.userId) {
        throw new Error('Você só pode excluir suas próprias mensagens')
      }
    }
    return prisma.orcamentoMensagem.delete({ where: { id } })
  }

  /** Filtra mensagens conforme visibilidade do usuario corrente */
  filtrarMensagensVisiveis<T extends { userId: string | null; acessoUsuarios: string[]; restritoFinanceiro: boolean }>(
    mensagens: T[],
    userId?: string,
    isFinanceiro?: boolean,
    isMaster?: boolean,
  ): T[] {
    if (isMaster) return mensagens
    return mensagens.filter(m => {
      // Restrito financeiro: somente usuarios financeiros (ou autor) veem
      if (m.restritoFinanceiro && !isFinanceiro && m.userId !== userId) return false
      // Restrito por usuarios: somente quem esta na lista (ou autor) ve
      if (m.acessoUsuarios.length > 0 && userId && !m.acessoUsuarios.includes(userId) && m.userId !== userId) return false
      return true
    })
  }

  // ── Arquivos ──────────────────────────────────────────────

  async addArquivo(orcamentoId: string, data: { fileName: string; fileUrl: string; fileSize?: number; mimeType?: string }, userId?: string) {
    return prisma.orcamentoArquivo.create({
      data: { orcamentoId, fileName: data.fileName, fileUrl: data.fileUrl, fileSize: data.fileSize || null, mimeType: data.mimeType || null, userId: userId || null },
    })
  }

  async removeArquivo(id: string) {
    return prisma.orcamentoArquivo.delete({ where: { id } })
  }

  // ── Eventos (audit trail) ─────────────────────────────────

  private async addEvento(orcamentoId: string, userId: string | undefined | null, tipo: string, de: string | null, para: string | null, descricao: string) {
    return prisma.orcamentoEvento.create({
      data: { orcamentoId, userId: userId || null, tipo, de, para, descricao },
    })
  }

  // ── Catalogo de Servicos ──────────────────────────────────

  async listCatalogo(empresaId?: string, opts?: { somenteAtivos?: boolean; somenteDisponiveis?: boolean; tipoOrcamento?: string | null }) {
    // Catalogo unificado para itens de orcamento:
    //   tipo='SERVICO'  → vem do modelo Servico (novo, com workflow/etapas/SLA)
    //   tipo='TAXA' ou  → vem do ServicoCatalogo (legado, catalogo simples)
    //   tipo='DESPESA'
    // Ambas as fontes retornam o mesmo shape (id, nome, tipo, valorPadrao, ativo,
    // disponivelOrcamento, empresaId) para que o seletor do orcamento trate
    // uniformemente.
    //
    // tipoOrcamento filtra os Servicos pela flag recorrenteMensal:
    //   SERVICO_MENSAL  → so Servicos com recorrenteMensal=true (cobranca recorrente)
    //   SERVICO_EXTRA   → so Servicos com recorrenteMensal=false (pontuais)
    //   undefined       → todos os Servicos
    // TAXA e DESPESA nao tem o conceito de recorrencia e sao retornados em ambos os tipos.
    // Multi-tenant: aceita serviços da empresa do user E templates globais
    // (empresaId=null). Sem o OR, serviços de catálogo padrão do sistema
    // (Constituição de Empresa, etc) ficam invisíveis pra qualquer empresa.
    const baseWhere: any = empresaId
      ? { OR: [{ empresaId }, { empresaId: null }] }
      : {}
    const ativo = opts?.somenteAtivos !== false ? { ativo: true } : {}
    const disponivel = opts?.somenteDisponiveis ? { disponivelOrcamento: true } : {}
    // Antes filtrávamos `recorrenteMensal: true/false` baseado no tipo do
    // orçamento (#HLP0079) — mas isso escondia EXTRAS de orçamentos mensais e
    // vice-versa. Caso real: usuário tinha um orçamento MENSAL e queria
    // adicionar uma "ADESÃO COMPETE" (pontual/extra), mas o serviço não
    // aparecia no seletor. O filtro foi removido: ambos os tipos veem todos
    // os serviços disponíveis; o user decide o que adicionar.

    const [servicos, catalogos] = await Promise.all([
      prisma.servico.findMany({
        // Bloqueia serviços marcados como internos — eles têm execução exclusivamente
        // interna e não devem aparecer no catálogo de itens do orçamento.
        where: { ...baseWhere, ...ativo, ...disponivel, ehServicoInterno: false },
        select: { id: true, nome: true, valorPadrao: true, ativo: true, disponivelOrcamento: true, empresaId: true, categoria: true, recorrenteMensal: true },
        orderBy: { nome: 'asc' },
      }),
      prisma.servicoCatalogo.findMany({
        where: { ...baseWhere, ...ativo, ...disponivel, tipo: { in: ['TAXA', 'DESPESA'] } },
        orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      }),
    ])

    // Normaliza os Servicos para o shape do catalogo (com tipo sintético 'SERVICO')
    const servicosAsCatalogo = servicos.map(s => ({
      id: s.id,
      nome: s.nome,
      tipo: 'SERVICO' as const,
      valorPadrao: s.valorPadrao,
      textoPadrao: null as string | null,
      ativo: s.ativo,
      disponivelOrcamento: s.disponivelOrcamento,
      empresaId: s.empresaId,
      categoria: s.categoria,
      createdAt: null as Date | null,
    }))
    const catalogosNormalizados = catalogos.map(c => ({ ...c, categoria: null as string | null }))

    const items = [...servicosAsCatalogo, ...catalogosNormalizados]
    const ids = items.map(i => i.id)

    // Textos do registro de TODOS os itens (Serviço/Taxa/Despesa) — referência
    // "soft" por catalogoId (sem FK); valem para qualquer tipo.
    const textosRows = ids.length > 0
      ? await prisma.orcamentoCatalogoTexto.findMany({
          where: { catalogoId: { in: ids } },
          orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
        }).catch(() => [])
      : []
    const textosMap = new Map<string, typeof textosRows>()
    for (const t of textosRows) {
      const arr = textosMap.get(t.catalogoId) ?? []
      arr.push(t)
      textosMap.set(t.catalogoId, arr)
    }

    // Contagem de uso (referenciados em itens de orcamento)
    let usoMap = new Map<string, number>()
    if (ids.length > 0) {
      const usos = await prisma.orcamentoItem.groupBy({
        by: ['catalogoId'],
        where: { catalogoId: { in: ids } },
        _count: true,
      }).catch(() => [])
      usoMap = new Map(usos.map(u => [u.catalogoId!, u._count]))
    }

    return items.map(i => ({ ...i, textos: textosMap.get(i.id) ?? [], usoCount: usoMap.get(i.id) || 0 }))
  }

  async createCatalogo(data: { nome: string; tipo: string; valorPadrao?: number; textoPadrao?: string; disponivelOrcamento?: boolean }, empresaId?: string) {
    return prisma.servicoCatalogo.create({
      data: {
        nome: data.nome,
        tipo: data.tipo,
        valorPadrao: data.valorPadrao ?? null,
        textoPadrao: data.textoPadrao || null,
        disponivelOrcamento: data.disponivelOrcamento ?? true,
        empresaId: empresaId || null,
      },
    })
  }

  async updateCatalogo(id: string, data: { nome?: string; tipo?: string; valorPadrao?: number | null; textoPadrao?: string | null; ativo?: boolean; disponivelOrcamento?: boolean }) {
    // O item pode ser um ServicoCatalogo (Taxa/Despesa) ou um Servico (módulo
    // Serviços). Roteia pela origem. `tipo` não se aplica a Servico.
    const cat = await prisma.servicoCatalogo.findUnique({ where: { id }, select: { id: true } })
    if (cat) return prisma.servicoCatalogo.update({ where: { id }, data: data as any })
    const { tipo: _tipo, ...semTipo } = data
    return prisma.servico.update({ where: { id }, data: semTipo as any })
  }

  async deleteCatalogo(id: string) {
    // Limpa os textos do registro (referência soft, sem cascade no banco).
    await prisma.orcamentoCatalogoTexto.deleteMany({ where: { catalogoId: id } }).catch(() => {})
    const cat = await prisma.servicoCatalogo.findUnique({ where: { id }, select: { id: true } })
    const usos = await prisma.orcamentoItem.count({ where: { catalogoId: id } })
    if (cat) {
      if (usos === 0) return prisma.servicoCatalogo.delete({ where: { id } })
      return prisma.servicoCatalogo.update({ where: { id }, data: { ativo: false } })
    }
    // Serviço (módulo Serviços): nunca excluir aqui — apenas inativa no catálogo.
    return prisma.servico.update({ where: { id }, data: { ativo: false } })
  }

  // ── Textos do registro do catalogo (titulo + descricao + valor) ──
  // Cada item de catalogo pode ter varios textos; ao adicionar o item num
  // orcamento o usuario escolhe qual texto vira o "texto padrao daquele item".

  async listCatalogoTextos(catalogoId: string) {
    return prisma.orcamentoCatalogoTexto.findMany({
      where: { catalogoId },
      orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
    })
  }

  async addCatalogoTexto(data: { catalogoId: string; titulo: string; descricao?: string; valor?: number }) {
    // Textos valem para QUALQUER item do catálogo (Serviço, Taxa ou Despesa). O
    // catalogo_id é referência soft, então validamos nas duas origens p/ dar erro
    // claro caso o item não exista (em vez de criar texto órfão).
    const [servico, catalogo] = await Promise.all([
      prisma.servico.findUnique({ where: { id: data.catalogoId }, select: { id: true } }),
      prisma.servicoCatalogo.findUnique({ where: { id: data.catalogoId }, select: { id: true } }),
    ])
    if (!servico && !catalogo) throw new Error('Item de catálogo inválido para o texto.')
    // ordem = proximo na sequencia
    const count = await prisma.orcamentoCatalogoTexto.count({ where: { catalogoId: data.catalogoId } })
    return prisma.orcamentoCatalogoTexto.create({
      data: {
        catalogoId: data.catalogoId,
        titulo: data.titulo,
        descricao: data.descricao ?? null,
        valor: data.valor ?? null,
        ordem: count,
      },
    })
  }

  async updateCatalogoTexto(id: string, data: { titulo?: string; descricao?: string | null; valor?: number | null }) {
    return prisma.orcamentoCatalogoTexto.update({ where: { id }, data: data as any })
  }

  async removeCatalogoTexto(id: string) {
    return prisma.orcamentoCatalogoTexto.delete({ where: { id } })
  }

  // ── Estatisticas ──────────────────────────────────────────

  async getStats(empresaId?: string) {
    const where: any = { arquivado: false }
    if (empresaId) where.empresaId = empresaId

    const [total, porStatus, valorTotal] = await Promise.all([
      prisma.orcamento.count({ where }),
      prisma.orcamento.groupBy({ by: ['status'], where, _count: true, _sum: { totalGeral: true } }),
      prisma.orcamento.aggregate({ where, _sum: { totalGeral: true } }),
    ])

    return { total, porStatus, valorTotal: Number(valorTotal._sum.totalGeral || 0) }
  }

  /**
   * Stats compactas pro widget do dashboard. Retorna contagens-chave e
   * valores em uma única chamada otimizada. Faz a checagem de cargo
   * (gestor+) — se o user não for privilegiado, retorna { permitido: false }
   * e o widget mostra empty state com mensagem.
   */
  async getDashboardStats(userId: string, empresaId?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, profile: true, isMaster: true, isEmpresaMaster: true },
    })
    if (!user) return { permitido: false as const }

    const isPriv =
      user.isMaster
      || user.isEmpresaMaster
      || ['GESTOR', 'COORDENADOR', 'DIRETOR'].includes(user.role as string)
      || ['GERENTE', 'ADMIN'].includes(user.profile as unknown as string)
    if (!isPriv) return { permitido: false as const }

    // Config de prazos pra detectar "atrasados" — espelha reportAtrasados
    const config = await this.getConfig(empresaId).catch(() => null)
    const diasEnvio = config?.diasEnviar ?? 7
    const diasAprovacao = config?.diasAprovar ?? 15

    const cutoffEnvio = new Date(Date.now() - diasEnvio * 86400000)
    const cutoffAprovacao = new Date(Date.now() - diasAprovacao * 86400000)

    const baseWhere: any = { arquivado: false }
    if (empresaId) baseWhere.empresaId = empresaId

    const [
      aguardandoEnvio,
      aguardandoAprovacao,
      atrasadosEnvio,
      atrasadosAprovacao,
      valoresAtivos,
    ] = await Promise.all([
      prisma.orcamento.count({ where: { ...baseWhere, status: { in: ['NOVO', 'A_ENVIAR'] } } }),
      prisma.orcamento.count({ where: { ...baseWhere, status: 'ENVIADO' } }),
      prisma.orcamento.count({
        where: { ...baseWhere, status: { in: ['NOVO', 'A_ENVIAR'] }, createdAt: { lt: cutoffEnvio } },
      }),
      prisma.orcamento.count({
        where: { ...baseWhere, status: 'ENVIADO', dtEnviado: { lt: cutoffAprovacao } },
      }),
      prisma.orcamento.aggregate({
        where: { ...baseWhere, status: { in: ['NOVO', 'A_ENVIAR', 'ENVIADO'] } },
        _sum: { totalGeral: true },
      }),
    ])

    // Vencendo em até 7 dias: validade = (dtEnviado ?? createdAt) + validadeDias.
    // Como validadeDias é dinâmico, precisamos buscar e calcular no JS.
    const horizonte = new Date(Date.now() + 7 * 86400000)
    const vivos = await prisma.orcamento.findMany({
      where: { ...baseWhere, status: { in: ['NOVO', 'A_ENVIAR', 'ENVIADO'] } },
      select: { id: true, validadeDias: true, dtEnviado: true, createdAt: true },
    })
    const agora = new Date()
    let vencendo7d = 0
    for (const o of vivos) {
      const base = o.dtEnviado ?? o.createdAt
      const venc = new Date(base)
      venc.setDate(venc.getDate() + o.validadeDias)
      if (venc >= agora && venc <= horizonte) vencendo7d++
    }

    return {
      permitido: true as const,
      aguardandoEnvio,
      aguardandoAprovacao,
      atrasados: atrasadosEnvio + atrasadosAprovacao,
      vencendo7d,
      valorPendente: Number(valoresAtivos._sum.totalGeral || 0),
    }
  }

  // ── Relatorios ─────────────────────────────────────────────

  /** Funil + visao geral por status no periodo */
  async reportFunil(empresaId?: string, dias?: number) {
    const where: any = { arquivado: false }
    if (empresaId) where.empresaId = empresaId
    if (dias) where.createdAt = { gte: new Date(Date.now() - dias * 86400000) }

    const grouped = await prisma.orcamento.groupBy({
      by: ['status'],
      where,
      _count: true,
      _sum: { totalGeral: true },
    })

    const ordemStatus = ['NOVO', 'A_ENVIAR', 'ENVIADO', 'APROVADO', 'LIBERADO', 'FINALIZADO', 'ENCERRADO']
    const map = new Map(grouped.map(g => [g.status, g]))
    const funil = ordemStatus.map(st => {
      const g = map.get(st as any)
      return { status: st, count: g?._count ?? 0, valor: Number(g?._sum?.totalGeral ?? 0) }
    })

    const total = funil.reduce((s, f) => s + f.count, 0)
    const valorTotal = funil.reduce((s, f) => s + f.valor, 0)
    const aprovados = funil.find(f => f.status === 'APROVADO')?.count ?? 0
    const liberados = funil.find(f => f.status === 'LIBERADO')?.count ?? 0
    const finalizados = funil.find(f => f.status === 'FINALIZADO')?.count ?? 0
    const ganhos = aprovados + liberados + finalizados
    const taxaConversao = total > 0 ? Math.round((ganhos / total) * 100) : 0

    return { funil, total, valorTotal, taxaConversao }
  }

  /**
   * Indicadores de Orçamentos (recriação do dashboard legado): KPIs por estágio
   * × tipo (mensal/extra), donuts, listas (aprovados/liberados/reprovados) e
   * série de 12 meses. Período = [dataInicio, dataFim] (default mês anterior).
   */
  async reportIndicadores(empresaId: string | undefined, dataInicio: string, dataFim: string) {
    const ini = new Date(`${dataInicio}T00:00:00`)
    const fim = new Date(`${dataFim}T23:59:59.999`)
    const base: Prisma.OrcamentoWhereInput = { arquivado: false, ...(empresaId ? { empresaId } : {}) }
    const periodo = (campo: 'dtEnviado' | 'dtAprovado' | 'dtLiberado' | 'dtCancelado'): Prisma.OrcamentoWhereInput =>
      ({ ...base, [campo]: { gte: ini, lte: fim } })

    // Classificação mensal/extra pela natureza do SERVIÇO (não pelo campo tipo
    // estático, que não é atualizado pela transição extra→mensal do fluxo).
    // Regra: orçamento com ≥1 item SERVICO de um Servico recorrenteMensal=true
    // conta como MENSAL; se não tiver itens de serviço, usa o campo `tipo`.
    const recorrentes = await prisma.servico.findMany({
      where: { recorrenteMensal: true, ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}) },
      select: { id: true },
    })
    const recorrenteSet = new Set(recorrentes.map(s => s.id))
    const ehMensal = (itens: { tipo: string; catalogoId: string | null }[], tipoFallback: string | null) => {
      const servicos = itens.filter(it => it.tipo === 'SERVICO' && it.catalogoId)
      if (servicos.length === 0) return tipoFallback === 'SERVICO_MENSAL'
      return servicos.some(it => recorrenteSet.has(it.catalogoId!))
    }

    const stageSelect = {
      id: true, numero: true, tipo: true, totalGeral: true, clienteId: true,
      itens: { select: { descricao: true, tipo: true, catalogoId: true }, orderBy: { createdAt: 'asc' } },
    } as const
    const [oEnviados, oAprovados, oLiberados, oReprovados] = await Promise.all([
      prisma.orcamento.findMany({ where: periodo('dtEnviado'), select: { ...stageSelect, dtEnviado: true } }),
      prisma.orcamento.findMany({ where: periodo('dtAprovado'), select: { ...stageSelect, dtAprovado: true } }),
      prisma.orcamento.findMany({ where: { ...periodo('dtLiberado'), status: 'LIBERADO' }, select: { ...stageSelect, dtLiberado: true } }),
      prisma.orcamento.findMany({ where: periodo('dtCancelado'), select: { ...stageSelect, dtCancelado: true } }),
    ])

    type Row = { id: string; numero: number; tipo: string | null; totalGeral: Prisma.Decimal; clienteId: string | null; itens: { descricao: string; tipo: string; catalogoId: string | null }[] }
    const agg = (rows: Row[]) => {
      const m = { count: 0, valor: 0 }, e = { count: 0, valor: 0 }
      for (const o of rows) {
        const v = Number(o.totalGeral)
        if (ehMensal(o.itens, o.tipo)) { m.count++; m.valor += v } else { e.count++; e.valor += v }
      }
      return { mensal: m, extra: e }
    }
    const env = agg(oEnviados), apr = agg(oAprovados), lib = agg(oLiberados)
    const reprovadosValor = oReprovados.reduce((s, o) => s + Number(o.totalGeral), 0)

    const kpis = {
      enviadosMensal: env.mensal,
      enviadosExtra: env.extra,
      aprovadosMensal: apr.mensal,
      aprovadosExtra: apr.extra,
      conversaoMensal: env.mensal.count > 0 ? Math.round((apr.mensal.count / env.mensal.count) * 100) : 0,
      conversaoExtra: env.extra.count > 0 ? Math.round((apr.extra.count / env.extra.count) * 100) : 0,
      reprovados: { count: oReprovados.length, valor: reprovadosValor },
      totalEnviados: { count: env.mensal.count + env.extra.count, valor: env.mensal.valor + env.extra.valor },
      totalAprovados: { count: apr.mensal.count + apr.extra.count, valor: apr.mensal.valor + apr.extra.valor },
    }

    const donutEstagios = { aprovados: apr.mensal.count + apr.extra.count, liberados: lib.mensal.count + lib.extra.count, reprovados: oReprovados.length }
    const donutTipo = { mensal: apr.mensal.count, extra: apr.extra.count }

    // Listas — cliente resolvido por id (Orcamento não tem relação `cliente`)
    const clienteIds = [...new Set([...oAprovados, ...oLiberados, ...oReprovados].map(o => o.clienteId).filter(Boolean))] as string[]
    const clientes = clienteIds.length
      ? await prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, razaoSocial: true, nomeFantasia: true } }).catch(() => [])
      : []
    const clienteMap = new Map(clientes.map(c => [c.id, c]))

    const mapItem = (o: Row, data: Date | null | undefined) => {
      const c = o.clienteId ? clienteMap.get(o.clienteId) : null
      const mensal = ehMensal(o.itens, o.tipo)
      const primeiro = o.itens.find(it => it.tipo === 'SERVICO') ?? o.itens[0]
      return {
        id: o.id,
        numero: o.numero,
        data: data ? data.toISOString() : null,
        cliente: c?.razaoSocial || c?.nomeFantasia || '—',
        tipo: mensal ? 'Serviço mensal' : 'Serviço extra',
        tipoKey: mensal ? 'SERVICO_MENSAL' : 'SERVICO_EXTRA',
        primeiroItem: primeiro?.descricao ? primeiro.descricao.toUpperCase() : '',
        qtdExtra: o.itens.length > 1 ? o.itens.length - 1 : 0,
        valor: Number(o.totalGeral),
      }
    }
    const ordenar = (rows: ReturnType<typeof mapItem>[]) =>
      rows.sort((a, b) => (a.tipoKey === b.tipoKey ? a.numero - b.numero : a.tipoKey === 'SERVICO_MENSAL' ? -1 : 1))
    const listas = {
      aprovados: ordenar(oAprovados.map(o => mapItem(o, o.dtAprovado))),
      liberados: ordenar(oLiberados.map(o => mapItem(o, o.dtLiberado))),
      reprovados: ordenar(oReprovados.map(o => mapItem(o, o.dtCancelado))),
    }

    // Série dos últimos 12 meses (por createdAt), classificada pelos serviços
    const desde = new Date()
    desde.setMonth(desde.getMonth() - 11)
    desde.setDate(1)
    desde.setHours(0, 0, 0, 0)
    const ult12 = await prisma.orcamento.findMany({
      where: { ...base, createdAt: { gte: desde } },
      select: { createdAt: true, tipo: true, itens: { select: { tipo: true, catalogoId: true } } },
    })
    const buckets: { mes: string; mensal: number; extra: number }[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(desde)
      d.setMonth(desde.getMonth() + i)
      buckets.push({ mes: `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`, mensal: 0, extra: 0 })
    }
    const idxMes = new Map(buckets.map((b, i) => [b.mes, i]))
    for (const o of ult12) {
      const key = `${String(o.createdAt.getMonth() + 1).padStart(2, '0')}-${o.createdAt.getFullYear()}`
      const i = idxMes.get(key)
      if (i === undefined) continue
      if (ehMensal(o.itens, o.tipo)) buckets[i]!.mensal++
      else buckets[i]!.extra++
    }

    return { periodo: { dataInicio, dataFim }, kpis, donutEstagios, donutTipo, listas, serie12m: buckets }
  }

  /** Atrasados — envio e aprovacao alem do prazo configurado */
  async reportAtrasados(empresaId?: string) {
    const where: any = { arquivado: false }
    if (empresaId) where.empresaId = empresaId

    // Buscar config para obter prazos
    const config = await this.getConfig(empresaId)
    const diasEnvio = config.diasEnviar || 7
    const diasAprovacao = config.diasAprovar || 15

    const cutoffEnvio = new Date(Date.now() - diasEnvio * 86400000)
    const cutoffAprovacao = new Date(Date.now() - diasAprovacao * 86400000)

    const [aguardandoEnvio, aguardandoAprovacao] = await Promise.all([
      prisma.orcamento.findMany({
        where: { ...where, status: { in: ['NOVO', 'A_ENVIAR'] }, createdAt: { lt: cutoffEnvio } },
        select: { id: true, numero: true, status: true, totalGeral: true, createdAt: true, clienteId: true, responsavelId: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.orcamento.findMany({
        where: { ...where, status: 'ENVIADO', dtEnviado: { lt: cutoffAprovacao } },
        select: { id: true, numero: true, status: true, totalGeral: true, createdAt: true, dtEnviado: true, clienteId: true, responsavelId: true },
        orderBy: { dtEnviado: 'asc' },
      }),
    ])

    // Enriquecer com nome do cliente
    const clienteIds = [...new Set([...aguardandoEnvio, ...aguardandoAprovacao].map(o => o.clienteId).filter(Boolean))] as string[]
    const clientes = clienteIds.length > 0
      ? await prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, razaoSocial: true } }).catch(() => [])
      : []
    const clienteMap = new Map(clientes.map(c => [c.id, c]))

    const enriquecer = (lista: any[]) => lista.map(o => ({
      ...o,
      totalGeral: Number(o.totalGeral || 0),
      cliente: o.clienteId ? clienteMap.get(o.clienteId) || null : null,
      diasAtraso: o.dtEnviado
        ? Math.floor((Date.now() - new Date(o.dtEnviado).getTime()) / 86400000) - diasAprovacao
        : Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000) - diasEnvio,
    }))

    return {
      aguardandoEnvio: enriquecer(aguardandoEnvio),
      aguardandoAprovacao: enriquecer(aguardandoAprovacao),
      diasEnvioConfig: diasEnvio,
      diasAprovacaoConfig: diasAprovacao,
    }
  }

  /** Desempenho por responsavel */
  async reportDesempenho(empresaId?: string, dias?: number) {
    const where: any = { arquivado: false }
    if (empresaId) where.empresaId = empresaId
    if (dias) where.createdAt = { gte: new Date(Date.now() - dias * 86400000) }

    const orcamentos = await prisma.orcamento.findMany({
      where,
      select: { responsavelId: true, status: true, totalGeral: true },
    })

    const byResp = new Map<string, { total: number; aprovados: number; encerrados: number; valor: number; valorAprovado: number }>()
    for (const o of orcamentos) {
      const rid = o.responsavelId || '__sem_responsavel__'
      if (!byResp.has(rid)) byResp.set(rid, { total: 0, aprovados: 0, encerrados: 0, valor: 0, valorAprovado: 0 })
      const e = byResp.get(rid)!
      e.total++
      e.valor += Number(o.totalGeral || 0)
      if (['APROVADO', 'LIBERADO', 'FINALIZADO'].includes(o.status)) {
        e.aprovados++
        e.valorAprovado += Number(o.totalGeral || 0)
      }
      if (o.status === 'ENCERRADO') e.encerrados++
    }

    const userIds = [...byResp.keys()].filter(id => id !== '__sem_responsavel__')
    const users = userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } }).catch(() => [])
      : []
    const userMap = new Map(users.map(u => [u.id, u]))

    return [...byResp.entries()].map(([id, data]) => ({
      responsavelId: id === '__sem_responsavel__' ? null : id,
      nome: id === '__sem_responsavel__' ? 'Sem responsavel' : (userMap.get(id)?.name ?? 'Desconhecido'),
      image: id === '__sem_responsavel__' ? null : (userMap.get(id)?.image ?? null),
      ...data,
      taxaAprovacao: data.total > 0 ? Math.round((data.aprovados / data.total) * 100) : 0,
    })).sort((a, b) => b.valorAprovado - a.valorAprovado)
  }

  /** Tempo medio entre transicoes de status */
  async reportTempoCiclo(empresaId?: string, dias?: number) {
    const where: any = { arquivado: false }
    if (empresaId) where.empresaId = empresaId
    if (dias) where.createdAt = { gte: new Date(Date.now() - dias * 86400000) }

    const orcs = await prisma.orcamento.findMany({
      where,
      select: { createdAt: true, dtEnviado: true, dtAprovado: true, dtLiberado: true, dtFinalizado: true },
    })

    const calcMedia = (datas: Array<{ a: Date | null; b: Date | null }>) => {
      const validos = datas.filter(d => d.a && d.b).map(d => (d.b!.getTime() - d.a!.getTime()) / 86400000)
      if (validos.length === 0) return { dias: 0, amostra: 0 }
      const soma = validos.reduce((s, v) => s + v, 0)
      return { dias: Math.round((soma / validos.length) * 10) / 10, amostra: validos.length }
    }

    return {
      criacaoAteEnvio: calcMedia(orcs.map(o => ({ a: o.createdAt, b: o.dtEnviado }))),
      envioAteAprovacao: calcMedia(orcs.map(o => ({ a: o.dtEnviado, b: o.dtAprovado }))),
      aprovacaoAteLiberacao: calcMedia(orcs.map(o => ({ a: o.dtAprovado, b: o.dtLiberado }))),
      liberacaoAteFinalizacao: calcMedia(orcs.map(o => ({ a: o.dtLiberado, b: o.dtFinalizado }))),
      criacaoAteFinalizacao: calcMedia(orcs.map(o => ({ a: o.createdAt, b: o.dtFinalizado }))),
    }
  }

  /** Distribuicao por area */
  async reportPorArea(empresaId?: string, dias?: number) {
    const where: any = { arquivado: false }
    if (empresaId) where.empresaId = empresaId
    if (dias) where.createdAt = { gte: new Date(Date.now() - dias * 86400000) }

    const orcs = await prisma.orcamento.findMany({
      where,
      select: { area: true, status: true, totalGeral: true },
    })

    const byArea = new Map<string, { count: number; valor: number; aprovados: number }>()
    for (const o of orcs) {
      const key = o.area?.trim() || 'Nao informada'
      if (!byArea.has(key)) byArea.set(key, { count: 0, valor: 0, aprovados: 0 })
      const e = byArea.get(key)!
      e.count++
      e.valor += Number(o.totalGeral || 0)
      if (['APROVADO', 'LIBERADO', 'FINALIZADO'].includes(o.status)) e.aprovados++
    }

    return [...byArea.entries()].map(([area, data]) => ({
      area,
      ...data,
      taxaAprovacao: data.count > 0 ? Math.round((data.aprovados / data.count) * 100) : 0,
    })).sort((a, b) => b.count - a.count)
  }

  // ── Configuracoes ─────────────────────────────────────────

  async getConfig(empresaId?: string) {
    // Carrega config global (empresa_id IS NULL) primeiro, depois sobrepõe com config
    // específica da empresa (se houver). Isso evita perder a config quando o
    // master configurou no escopo global mas o orçamento é criado por user de empresa.
    const rowsGlobal = await prisma.$queryRawUnsafe<Array<{ valor: string }>>(
      `SELECT valor FROM opcoes_cadastro WHERE tipo = 'ORCAMENTO_CONFIG' AND empresa_id IS NULL`
    ).catch(() => [])
    const rowsEmpresa = empresaId
      ? await prisma.$queryRawUnsafe<Array<{ valor: string }>>(
          `SELECT valor FROM opcoes_cadastro WHERE tipo = 'ORCAMENTO_CONFIG' AND empresa_id = '${empresaId}'`
        ).catch(() => [])
      : []

    const config: Record<string, string> = {}
    // Ordem importa: global primeiro, empresa por cima (override)
    for (const r of [...rowsGlobal, ...rowsEmpresa]) {
      const idx = r.valor.indexOf('=')
      if (idx > 0) config[r.valor.slice(0, idx)] = r.valor.slice(idx + 1)
    }

    return {
      solicitanteResponsavel: config.solicitante_responsavel === '1',
      diasEnviar: parseInt(config.dias_enviar || '7'),
      diasAprovar: parseInt(config.dias_aprovar || '15'),
      diasRevisar: parseInt(config.dias_revisar || '7'),
      validadeDias: parseInt(config.validade_dias || '90'),
      numeroInicial: parseInt(config.numero_inicial || '1'),
      emailNovo: config.email_novo || '',
      emailComercial: config.email_comercial || '',
      emailFinanceiro: config.email_financeiro || '',
      textoPadrao: config.texto_padrao || '',
      textoApresentacao: config.texto_apresentacao || '',
      headerCover: config.header_cover || '',
    }
  }

  // Define a imagem de fundo do header de orcamentos. URL vazia/null limpa.
  // Restricao a master e aplicada no router (orcamento.router.ts).
  async setHeaderCover(url: string | null, empresaId?: string) {
    await this.saveConfig({ header_cover: url || '' }, empresaId)
    return { ok: true }
  }

  async saveConfig(data: Record<string, string>, empresaId?: string) {
    for (const [key, value] of Object.entries(data)) {
      const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM opcoes_cadastro WHERE tipo = 'ORCAMENTO_CONFIG' AND valor LIKE '${key}=%' ${empresaId ? `AND empresa_id = '${empresaId}'` : 'AND empresa_id IS NULL'} LIMIT 1`
      ).catch(() => [])
      if (existing[0]) {
        await prisma.$executeRawUnsafe(`UPDATE opcoes_cadastro SET valor = $1 WHERE id = $2`, `${key}=${value}`, existing[0].id)
      } else {
        await prisma.$executeRawUnsafe(
          `INSERT INTO opcoes_cadastro (id, tipo, valor, empresa_id) VALUES (gen_random_uuid(), 'ORCAMENTO_CONFIG', $1, $2)`,
          `${key}=${value}`, empresaId || null
        )
      }
    }
    return { ok: true }
  }

  // ============================================================
  // Notificações de orçamentos atrasados
  // ============================================================
  /**
   * Varre orçamentos em status pendente cujo tempo no status atual excedeu
   * a configuração da empresa (`dias_enviar`, `dias_aprovar`, etc.) e cria
   * uma notificação no sino do responsável.
   *
   * Estratégia de deduplicação: se já existe notificação não-lida com origem
   * 'orcamentos' apontando para o mesmo orçamento, atualiza ela em vez de
   * criar nova (evita poluir o sino com múltiplas entradas do mesmo registro).
   *
   * Designed para ser chamado por cron diário (ex: 08:00). Pode ser chamado
   * manualmente via endpoint admin para testes.
   */
  async notificarOrcamentosAtrasados(opts?: { empresaId?: string }): Promise<{ verificados: number; notificados: number }> {
    const config = await this.getConfig(opts?.empresaId)
    const agora = Date.now()

    // Carrega orçamentos em status pendente que possam estar atrasados
    const where: any = {
      arquivado: false,
      status: { in: ['NOVO', 'A_ENVIAR', 'ENVIADO', 'APROVADO'] },
    }
    if (opts?.empresaId) where.empresaId = opts.empresaId

    const orcs = await prisma.orcamento.findMany({
      where,
      select: {
        id: true, numero: true, status: true, responsavelId: true, solicitanteId: true,
        clienteId: true, empresaId: true,
        createdAt: true, dtEnviado: true, dtAprovado: true,
      },
    })

    // Calcula referência de "início do estado atual" e limites
    type Atraso = {
      orc: typeof orcs[number]
      diasAtraso: number
      stage: string
      label: string
    }
    const atrasados: Atraso[] = []

    for (const o of orcs) {
      let inicioEstado: Date | null = null
      let limiteDias = 0
      let stage = ''
      let label = ''

      if (o.status === 'NOVO' || o.status === 'A_ENVIAR') {
        inicioEstado = o.createdAt
        limiteDias = config.diasEnviar
        stage = 'envio'
        label = 'aguardando envio'
      } else if (o.status === 'ENVIADO') {
        inicioEstado = o.dtEnviado ?? o.createdAt
        limiteDias = config.diasAprovar
        stage = 'aprovacao'
        label = 'aguardando decisão do cliente'
      } else if (o.status === 'APROVADO') {
        inicioEstado = o.dtAprovado ?? o.createdAt
        limiteDias = config.diasRevisar
        stage = 'liberacao'
        label = 'aprovado, aguardando liberação'
      }

      if (!inicioEstado || limiteDias <= 0) continue
      const diasNoEstado = Math.floor((agora - inicioEstado.getTime()) / 86400000)
      if (diasNoEstado <= limiteDias) continue

      atrasados.push({
        orc: o,
        diasAtraso: diasNoEstado - limiteDias,
        stage,
        label,
      })
    }

    if (atrasados.length === 0) {
      return { verificados: orcs.length, notificados: 0 }
    }

    // Carrega clientes para nomes amigáveis
    const clienteIds = Array.from(new Set(atrasados.map(a => a.orc.clienteId).filter((c): c is string => !!c)))
    const clientesList = clienteIds.length > 0
      ? await prisma.cliente.findMany({
          where: { id: { in: clienteIds } },
          select: { id: true, razaoSocial: true },
        })
      : []
    const clienteMap = new Map(clientesList.map(c => [c.id, c.razaoSocial]))

    let notificados = 0
    for (const a of atrasados) {
      const link = `/orcamentos/${a.orc.id}`
      const clienteNome = a.orc.clienteId ? clienteMap.get(a.orc.clienteId) ?? 'cliente' : 'sem cliente'
      const titulo = `Orçamento #${a.orc.numero} atrasado`
      const mensagem = `${clienteNome} — ${a.label} há ${a.diasAtraso} dia${a.diasAtraso > 1 ? 's' : ''} além do prazo.`
      // Destinatários: responsavel preferencial; fallback para solicitante
      const destinatariosIds = Array.from(new Set([
        a.orc.responsavelId,
        a.orc.solicitanteId,
      ].filter((u): u is string => !!u)))
      if (destinatariosIds.length === 0) continue

      for (const userId of destinatariosIds) {
        // Dedupe: procura notificação não-lida do mesmo orçamento (mesmo link)
        const existente = await prisma.notification.findFirst({
          where: { userId, link, lida: false, origem: 'orcamentos' },
          select: { id: true },
        })
        if (existente) {
          // Atualiza mensagem e timestamp pra "subir" no topo do sino
          await prisma.notification.update({
            where: { id: existente.id },
            data: { titulo, mensagem, tipo: 'warning', createdAt: new Date() },
          }).catch(() => null)
        } else {
          await prisma.notification.create({
            data: {
              userId,
              titulo,
              mensagem,
              tipo: 'warning',
              link,
              origem: 'orcamentos',
              empresaId: a.orc.empresaId,
            },
          }).catch(() => null)
        }
        notificados++
      }
    }

    return { verificados: orcs.length, notificados }
  }

  // ============================================================
  // Histórico do LEGADO (orcamento_legado*) — SÓ leitura. NÃO são orçamentos
  // válidos: ficam em tabelas separadas e só aparecem como histórico no detalhe
  // do orçamento atual e no cadastro do cliente. Lido via SQL raw (client local
  // pode estar desatualizado pelo lock de DLL; tabelas existem no schema/prod).
  // ============================================================
  async listLegadoPorCliente(clienteId: string) {
    if (!clienteId) return []
    const orcs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, legacy_id AS "legacyId", numero, status, tipo, contato, contato_email AS "contatoEmail",
              validade_dias AS "validadeDias", desconto, valor_desconto AS "valorDesconto", valor_total AS "valorTotal",
              descricao, decisao_tipo AS "decisaoTipo", decisao_nome AS "decisaoNome", decisao_obs AS "decisaoObs",
              decisao_em AS "decisaoEm", csat_obs AS "csatObs",
              dt_novo AS "dtNovo", dt_enviado AS "dtEnviado", dt_aprovado AS "dtAprovado", dt_liberado AS "dtLiberado",
              dt_finalizado AS "dtFinalizado", dt_encerrado AS "dtEncerrado", dt_cancelado AS "dtCancelado"
         FROM orcamento_legado WHERE cliente_id = $1 ORDER BY numero DESC`, clienteId,
    ).catch(() => [] as any[])
    if (orcs.length === 0) return []
    const ids = orcs.map(o => o.id)
    const inList = ids.map((_, i) => `$${i + 1}`).join(',')
    const [itens, msgs, evs] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`SELECT orcamento_id AS "orcamentoId", descricao, tipo, quantidade, valor_unitario AS "valorUnitario" FROM orcamento_legado_item WHERE orcamento_id IN (${inList}) ORDER BY ordem ASC`, ...ids).catch(() => [] as any[]),
      prisma.$queryRawUnsafe<any[]>(`SELECT orcamento_id AS "orcamentoId", conteudo, data FROM orcamento_legado_mensagem WHERE orcamento_id IN (${inList}) ORDER BY data ASC`, ...ids).catch(() => [] as any[]),
      prisma.$queryRawUnsafe<any[]>(`SELECT orcamento_id AS "orcamentoId", evento, data FROM orcamento_legado_evento WHERE orcamento_id IN (${inList}) ORDER BY data ASC`, ...ids).catch(() => [] as any[]),
    ])
    const by = (arr: any[]) => { const m = new Map<string, any[]>(); for (const x of arr) { const k = x.orcamentoId as string; if (!m.has(k)) m.set(k, []); m.get(k)!.push(x) } return m }
    const mi = by(itens), mm = by(msgs), me = by(evs)
    return orcs.map(o => ({ ...o, itens: mi.get(o.id) || [], mensagens: mm.get(o.id) || [], eventos: me.get(o.id) || [] }))
  }

  // ── Assistente de IA — chat persistido por orçamento + usuário ──────────
  async listIaMensagens(orcamentoId: string, userId?: string) {
    return prisma.$queryRawUnsafe<{ role: string; conteudo: string }[]>(
      `SELECT role, conteudo FROM orcamento_ia_mensagem
        WHERE orcamento_id = $1 AND user_id IS NOT DISTINCT FROM $2
        ORDER BY created_at ASC`,
      orcamentoId, userId ?? null,
    ).catch(() => [] as { role: string; conteudo: string }[])
  }

  async salvarIaMensagens(orcamentoId: string, userId: string | undefined, msgs: { role: string; conteudo: string }[]) {
    for (const m of msgs) {
      if (!m.conteudo?.trim()) continue
      await prisma.$executeRawUnsafe(
        `INSERT INTO orcamento_ia_mensagem (id, orcamento_id, user_id, role, conteudo)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
        orcamentoId, userId ?? null, m.role, m.conteudo,
      ).catch(() => {})
    }
  }

  async limparIaChat(orcamentoId: string, userId?: string) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM orcamento_ia_mensagem WHERE orcamento_id = $1 AND user_id IS NOT DISTINCT FROM $2`,
      orcamentoId, userId ?? null,
    ).catch(() => {})
    return { ok: true }
  }

  // ── Sugestões (ações rápidas) do assistente de IA — editáveis em Configurações ──
  async listIaSugestoes(empresaId?: string) {
    return prisma.$queryRawUnsafe<{ id: string; label: string; prompt: string; ordem: number }[]>(
      `SELECT id, label, prompt, ordem FROM orcamento_ia_sugestao
        WHERE empresa_id IS NOT DISTINCT FROM $1
        ORDER BY ordem ASC, created_at ASC`,
      empresaId ?? null,
    ).catch(() => [] as { id: string; label: string; prompt: string; ordem: number }[])
  }

  async saveIaSugestoes(empresaId: string | undefined, items: { label: string; prompt: string }[]) {
    // Lista pequena e reordenável → replace-all por empresa, mantendo a ordem recebida.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM orcamento_ia_sugestao WHERE empresa_id IS NOT DISTINCT FROM $1`, empresaId ?? null)
      for (let i = 0; i < items.length; i++) {
        const label = (items[i]?.label ?? '').trim()
        const prompt = (items[i]?.prompt ?? '').trim()
        if (!label || !prompt) continue
        await tx.$executeRawUnsafe(
          `INSERT INTO orcamento_ia_sugestao (id, label, prompt, ordem, empresa_id)
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
          label, prompt, i, empresaId ?? null,
        )
      }
    })
    return { ok: true }
  }

  /**
   * "Banco de modelos" pro assistente de IA aprender o estilo da casa: textos
   * de proposta (textoCorpoCliente) de orçamentos JÁ registrados. Prioriza os
   * comprovados (aprovado/liberado/finalizado) e do mesmo tipo, mais recentes.
   * Consulta ao vivo — sem tabela/seed extra; sempre reflete o que existe.
   */
  async listModelosProposta(opts: { excluirId?: string; tipo?: string | null; empresaId?: string | null; limite?: number }) {
    const limite = Math.min(opts.limite ?? 5, 10)
    const rows = await prisma.$queryRawUnsafe<{ numero: number; tipo: string | null; status: string; texto: string }[]>(
      `SELECT numero, tipo, status, texto_corpo_cliente AS "texto"
         FROM orcamentos
        WHERE texto_corpo_cliente IS NOT NULL
          AND length(btrim(texto_corpo_cliente)) > 40
          AND ($1::text IS NULL OR id <> $1)
          AND ($2::text IS NULL OR empresa_id = $2)
          AND arquivado = false
        ORDER BY (status IN ('APROVADO','LIBERADO','FINALIZADO')) DESC,
                 ($3::text IS NOT NULL AND tipo = $3) DESC,
                 created_at DESC
        LIMIT ${limite}`,
      opts.excluirId ?? null, opts.empresaId ?? null, opts.tipo ?? null,
    ).catch(() => [] as { numero: number; tipo: string | null; status: string; texto: string }[])
    return rows
  }

  // ── Biblioteca curada de modelos de proposta (gerida nas Configurações) ──
  /** Modelos curados ATIVOS — usados como referência pela IA (prefere o tipo do orçamento). */
  async listModelosPropostaCurados(opts: { tipo?: string | null; empresaId?: string | null; limite?: number }) {
    const limite = Math.min(opts.limite ?? 6, 12)
    return prisma.$queryRawUnsafe<{ titulo: string; conteudo: string; tipo: string | null }[]>(
      `SELECT titulo, conteudo, tipo FROM orcamento_proposta_modelo
        WHERE ativo = true AND ($1::text IS NULL OR empresa_id = $1 OR empresa_id IS NULL)
        ORDER BY ($2::text IS NOT NULL AND tipo = $2) DESC, ordem ASC, created_at DESC
        LIMIT ${limite}`,
      opts.empresaId ?? null, opts.tipo ?? null,
    ).catch(() => [] as { titulo: string; conteudo: string; tipo: string | null }[])
  }

  /** Lista completa (ativos + inativos) para a tela de gestão. */
  async listModelosPropostaAdmin(empresaId?: string | null) {
    return prisma.$queryRawUnsafe<any[]>(
      `SELECT id, titulo, conteudo, tipo, segmento, ativo, ordem, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM orcamento_proposta_modelo
        WHERE ($1::text IS NULL OR empresa_id = $1 OR empresa_id IS NULL)
        ORDER BY ordem ASC, created_at DESC`,
      empresaId ?? null,
    ).catch(() => [] as any[])
  }

  async createModeloProposta(data: { titulo: string; conteudo: string; tipo?: string | null; segmento?: string | null; ativo?: boolean; ordem?: number }, userId?: string, empresaId?: string | null) {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO orcamento_proposta_modelo (id, titulo, conteudo, tipo, segmento, ativo, ordem, empresa_id, created_by)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      data.titulo, data.conteudo, data.tipo ?? null, data.segmento ?? null,
      data.ativo ?? true, data.ordem ?? 0, empresaId ?? null, userId ?? null,
    )
    return { id: rows[0]?.id }
  }

  async updateModeloProposta(id: string, data: { titulo?: string; conteudo?: string; tipo?: string | null; segmento?: string | null; ativo?: boolean; ordem?: number }) {
    await prisma.$executeRawUnsafe(
      `UPDATE orcamento_proposta_modelo SET
         titulo = COALESCE($2, titulo),
         conteudo = COALESCE($3, conteudo),
         tipo = $4,
         segmento = $5,
         ativo = COALESCE($6, ativo),
         ordem = COALESCE($7, ordem),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      id, data.titulo ?? null, data.conteudo ?? null, data.tipo ?? null, data.segmento ?? null,
      data.ativo ?? null, data.ordem ?? null,
    )
    return { id }
  }

  async excluirModeloProposta(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM orcamento_proposta_modelo WHERE id = $1`, id)
    return { id }
  }
}
