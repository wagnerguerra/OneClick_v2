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
  participanteIds?: string[]
  participantesAvulsos?: string[]
  recorrencia?: 'NENHUMA' | 'DIARIA' | 'SEMANAL' | 'MENSAL' | 'ANUAL'
  recorrenciaVezes?: number | null
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
  participanteIds?: string[]
  participantesAvulsos?: string[]
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
            usuario: { select: { id: true, name: true } },
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
            usuario: { select: { id: true, name: true } },
          },
        },
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })
  }

  async create(input: CreateEventoInput, userId: string) {
    const {
      titulo, descricao, data, dataFim, horaInicio, horaFim, diaInteiro,
      local, contato, link, presenca, particular, editavel,
      sala, salaId, garagem, vagas, equipamentos, isTarefa,
      tipoId, empresaId, participanteIds, participantesAvulsos,
      recorrencia, recorrenciaVezes,
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

    // Gate de conflito conforme AgendaConfig — pula se diaInteiro/sem horários.
    await this.aplicarGateConflito({
      data, horaInicio, horaFim, diaInteiro,
      participanteIds, sala: sala || undefined, salaId: salaId || undefined,
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
          recorrencia: rec as never,
          recorrenciaVezes: isRecurrent ? vezes : null,
          lote,
        },
      })

      // Create participants (user-based)
      if (participanteIds && participanteIds.length > 0) {
        await prisma.agendaParticipante.createMany({
          data: participanteIds.map((uid) => ({
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

    // Notificar participantes (assíncrono, não bloqueia)
    for (const ev of createdEvents) {
      this.notificarParticipantes(ev.id, 'criado').catch((e: Error) => {
        console.error(`[Agenda] Falha ao notificar participantes (criado, ev=${ev.id}):`, e.message, e.stack)
      })
    }

    return createdEvents.length === 1 ? createdEvents[0]! : createdEvents
  }

  async update(id: string, data: UpdateEventoInput, userId: string) {
    const evento = await prisma.agendaEvento.findUniqueOrThrow({ where: { id } })

    // Editavel=false vem de eventos importados do legado (SERPRO2, evemodifica='0').
    // Regra: o criador (inclusive quem "herdou" o evento via mapeamento de email no
    // import) sempre pode editar — alinha com o front que mostra "Editar" pro dono.
    if (!evento.editavel && evento.criadorId !== userId) {
      throw new Error('Este evento não pode ser editado.')
    }

    // Gate de conflito conforme AgendaConfig — usa os valores novos quando passados,
    // ou os atuais do evento como fallback. Pula se diaInteiro/sem horários.
    await this.aplicarGateConflito({
      data: data.data ?? evento.data.toISOString().slice(0, 10),
      horaInicio: data.horaInicio !== undefined ? data.horaInicio : evento.horaInicio,
      horaFim: data.horaFim !== undefined ? data.horaFim : evento.horaFim,
      diaInteiro: data.diaInteiro !== undefined ? data.diaInteiro : evento.diaInteiro,
      participanteIds: data.participanteIds,
      sala: data.sala !== undefined ? (data.sala || undefined) : (evento.sala || undefined),
      salaId: data.salaId !== undefined ? (data.salaId || undefined) : (evento.salaId || undefined),
      eventoIdExcluir: id,
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

    // Create audit log
    await prisma.agendaLog.create({
      data: {
        eventoId: id,
        usuarioId: userId,
        acao: 'editado',
      },
    })

    // Notificar participantes
    this.notificarParticipantes(updated.id, 'editado').catch((e: Error) => {
      console.error(`[Agenda] Falha ao notificar participantes (editado, ev=${updated.id}):`, e.message, e.stack)
    })

    return updated
  }

  async delete(id: string, userId: string) {
    // Notificar antes do soft delete
    this.notificarParticipantes(id, 'excluido').catch((e: Error) => {
      console.error(`[Agenda] Falha ao notificar participantes (excluido, ev=${id}):`, e.message, e.stack)
    })

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
  }) {
    const { data, horaInicio, horaFim, participanteIds, sala, salaId, eventoIdExcluir } = params
    const conflitos: Array<{ tipo: 'participante' | 'sala'; nome: string; evento: string; horario: string }> = []

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
          // Buscar nomes
          const users = await prisma.user.findMany({
            where: { id: { in: conflitados } },
            select: { id: true, name: true },
          })
          for (const u of users) {
            conflitos.push({
              tipo: 'participante',
              nome: u.name,
              evento: ev.titulo,
              horario: `${ev.horaInicio} — ${ev.horaFim}`,
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
    return prisma.agendaLog.findMany({
      where: { eventoId },
      orderBy: { createdAt: 'desc' },
    })
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
      select: { id: true, name: true },
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
  }): Promise<void> {
    if (params.diaInteiro) return
    if (!params.horaInicio || !params.horaFim) return

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
