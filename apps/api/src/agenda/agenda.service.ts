import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { Prisma } from '@saas/db'
import { EmailService } from '../common/email.service'
import { NotificationService } from '../notification/notification.service'
import { AgendaConfigService } from './agenda-config.service'

function decodeHtmlEntities(str: string | null | undefined): string | null {
  if (!str) return null
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  const dayOfMonth = date.getDate()
  result.setMonth(result.getMonth() + months)
  // Handle end-of-month: if the day changed, it means the month overflowed
  // (e.g., Jan 31 + 1 month → Mar 3), so set it to last day of target month
  if (result.getDate() !== dayOfMonth) {
    result.setDate(0) // sets to last day of previous month (the correct target month)
  }
  return result
}

function addYears(date: Date, years: number): Date {
  const result = new Date(date)
  const dayOfMonth = date.getDate()
  result.setFullYear(result.getFullYear() + years)
  // Handle leap year edge case (Feb 29 → Feb 28)
  if (result.getDate() !== dayOfMonth) {
    result.setDate(0)
  }
  return result
}

interface CreateEventoInput {
  titulo: string
  descricao?: string | null
  data: string
  dataFim?: string | null
  horaInicio?: string | null
  horaFim?: string | null
  diaInteiro?: boolean
  local?: string | null
  contato?: string | null
  link?: string | null
  presenca?: 'PRESENCIAL' | 'ONLINE' | 'HIBRIDO'
  particular?: boolean
  editavel?: boolean
  sala?: string | null
  salaId?: string | null
  garagem?: boolean
  vagas?: number | null
  equipamentos?: string | null
  isTarefa?: boolean
  tipoId: string
  empresaId?: string | null
  oportunidadeId?: string | null
  participanteIds?: string[]
  participantesAvulsos?: string[]
  recorrencia?: 'NENHUMA' | 'DIARIA' | 'SEMANAL' | 'MENSAL' | 'ANUAL'
  recorrenciaVezes?: number | null
  notificar?: boolean
}

interface UpdateEventoInput {
  titulo?: string
  descricao?: string | null
  data?: string
  dataFim?: string | null
  horaInicio?: string | null
  horaFim?: string | null
  diaInteiro?: boolean
  local?: string | null
  contato?: string | null
  link?: string | null
  presenca?: 'PRESENCIAL' | 'ONLINE' | 'HIBRIDO'
  particular?: boolean
  editavel?: boolean
  sala?: string | null
  salaId?: string | null
  garagem?: boolean
  vagas?: number | null
  equipamentos?: string | null
  isTarefa?: boolean
  tipoId?: string
  empresaId?: string | null
  oportunidadeId?: string | null
  participanteIds?: string[]
  participantesAvulsos?: string[]
  notificar?: boolean
}

interface ListEventosParams {
  dataInicio: string
  dataFim: string
  tipoId?: string
  criadorId?: string
  empresaId?: string
}

export interface ImportProgress {
  status: 'idle' | 'running' | 'done'
  total: number
  current: number
  importados: number
  ignorados: number
  erros: number
  participantes: number
  currentEvento: string
  items: Array<{ nome: string; status: 'importado' | 'ignorado' | 'erro'; erro?: string }>
}

@Injectable()
export class AgendaService {
  constructor(
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(NotificationService) private readonly notificationService: NotificationService,
    @Inject(AgendaConfigService) private readonly configService: AgendaConfigService,
  ) {}

  private importProgress: ImportProgress = {
    status: 'idle', total: 0, current: 0, importados: 0, ignorados: 0, erros: 0,
    participantes: 0, currentEvento: '', items: [],
  }

