import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { AgendaLembreteCanal } from '@saas/db'

/**
 * Tarefas da agenda — entidade separada do AgendaEvento. Sem participantes,
 * sem sala, sem link, sem conflito de horário. Estilo Google Tasks.
 */
@Injectable()
export class AgendaTarefaService {
  /**
   * Lista tarefas com filtros opcionais. Scope:
   * - Sem `usuarioId`: master (vê todas)
   * - Com `usuarioId`: apenas tarefas onde criadorId = usuarioId
   */
  async list(filtros: {
    usuarioId?: string                    // se setado, filtra por criador
    apenasAbertas?: boolean
    apenasConcluidas?: boolean
    dataInicio?: string                   // yyyy-MM-dd
    dataFim?: string
    empresaId?: string | null
  }) {
    const where: Record<string, unknown> = {}
    if (filtros.usuarioId) where.criadorId = filtros.usuarioId
    if (filtros.apenasAbertas) where.concluida = false
    if (filtros.apenasConcluidas) where.concluida = true
    if (filtros.empresaId) where.empresaId = filtros.empresaId
    if (filtros.dataInicio || filtros.dataFim) {
      const prazo: Record<string, Date> = {}
      if (filtros.dataInicio) prazo.gte = new Date(filtros.dataInicio + 'T00:00:00.000Z')
      if (filtros.dataFim) prazo.lte = new Date(filtros.dataFim + 'T23:59:59.999Z')
      where.prazo = prazo
    }
    return prisma.agendaTarefa.findMany({
      where,
      orderBy: [{ concluida: 'asc' }, { prazo: 'asc' }],
      include: {
        criador: { select: { id: true, name: true, image: true } },
        lembretes: { orderBy: { minutosAntes: 'asc' } },
      },
    })
  }

  async getById(id: string) {
    return prisma.agendaTarefa.findUniqueOrThrow({
      where: { id },
      include: {
        criador: { select: { id: true, name: true, image: true } },
        lembretes: { orderBy: { minutosAntes: 'asc' } },
      },
    })
  }

  async create(input: {
    titulo: string
    descricao?: string | null
    prazo: string                          // yyyy-MM-dd
    horaPrazo?: string | null              // HH:MM opcional
    prioridade?: 'BAIXA' | 'NORMAL' | 'ALTA'
    empresaId?: string | null
  }, criadorId: string) {
    return prisma.agendaTarefa.create({
      data: {
        titulo: input.titulo,
        descricao: input.descricao ?? null,
        prazo: new Date(input.prazo + 'T00:00:00.000Z'),
        horaPrazo: input.horaPrazo ?? null,
        prioridade: input.prioridade ?? 'NORMAL',
        criadorId,
        empresaId: input.empresaId ?? null,
      },
      include: {
        criador: { select: { id: true, name: true, image: true } },
        lembretes: true,
      },
    })
  }

  async update(id: string, data: {
    titulo?: string
    descricao?: string | null
    prazo?: string
    horaPrazo?: string | null
    prioridade?: 'BAIXA' | 'NORMAL' | 'ALTA'
  }) {
    const updateData: Record<string, unknown> = {}
    if (data.titulo !== undefined) updateData.titulo = data.titulo
    if (data.descricao !== undefined) updateData.descricao = data.descricao
    if (data.prazo !== undefined) updateData.prazo = new Date(data.prazo + 'T00:00:00.000Z')
    if (data.horaPrazo !== undefined) updateData.horaPrazo = data.horaPrazo
    if (data.prioridade !== undefined) updateData.prioridade = data.prioridade
    return prisma.agendaTarefa.update({
      where: { id },
      data: updateData,
      include: {
        criador: { select: { id: true, name: true, image: true } },
        lembretes: { orderBy: { minutosAntes: 'asc' } },
      },
    })
  }

  /** Toggle concluida — atualiza concluidaEm pra agora ou null. */
  async toggleConcluida(id: string, concluida: boolean) {
    return prisma.agendaTarefa.update({
      where: { id },
      data: {
        concluida,
        concluidaEm: concluida ? new Date() : null,
      },
    })
  }

  async delete(id: string) {
    // Cascade pelo schema apaga os lembretes
    return prisma.agendaTarefa.delete({ where: { id } })
  }

  // ============================================================
  // Lembretes
  // ============================================================

  async listLembretes(tarefaId: string) {
    return prisma.agendaTarefaLembrete.findMany({
      where: { tarefaId },
      orderBy: { minutosAntes: 'asc' },
    })
  }

  /** Sync atômico — substitui todos os lembretes da tarefa. */
  async saveLembretes(tarefaId: string, lembretes: Array<{ canal: AgendaLembreteCanal; minutosAntes: number }>) {
    await prisma.agendaTarefaLembrete.deleteMany({ where: { tarefaId } })
    if (lembretes.length === 0) return []
    await prisma.agendaTarefaLembrete.createMany({
      data: lembretes.map(l => ({ tarefaId, canal: l.canal, minutosAntes: l.minutosAntes })),
    })
    return this.listLembretes(tarefaId)
  }
}
