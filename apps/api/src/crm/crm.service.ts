import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { CreateOportunidadeInput, UpdateOportunidadeInput, ListOportunidadeInput } from '@saas/types'
import { OrcamentoService } from '../orcamento/orcamento.service'
import { CrmEventsService } from './crm-events.service'
import { NotificationService } from '../notification/notification.service'
import { CnpjService } from '../cnpj/cnpj.service'

const DEFAULT_ETAPAS = [
  { nome: 'Deal Aberto', ordem: 1, cor: '#818cf8', probabilidade: 10, ehGanho: false, ehPerda: false },
  { nome: 'Diagnostico', ordem: 2, cor: '#60a5fa', probabilidade: 25, ehGanho: false, ehPerda: false },
  { nome: 'Solucao Validada', ordem: 3, cor: '#34d399', probabilidade: 40, ehGanho: false, ehPerda: false },
  { nome: 'Proposta Enviada', ordem: 4, cor: '#fbbf24', probabilidade: 60, ehGanho: false, ehPerda: false },
  { nome: 'Negociacao', ordem: 5, cor: '#f97316', probabilidade: 75, ehGanho: false, ehPerda: false },
  { nome: 'Ganho', ordem: 6, cor: '#10b981', probabilidade: 100, ehGanho: true, ehPerda: false },
  { nome: 'Perdido', ordem: 7, cor: '#ef4444', probabilidade: 0, ehGanho: false, ehPerda: true },
]

@Injectable()
export class CrmService {
  constructor(
    @Inject(forwardRef(() => OrcamentoService))
    private readonly orcamentoService: OrcamentoService,
    private readonly crmEvents: CrmEventsService,
    private readonly notificationService: NotificationService,
    private readonly cnpjService: CnpjService,
  ) {}