  /**
   * Bypass de propriedade: usuário com sub-perm `editar_todos_eventos` (ou MASTER
   * global) pode editar/excluir eventos de qualquer pessoa, inclusive eventos
   * marcados como `editavel=false` (importados do legado).
   */
  private async userPodeEditarTodos(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isMaster: true },
    })
    if (user?.isMaster) return true
    const perm = await prisma.userPermission.findUnique({
      where: { userId_moduleSlug: { userId, moduleSlug: 'agenda' } },
      select: { subPermissions: true },
    })
    const subs = (perm?.subPermissions ?? {}) as Record<string, boolean>
    return subs.editar_todos_eventos === true
  }

  /** Pode excluir eventos de outros: MASTER ou sub-perm `delete_eventos`/`editar_todos_eventos`. */
  private async userPodeExcluir(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isMaster: true } })
    if (user?.isMaster) return true
    const perm = await prisma.userPermission.findUnique({
      where: { userId_moduleSlug: { userId, moduleSlug: 'agenda' } },
      select: { subPermissions: true },
    })
    const subs = (perm?.subPermissions ?? {}) as Record<string, boolean>
    return subs.delete_eventos === true || subs.editar_todos_eventos === true
  }

  /**
   * Pode editar/excluir anotações e anexos de QUALQUER usuário: MASTER ou
   * sub-perm `gerenciar_anotacoes_anexos`. (O dono do registro sempre pode
   * mexer no próprio — checado por registro em `podeGerenciarRegistro`.)
   */
  private async userPodeGerenciarAnotacaoAnexo(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isMaster: true } })
    if (user?.isMaster) return true
    const perm = await prisma.userPermission.findUnique({
      where: { userId_moduleSlug: { userId, moduleSlug: 'agenda' } },
      select: { subPermissions: true },
    })
    const subs = (perm?.subPermissions ?? {}) as Record<string, boolean>
    return subs.gerenciar_anotacoes_anexos === true
  }

  /** Dono do registro OU master/sub-perm. `ownerId` = userId que criou a anotação/anexo. */
  private async podeGerenciarRegistro(userId: string, ownerId: string | null | undefined): Promise<boolean> {
    if (ownerId && ownerId === userId) return true
    return this.userPodeGerenciarAnotacaoAnexo(userId)
  }

  /** Pode alterar o TIPO do evento direto na prévia: MASTER ou sub-perm `alterar_tipo_evento`. */
  private async userPodeAlterarTipo(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isMaster: true } })
    if (user?.isMaster) return true
    const perm = await prisma.userPermission.findUnique({
      where: { userId_moduleSlug: { userId, moduleSlug: 'agenda' } },
      select: { subPermissions: true },
    })
    const subs = (perm?.subPermissions ?? {}) as Record<string, boolean>
    return subs.alterar_tipo_evento === true
  }

  /**
   * Troca o tipo do evento (gate próprio: master/sub-perm) e registra no histórico.
   * Se o evento faz parte de uma RECORRÊNCIA (mesmo `lote`), aplica o novo tipo a
   * TODA a série — não só à instância clicada.
   */
  async alterarTipo(eventoId: string, tipoId: string, userId: string) {
    if (!(await this.userPodeAlterarTipo(userId))) {
      throw new Error('Você não tem permissão para alterar o tipo do evento.')
    }
    const evento = await prisma.agendaEvento.findUniqueOrThrow({ where: { id: eventoId }, select: { tipoId: true, lote: true } })
    const [tipoNovo, tipoAnterior] = await Promise.all([
      prisma.agendaTipo.findUniqueOrThrow({ where: { id: tipoId }, select: { nome: true } }),
      prisma.agendaTipo.findUnique({ where: { id: evento.tipoId }, select: { nome: true } }).catch(() => null),
    ])

    let afetados = 1
    if (evento.lote) {
      // Recorrência: atualiza todas as instâncias da série (mesmo lote).
      const res = await prisma.agendaEvento.updateMany({ where: { lote: evento.lote }, data: { tipoId } })
      afetados = res.count
    } else {
      await prisma.agendaEvento.update({ where: { id: eventoId }, data: { tipoId } })
    }

    await prisma.agendaLog.create({
      data: {
        eventoId, usuarioId: userId, acao: 'tipo_alterado',
        detalhes: `Tipo alterado${tipoAnterior ? ` de "${tipoAnterior.nome}"` : ''} para "${tipoNovo.nome}"`
          + (evento.lote ? ` em ${afetados} evento(s) da recorrência.` : '.'),
      },
    }).catch(() => null)

    return prisma.agendaEvento.findUniqueOrThrow({ where: { id: eventoId } })
  }

  /** Pode acessar os relatórios da agenda: MASTER ou sub-perm `ver_relatorios`. */
  private async userPodeVerRelatorios(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isMaster: true } })
    if (user?.isMaster) return true
    const perm = await prisma.userPermission.findUnique({
      where: { userId_moduleSlug: { userId, moduleSlug: 'agenda' } },
      select: { subPermissions: true },
    })
    const subs = (perm?.subPermissions ?? {}) as Record<string, boolean>
    return subs.ver_relatorios === true
  }

  /**
   * Relatório agregado dos eventos num período. Como os TIPOS são dinâmicos
   * (Reunião, Curso, Visita ao cliente, etc.), agregamos genericamente:
   *  - porTipo: quantidade + tempo total por tipo de evento
   *  - porUsuario: quantidade + tempo total por usuário (participante)
   * Filtros opcionais: usuarioId (só eventos do usuário) e tipoId (só do tipo).
   * Tempo = horaFim - horaInicio (eventos de dia inteiro contam na quantidade,
   * mas com 0 min de duração).
   */
  async relatorio(
    input: { dataInicio: string; dataFim: string; usuarioId?: string; tipoId?: string },
    userId: string,
    isMaster: boolean,
    empresaId?: string | null,
  ) {
    if (!(await this.userPodeVerRelatorios(userId))) {
      throw new Error('Você não tem permissão para acessar os relatórios da agenda.')
    }
    const inicio = new Date(`${input.dataInicio}T00:00:00.000Z`)
    const fim = new Date(`${input.dataFim}T23:59:59.999Z`)
    const where: Prisma.AgendaEventoWhereInput = { isActive: true, data: { gte: inicio, lte: fim } }
    if (!isMaster && empresaId) where.empresaId = empresaId
    if (input.tipoId) where.tipoId = input.tipoId

    const eventos = await prisma.agendaEvento.findMany({
      where,
      select: {
        id: true, diaInteiro: true, horaInicio: true, horaFim: true,
        tipo: { select: { id: true, nome: true, cor: true, corBorda: true } },
        participantes: { where: { isActive: true, usuarioId: { not: null } }, select: { usuarioId: true } },
      },
    })

    const toMin = (s: string) => {
      const [h, m] = s.split(':')
      return (Number(h) || 0) * 60 + (Number(m) || 0)
    }
    const minutosDe = (ev: { diaInteiro: boolean; horaInicio: string | null; horaFim: string | null }) => {
      if (ev.diaInteiro || !ev.horaInicio || !ev.horaFim) return 0
      const mins = toMin(ev.horaFim) - toMin(ev.horaInicio)
      return mins > 0 ? mins : 0
    }

    const usuarioFiltro = input.usuarioId || null
    type TipoChip = { tipoId: string; nome: string; cor: string; quantidade: number }
    const porTipoMap = new Map<string, { tipoId: string; nome: string; cor: string; corBorda: string; quantidade: number; totalMinutos: number; usuarios: Map<string, number> }>()
    const porUsuarioMap = new Map<string, { quantidade: number; totalMinutos: number; tipos: Map<string, TipoChip> }>()
    let totalQtd = 0, totalMin = 0

    for (const ev of eventos) {
      const participantes = ev.participantes.map(p => p.usuarioId!).filter(Boolean)
      if (usuarioFiltro && !participantes.includes(usuarioFiltro)) continue
      const mins = minutosDe(ev)
      totalQtd++; totalMin += mins

      const k = ev.tipo.id
      const t = porTipoMap.get(k) ?? { tipoId: k, nome: ev.tipo.nome, cor: ev.tipo.cor, corBorda: ev.tipo.corBorda, quantidade: 0, totalMinutos: 0, usuarios: new Map<string, number>() }
      t.quantidade++; t.totalMinutos += mins
      porTipoMap.set(k, t)

      const alvo = usuarioFiltro ? [usuarioFiltro] : participantes
      for (const uid of alvo) {
        // por tipo → breakdown por usuário
        t.usuarios.set(uid, (t.usuarios.get(uid) ?? 0) + 1)
        // por usuário → breakdown por tipo
        const u = porUsuarioMap.get(uid) ?? { quantidade: 0, totalMinutos: 0, tipos: new Map<string, TipoChip>() }
        u.quantidade++; u.totalMinutos += mins
        const tc = u.tipos.get(k) ?? { tipoId: k, nome: ev.tipo.nome, cor: ev.tipo.corBorda || ev.tipo.cor, quantidade: 0 }
        tc.quantidade++
        u.tipos.set(k, tc)
        porUsuarioMap.set(uid, u)
      }
    }

    const userIds = [...porUsuarioMap.keys()]
    const users = await this.resolveUserNames(userIds)
    const porUsuario = userIds
      .map(uid => {
        const u = porUsuarioMap.get(uid)!
        return {
          usuarioId: uid,
          nome: users.get(uid)?.name ?? 'Desconhecido',
          image: users.get(uid)?.image ?? null,
          quantidade: u.quantidade,
          totalMinutos: u.totalMinutos,
          tipos: [...u.tipos.values()].sort((a, b) => b.quantidade - a.quantidade),
        }
      })
      .sort((a, b) => b.totalMinutos - a.totalMinutos || b.quantidade - a.quantidade)

    const porTipo = [...porTipoMap.values()]
      .map(t => ({
        tipoId: t.tipoId, nome: t.nome, cor: t.cor, corBorda: t.corBorda, quantidade: t.quantidade, totalMinutos: t.totalMinutos,
        usuarios: [...t.usuarios.entries()]
          .map(([uid, q]) => ({ usuarioId: uid, nome: users.get(uid)?.name ?? 'Desconhecido', image: users.get(uid)?.image ?? null, quantidade: q }))
          .sort((a, b) => b.quantidade - a.quantidade),
      }))
      .sort((a, b) => b.quantidade - a.quantidade)

    return { totais: { quantidade: totalQtd, totalMinutos: totalMin }, porTipo, porUsuario }
  }

  /**
   * Lista paginada dos eventos por trás de uma linha do relatório (drill-down).
   * Filtra por período + tipoId e/ou usuarioId (participante). Usado quando o
   * usuário clica numa linha "Por tipo" ou "Por usuário".
   */
  async relatorioEventos(
    input: { dataInicio: string; dataFim: string; tipoId?: string; usuarioId?: string; page?: number; limit?: number },
    userId: string,
    isMaster: boolean,
    empresaId?: string | null,
  ) {
    if (!(await this.userPodeVerRelatorios(userId))) {
      throw new Error('Você não tem permissão para acessar os relatórios da agenda.')
    }
    const page = Math.max(1, input.page ?? 1)
    const limit = Math.min(50, Math.max(1, input.limit ?? 10))
    const inicio = new Date(`${input.dataInicio}T00:00:00.000Z`)
    const fim = new Date(`${input.dataFim}T23:59:59.999Z`)
    const where: Prisma.AgendaEventoWhereInput = { isActive: true, data: { gte: inicio, lte: fim } }
    if (!isMaster && empresaId) where.empresaId = empresaId
    if (input.tipoId) where.tipoId = input.tipoId
    if (input.usuarioId) where.participantes = { some: { usuarioId: input.usuarioId, isActive: true } }

    const [total, eventos] = await Promise.all([
      prisma.agendaEvento.count({ where }),
      prisma.agendaEvento.findMany({
        where,
        orderBy: [{ data: 'desc' }, { horaInicio: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, titulo: true, data: true, horaInicio: true, horaFim: true, diaInteiro: true,
          local: true, sala: true,
          tipo: { select: { nome: true, cor: true, corBorda: true } },
          _count: { select: { participantes: true } },
        },
      }),
    ])

    const toMin = (s: string) => { const [h, m] = s.split(':'); return (Number(h) || 0) * 60 + (Number(m) || 0) }
    const data = eventos.map(e => ({
      id: e.id,
      titulo: e.titulo,
      data: e.data,
      horaInicio: e.horaInicio,
      horaFim: e.horaFim,
      diaInteiro: e.diaInteiro,
      local: e.sala || e.local || null,
      tipoNome: e.tipo.nome,
      tipoCor: e.tipo.corBorda || e.tipo.cor,
      minutos: (e.diaInteiro || !e.horaInicio || !e.horaFim) ? 0 : Math.max(0, toMin(e.horaFim) - toMin(e.horaInicio)),
      participantes: e._count.participantes,
    }))

    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
  }

  getImportProgress(): ImportProgress {
    return { ...this.importProgress }
  }

  // ============================================================
  // TIPOS (Categorias)
  // ============================================================

  async listTipos() {
    return prisma.agendaTipo.findMany({
      where: { isActive: true },
      orderBy: { nome: 'asc' },
    })
  }

  async createTipo(data: { nome: string; cor?: string; corBorda?: string; corTexto?: string; bloqueiaAgenda?: boolean }) {
    return prisma.agendaTipo.create({
      data: {
        nome: data.nome,
        cor: data.cor ?? '#3b82f6',
        corBorda: data.corBorda ?? '#2563eb',
        corTexto: data.corTexto ?? '#ffffff',
        bloqueiaAgenda: data.bloqueiaAgenda ?? false,
      },
    })
  }

  async updateTipo(id: string, data: { nome?: string; cor?: string; corBorda?: string; corTexto?: string; bloqueiaAgenda?: boolean }) {
    const updateData: Record<string, unknown> = {}
    if (data.nome !== undefined) updateData.nome = data.nome
    if (data.cor !== undefined) updateData.cor = data.cor
    if (data.corBorda !== undefined) updateData.corBorda = data.corBorda
    if (data.corTexto !== undefined) updateData.corTexto = data.corTexto
    if (data.bloqueiaAgenda !== undefined) updateData.bloqueiaAgenda = data.bloqueiaAgenda

    return prisma.agendaTipo.update({
      where: { id },
      data: updateData,
    })
  }

  async deleteTipo(id: string) {
    return prisma.agendaTipo.update({
      where: { id },
      data: { isActive: false },
    })
  }

  // ============================================================
  // EVENTOS
  // ============================================================

  async listEventos(params: ListEventosParams, userId: string) {
    const { dataInicio, dataFim, tipoId, criadorId, empresaId } = params

    const rangeStart = new Date(dataInicio)
    const rangeEnd = new Date(dataFim)

    const where: Prisma.AgendaEventoWhereInput = {
      isActive: true,
      isTarefa: false,  // tarefas agora moram em agenda_tarefas — não vazam pra listagem de eventos
      OR: [
        // Evento começa dentro do range
        { data: { gte: rangeStart, lte: rangeEnd } },
        // Evento multi-dia que cruza o range (começa antes, termina dentro ou depois)
        { data: { lte: rangeEnd }, dataFim: { gte: rangeStart } },
      ],
      ...(tipoId ? { tipoId } : {}),
      ...(criadorId ? { criadorId } : {}),
      ...(empresaId ? { empresaId } : {}),
    }

    const eventos = await prisma.agendaEvento.findMany({
      where,
      include: {
        tipo: { select: { id: true, nome: true, cor: true, corBorda: true, corTexto: true } },
        criador: { select: { id: true, name: true } },
        participantes: {
          where: { isActive: true },
          include: {
            usuario: { select: { id: true, name: true, image: true } },
          },
        },
      },
      orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
    })

    // Filter out particular events where user is not the creator or a participant
    return eventos.filter((evento) => {
      if (!evento.particular) return true
      if (evento.criadorId === userId) return true
      return evento.participantes.some((p) => p.usuarioId === userId)
    })
  }

  async getById(id: string) {
    return prisma.agendaEvento.findUniqueOrThrow({
      where: { id },
      include: {
        tipo: { select: { id: true, nome: true, cor: true, corBorda: true, corTexto: true } },
        criador: { select: { id: true, name: true } },
        participantes: {
          where: { isActive: true },
          include: {
            usuario: { select: { id: true, name: true, image: true } },
          },
        },
        logs: {
          orderBy: { createdAt: 'desc' },
        },
        // Card do CRM vinculado (infos pro painel lateral do detalhe do evento)
        oportunidade: {
          select: {
            id: true,
            titulo: true,
            descricao: true,
            valor: true,
            razaoSocial: true,
            cpfCnpj: true,
            atividade: true,
            origem: true,
            motivoPerda: true,
            previsaoFechamento: true,
            createdAt: true,
            updatedAt: true,
            clienteId: true,
            responsavelId: true,
            contatoNome: true,
            contatoCargo: true,
            contatoTelefone: true,
            contatoEmail: true,
            etapa: { select: { id: true, nome: true, cor: true } },
            tags: { select: { tag: { select: { id: true, nome: true, cor: true } } } },
            _count: { select: { tarefas: true, mensagens: true, arquivos: true } },
          },
        },
      },
    }).then(async (ev) => {
      // Anotações e anexos do evento (resolvidos do evento OU da oportunidade
      // vinculada — ver listAnotacoes/listAnexos). Carregados junto pra o modal.
      const [anot, anex] = await Promise.all([this.listAnotacoes(ev.id), this.listAnexos(ev.id)])
      const base = { ...ev, anotacoes: anot.anotacoes, anexos: anex.anexos }
      if (!base.oportunidade) return base
      // `responsavelId` e `clienteId` não são relations no schema da Oportunidade
      // (resolvidos manualmente) — então enriquecemos responsável e cliente aqui.
      const [resp, cliente] = await Promise.all([
        base.oportunidade.responsavelId
          ? prisma.user
              .findUnique({ where: { id: base.oportunidade.responsavelId }, select: { id: true, name: true } })
              .catch(() => null)
          : Promise.resolve(null),
        base.oportunidade.clienteId
          ? prisma.cliente
              .findUnique({ where: { id: base.oportunidade.clienteId }, select: { id: true, razaoSocial: true, documento: true } })
              .catch(() => null)
          : Promise.resolve(null),
      ])
      return { ...base, oportunidade: { ...base.oportunidade, responsavel: resp, cliente } }
    })
  }

  /**
   * Seletor leve de oportunidades pra vincular um evento da agenda a um card do
   * CRM. Filtra por empresa do usuário (a menos que MASTER) e por texto livre no
   * título / razão social. Retorna no máximo 20 resultados.
   */
  async buscarOportunidades(search: string | undefined, isMaster: boolean, empresaId?: string | null) {
    const where: Prisma.OportunidadeWhereInput = { isActive: true }
    if (!isMaster && empresaId) where.empresaId = empresaId
    const termo = (search ?? '').trim()
    if (termo) {
      where.OR = [
        { titulo: { contains: termo, mode: 'insensitive' } },
        { razaoSocial: { contains: termo, mode: 'insensitive' } },
      ]
    }
    return prisma.oportunidade.findMany({
      where,
      select: {
        id: true,
        titulo: true,
        razaoSocial: true,
        etapa: { select: { nome: true, cor: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    })
  }

  // ===== Anotações & Anexos do evento ========================================
  // Regra: quando o evento NÃO tem card do CRM vinculado, gravam/leem nas tabelas
  // próprias (agenda_evento_anotacoes / agenda_evento_anexos). Quando TEM vínculo,
  // operam sobre a oportunidade (oportunidade_mensagens / oportunidade_arquivos),
  // ficando "mesclados" ao card. A migração na hora de vincular é feita no update().

  private async resolveUserNames(ids: (string | null | undefined)[]) {
    const uniq = [...new Set(ids.filter(Boolean))] as string[]
    if (!uniq.length) return new Map<string, { id: string; name: string; image: string | null }>()
    const users = await prisma.user
      .findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, image: true } })
      .catch(() => [] as { id: string; name: string; image: string | null }[])
    return new Map(users.map((u) => [u.id, u]))
  }

  private async eventoOportunidadeId(eventoId: string): Promise<string | null> {
    const ev = await prisma.agendaEvento.findUniqueOrThrow({ where: { id: eventoId }, select: { oportunidadeId: true } })
    return ev.oportunidadeId
  }

  /** Move anotações/anexos próprios do evento para a oportunidade (merge no vínculo). */
  private async migrarAnotacoesAnexosParaOportunidade(eventoId: string, oportunidadeId: string) {
    const [anotacoes, anexos] = await Promise.all([
      prisma.agendaEventoAnotacao.findMany({ where: { eventoId } }),
      prisma.agendaEventoAnexo.findMany({ where: { eventoId } }),
    ])
    if (anotacoes.length) {
      await prisma.oportunidadeMensagem.createMany({
        data: anotacoes.map((a) => ({ oportunidadeId, userId: a.userId, mensagem: a.texto, createdAt: a.createdAt })),
      })
      await prisma.agendaEventoAnotacao.deleteMany({ where: { eventoId } })
    }
    if (anexos.length) {
      await prisma.oportunidadeArquivo.createMany({
        data: anexos.map((a) => ({
          oportunidadeId, fileName: a.fileName, fileUrl: a.fileUrl,
          fileSize: a.fileSize, mimeType: a.mimeType, userId: a.userId, createdAt: a.createdAt,
        })),
      })
      await prisma.agendaEventoAnexo.deleteMany({ where: { eventoId } })
    }
    return { anotacoes: anotacoes.length, anexos: anexos.length }
  }

  async listAnotacoes(eventoId: string) {
    const oppId = await this.eventoOportunidadeId(eventoId)
    if (oppId) {
      const rows = await prisma.oportunidadeMensagem.findMany({ where: { oportunidadeId: oppId }, orderBy: { createdAt: 'desc' } })
      const users = await this.resolveUserNames(rows.map((r) => r.userId))
      return {
        vinculado: true,
        anotacoes: rows.map((r) => ({ id: r.id, texto: r.mensagem, userId: r.userId, user: r.userId ? users.get(r.userId) ?? null : null, createdAt: r.createdAt })),
      }
    }
    const rows = await prisma.agendaEventoAnotacao.findMany({ where: { eventoId }, orderBy: { createdAt: 'desc' } })
    const users = await this.resolveUserNames(rows.map((r) => r.userId))
    return {
      vinculado: false,
      anotacoes: rows.map((r) => ({ id: r.id, texto: r.texto, userId: r.userId, user: r.userId ? users.get(r.userId) ?? null : null, createdAt: r.createdAt })),
    }
  }

  async addAnotacao(eventoId: string, userId: string, texto: string) {
    const t = (texto ?? '').trim()
    if (!t) throw new Error('A anotação não pode ser vazia.')
    const oppId = await this.eventoOportunidadeId(eventoId)
    if (oppId) {
      const r = await prisma.oportunidadeMensagem.create({ data: { oportunidadeId: oppId, userId, mensagem: t } })
      await prisma.oportunidadeEvento
        .create({ data: { oportunidadeId: oppId, userId, tipo: 'mensagem', descricao: 'Nova anotação adicionada (via agenda)' } })
        .catch(() => null)
      return r
    }
    return prisma.agendaEventoAnotacao.create({ data: { eventoId, userId, texto: t } })
  }

  async editarAnotacao(eventoId: string, anotacaoId: string, texto: string, userId: string) {
    const t = (texto ?? '').trim()
    if (!t) throw new Error('A anotação não pode ser vazia.')
    const oppId = await this.eventoOportunidadeId(eventoId)
    if (oppId) {
      const rec = await prisma.oportunidadeMensagem.findUnique({ where: { id: anotacaoId }, select: { userId: true, oportunidadeId: true } })
      if (!rec || rec.oportunidadeId !== oppId) throw new Error('Anotação não encontrada.')
      if (!(await this.podeGerenciarRegistro(userId, rec.userId))) throw new Error('Você não tem permissão para editar esta anotação.')
      return prisma.oportunidadeMensagem.update({ where: { id: anotacaoId }, data: { mensagem: t } })
    }
    const rec = await prisma.agendaEventoAnotacao.findUnique({ where: { id: anotacaoId }, select: { userId: true, eventoId: true } })
    if (!rec || rec.eventoId !== eventoId) throw new Error('Anotação não encontrada.')
    if (!(await this.podeGerenciarRegistro(userId, rec.userId))) throw new Error('Você não tem permissão para editar esta anotação.')
    return prisma.agendaEventoAnotacao.update({ where: { id: anotacaoId }, data: { texto: t } })
  }

  async deleteAnotacao(eventoId: string, anotacaoId: string, userId: string) {
    const oppId = await this.eventoOportunidadeId(eventoId)
    if (oppId) {
      const rec = await prisma.oportunidadeMensagem.findUnique({ where: { id: anotacaoId }, select: { userId: true, oportunidadeId: true } })
      if (!rec || rec.oportunidadeId !== oppId) return { ok: true }
      if (!(await this.podeGerenciarRegistro(userId, rec.userId))) throw new Error('Você não tem permissão para excluir esta anotação.')
      await prisma.oportunidadeMensagem.delete({ where: { id: anotacaoId } })
    } else {
      const rec = await prisma.agendaEventoAnotacao.findUnique({ where: { id: anotacaoId }, select: { userId: true, eventoId: true } })
      if (!rec || rec.eventoId !== eventoId) return { ok: true }
      if (!(await this.podeGerenciarRegistro(userId, rec.userId))) throw new Error('Você não tem permissão para excluir esta anotação.')
      await prisma.agendaEventoAnotacao.delete({ where: { id: anotacaoId } })
    }
    return { ok: true }
  }

  async listAnexos(eventoId: string) {
    const oppId = await this.eventoOportunidadeId(eventoId)
    if (oppId) {
      const rows = await prisma.oportunidadeArquivo.findMany({ where: { oportunidadeId: oppId }, orderBy: { createdAt: 'desc' } })
      const users = await this.resolveUserNames(rows.map((r) => r.userId))
      return {
        vinculado: true,
        anexos: rows.map((r) => ({ id: r.id, fileName: r.fileName, fileUrl: r.fileUrl, fileSize: r.fileSize, mimeType: r.mimeType, userId: r.userId, user: r.userId ? users.get(r.userId) ?? null : null, createdAt: r.createdAt })),
      }
    }
    const rows = await prisma.agendaEventoAnexo.findMany({ where: { eventoId }, orderBy: { createdAt: 'desc' } })
    const users = await this.resolveUserNames(rows.map((r) => r.userId))
    return {
      vinculado: false,
      anexos: rows.map((r) => ({ id: r.id, fileName: r.fileName, fileUrl: r.fileUrl, fileSize: r.fileSize, mimeType: r.mimeType, userId: r.userId, user: r.userId ? users.get(r.userId) ?? null : null, createdAt: r.createdAt })),
    }
  }

  async addAnexo(eventoId: string, data: { fileName: string; fileUrl: string; fileSize?: number | null; mimeType?: string | null }, userId: string) {
    const oppId = await this.eventoOportunidadeId(eventoId)
    if (oppId) {
      const r = await prisma.oportunidadeArquivo.create({
        data: { oportunidadeId: oppId, fileName: data.fileName, fileUrl: data.fileUrl, fileSize: data.fileSize ?? null, mimeType: data.mimeType ?? null, userId: userId || null },
      })
      await prisma.oportunidadeEvento
        .create({ data: { oportunidadeId: oppId, userId, tipo: 'arquivo', descricao: `Arquivo anexado (via agenda): "${data.fileName}"` } })
        .catch(() => null)
      return r
    }
    return prisma.agendaEventoAnexo.create({
      data: { eventoId, fileName: data.fileName, fileUrl: data.fileUrl, fileSize: data.fileSize ?? null, mimeType: data.mimeType ?? null, userId: userId || null },
    })
  }

  async removeAnexo(eventoId: string, anexoId: string, userId: string) {
    const oppId = await this.eventoOportunidadeId(eventoId)
    if (oppId) {
      const rec = await prisma.oportunidadeArquivo.findUnique({ where: { id: anexoId }, select: { userId: true, oportunidadeId: true } })
      if (!rec || rec.oportunidadeId !== oppId) return { ok: true }
      if (!(await this.podeGerenciarRegistro(userId, rec.userId))) throw new Error('Você não tem permissão para remover este anexo.')
      await prisma.oportunidadeArquivo.delete({ where: { id: anexoId } })
    } else {
      const rec = await prisma.agendaEventoAnexo.findUnique({ where: { id: anexoId }, select: { userId: true, eventoId: true } })
      if (!rec || rec.eventoId !== eventoId) return { ok: true }
      if (!(await this.podeGerenciarRegistro(userId, rec.userId))) throw new Error('Você não tem permissão para remover este anexo.')
      await prisma.agendaEventoAnexo.delete({ where: { id: anexoId } })
    }
    return { ok: true }
  }

  async create(input: CreateEventoInput, userId: string) {
    const {
      titulo, descricao, data, dataFim, horaInicio, horaFim, diaInteiro,
      local, contato, link, presenca, particular, editavel,
      sala, salaId, garagem, vagas, equipamentos, isTarefa,
      tipoId, empresaId, oportunidadeId, participanteIds, participantesAvulsos,
      recorrencia, recorrenciaVezes, notificar,
    } = input

    // Bloqueia agendamento em data passada (só no create — editar evento antigo
    // continua permitido). Compara YYYY-MM-DD pra ignorar timezone.
    const hojeStr = (() => {
      const h = new Date()
      return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
    })()
    if (data && data < hojeStr) {
      throw new Error('Não é possível agendar eventos em dias que já passaram.')
    }

    // Gate de conflito conforme AgendaConfig — pula se diaInteiro/sem horários
    // ou se o tipo escolhido não bloqueia agenda (lembretes corporativos).
    await this.aplicarGateConflito({
      data, horaInicio, horaFim, diaInteiro,
      participanteIds, sala: sala || undefined, salaId: salaId || undefined,
      tipoId,
    })

    const baseDate = new Date(data)
    const rec = recorrencia || 'NENHUMA'
    const vezes = recorrenciaVezes && recorrenciaVezes > 0 ? recorrenciaVezes : 1
    const isRecurrent = rec !== 'NENHUMA' && vezes > 1
    const lote = isRecurrent ? generateUUID() : null

    const createdEvents: Awaited<ReturnType<typeof prisma.agendaEvento.create>>[] = []

    for (let i = 0; i < (isRecurrent ? vezes : 1); i++) {
      let eventDate: Date

      switch (rec) {
        case 'DIARIA':
          eventDate = addDays(baseDate, i)
          break
        case 'SEMANAL':
          eventDate = addDays(baseDate, i * 7)
          break
        case 'MENSAL':
          eventDate = addMonths(baseDate, i)
          break
        case 'ANUAL':
          eventDate = addYears(baseDate, i)
          break
        default:
          eventDate = baseDate
      }

      const evento = await prisma.agendaEvento.create({
        data: {
          titulo,
          descricao: descricao || null,
          data: eventDate,
          dataFim: dataFim ? new Date(dataFim) : null,
          horaInicio: horaInicio || null,
          horaFim: horaFim || null,
          diaInteiro: diaInteiro ?? false,
          local: local || null,
          contato: contato || null,
          link: link || null,
          presenca: (presenca || 'PRESENCIAL') as never,
          particular: particular ?? false,
          editavel: editavel ?? true,
          sala: sala || null,
          salaId: salaId || null,
          garagem: garagem ?? false,
          vagas: vagas ?? null,
          equipamentos: equipamentos || null,
          isTarefa: isTarefa ?? false,
          tipoId,
          criadorId: userId,
          empresaId: empresaId || null,
          oportunidadeId: oportunidadeId || null,
          recorrencia: rec as never,
          recorrenciaVezes: isRecurrent ? vezes : null,
          lote,
        },
      })

      // Participantes (por usuário) — usa exatamente o que veio do frontend.
      // O form já pré-seleciona o criador ao abrir, mas se ele se remover da
      // lista a vontade é respeitada (NÃO forçar o criador aqui).
      const ids = Array.from(new Set(participanteIds ?? []))
      if (ids.length > 0) {
        await prisma.agendaParticipante.createMany({
          data: ids.map((uid) => ({
            eventoId: evento.id,
            usuarioId: uid,
          })),
          skipDuplicates: true,
        })
      }

      // Create participants (avulsos — external names)
      if (participantesAvulsos && participantesAvulsos.length > 0) {
        await prisma.agendaParticipante.createMany({
          data: participantesAvulsos.map((nome) => ({
            eventoId: evento.id,
            nomeAvulso: nome,
          })),
        })
      }

      // Create audit log
      await prisma.agendaLog.create({
        data: {
          eventoId: evento.id,
          usuarioId: userId,
          acao: 'criado',
        },
      })

      createdEvents.push(evento)
    }

    // Notificar participantes por e-mail (opt-in — só quando o usuário marcou no form).
    // A auditoria (AgendaLog) é sempre gravada acima; só o e-mail é condicional.
    if (notificar === true) {
      for (const ev of createdEvents) {
        this.notificarParticipantes(ev.id, 'criado').catch((e: Error) => {
          console.error(`[Agenda] Falha ao notificar participantes (criado, ev=${ev.id}):`, e.message, e.stack)
        })
      }
    }

    return createdEvents.length === 1 ? createdEvents[0]! : createdEvents
  }

  async update(id: string, data: UpdateEventoInput, userId: string) {
    const evento = await prisma.agendaEvento.findUniqueOrThrow({ where: { id } })

    // Permissão de edição: SÓ o criador (dono) do evento, MASTER ou quem tem a
    // sub-permissão `editar_todos_eventos`. (`editavel` é flag do evento — legado
    // SERPRO2 evemodifica='0' — NÃO é permissão de usuário; o dono ainda pode editar.)
    if (evento.criadorId !== userId) {
      const podeEditarTodos = await this.userPodeEditarTodos(userId)
      if (!podeEditarTodos) {
        throw new Error('Você não tem permissão para editar este evento.')
      }
    }

    // Gate de conflito conforme AgendaConfig — usa os valores novos quando passados,
    // ou os atuais do evento como fallback. Pula se diaInteiro/sem horários ou se o
    // tipo (novo ou atual) não bloqueia agenda (lembretes corporativos).
    await this.aplicarGateConflito({
      data: data.data ?? evento.data.toISOString().slice(0, 10),
      horaInicio: data.horaInicio !== undefined ? data.horaInicio : evento.horaInicio,
      horaFim: data.horaFim !== undefined ? data.horaFim : evento.horaFim,
      diaInteiro: data.diaInteiro !== undefined ? data.diaInteiro : evento.diaInteiro,
      participanteIds: data.participanteIds,
      sala: data.sala !== undefined ? (data.sala || undefined) : (evento.sala || undefined),
      salaId: data.salaId !== undefined ? (data.salaId || undefined) : (evento.salaId || undefined),
      eventoIdExcluir: id,
      tipoId: data.tipoId ?? evento.tipoId,
    })

    const updateData: Record<string, unknown> = {}
    if (data.titulo !== undefined) updateData.titulo = data.titulo
    if (data.descricao !== undefined) updateData.descricao = data.descricao || null
    if (data.data !== undefined) updateData.data = new Date(data.data)
    if (data.dataFim !== undefined) updateData.dataFim = data.dataFim ? new Date(data.dataFim) : null
    if (data.horaInicio !== undefined) updateData.horaInicio = data.horaInicio || null
    if (data.horaFim !== undefined) updateData.horaFim = data.horaFim || null
    if (data.diaInteiro !== undefined) updateData.diaInteiro = data.diaInteiro
    if (data.local !== undefined) updateData.local = data.local || null
    if (data.contato !== undefined) updateData.contato = data.contato || null
    if (data.link !== undefined) updateData.link = data.link || null
    if (data.presenca !== undefined) updateData.presenca = data.presenca
    if (data.particular !== undefined) updateData.particular = data.particular
    if (data.editavel !== undefined) updateData.editavel = data.editavel
    if (data.sala !== undefined) updateData.sala = data.sala || null
    if (data.salaId !== undefined) updateData.salaId = data.salaId || null
    if (data.garagem !== undefined) updateData.garagem = data.garagem
    if (data.vagas !== undefined) updateData.vagas = data.vagas
    if (data.equipamentos !== undefined) updateData.equipamentos = data.equipamentos || null
    if (data.isTarefa !== undefined) updateData.isTarefa = data.isTarefa
    if (data.tipoId !== undefined) updateData.tipoId = data.tipoId
    if (data.empresaId !== undefined) updateData.empresaId = data.empresaId || null
    if (data.oportunidadeId !== undefined) updateData.oportunidadeId = data.oportunidadeId || null

    const updated = await prisma.agendaEvento.update({
      where: { id },
      data: updateData,
    })

    // Recreate participants if provided
    if (data.participanteIds !== undefined || data.participantesAvulsos !== undefined) {
      // Remove existing active participants
      await prisma.agendaParticipante.deleteMany({
        where: { eventoId: id },
      })

      // Create user-based participants
      if (data.participanteIds && data.participanteIds.length > 0) {
        await prisma.agendaParticipante.createMany({
          data: data.participanteIds.map((uid) => ({
            eventoId: id,
            usuarioId: uid,
          })),
          skipDuplicates: true,
        })
      }

      // Create avulso participants
      if (data.participantesAvulsos && data.participantesAvulsos.length > 0) {
        await prisma.agendaParticipante.createMany({
          data: data.participantesAvulsos.map((nome) => ({
            eventoId: id,
            nomeAvulso: nome,
          })),
        })
      }
    }

    // Transição de vínculo com o CRM: ao VINCULAR (ou trocar de card), as
    // anotações/anexos PRÓPRIOS do evento são migrados pra oportunidade (merge).
    // Ao DESVINCULAR, os dados permanecem na oportunidade (decisão do produto) —
    // só registramos no histórico (agenda_logs).
    if (data.oportunidadeId !== undefined) {
      const oldOpp = evento.oportunidadeId
      const newOpp = data.oportunidadeId || null
      if (newOpp && newOpp !== oldOpp) {
        const mig = await this.migrarAnotacoesAnexosParaOportunidade(id, newOpp)
        await prisma.agendaLog.create({
          data: {
            eventoId: id, usuarioId: userId, acao: 'vinculo_crm',
            detalhes: `Vinculado a um card do CRM. ${mig.anotacoes} anotação(ões) e ${mig.anexos} anexo(s) migrados para a oportunidade.`,
          },
        })
      } else if (!newOpp && oldOpp) {
        const opp = await prisma.oportunidade.findUnique({ where: { id: oldOpp }, select: { titulo: true } }).catch(() => null)
        await prisma.agendaLog.create({
          data: {
            eventoId: id, usuarioId: userId, acao: 'desvinculo_crm',
            detalhes: `Desvinculado do card do CRM${opp ? ` "${opp.titulo}"` : ''}. Anotações e anexos permanecem na oportunidade.`,
          },
        })
      }
    }

    // Create audit log
    await prisma.agendaLog.create({
      data: {
        eventoId: id,
        usuarioId: userId,
        acao: 'editado',
      },
    })

    // Notificar participantes por e-mail (opt-in — só quando marcado no form).
    if (data.notificar === true) {
      this.notificarParticipantes(updated.id, 'editado').catch((e: Error) => {
        console.error(`[Agenda] Falha ao notificar participantes (editado, ev=${updated.id}):`, e.message, e.stack)
      })
    }

    return updated
  }

  async delete(id: string, userId: string, notificar = false) {
    // Permissão de exclusão: dono do evento, MASTER, ou sub-perm `delete_eventos`
    // / `editar_todos_eventos`. (espelha o botão "Excluir" do front)
    const ev = await prisma.agendaEvento.findUniqueOrThrow({ where: { id }, select: { criadorId: true } })
    if (ev.criadorId !== userId && !(await this.userPodeExcluir(userId))) {
      throw new Error('Você não tem permissão para excluir este evento.')
    }

    // Notificar antes do soft delete (opt-in — só quando marcado no diálogo de exclusão).
    if (notificar === true) {
      this.notificarParticipantes(id, 'excluido').catch((e: Error) => {
        console.error(`[Agenda] Falha ao notificar participantes (excluido, ev=${id}):`, e.message, e.stack)
      })
    }

    await prisma.agendaLog.create({
      data: {
        eventoId: id,
        usuarioId: userId,
        acao: 'excluido',
      },
    })

    return prisma.agendaEvento.update({
      where: { id },
      data: { isActive: false },
    })
  }

  async deleteLote(lote: string, userId: string) {
    const eventos = await prisma.agendaEvento.findMany({
      where: { lote, isActive: true },
      select: { id: true },
    })

    for (const evento of eventos) {
      await prisma.agendaLog.create({
        data: {
          eventoId: evento.id,
          usuarioId: userId,
          acao: 'excluido',
          detalhes: 'Exclusão em lote (recorrência)',
        },
      })
    }

    const result = await prisma.agendaEvento.updateMany({
      where: { lote, isActive: true },
      data: { isActive: false },
    })

    return { deleted: result.count }
  }

  // ============================================================
  // CONFLITOS — verifica se participantes/sala já estão ocupados
  // ============================================================

  async verificarConflitos(params: {
    data: string
    horaInicio: string
    horaFim: string
    participanteIds?: string[]
    sala?: string
    salaId?: string  // novo: prioritário sobre `sala` (string) quando ambos passados
    eventoIdExcluir?: string // para ignorar o próprio evento ao editar
    tipoId?: string // se o tipo do evento sendo criado/editado não bloqueia (ex.: LEMBRETE CORPORATIVO), pular toda a checagem
  }) {
    const { data, horaInicio, horaFim, participanteIds, sala, salaId, eventoIdExcluir, tipoId } = params
    const conflitos: Array<{
      tipo: 'participante' | 'sala'
      nome: string
      evento: string
      horario: string
      /** Avatar do user — só preenchido para tipo='participante' (pode ser null se o user não tem foto) */
      image?: string | null
    }> = []

    // Se o tipo escolhido não bloqueia agenda, ele NUNCA gera nem sofre conflito —
    // retorna lista vazia sem nem consultar o BD. Defesa em profundidade: o frontend
    // já filtra, mas blindar aqui evita bypass de outros chamadores.
    if (tipoId) {
      const tipoSel = await prisma.agendaTipo.findUnique({
        where: { id: tipoId },
        select: { bloqueiaAgenda: true },
      })
      if (tipoSel && !tipoSel.bloqueiaAgenda) return conflitos
    }

    const eventDate = new Date(data)

    // Buscar eventos no mesmo dia que se sobrepõem no horário
    const eventosNoDia = await prisma.agendaEvento.findMany({
      where: {
        isActive: true,
        data: eventDate,
        diaInteiro: false,
        ...(eventoIdExcluir ? { id: { not: eventoIdExcluir } } : {}),
        tipo: { bloqueiaAgenda: true },
      },
      include: {
        participantes: { where: { isActive: true } },
        tipo: { select: { nome: true } },
        salaRef: { select: { id: true, nome: true } },
      },
    })

    // Filtrar por sobreposição de horário
    const conflitantes = eventosNoDia.filter(ev => {
      if (!ev.horaInicio || !ev.horaFim) return false
      return ev.horaInicio < horaFim && ev.horaFim > horaInicio
    })

    // Conflito de participantes
    if (participanteIds && participanteIds.length > 0) {
      for (const ev of conflitantes) {
        const participantesEvento = ev.participantes.map(p => p.usuarioId).filter(Boolean) as string[]
        const conflitados = participanteIds.filter(id => participantesEvento.includes(id))
        if (conflitados.length > 0) {
          // Buscar nomes + avatar pra exibir no alerta de conflito
          const users = await prisma.user.findMany({
            where: { id: { in: conflitados } },
            select: { id: true, name: true, image: true },
          })
          for (const u of users) {
            conflitos.push({
              tipo: 'participante',
              nome: u.name,
              evento: ev.titulo,
              horario: `${ev.horaInicio} — ${ev.horaFim}`,
              image: u.image ?? null,
            })
          }
        }
      }
    }

    // Conflito de sala — prioriza FK (salaId), faz fallback pra string (sala legado)
    if (salaId) {
      // Resolve nome da sala uma vez (pra mensagem)
      const salaInfo = await prisma.agendaSala.findUnique({ where: { id: salaId }, select: { nome: true } })
      const salaNome = salaInfo?.nome ?? '(sala)'
      for (const ev of conflitantes) {
        if (ev.salaId === salaId) {
          conflitos.push({
            tipo: 'sala',
            nome: salaNome,
            evento: ev.titulo,
            horario: `${ev.horaInicio} — ${ev.horaFim}`,
          })
        }
      }
    } else if (sala && sala.trim()) {
      for (const ev of conflitantes) {
        if (ev.sala && ev.sala.toLowerCase() === sala.toLowerCase()) {
          conflitos.push({
            tipo: 'sala',
            nome: sala,
            evento: ev.titulo,
            horario: `${ev.horaInicio} — ${ev.horaFim}`,
          })
        }
      }
    }

    return conflitos
  }

  // ============================================================
  // DISPONIBILIDADE — retorna slots ocupados de usuários
  // ============================================================

  async verificarDisponibilidade(params: {
    data: string
    usuarioIds: string[]
  }) {
    const eventDate = new Date(params.data)

    const eventos = await prisma.agendaEvento.findMany({
      where: {
        isActive: true,
        data: eventDate,
        diaInteiro: false,
        participantes: {
          some: {
            usuarioId: { in: params.usuarioIds },
            isActive: true,
          },
        },
      },
      include: {
        participantes: {
          where: { isActive: true, usuarioId: { in: params.usuarioIds } },
          include: { usuario: { select: { id: true, name: true } } },
        },
        tipo: { select: { nome: true, cor: true } },
      },
      orderBy: { horaInicio: 'asc' },
    })

    // Também incluir eventos onde o usuário é o criador
    const eventosCriador = await prisma.agendaEvento.findMany({
      where: {
        isActive: true,
        data: eventDate,
        diaInteiro: false,
        criadorId: { in: params.usuarioIds },
        id: { notIn: eventos.map(e => e.id) },
      },
      include: {
        participantes: {
          where: { isActive: true },
          include: { usuario: { select: { id: true, name: true } } },
        },
        tipo: { select: { nome: true, cor: true } },
      },
      orderBy: { horaInicio: 'asc' },
    })

    const todosEventos = [...eventos, ...eventosCriador]

    // Organizar por usuário
    const resultado: Record<string, Array<{ eventoId: string; titulo: string; horaInicio: string; horaFim: string; tipo: string; cor: string }>> = {}
    for (const uid of params.usuarioIds) {
      resultado[uid] = []
    }

    for (const ev of todosEventos) {
      if (!ev.horaInicio || !ev.horaFim) continue

      // Verificar quais dos usuários solicitados participam
      const participantesIds = ev.participantes.map(p => p.usuarioId).filter(Boolean) as string[]
      const envolvidos = params.usuarioIds.filter(uid => participantesIds.includes(uid) || ev.criadorId === uid)

      for (const uid of envolvidos) {
        if (!resultado[uid]!.find(e => e.eventoId === ev.id)) {
          resultado[uid]!.push({
            eventoId: ev.id,
            titulo: ev.titulo,
            horaInicio: ev.horaInicio,
            horaFim: ev.horaFim,
            tipo: ev.tipo.nome,
            cor: ev.tipo.cor,
          })
        }
      }
    }

    return resultado
  }

  /**
   * Disponibilidade combinada num range de datas — usada pela página
   * /agenda/disponibilidade pra montar um grid semanal mostrando quando todos
   * os usuários selecionados estão livres ou ocupados.
   *
   * Retorna eventos com hora definida (não dia-inteiro) onde algum dos usuários
   * solicitados participa OU é criador. Frontend monta o grid e calcula os
   * slots livres por interseção.
   */
  async disponibilidadeRange(params: {
    dataInicio: string  // YYYY-MM-DD
    dataFim: string     // YYYY-MM-DD inclusivo
    usuarioIds: string[]
  }): Promise<Array<{
    id: string
    data: string          // YYYY-MM-DD
    horaInicio: string    // HH:MM
    horaFim: string       // HH:MM
    titulo: string
    tipoNome: string
    tipoCor: string
    usuariosOcupados: string[]   // ids dos solicitados que estão nesse evento
    nomesOcupados: string[]      // nomes correspondentes (pra tooltip)
  }>> {
    if (params.usuarioIds.length === 0) return []
    const inicio = new Date(params.dataInicio)
    const fim = new Date(params.dataFim)

    // Busca eventos com horário onde algum dos usuários (participante OU criador)
    // tem envolvimento no range. Inclui dados pra montar tooltip no frontend.
    const eventos = await prisma.agendaEvento.findMany({
      where: {
        isActive: true,
        diaInteiro: false,
        data: { gte: inicio, lte: fim },
        OR: [
          { criadorId: { in: params.usuarioIds } },
          { participantes: { some: { usuarioId: { in: params.usuarioIds }, isActive: true } } },
        ],
      },
      include: {
        participantes: {
          where: { isActive: true, usuarioId: { in: params.usuarioIds } },
          include: { usuario: { select: { id: true, name: true } } },
        },
        criador: { select: { id: true, name: true } },
        tipo: { select: { nome: true, cor: true } },
      },
      orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
    })

    return eventos
      .filter(ev => ev.horaInicio && ev.horaFim)
      .map(ev => {
        const partIds = ev.participantes.map(p => p.usuarioId).filter(Boolean) as string[]
        const envolvidos = new Set<string>()
        const nomes = new Map<string, string>()
        for (const uid of params.usuarioIds) {
          if (partIds.includes(uid) || ev.criadorId === uid) {
            envolvidos.add(uid)
            // Resolve nome: dos participantes ou do criador
            const p = ev.participantes.find(x => x.usuarioId === uid)
            if (p?.usuario) nomes.set(uid, p.usuario.name)
            else if (ev.criadorId === uid) nomes.set(uid, ev.criador.name)
          }
        }
        const dataIso = ev.data.toISOString().slice(0, 10)
        return {
          id: ev.id,
          data: dataIso,
          horaInicio: ev.horaInicio!,
          horaFim: ev.horaFim!,
          titulo: ev.titulo,
          tipoNome: ev.tipo.nome,
          tipoCor: ev.tipo.cor,
          usuariosOcupados: Array.from(envolvidos),
          nomesOcupados: Array.from(envolvidos).map(id => nomes.get(id) ?? id),
        }
      })
  }

  // ============================================================
  // LOGS
  // ============================================================

  async listLogs(eventoId: string) {
    const logs = await prisma.agendaLog.findMany({
      where: { eventoId },
      orderBy: { createdAt: 'desc' },
    })
    if (logs.length === 0) return []
    // Enriquecimento: busca os nomes dos autores em batch (1 query) e adiciona
    // como campo `usuario`. AgendaLog não tem relação direta no schema, então
    // resolvemos manualmente em vez de mexer na migration.
    const userIds = Array.from(new Set(logs.map(l => l.usuarioId).filter(Boolean)))
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, image: true },
    })
    const userMap = new Map(users.map(u => [u.id, u]))
    return logs.map(l => ({ ...l, usuario: userMap.get(l.usuarioId) ?? null }))
  }

  // ============================================================
  // USUÁRIOS (para seleção de participantes)
  // ============================================================

  /**
   * Lista usuários disponíveis pra adicionar como participantes em eventos.
   * Respeita multi-tenant: usuários comuns só veem colegas da própria empresa;
   * masters veem todos do tenant. Inativos sempre ocultos.
   */
  async listUsuarios(isMaster: boolean, empresaId?: string | null) {
    return prisma.user.findMany({
      where: {
        isActive: true,
        ...(!isMaster && empresaId ? { empresaId } : {}),
      },
      // image pra exibir avatar nos selects de participantes
      select: { id: true, name: true, image: true },
      orderBy: { name: 'asc' },
    })
  }

  // ============================================================
  // IMPORTAR TIPOS DO LEGADO (MySQL OneClick v1)
  // ============================================================

  async importTiposLegado(): Promise<{ importados: number; ignorados: number; erros: number }> {
    // Conectar ao MySQL legado
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: ['OCK_V1_DB_HOST', 'OCK_V1_DB_PORT', 'OCK_V1_DB_USER', 'OCK_V1_DB_PASSWORD', 'OCK_V1_DB_NAME'] } },
    })
    const map = new Map(configs.map(c => [c.key, c.value]))

    const host = map.get('OCK_V1_DB_HOST') || process.env.OCK_V1_DB_HOST
    const port = Number(map.get('OCK_V1_DB_PORT') || process.env.OCK_V1_DB_PORT || '3306')
    const user = map.get('OCK_V1_DB_USER') || process.env.OCK_V1_DB_USER
    const password = map.get('OCK_V1_DB_PASSWORD') || process.env.OCK_V1_DB_PASSWORD
    const database = map.get('OCK_V1_DB_NAME') || process.env.OCK_V1_DB_NAME

    if (!host || !user || !database) {
      throw new Error('Conexão com o banco OneClick v1 não configurada. Configure em Configurações → Banco de Dados → OneClick v1.')
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mysql2 = require('mysql2/promise')
    const conn = await mysql2.createConnection({ host, port, user, password, database, connectTimeout: 10000 })

    const [rows] = await conn.query(
      'SELECT typeid, typename, typecolor, borda, texto, bloqueia_agenda FROM ger_cal_tip WHERE ativo = 1 ORDER BY typename'
    )
    await conn.end()

    const tiposLegado = rows as Array<{
      typeid: number; typename: string; typecolor: string; borda: string; texto: string; bloqueia_agenda: number | null
    }>

    let importados = 0, ignorados = 0, erros = 0

    for (const t of tiposLegado) {
      try {
        // Verificar se já existe pelo nome
        const existing = await prisma.agendaTipo.findFirst({
          where: { nome: { equals: t.typename, mode: 'insensitive' } },
        })
        if (existing) { ignorados++; continue }

        await prisma.agendaTipo.create({
          data: {
            nome: t.typename,
            cor: t.typecolor || '#3b82f6',
            corBorda: t.borda || '#2563eb',
            corTexto: t.texto || '#ffffff',
            bloqueiaAgenda: t.bloqueia_agenda === 1,
          },
        })
        importados++
      } catch {
        erros++
      }
    }

    return { importados, ignorados, erros }
  }

  // ============================================================
  // IMPORTAR EVENTOS DO LEGADO (MySQL OneClick v1)
  // ============================================================

  async importEventosLegado(userId: string, apenasAtivos = true): Promise<{ message: string }> {
    if (this.importProgress.status === 'running') throw new Error('Importação já em andamento.')

    this.importProgress = { status: 'running', total: 0, current: 0, importados: 0, ignorados: 0, erros: 0, participantes: 0, currentEvento: 'Conectando...', items: [] }

    // Executar em background (não bloqueia a resposta)
    this.runImport(userId, apenasAtivos).catch(e => {
      console.error('[Agenda] Falha na importação:', (e as Error).message)
      this.importProgress.status = 'done'
      this.importProgress.currentEvento = `Erro: ${(e as Error).message}`
    })

    return { message: 'Importação iniciada' }
  }

  private async runImport(userId: string, apenasAtivos: boolean) {
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: ['OCK_V1_DB_HOST', 'OCK_V1_DB_PORT', 'OCK_V1_DB_USER', 'OCK_V1_DB_PASSWORD', 'OCK_V1_DB_NAME'] } },
    })
    const cfgMap = new Map(configs.map(c => [c.key, c.value]))

    const host = cfgMap.get('OCK_V1_DB_HOST') || process.env.OCK_V1_DB_HOST
    const port = Number(cfgMap.get('OCK_V1_DB_PORT') || process.env.OCK_V1_DB_PORT || '3306')
    const user = cfgMap.get('OCK_V1_DB_USER') || process.env.OCK_V1_DB_USER
    const password = cfgMap.get('OCK_V1_DB_PASSWORD') || process.env.OCK_V1_DB_PASSWORD
    const database = cfgMap.get('OCK_V1_DB_NAME') || process.env.OCK_V1_DB_NAME

    if (!host || !user || !database) throw new Error('Conexão com o banco OneClick v1 não configurada.')

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mysql2 = require('mysql2/promise')
    const conn = await mysql2.createConnection({ host, port, user, password, database, charset: 'utf8mb4', connectTimeout: 15000 })

    this.importProgress.currentEvento = 'Buscando eventos...'

    const [rows] = await conn.query(
      `SELECT e.eveid, e.evenome, e.evedata, e.evehoraini, e.evehorafim, e.evedesc,
              e.evelocal, e.evecontato, e.eveparticular, e.evemodifica, e.evecontrole,
              e.evetipo, e.evelote, e.everepete, e.eveuser, e.eveativo,
              e.sala, e.presencial, e.numparticipantes, e.link, e.garagem, e.vagas,
              e.arrumar, e.equipamentos, e.id_google,
              t.typename, t.typecolor, t.borda, t.texto,
              u.cad_usu_nome, u.cad_usu_email
       FROM ger_cal e
       LEFT JOIN ger_cal_tip t ON e.evetipo = t.typeid
       LEFT JOIN ger_cad_usu u ON e.eveuser = u.cad_usu_id
       WHERE ${apenasAtivos ? "e.eveativo = '1'" : '1=1'}
       ORDER BY e.evedata ASC`
    )

    this.importProgress.currentEvento = 'Buscando participantes...'

    const [partRows] = await conn.query(
      `SELECT p.id_evento, p.id_participante, p.nome_avulso, p.ativo,
              u.cad_usu_nome, u.cad_usu_email
       FROM ger_cal_participantes p
       LEFT JOIN ger_cad_usu u ON p.id_participante = u.cad_usu_id
       WHERE p.ativo = '1'`
    )
    await conn.end()

    const eventos = rows as Array<Record<string, unknown>>
    const participantesLegado = partRows as Array<Record<string, unknown>>
    this.importProgress.total = eventos.length

    const partMap = new Map<number, Array<Record<string, unknown>>>()
    for (const p of participantesLegado) {
      const evId = Number(p.id_evento)
      if (!partMap.has(evId)) partMap.set(evId, [])
      partMap.get(evId)!.push(p)
    }

    const tiposLocais = await prisma.agendaTipo.findMany({ where: { isActive: true } })
    const tipoMap = new Map<string, string>()
    for (const t of tiposLocais) tipoMap.set(t.nome.toLowerCase(), t.id)

    const usersLocais = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, email: true, name: true } })
    const userByEmail = new Map<string, string>()
    const userByName = new Map<string, string>()
    for (const u of usersLocais) {
      if (u.email) userByEmail.set(u.email.toLowerCase(), u.id)
      userByName.set(u.name.toLowerCase(), u.id)
    }

    for (const ev of eventos) {
      const nomeEvento = decodeHtmlEntities(String(ev.evenome || 'Sem título')) || 'Sem título'
      this.importProgress.current++
      this.importProgress.currentEvento = nomeEvento

      try {
        const legacyId = String(ev.eveid)
        const existing = await prisma.agendaEvento.findFirst({ where: { googleId: `legacy_${legacyId}` } })
        if (existing) {
          this.importProgress.ignorados++
          this.importProgress.items.push({ nome: nomeEvento, status: 'ignorado' })
          continue
        }

        const tipoNome = String(ev.typename || '').toLowerCase()
        let tipoId = tipoMap.get(tipoNome)
        if (!tipoId) {
          if (ev.typename) {
            const novo = await prisma.agendaTipo.create({ data: { nome: String(ev.typename), cor: String(ev.typecolor || '#3b82f6'), corBorda: String(ev.borda || '#2563eb'), corTexto: String(ev.texto || '#ffffff') } })
            tipoId = novo.id
            tipoMap.set(tipoNome, tipoId)
          } else {
            tipoId = tiposLocais[0]?.id
            if (!tipoId) { const fb = await prisma.agendaTipo.create({ data: { nome: 'Geral', cor: '#6b7280', corBorda: '#4b5563', corTexto: '#ffffff' } }); tipoId = fb.id; tiposLocais.push(fb) }
          }
        }

        const criadorEmail = String(ev.cad_usu_email || '').toLowerCase()
        const criadorNome = String(ev.cad_usu_nome || '').toLowerCase()
        const criadorId = userByEmail.get(criadorEmail) || userByName.get(criadorNome) || userId

        const presencaMap: Record<string, string> = { '1': 'PRESENCIAL', '2': 'ONLINE', '3': 'HIBRIDO' }
        const presenca = presencaMap[String(ev.presencial)] || 'PRESENCIAL'
        const recMap: Record<string, string> = { '0': 'NENHUMA', '1': 'DIARIA', '7': 'SEMANAL', '30': 'MENSAL', '365': 'ANUAL' }
        const recorrencia = recMap[String(ev.everepete)] || 'NENHUMA'
        const dataEvento = ev.evedata instanceof Date ? ev.evedata : new Date(String(ev.evedata))

        const evento = await prisma.agendaEvento.create({
          data: {
            titulo: nomeEvento, descricao: decodeHtmlEntities(ev.evedesc ? String(ev.evedesc) : null), data: dataEvento,
            horaInicio: ev.evehoraini ? String(ev.evehoraini).slice(0, 5) : null,
            horaFim: ev.evehorafim ? String(ev.evehorafim).slice(0, 5) : null,
            diaInteiro: !ev.evehoraini || String(ev.evehoraini) === '00:00',
            local: decodeHtmlEntities(ev.evelocal ? String(ev.evelocal) : null), contato: decodeHtmlEntities(ev.evecontato ? String(ev.evecontato) : null),
            link: ev.link ? String(ev.link) : null, presenca: presenca as never,
            particular: String(ev.eveparticular) === '1', editavel: String(ev.evemodifica) !== '0',
            sala: ev.sala ? String(ev.sala) : null, garagem: String(ev.garagem) === '1',
            vagas: ev.vagas ? Number(ev.vagas) : null, equipamentos: String(ev.equipamentos) === '1' ? 'sim' : null,
            isTarefa: String(ev.evecontrole) === '2', isActive: String(ev.eveativo) === '1',
            recorrencia: recorrencia as never, lote: ev.evelote ? String(ev.evelote) : null,
            googleId: `legacy_${legacyId}`, tipoId: tipoId!, criadorId,
          },
        })

        const parts = partMap.get(Number(ev.eveid)) || []
        for (const p of parts) {
          try {
            const pEmail = String(p.cad_usu_email || '').toLowerCase()
            const pNome = String(p.cad_usu_nome || '').toLowerCase()
            const pUserId = userByEmail.get(pEmail) || userByName.get(pNome)
            const nomeAvulso = !pUserId && p.nome_avulso ? decodeHtmlEntities(String(p.nome_avulso)) : (!pUserId && p.cad_usu_nome ? decodeHtmlEntities(String(p.cad_usu_nome)) : null)
            if (pUserId || nomeAvulso) {
              await prisma.agendaParticipante.create({ data: { eventoId: evento.id, usuarioId: pUserId || null, nomeAvulso: pUserId ? null : nomeAvulso } })
              this.importProgress.participantes++
            }
          } catch { /* duplicado */ }
        }

        this.importProgress.importados++
        this.importProgress.items.push({ nome: nomeEvento, status: 'importado' })
      } catch (e) {
        this.importProgress.erros++
        this.importProgress.items.push({ nome: nomeEvento, status: 'erro', erro: (e as Error).message })
      }
    }

    this.importProgress.status = 'done'
    this.importProgress.currentEvento = 'Concluído'
  }

  // ============================================================
  // NOTIFICAÇÃO POR EMAIL
  // ============================================================

  async notificarParticipantes(eventoId: string, acao: 'criado' | 'editado' | 'excluido') {
    try {
      console.log(`[Agenda.notif] Início — evento=${eventoId} acao=${acao}`)
      const evento = await prisma.agendaEvento.findUnique({
        where: { id: eventoId },
        include: {
          tipo: { select: { nome: true, cor: true } },
          criador: { select: { id: true, name: true, email: true, empresaId: true } },
          participantes: {
            where: { isActive: true, usuarioId: { not: null } },
            include: { usuario: { select: { id: true, name: true, email: true } } },
          },
        },
      })
      if (!evento) {
        console.log(`[Agenda.notif] Evento ${eventoId} não encontrado`)
        return
      }
      console.log(`[Agenda.notif] Evento "${evento.titulo}" — criador=${evento.criador.id} empresa=${evento.criador.empresaId} tipo=${evento.tipo?.nome} particular=${evento.particular} isTarefa=${evento.isTarefa} participantes=${evento.participantes.length}`)

      // ── Notificação no sino global ────────────────────────
      // Determina o público alvo conforme o tipo de evento:
      //  • Tipo "Comemorativa" (data especial geral)        → todos da empresa
      //  • Sem participantes específicos (aberto a todos)   → todos da empresa
      //  • Com participantes específicos                    → só os participantes
      // Exceções:
      //  • Eventos `particular: true`               → nunca viram broadcast global
      //  • Tarefas pessoais (`isTarefa: true` sem participantes) → idem
      // O criador é sempre excluído (já sabe da ação).
      const tipoNome = (evento.tipo?.nome ?? '').toLowerCase()
      const ehComemorativa = tipoNome.includes('comemora')
      const semParticipantes = evento.participantes.length === 0
      // Eventos pessoais não viram broadcast — só notificam se tiverem
      // participantes nominais explícitos (e nesse caso só esses).
      const podeBroadcast = !evento.particular && !(evento.isTarefa && semParticipantes)
      const ehParaTodos = podeBroadcast && (ehComemorativa || semParticipantes)

      // Se o criador se incluiu explicitamente como participante, ele recebe
      // a notificação (foi opção dele se considerar participante).
      const criadorEhParticipante = evento.participantes.some(p => p.usuario?.id === evento.criador.id)

      let userIdsParaNotificar: string[] = []
      if (ehParaTodos) {
        // Busca todos os users ativos da empresa do criador
        const usersEmpresa = await prisma.user.findMany({
          where: {
            isActive: true,
            ...(evento.criador.empresaId ? { empresaId: evento.criador.empresaId } : {}),
          },
          select: { id: true },
        })
        // Em broadcast, exclui criador a menos que ele se incluiu nos participantes
        userIdsParaNotificar = usersEmpresa
          .map(u => u.id)
          .filter(id => criadorEhParticipante || id !== evento.criador.id)
      } else {
        // Em evento com participantes nominais, mantém todos (inclui criador
        // se ele estiver na lista — ele se incluiu intencionalmente)
        userIdsParaNotificar = evento.participantes
          .map(p => p.usuario?.id)
          .filter((id): id is string => !!id)
      }

      console.log(`[Agenda.notif] ehComemorativa=${ehComemorativa} semParticipantes=${semParticipantes} podeBroadcast=${podeBroadcast} ehParaTodos=${ehParaTodos} criadorEhParticipante=${criadorEhParticipante} userIdsParaNotificar=${userIdsParaNotificar.length}`)
      if (userIdsParaNotificar.length > 0) {
        console.log(`[Agenda.notif] Vai notificar IDs:`, userIdsParaNotificar)
        const dataDispBR = new Date(evento.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
        const horaDisp = evento.diaInteiro ? 'dia inteiro' : evento.horaInicio ?? ''
        const prefixoTitulo = ehComemorativa
          ? '🎉 '
          : semParticipantes
            ? '📢 '
            : ''
        const tituloN = acao === 'criado'
          ? `${prefixoTitulo}Novo evento na agenda: ${evento.titulo}`
          : acao === 'editado'
            ? `${prefixoTitulo}Evento atualizado: ${evento.titulo}`
            : `${prefixoTitulo}Evento cancelado: ${evento.titulo}`
        const mensagemN = acao === 'excluido'
          ? `${evento.criador.name} cancelou um evento ${ehParaTodos ? 'aberto a todos' : 'que você estava participando'}.`
          : `${dataDispBR}${horaDisp ? ` às ${horaDisp}` : ''}${evento.local ? ` · ${evento.local}` : ''}`
        const tipoN: 'info' | 'success' | 'warning' = acao === 'criado'
          ? (ehComemorativa ? 'success' : 'info')
          : 'warning'

        // Link com eventoId no querystring serve como chave de dedup — uma única
        // notificação por (evento, usuário). Editar várias vezes o evento substitui
        // a notificação anterior pelo estado mais recente.
        const linkN = `/agenda?eventoId=${evento.id}`

        try {
          // Dedup: remove notificações antigas do mesmo evento pros mesmos users
          // antes de criar as novas. Garante 1 notificação por evento por user.
          await prisma.notification.deleteMany({
            where: {
              userId: { in: userIdsParaNotificar },
              origem: 'agenda',
              link: linkN,
            },
          })
        } catch (e) {
          console.warn('[Agenda] Falha ao limpar notificações antigas do evento:', (e as Error).message)
        }

        this.notificationService.criarParaUsers(userIdsParaNotificar, {
          titulo: tituloN,
          mensagem: mensagemN,
          tipo: tipoN,
          link: linkN,
          origem: 'agenda',
          empresaId: evento.criador.empresaId || null,
        }).catch(e => {
          console.warn('[Agenda] Falha ao criar notificações de evento:', (e as Error).message)
        })
      }

      // Email continua restrito aos participantes nominais — evento "para todos"
      // não dispara email global pra evitar spam. Sino global cobre esse caso.
      if (evento.participantes.length === 0) return

      const emails = evento.participantes
        .map(p => p.usuario?.email)
        .filter((e): e is string => !!e)
      if (emails.length === 0) return

      // Buscar logo da empresa do criador
      let logoUrl = ''
      let empresaNome = ''
      if (evento.criador.empresaId) {
        const empresa = await prisma.empresa.findUnique({
          where: { id: evento.criador.empresaId },
          select: { logoUrl: true, nomeFantasia: true, razaoSocial: true },
        })
        if (empresa) {
          logoUrl = empresa.logoUrl ?? ''
          empresaNome = empresa.nomeFantasia ?? empresa.razaoSocial
        }
      }

      // Buscar URL da aplicação
      const appUrlConfig = await prisma.systemConfig.findUnique({ where: { key: 'NEXT_PUBLIC_APP_URL' } })
      const appUrl = appUrlConfig?.value || process.env.NEXT_PUBLIC_APP_URL || ''

      // Se logoUrl é relativo, prefixar com API URL
      if (logoUrl && !logoUrl.startsWith('http')) {
        const apiUrl = process.env.API_URL || 'http://localhost:4000'
        logoUrl = `${apiUrl}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`
      }

      const dataFormatada = new Date(evento.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
      const dataFimFormatada = evento.dataFim ? new Date(evento.dataFim).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null
      const horario = evento.diaInteiro ? 'Dia inteiro' : `${evento.horaInicio ?? ''} — ${evento.horaFim ?? ''}`
      const dataDisplay = dataFimFormatada ? `${dataFormatada} a ${dataFimFormatada}` : dataFormatada

      const acaoLabel = acao === 'criado' ? 'Novo Evento' : acao === 'editado' ? 'Evento Atualizado' : 'Evento Cancelado'
      const acaoIcon = acao === 'criado' ? '📅' : acao === 'editado' ? '✏️' : '❌'
      const acaoCor = acao === 'excluido' ? '#ef4444' : evento.tipo.cor
      const acaoBg = acao === 'excluido' ? '#fef2f2' : `${evento.tipo.cor}15`

      const presencaLabels: Record<string, string> = { PRESENCIAL: '📍 Presencial', ONLINE: '💻 Online', HIBRIDO: '🔄 Híbrido' }
      const presencaLabel = presencaLabels[evento.presenca] || evento.presenca

      const participantesNomes = evento.participantes.map(p => p.usuario?.name).filter(Boolean).join(', ')

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

  <!-- Header com logo -->
  <tr><td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:24px 32px;text-align:center">
    ${logoUrl ? `<img src="${logoUrl}" alt="${empresaNome}" style="max-height:40px;max-width:200px;margin-bottom:8px" />` : ''}
    ${!logoUrl && empresaNome ? `<p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px">${empresaNome}</p>` : ''}
  </td></tr>

  <!-- Badge da ação -->
  <tr><td style="padding:24px 32px 0">
    <table cellpadding="0" cellspacing="0" style="width:100%"><tr>
      <td style="background:${acaoBg};border-left:4px solid ${acaoCor};border-radius:0 8px 8px 0;padding:12px 16px">
        <span style="font-size:13px;font-weight:600;color:${acaoCor}">${acaoIcon} ${acaoLabel}</span>
        <span style="font-size:12px;color:#6b7280;margin-left:8px">· ${evento.tipo.nome}</span>
      </td>
    </tr></table>
  </td></tr>

  <!-- Título do evento -->
  <tr><td style="padding:20px 32px 0">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827;line-height:1.3">${evento.titulo}</h1>
  </td></tr>

  <!-- Detalhes em cards -->
  <tr><td style="padding:20px 32px">
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;width:36px;vertical-align:top">
          <span style="font-size:18px">📆</span>
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6">
          <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600">Data</span><br>
          <span style="font-size:14px;color:#374151;font-weight:500">${dataDisplay}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;width:36px;vertical-align:top">
          <span style="font-size:18px">⏰</span>
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6">
          <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600">Horário</span><br>
          <span style="font-size:14px;color:#374151;font-weight:500">${horario}</span>
        </td>
      </tr>
      ${evento.local || evento.sala ? `<tr>
        <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;width:36px;vertical-align:top">
          <span style="font-size:18px">📍</span>
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6">
          <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600">Local</span><br>
          <span style="font-size:14px;color:#374151;font-weight:500">${[evento.local, evento.sala].filter(Boolean).join(' · ')}</span>
        </td>
      </tr>` : ''}
      <tr>
        <td style="padding:14px 16px;${evento.link ? 'border-bottom:1px solid #f3f4f6;' : ''}width:36px;vertical-align:top">
          <span style="font-size:18px">🏷️</span>
        </td>
        <td style="padding:14px 16px;${evento.link ? 'border-bottom:1px solid #f3f4f6;' : ''}">
          <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600">Modalidade</span><br>
          <span style="font-size:14px;color:#374151;font-weight:500">${presencaLabel}</span>
        </td>
      </tr>
      ${evento.link ? `<tr>
        <td style="padding:14px 16px;width:36px;vertical-align:top">
          <span style="font-size:18px">🔗</span>
        </td>
        <td style="padding:14px 16px">
          <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600">Link da reunião</span><br>
          <a href="${evento.link}" style="font-size:14px;color:#3b82f6;text-decoration:none;font-weight:500;word-break:break-all">${evento.link}</a>
        </td>
      </tr>` : ''}
    </table>
  </td></tr>

  ${evento.link ? `<!-- Botão de acesso -->
  <tr><td style="padding:0 32px 20px;text-align:center">
    <a href="${evento.link}" style="display:inline-block;background:${evento.tipo.cor};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px">Acessar reunião</a>
  </td></tr>` : ''}

  ${participantesNomes ? `<!-- Participantes -->
  <tr><td style="padding:0 32px 20px">
    <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600">👥 Participantes</p>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">${participantesNomes}</p>
  </td></tr>` : ''}

  ${evento.descricao ? `<!-- Descrição -->
  <tr><td style="padding:0 32px 24px">
    <div style="background:#f9fafb;border-radius:8px;padding:16px;border:1px solid #f3f4f6">
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600">Detalhes</p>
      <div style="font-size:13px;color:#4b5563;line-height:1.6">${evento.descricao}</div>
    </div>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center">
    <p style="margin:0 0 4px;font-size:12px;color:#6b7280">Organizado por <strong>${evento.criador.name}</strong></p>
    <p style="margin:0;font-size:11px;color:#9ca3af">Agenda Corporativa${empresaNome ? ` · ${empresaNome}` : ''}</p>
    ${appUrl ? `<p style="margin:8px 0 0"><a href="${appUrl}/agenda" style="font-size:11px;color:#3b82f6;text-decoration:none">Abrir no sistema →</a></p>` : ''}
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`

      await this.emailService.sendMail({
        to: emails,
        subject: `${acaoIcon} ${acaoLabel}: ${evento.titulo} — ${dataDisplay}`,
        html,
      })
    } catch (e) {
      console.error('[Agenda] Falha ao notificar participantes:', (e as Error).message)
    }
  }

  // ============================================================
  // Gate de conflito — aplicado em create/update conforme AgendaConfig
  // ============================================================

  /**
   * Antes de salvar um evento, lê a config global e dependendo dela:
   *   - DESLIGADO: pula a verificação
   *   - AVISAR:    NÃO bloqueia aqui (front já mostrou o dialog e usuário confirmou)
   *   - BLOQUEAR:  re-verifica e lança erro se houver conflito do tipo bloqueado
   *
   * Eventos dia-inteiro ou sem horário definido são liberados (não há overlap a checar).
   */
  private async aplicarGateConflito(params: {
    data: string
    horaInicio?: string | null
    horaFim?: string | null
    diaInteiro?: boolean | null
    participanteIds?: string[]
    sala?: string
    salaId?: string
    eventoIdExcluir?: string
    tipoId?: string
  }): Promise<void> {
    if (params.diaInteiro) return
    if (!params.horaInicio || !params.horaFim) return

    // Tipo não-bloqueador (ex.: LEMBRETE CORPORATIVO) — sai antes mesmo de ler config.
    if (params.tipoId) {
      const tipoSel = await prisma.agendaTipo.findUnique({
        where: { id: params.tipoId },
        select: { bloqueiaAgenda: true },
      })
      if (tipoSel && !tipoSel.bloqueiaAgenda) return
    }

    const cfg = await this.configService.get()
    if (cfg.conflitoParticipante !== 'BLOQUEAR' && cfg.conflitoSala !== 'BLOQUEAR') return

    const conflitos = await this.verificarConflitos({
      data: params.data,
      horaInicio: params.horaInicio,
      horaFim: params.horaFim,
      participanteIds: params.participanteIds,
      sala: params.sala,
      salaId: params.salaId,
      eventoIdExcluir: params.eventoIdExcluir,
      tipoId: params.tipoId,
    })

    if (conflitos.length === 0) return

    const bloqueiaParticipante = cfg.conflitoParticipante === 'BLOQUEAR'
    const bloqueiaSala = cfg.conflitoSala === 'BLOQUEAR'
    const fatais = conflitos.filter(c =>
      (c.tipo === 'participante' && bloqueiaParticipante) ||
      (c.tipo === 'sala' && bloqueiaSala),
    )
    if (fatais.length === 0) return

    const detalhe = fatais.map(c => `${c.tipo === 'sala' ? 'Sala' : 'Participante'} "${c.nome}" em "${c.evento}" (${c.horario})`).join('; ')
    throw new Error(`Conflito de agenda — evento bloqueado pelas regras da empresa: ${detalhe}`)
  }
}