  /**
   * Lista os usuários ativos da área "Comercial" — destinatários das
   * notificações de novos orçamentos criados via CRM. Filtra por empresa
   * quando informada pra não vazar entre tenants.
   */
  private async listarUsuariosComercial(empresaId?: string | null): Promise<string[]> {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        area: { name: { equals: 'Comercial', mode: 'insensitive' } },
        ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}),
      },
      select: { id: true },
    })
    return users.map(u => u.id)
  }

  // ── Etapas ────────────────────────────────────────────────

  async listEtapas(empresaId?: string) {
    let etapas = await prisma.crmEtapa.findMany({
      where: empresaId ? { empresaId } : {},
      orderBy: { ordem: 'asc' },
      include: { _count: { select: { oportunidades: true } } },
    })

    // Seed etapas padrao se nao existir nenhuma
    if (etapas.length === 0) {
      await prisma.crmEtapa.createMany({
        data: DEFAULT_ETAPAS.map(e => ({ ...e, empresaId: empresaId || null })),
      })
      etapas = await prisma.crmEtapa.findMany({
        where: empresaId ? { empresaId } : {},
        orderBy: { ordem: 'asc' },
        include: { _count: { select: { oportunidades: true } } },
      })
    }

    return etapas
  }

  async createEtapa(data: { nome: string; cor?: string; probabilidade?: number; ordem?: number }, empresaId?: string) {
    const maxOrdem = await prisma.crmEtapa.aggregate({ where: empresaId ? { empresaId } : {}, _max: { ordem: true } })
    return prisma.crmEtapa.create({
      data: {
        nome: data.nome, cor: data.cor || '#818cf8',
        probabilidade: data.probabilidade || 0,
        ordem: data.ordem ?? ((maxOrdem._max.ordem || 0) + 1),
        empresaId: empresaId || null,
      },
    })
  }

  async updateEtapa(id: string, data: { nome?: string; cor?: string; probabilidade?: number; ordem?: number }) {
    return prisma.crmEtapa.update({ where: { id }, data })
  }

  async deleteEtapa(id: string) {
    // Verificar se tem oportunidades vinculadas
    const count = await prisma.oportunidade.count({ where: { etapaId: id } })
    if (count > 0) throw new Error(`Nao e possivel excluir: ${count} oportunidade(s) vinculada(s)`)
    return prisma.crmEtapa.delete({ where: { id } })
  }

  // ── Oportunidades ─────────────────────────────────────────

  async list(input: ListOportunidadeInput, isMaster: boolean, empresaId?: string) {
    const where: any = {}
    if (!isMaster && empresaId) where.empresaId = empresaId
    if (input.etapaId) where.etapaId = input.etapaId
    if (input.clienteId) where.clienteId = input.clienteId
    if (input.responsavelId) where.responsavelId = input.responsavelId
    if (input.isActive !== undefined) where.isActive = input.isActive
    if (input.search) {
      where.OR = [
        { titulo: { contains: input.search, mode: 'insensitive' } },
        { descricao: { contains: input.search, mode: 'insensitive' } },
      ]
    }

    const [data, total] = await Promise.all([
      prisma.oportunidade.findMany({
        where,
        include: {
          etapa: { select: { id: true, nome: true, cor: true, probabilidade: true, ehGanho: true, ehPerda: true } },
          _count: { select: { tarefas: true, mensagens: true, arquivos: true, agendaEventos: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: ((input.page || 1) - 1) * (input.limit || 50),
        take: input.limit || 50,
      }),
      prisma.oportunidade.count({ where }),
    ])

    return { data, total, page: input.page || 1, limit: input.limit || 50, totalPages: Math.ceil(total / (input.limit || 50)) }
  }

  async listKanban(isMaster: boolean, empresaId?: string, search?: string) {
    // Limpar declinios vencidos silenciosamente
    this.limparDecliniosVencidos(empresaId).catch(() => {})

    const where: any = { isActive: true }
    if (!isMaster && empresaId) where.empresaId = empresaId

    // Busca abrangente — cobre tudo o que aparece no card da oportunidade:
    // título, descrição, dados do lead (razão social/CNPJ), contato
    // (nome/cargo/telefone/e-mail), origem/atividade, o cliente vinculado
    // (razão social/fantasia/documento) e o responsável (nome).
    if (search && search.trim()) {
      const term = search.trim()
      const numStr = term.replace(/[^0-9]/g, '') // dígitos: CNPJ/telefone
      const or: any[] = [
        { titulo: { contains: term, mode: 'insensitive' } },
        { descricao: { contains: term, mode: 'insensitive' } },
        { razaoSocial: { contains: term, mode: 'insensitive' } },
        { cpfCnpj: { contains: term, mode: 'insensitive' } },
        { contatoNome: { contains: term, mode: 'insensitive' } },
        { contatoCargo: { contains: term, mode: 'insensitive' } },
        { contatoTelefone: { contains: term, mode: 'insensitive' } },
        { contatoEmail: { contains: term, mode: 'insensitive' } },
        { origem: { contains: term, mode: 'insensitive' } },
        { atividade: { contains: term, mode: 'insensitive' } },
      ]
      if (numStr) {
        or.push({ cpfCnpj: { contains: numStr } })
        or.push({ contatoTelefone: { contains: numStr } })
      }
      // Cliente vinculado (nome / fantasia / CNPJ) — pré-busca os IDs no escopo
      const clienteOr: any[] = [
        { razaoSocial: { contains: term, mode: 'insensitive' } },
        { nomeFantasia: { contains: term, mode: 'insensitive' } },
      ]
      if (numStr) clienteOr.push({ documento: { contains: numStr } })
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
      if (usuarios.length > 0) or.push({ responsavelId: { in: usuarios.map(u => u.id) } })
      where.OR = or
    }

    return prisma.oportunidade.findMany({
      where,
      include: {
        etapa: { select: { id: true, nome: true, cor: true, probabilidade: true, ehGanho: true, ehPerda: true } },
        tags: { include: { tag: true } },
        _count: { select: { tarefas: true, mensagens: true, arquivos: true, agendaEventos: true } },
      },
      orderBy: [{ ordem: 'asc' }, { updatedAt: 'desc' }],
    }).then(async (ops) => {
      // Enriquecer com dados do responsavel
      const userIds = [...new Set(ops.map(o => o.responsavelId).filter(Boolean))] as string[]
      const users = userIds.length > 0
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } }).catch(() => [])
        : []
      const userMap = new Map(users.map(u => [u.id, u]))

      // Buscar orcamentos vinculados (1 por oportunidade, o mais recente)
      const opIds = ops.map(o => o.id)
      let orcamentoMap = new Map<string, { id: string; numero: number; status: string }>()
      if (opIds.length > 0) {
        try {
          const orcs = await prisma.$queryRawUnsafe<Array<{ id: string; numero: number; status: string; oportunidade_id: string }>>(
            `SELECT id, numero, status, oportunidade_id FROM orcamentos WHERE oportunidade_id IN (${opIds.map((_, i) => `$${i + 1}`).join(',')}) ORDER BY created_at DESC`,
            ...opIds,
          )
          for (const orc of orcs) {
            if (!orcamentoMap.has(orc.oportunidade_id)) {
              orcamentoMap.set(orc.oportunidade_id, { id: orc.id, numero: orc.numero, status: orc.status })
            }
          }
        } catch { /* tabela pode nao existir ainda */ }
      }

      return ops.map(o => ({
        ...o,
        responsavel: o.responsavelId ? userMap.get(o.responsavelId) || null : null,
        orcamento: orcamentoMap.get(o.id) || null,
      }))
    })
  }

  async getById(id: string) {
    return prisma.oportunidade.findUnique({
      where: { id },
      include: {
        etapa: true,
        tags: { include: { tag: true } },
        tarefas: { orderBy: { createdAt: 'desc' } },
        mensagens: { orderBy: { createdAt: 'desc' } },
        arquivos: { orderBy: { createdAt: 'desc' } },
        eventos: { orderBy: { createdAt: 'desc' }, take: 50 },
        // Eventos da agenda vinculados a esta oportunidade (vínculo bidirecional)
        agendaEventos: {
          where: { isActive: true },
          orderBy: [{ data: 'desc' }, { horaInicio: 'desc' }],
          select: {
            id: true,
            titulo: true,
            data: true,
            horaInicio: true,
            diaInteiro: true,
            tipo: { select: { nome: true, cor: true } },
          },
        },
      },
    }).then(async (op) => {
      if (!op) return op
      // Enriquecer com dados dos usuarios (responsavel, eventos, mensagens)
      const userIds = [
        ...new Set([
          op.responsavelId,
          ...op.eventos.map(e => e.userId),
          ...op.mensagens.map(m => m.userId),
        ].filter(Boolean)),
      ] as string[]
      const users = userIds.length > 0
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } }).catch(() => [])
        : []
      const userMap = new Map(users.map(u => [u.id, u]))
      return {
        ...op,
        responsavel: op.responsavelId ? userMap.get(op.responsavelId) || null : null,
        eventos: op.eventos.map(e => ({ ...e, user: e.userId ? userMap.get(e.userId) || null : null })),
        mensagens: op.mensagens.map(m => ({ ...m, user: m.userId ? userMap.get(m.userId) || null : null })),
      }
    })
  }

  // Verificar se cliente ja existe pelo CPF/CNPJ ou razao social
  /**
   * Auto-complete por CPF — busca em ordem:
   *   1. Cliente (CPFs cadastrados)   → traz nome/email/telefone
   *   2. Socio (sócios cadastrados)   → traz nome/email/telefone
   *   3. SERPRO Consulta CPF          → traz apenas o nome (Receita não tem
   *      email/telefone na base de pessoa física)
   *
   * Email/telefone só vêm das fontes 1 e 2. Fonte é informada na resposta
   * pra UI poder indicar a origem ('cliente' | 'socio' | 'serpro').
   */
  async lookupPorCpf(cpf: string): Promise<{ found: boolean; nome?: string; email?: string | null; telefone?: string | null; fonte?: 'cliente' | 'socio' | 'serpro' }> {
    const doc = (cpf || '').replace(/\D/g, '')
    if (doc.length !== 11) return { found: false }

    // 1. Cliente PF cadastrado
    const cliente = await prisma.cliente.findFirst({
      where: { documento: { contains: doc }, tipoDocumento: 'CPF' },
      select: { razaoSocial: true, email: true, telefone: true },
    })
    if (cliente) {
      return { found: true, nome: cliente.razaoSocial, email: cliente.email, telefone: cliente.telefone, fonte: 'cliente' }
    }

    // 2. Sócio com esse CPF (mais provável — sócios são pessoas físicas)
    const socio = await prisma.socio.findFirst({
      where: { cpf: { contains: doc } },
      select: { nomeCompleto: true, email: true, celular: true, telefone: true },
    })
    if (socio) {
      return {
        found: true,
        nome: socio.nomeCompleto,
        email: socio.email,
        telefone: socio.celular || socio.telefone,
        fonte: 'socio',
      }
    }

    // 3. Fallback SERPRO — só traz o nome (Receita não expõe email/telefone)
    try {
      const r = await this.cnpjService.consultarCpf(doc)
      if (r.nome) {
        return { found: true, nome: r.nome, email: null, telefone: null, fonte: 'serpro' }
      }
    } catch { /* silencioso — credencial não configurada ou CPF não encontrado */ }

    return { found: false }
  }

  async checkCliente(cpfCnpj?: string | null, razaoSocial?: string | null): Promise<{ exists: boolean; cliente?: { id: string; razaoSocial: string; documento: string; situacao: string; isLead: boolean } }> {
    if (cpfCnpj) {
      const doc = cpfCnpj.replace(/\D/g, '')
      if (doc.length >= 11) {
        const found = await prisma.cliente.findFirst({
          where: { documento: { contains: doc } },
          select: { id: true, razaoSocial: true, documento: true, situacao: true, isLead: true },
        })
        if (found) return { exists: true, cliente: found }
      }
    }
    if (razaoSocial) {
      const found = await prisma.cliente.findFirst({
        where: { razaoSocial: { equals: razaoSocial.trim(), mode: 'insensitive' } },
        select: { id: true, razaoSocial: true, documento: true, situacao: true, isLead: true },
      })
      if (found) return { exists: true, cliente: found }
    }
    return { exists: false }
  }

  async create(input: CreateOportunidadeInput, userId?: string, empresaId?: string) {
    let clienteId = input.clienteId || null

    // Se nao tem clienteId, tentar vincular ou criar como Lead
    if (!clienteId) {
      // Usar razaoSocial ou titulo como nome do Lead
      const nomeCliente = input.razaoSocial?.trim() || input.titulo
      const check = await this.checkCliente(input.cpfCnpj, nomeCliente)
      if (check.exists && check.cliente) {
        // Vincular ao cliente existente
        clienteId = check.cliente.id
      } else {
        // Criar novo cliente como Lead
        const novoCliente = await prisma.cliente.create({
          data: {
            razaoSocial: nomeCliente,
            documento: input.cpfCnpj?.replace(/\D/g, '') || '',
            tipoDocumento: (input.cpfCnpj?.replace(/\D/g, '').length || 0) === 11 ? 'CPF' : 'CNPJ',
            isLead: true,
            situacao: 'PROSPECT',
            status: 'ATIVA',
            origem: input.origem || '',
            telefone: input.contatoTelefone || '',
            email: input.contatoEmail || '',
            empresaId: empresaId || null,
          },
        })
        clienteId = novoCliente.id
      }
    }

    const oportunidade = await prisma.oportunidade.create({
      data: {
        titulo: input.titulo,
        descricao: input.descricao || null,
        valor: input.valor ?? null,
        etapaId: input.etapaId,
        clienteId,
        responsavelId: input.responsavelId || userId || null,
        previsaoFechamento: input.previsaoFechamento ? new Date(input.previsaoFechamento) : null,
        origem: input.origem || null,
        atividade: input.atividade || null,
        cpfCnpj: input.cpfCnpj || null,
        razaoSocial: input.razaoSocial || null,
        contatoNome: input.contatoNome || null,
        contatoCargo: input.contatoCargo || null,
        contatoTelefone: input.contatoTelefone || null,
        contatoEmail: input.contatoEmail || null,
        empresaId: empresaId || null,
      },
      include: { etapa: true },
    })
    this.addEvento(oportunidade.id, userId, 'criacao', `Oportunidade "${input.titulo}" criada`)
    // Notifica destinatários da área Comercial (#HLP0075) — comportamento da v1
    // (Wagner + Giovana). Tira o próprio criador da lista pra não auto-notificar.
    // Fire-and-forget: falha na notificação não bloqueia criação da oportunidade.
    void (async () => {
      try {
        const userIds = await this.listarUsuariosComercial(empresaId)
        const destinatarios = userId ? userIds.filter(id => id !== userId) : userIds
        if (destinatarios.length === 0) return
        const nomeCliente = input.razaoSocial?.trim() || input.titulo
        await this.notificationService.criarParaUsers(destinatarios, {
          titulo: 'Nova oportunidade no CRM',
          mensagem: `${nomeCliente} · ${oportunidade.etapa?.nome ?? 'sem etapa'}`,
          tipo: 'info',
          link: `/crm/oportunidades/${oportunidade.id}`,
          origem: 'crm.oportunidade.criada',
          empresaId: empresaId || null,
        })
      } catch (e) {
        console.warn('[CRM.create] notificação falhou:', (e as Error).message)
      }
    })()
    return oportunidade
  }

  async update(id: string, input: UpdateOportunidadeInput, userId?: string) {
    const data: any = {}
    if (input.titulo !== undefined) data.titulo = input.titulo
    if (input.descricao !== undefined) data.descricao = input.descricao
    if (input.valor !== undefined) data.valor = input.valor
    if (input.etapaId !== undefined) data.etapaId = input.etapaId
    if (input.clienteId !== undefined) data.clienteId = input.clienteId
    if (input.responsavelId !== undefined) data.responsavelId = input.responsavelId
    if (input.previsaoFechamento !== undefined) data.previsaoFechamento = input.previsaoFechamento ? new Date(input.previsaoFechamento) : null
    if (input.motivoPerda !== undefined) data.motivoPerda = input.motivoPerda
    if (input.origem !== undefined) data.origem = input.origem
    if (input.atividade !== undefined) data.atividade = input.atividade
    if (input.cpfCnpj !== undefined) data.cpfCnpj = input.cpfCnpj
    if (input.razaoSocial !== undefined) data.razaoSocial = input.razaoSocial
    if (input.contatoNome !== undefined) data.contatoNome = input.contatoNome
    if (input.contatoCargo !== undefined) data.contatoCargo = input.contatoCargo
    if (input.contatoTelefone !== undefined) data.contatoTelefone = input.contatoTelefone
    if (input.contatoEmail !== undefined) data.contatoEmail = input.contatoEmail
    if (input.isActive !== undefined) data.isActive = input.isActive

    const result = await prisma.oportunidade.update({ where: { id }, data, include: { etapa: true } })
    const campos = Object.keys(data).join(', ')
    this.addEvento(id, userId, 'edicao', `Campos alterados: ${campos}`)
    return result
  }

  async moverEtapa(id: string, etapaId: string, userId?: string, empresaId?: string) {
    // Buscar etapa anterior para log
    const anterior = await prisma.oportunidade.findUnique({ where: { id }, include: { etapa: { select: { nome: true } } } })
    const oportunidade = await prisma.oportunidade.update({
      where: { id },
      data: { etapaId },
      include: { etapa: true },
    })

    // Se a etapa destino contém "orçamento" ou "orcamento", criar orçamento automaticamente
    let orcamentoCriado: { id: string; numero: number } | null = null
    const nomeEtapa = oportunidade.etapa.nome.toLowerCase()
    if (nomeEtapa.includes('orçamento') || nomeEtapa.includes('orcamento')) {
      // Verificar se ja existe um orcamento vinculado a essa oportunidade
      const existente = await prisma.orcamento.findFirst({
        where: { oportunidadeId: id },
        select: { id: true, numero: true },
      })
      if (!existente) {
        // Solicitante = usuario que registrou o CRM (criou a oportunidade), nao quem moveu a etapa.
        // Buscamos no log de eventos o registro de criacao; se nao houver, caimos para o userId atual.
        const eventoCriacao = await prisma.oportunidadeEvento.findFirst({
          where: { oportunidadeId: id, tipo: 'criacao' },
          orderBy: { createdAt: 'asc' },
          select: { userId: true },
        }).catch(() => null)
        const solicitanteId = eventoCriacao?.userId || userId
        const novoOrc = await this.orcamentoService.create({
          oportunidadeId: id,
          clienteId: oportunidade.clienteId || undefined,
          solicitanteId: solicitanteId || undefined,
          observacoes: `Orcamento gerado automaticamente a partir da oportunidade "${oportunidade.titulo}"`,
        }, userId, empresaId || oportunidade.empresaId || undefined)
        orcamentoCriado = { id: novoOrc.id, numero: novoOrc.numero }
      }
    }

    this.addEvento(id, userId, 'etapa', `Movido para "${oportunidade.etapa.nome}"`, anterior?.etapa?.nome, oportunidade.etapa.nome)
    if (orcamentoCriado) {
      this.addEvento(id, userId, 'orcamento', `Orcamento #${orcamentoCriado.numero} gerado automaticamente`)
      // Notifica o time Comercial — sino de todos eles dispara via SSE.
      // A notificação fica viva até o orçamento sair do status NOVO (removida
      // automaticamente em orcamentoService.changeStatus).
      const destinatarios = await this.listarUsuariosComercial(empresaId || oportunidade.empresaId)
      if (destinatarios.length > 0) {
        const titulo = `Novo orçamento #${orcamentoCriado.numero}`
        const cliente = oportunidade.titulo // título da oportunidade serve como rótulo do card
        await this.notificationService.criarParaUsers(destinatarios, {
          titulo,
          mensagem: `Card CRM "${cliente}" gerou um orçamento — abra para revisar e enviar ao cliente.`,
          tipo: 'info',
          origem: 'orcamentos',
          link: `/orcamentos/${orcamentoCriado.id}`,
          empresaId: empresaId || oportunidade.empresaId || null,
        })
      }
    }

    return { ...oportunidade, orcamentoCriado }
  }

  async reordenar(ids: string[]) {
    await Promise.all(ids.map((id, idx) =>
      prisma.oportunidade.update({ where: { id }, data: { ordem: idx } })
    ))
    this.crmEvents.emit({ type: 'reorder' })
    return { ok: true }
  }

  async delete(id: string) {
    // Cascata: deleta orçamentos vinculados a esta oportunidade antes de
    // apagar o card — flag `cascataDoCrm` bypassa a proteção em orcamento.delete.
    const orcamentos = await prisma.orcamento.findMany({
      where: { oportunidadeId: id },
      select: { id: true },
    }).catch(() => [] as Array<{ id: string }>)
    for (const orc of orcamentos) {
      // Limpa também as notificações de sino vinculadas àquele orçamento
      await this.notificationService.removerPorLink(`/orcamentos/${orc.id}`)
      await this.orcamentoService.delete(orc.id, { cascataDoCrm: true })
    }
    const result = await prisma.oportunidade.delete({ where: { id } })
    this.crmEvents.emit({ type: 'delete', oportunidadeId: id })
    return result
  }

  // ── Tarefas ───────────────────────────────────────────────

  async addTarefa(oportunidadeId: string, titulo: string, responsavelId?: string, prazo?: string, userId?: string) {
    const tarefa = await prisma.oportunidadeTarefa.create({
      data: { oportunidadeId, titulo, responsavelId: responsavelId || null, prazo: prazo ? new Date(prazo) : null },
    })
    this.addEvento(oportunidadeId, userId, 'tarefa', `Tarefa adicionada: "${titulo}"`)
    return tarefa
  }

  async toggleTarefa(id: string, userId?: string) {
    const tarefa = await prisma.oportunidadeTarefa.findUnique({ where: { id } })
    if (!tarefa) throw new Error('Tarefa nao encontrada')
    const result = await prisma.oportunidadeTarefa.update({ where: { id }, data: { concluida: !tarefa.concluida } })
    this.addEvento(tarefa.oportunidadeId, userId, 'tarefa', `Tarefa "${tarefa.titulo}" ${result.concluida ? 'concluida' : 'reaberta'}`)
    return result
  }

  async deleteTarefa(id: string, userId?: string) {
    const tarefa = await prisma.oportunidadeTarefa.findUnique({ where: { id } })
    const result = await prisma.oportunidadeTarefa.delete({ where: { id } })
    if (tarefa) this.addEvento(tarefa.oportunidadeId, userId, 'tarefa', `Tarefa removida: "${tarefa.titulo}"`)
    return result
  }

  // ── Mensagens ─────────────────────────────────────────────

  async addMensagem(oportunidadeId: string, userId: string, mensagem: string) {
    const result = await prisma.oportunidadeMensagem.create({
      data: { oportunidadeId, userId, mensagem },
    })
    this.addEvento(oportunidadeId, userId, 'mensagem', 'Nova mensagem adicionada')
    return result
  }

  // ── Arquivos ──────────────────────────────────────────────

  async addArquivo(oportunidadeId: string, data: { fileName: string; fileUrl: string; fileSize?: number; mimeType?: string }, userId?: string) {
    const result = await prisma.oportunidadeArquivo.create({
      data: {
        oportunidadeId,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize || null,
        mimeType: data.mimeType || null,
        userId: userId || null,
      },
    })
    this.addEvento(oportunidadeId, userId, 'arquivo', `Arquivo anexado: "${data.fileName}"`)
    return result
  }

  async removeArquivo(id: string, userId?: string) {
    const arq = await prisma.oportunidadeArquivo.findUnique({ where: { id } })
    const result = await prisma.oportunidadeArquivo.delete({ where: { id } })
    if (arq) this.addEvento(arq.oportunidadeId, userId, 'arquivo', `Arquivo removido: "${arq.fileName}"`)
    return result
  }

  // ── Tags ───────────────────────────────────────────────────

  async listTags(empresaId?: string) {
    return prisma.crmTag.findMany({
      where: empresaId ? { empresaId } : {},
      orderBy: { nome: 'asc' },
      include: { _count: { select: { oportunidades: true } } },
    })
  }

  async createTag(data: { nome: string; cor?: string }, empresaId?: string) {
    return prisma.crmTag.create({
      data: { nome: data.nome, cor: data.cor || '#94a3b8', empresaId: empresaId || null },
    })
  }

  async updateTag(id: string, data: { nome?: string; cor?: string }) {
    return prisma.crmTag.update({ where: { id }, data })
  }

  async deleteTag(id: string) {
    return prisma.crmTag.delete({ where: { id } })
  }

  async addTagToOportunidade(oportunidadeId: string, tagId: string, userId?: string) {
    const result = await prisma.oportunidadeTag.create({
      data: { oportunidadeId, tagId },
    }).catch(() => null)
    const tag = await prisma.crmTag.findUnique({ where: { id: tagId }, select: { nome: true } }).catch(() => null)
    this.addEvento(oportunidadeId, userId, 'tag', `Tag adicionada: "${tag?.nome || tagId}"`)
    return result
  }

  async removeTagFromOportunidade(oportunidadeId: string, tagId: string, userId?: string) {
    const tag = await prisma.crmTag.findUnique({ where: { id: tagId }, select: { nome: true } }).catch(() => null)
    const result = await prisma.oportunidadeTag.deleteMany({
      where: { oportunidadeId, tagId },
    })
    this.addEvento(oportunidadeId, userId, 'tag', `Tag removida: "${tag?.nome || tagId}"`)
    return result
  }

  // ── Eventos (log de atividades) ─────────────────────────────

  async addEvento(oportunidadeId: string, userId: string | null | undefined, tipo: string, descricao: string, de?: string | null, para?: string | null) {
    // Notificar todos os clientes conectados via SSE
    const sseType = tipo === 'criacao' ? 'create' : tipo === 'etapa' ? 'move' : tipo === 'edicao' ? 'update' : tipo as any
    this.crmEvents.emit({ type: sseType, oportunidadeId, userId: userId || undefined })
    return prisma.oportunidadeEvento.create({
      data: { oportunidadeId, userId: userId || null, tipo, descricao, de: de || null, para: para || null },
    }).catch(() => null)
  }

  async listEventos(oportunidadeId: string) {
    const eventos = await prisma.oportunidadeEvento.findMany({
      where: { oportunidadeId },
      orderBy: { createdAt: 'desc' },
    })
    // Enriquecer com nome do usuario
    const userIds = [...new Set(eventos.map(e => e.userId).filter(Boolean))] as string[]
    if (userIds.length === 0) return eventos.map(e => ({ ...e, user: null }))
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } }).catch(() => [])
    const userMap = new Map(users.map(u => [u.id, u]))
    return eventos.map(e => ({ ...e, user: e.userId ? userMap.get(e.userId) || null : null }))
  }

  // ── Estatisticas ──────────────────────────────────────────

  async getStats(isMaster: boolean, empresaId?: string) {
    const where: any = { isActive: true }
    if (!isMaster && empresaId) where.empresaId = empresaId

    const [total, valorTotal, porEtapa] = await Promise.all([
      prisma.oportunidade.count({ where }),
      prisma.oportunidade.aggregate({ where, _sum: { valor: true } }),
      prisma.oportunidade.groupBy({
        by: ['etapaId'],
        where,
        _count: true,
        _sum: { valor: true },
      }),
    ])

    return {
      total,
      valorTotal: Number(valorTotal._sum.valor || 0),
      porEtapa,
    }
  }

  // ── Configuracoes do CRM ──────────────────────────────────

  async getConfig(empresaId?: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ valor: string }>>(
      `SELECT valor FROM opcoes_cadastro WHERE tipo = 'CRM_CONFIG' AND valor LIKE 'declinio_dias=%' ${empresaId ? `AND empresa_id = '${empresaId}'` : ''} LIMIT 1`
    ).catch(() => [])
    const val = rows[0]?.valor?.split('=')?.[1]
    return { declinioDias: val ? parseInt(val) : 30 }
  }

  async saveConfig(key: string, value: string, empresaId?: string) {
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM opcoes_cadastro WHERE tipo = 'CRM_CONFIG' AND valor LIKE '${key}=%' ${empresaId ? `AND empresa_id = '${empresaId}'` : ''} LIMIT 1`
    ).catch(() => [])
    if (existing.length > 0) {
      await prisma.$executeRawUnsafe(`UPDATE opcoes_cadastro SET valor = $1 WHERE id = $2`, `${key}=${value}`, existing[0].id)
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO opcoes_cadastro (id, tipo, valor, empresa_id) VALUES (gen_random_uuid(), 'CRM_CONFIG', $1, $2)`,
        `${key}=${value}`, empresaId || null
      )
    }
    return { ok: true }
  }

  // ── Relatorios ─────────────────────────────────────────────

  async reportFunil(empresaId?: string, dias?: number) {
    const where: any = {}
    if (empresaId) where.empresaId = empresaId
    if (dias) where.createdAt = { gte: new Date(Date.now() - dias * 86400000) }

    const etapas = await prisma.crmEtapa.findMany({
      where: empresaId ? { empresaId } : {},
      orderBy: { ordem: 'asc' },
    })

    const grouped = await prisma.oportunidade.groupBy({
      by: ['etapaId'],
      where,
      _count: true,
      _sum: { valor: true },
    })

    const groupMap = new Map(grouped.map(g => [g.etapaId, g]))

    const funilData = etapas.map(e => {
      const g = groupMap.get(e.id)
      return {
        etapaId: e.id,
        nome: e.nome,
        cor: e.cor,
        ordem: e.ordem,
        ehGanho: e.ehGanho,
        ehPerda: e.ehPerda,
        count: g?._count ?? 0,
        valor: Number(g?._sum?.valor ?? 0),
      }
    })

    // Calcular taxas de conversao entre etapas consecutivas (excluindo Perdido)
    const etapasAtivas = funilData.filter(e => !e.ehPerda)
    const conversoes: { de: string; para: string; taxa: number }[] = []
    for (let i = 0; i < etapasAtivas.length - 1; i++) {
      const atual = etapasAtivas[i]
      const prox = etapasAtivas[i + 1]
      const taxa = atual.count > 0 ? Math.round((prox.count / atual.count) * 100) : 0
      conversoes.push({ de: atual.nome, para: prox.nome, taxa })
    }

    const totalOportunidades = funilData.reduce((s, e) => s + e.count, 0)
    const valorTotal = funilData.reduce((s, e) => s + e.valor, 0)
    const ganhos = funilData.find(e => e.ehGanho)
    const taxaGeral = totalOportunidades > 0 ? Math.round(((ganhos?.count ?? 0) / totalOportunidades) * 100) : 0

    return { etapas: funilData, conversoes, totalOportunidades, valorTotal, taxaGeral }
  }

  async reportDesempenho(empresaId?: string, dias?: number) {
    const where: any = {}
    if (empresaId) where.empresaId = empresaId
    if (dias) where.createdAt = { gte: new Date(Date.now() - dias * 86400000) }

    const oportunidades = await prisma.oportunidade.findMany({
      where,
      select: {
        responsavelId: true,
        valor: true,
        etapa: { select: { ehGanho: true, ehPerda: true } },
      },
    })

    // Agrupar por responsavel
    const byResp = new Map<string, { total: number; ganhos: number; perdidos: number; valor: number; valorGanho: number }>()

    for (const op of oportunidades) {
      const rid = op.responsavelId || '__sem_responsavel__'
      if (!byResp.has(rid)) byResp.set(rid, { total: 0, ganhos: 0, perdidos: 0, valor: 0, valorGanho: 0 })
      const entry = byResp.get(rid)!
      entry.total++
      entry.valor += Number(op.valor ?? 0)
      if (op.etapa.ehGanho) { entry.ganhos++; entry.valorGanho += Number(op.valor ?? 0) }
      if (op.etapa.ehPerda) entry.perdidos++
    }

    // Buscar nomes dos usuarios
    const userIds = [...byResp.keys()].filter(id => id !== '__sem_responsavel__')
    const users = userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } }).catch(() => [])
      : []
    const userMap = new Map(users.map(u => [u.id, u]))

    const resultado = [...byResp.entries()].map(([id, data]) => ({
      responsavelId: id === '__sem_responsavel__' ? null : id,
      nome: id === '__sem_responsavel__' ? 'Sem responsavel' : (userMap.get(id)?.name ?? 'Desconhecido'),
      image: id === '__sem_responsavel__' ? null : (userMap.get(id)?.image ?? null),
      ...data,
      taxaConversao: data.total > 0 ? Math.round((data.ganhos / data.total) * 100) : 0,
    })).sort((a, b) => b.valorGanho - a.valorGanho)

    return resultado
  }

  async reportOrigem(empresaId?: string, dias?: number) {
    const where: any = {}
    if (empresaId) where.empresaId = empresaId
    if (dias) where.createdAt = { gte: new Date(Date.now() - dias * 86400000) }

    const oportunidades = await prisma.oportunidade.findMany({
      where,
      select: {
        origem: true,
        valor: true,
        etapa: { select: { ehGanho: true, ehPerda: true } },
      },
    })

    const byOrigem = new Map<string, { count: number; valor: number; ganhos: number; perdidos: number }>()

    for (const op of oportunidades) {
      const key = op.origem?.trim() || 'Nao informada'
      if (!byOrigem.has(key)) byOrigem.set(key, { count: 0, valor: 0, ganhos: 0, perdidos: 0 })
      const entry = byOrigem.get(key)!
      entry.count++
      entry.valor += Number(op.valor ?? 0)
      if (op.etapa.ehGanho) entry.ganhos++
      if (op.etapa.ehPerda) entry.perdidos++
    }

    const resultado = [...byOrigem.entries()].map(([origem, data]) => ({
      origem,
      ...data,
      taxaConversao: data.count > 0 ? Math.round((data.ganhos / data.count) * 100) : 0,
    })).sort((a, b) => b.count - a.count)

    const total = resultado.reduce((s, r) => s + r.count, 0)
    return { origens: resultado, total }
  }

  async reportTempoMedio(empresaId?: string) {
    const where: any = { isActive: true }
    if (empresaId) where.empresaId = empresaId

    // Calcular tempo medio na etapa atual usando updatedAt - createdAt para oportunidades ativas
    // Tambem buscar eventos de mudanca de etapa para calculo mais preciso
    const etapas = await prisma.crmEtapa.findMany({
      where: empresaId ? { empresaId } : {},
      orderBy: { ordem: 'asc' },
    })

    // Buscar eventos de tipo 'etapa' para calcular tempo entre mudancas
    const eventos = await prisma.oportunidadeEvento.findMany({
      where: {
        tipo: 'etapa',
        oportunidade: empresaId ? { empresaId } : {},
      },
      orderBy: [{ oportunidadeId: 'asc' }, { createdAt: 'asc' }],
      select: { oportunidadeId: true, para: true, createdAt: true },
    })

    // Agrupar eventos por oportunidade para calcular tempo em cada etapa
    const temposPorEtapa = new Map<string, number[]>()

    // Inicializar todas as etapas
    for (const e of etapas) {
      temposPorEtapa.set(e.nome, [])
    }

    // Agrupar eventos por oportunidade
    const eventosPorOp = new Map<string, Array<{ para: string | null; createdAt: Date }>>()
    for (const ev of eventos) {
      if (!eventosPorOp.has(ev.oportunidadeId)) eventosPorOp.set(ev.oportunidadeId, [])
      eventosPorOp.get(ev.oportunidadeId)!.push(ev)
    }

    // Calcular tempo entre eventos consecutivos
    for (const [, evs] of eventosPorOp) {
      for (let i = 0; i < evs.length - 1; i++) {
        const etapaNome = evs[i].para
        if (!etapaNome) continue
        const diffMs = new Date(evs[i + 1].createdAt).getTime() - new Date(evs[i].createdAt).getTime()
        const diffDias = diffMs / 86400000
        if (temposPorEtapa.has(etapaNome)) {
          temposPorEtapa.get(etapaNome)!.push(diffDias)
        }
      }
    }

    // Fallback: para oportunidades ativas sem eventos suficientes, usar updatedAt - createdAt agrupado por etapa
    const ativas = await prisma.oportunidade.findMany({
      where,
      select: { etapaId: true, createdAt: true, updatedAt: true },
    })

    const etapaNameMap = new Map(etapas.map(e => [e.id, e.nome]))
    for (const op of ativas) {
      const nome = etapaNameMap.get(op.etapaId)
      if (!nome) continue
      const dias = (new Date(op.updatedAt).getTime() - new Date(op.createdAt).getTime()) / 86400000
      // Somente adicionar se nao temos dados de eventos para esta etapa
      if (temposPorEtapa.get(nome)?.length === 0) {
        temposPorEtapa.get(nome)!.push(dias)
      }
    }

    const resultado = etapas.map(e => {
      const tempos = temposPorEtapa.get(e.nome) || []
      const media = tempos.length > 0 ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0
      return {
        etapaId: e.id,
        nome: e.nome,
        cor: e.cor,
        ordem: e.ordem,
        mediaDias: Math.round(media * 10) / 10,
        totalOportunidades: tempos.length,
      }
    })

    return resultado
  }

  // ── Limpeza de Declinios vencidos ─────────────────────────

  async limparDecliniosVencidos(empresaId?: string) {
    const config = await this.getConfig(empresaId)
    const dias = config.declinioDias
    // Buscar etapas de declinio
    const etapasDecl = await prisma.crmEtapa.findMany({
      where: { nome: { contains: 'decl', mode: 'insensitive' } },
      select: { id: true },
    })
    if (etapasDecl.length === 0) return 0

    const etapaIds = etapasDecl.map(e => e.id)
    const cutoff = new Date(Date.now() - dias * 86400000)

    // Desativar oportunidades em Declinio que passaram do prazo
    const result = await prisma.oportunidade.updateMany({
      where: {
        etapaId: { in: etapaIds },
        isActive: true,
        updatedAt: { lt: cutoff },
      },
      data: { isActive: false },
    })
    return result.count
  }
}
