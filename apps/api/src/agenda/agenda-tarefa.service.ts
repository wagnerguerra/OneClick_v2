import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { AgendaLembreteCanal } from '@saas/db'
import { randomUUID } from 'crypto'

/**
 * Tarefas da agenda — entidade separada do AgendaEvento. Estilo Google Tasks,
 * porém com MEMBROS (criador + participantes). Cada membro dá CIÊNCIA da
 * finalização; quando todos estão cientes, a tarefa é considerada concluída
 * (campo `concluida` recalculado aqui). Acesso aos membros via SQL raw
 * (tabela agenda_tarefa_participantes) p/ não depender de `prisma generate`.
 */
@Injectable()
export class AgendaTarefaService {
  // ── Membros / ciência (SQL raw) ─────────────────────────────────
  private async membrosDeTarefas(ids: string[]): Promise<Map<string, any[]>> {
    const map = new Map<string, any[]>()
    if (!ids.length) return map
    const ph = ids.map((_, i) => `$${i + 1}`).join(',')
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT p.tarefa_id, p.usuario_id, p.ciente_em, u.name, u.image
       FROM agenda_tarefa_participantes p JOIN users u ON u.id = p.usuario_id
       WHERE p.tarefa_id IN (${ph})
       ORDER BY p.created_at ASC`,
      ...ids,
    )
    for (const r of rows) {
      const arr = map.get(r.tarefa_id) ?? []
      arr.push({ usuarioId: r.usuario_id, name: r.name, image: r.image, cienteEm: r.ciente_em, ciente: !!r.ciente_em })
      map.set(r.tarefa_id, arr)
    }
    return map
  }

  /** Recalcula `concluida`: true sse há membros e TODOS deram ciência. */
  private async recomputeConcluida(tarefaId: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int AS total, COUNT(ciente_em)::int AS cientes, MAX(ciente_em) AS ultima
       FROM agenda_tarefa_participantes WHERE tarefa_id = $1`, tarefaId,
    )
    const total = rows[0]?.total ?? 0
    const cientes = rows[0]?.cientes ?? 0
    const concluida = total > 0 && cientes === total
    await prisma.agendaTarefa.update({
      where: { id: tarefaId },
      data: { concluida, concluidaEm: concluida ? (rows[0]?.ultima ?? new Date()) : null },
    })
  }

  /** Define os membros (criador sempre incluso; nunca removido). */
  private async setMembros(tarefaId: string, participantes: string[], criadorId: string) {
    const desejados = Array.from(new Set([criadorId, ...participantes.filter(Boolean)]))
    const existentes = (await prisma.$queryRawUnsafe<any[]>(
      `SELECT usuario_id FROM agenda_tarefa_participantes WHERE tarefa_id = $1`, tarefaId,
    )).map(r => r.usuario_id)
    const adicionar = desejados.filter(u => !existentes.includes(u))
    const remover = existentes.filter(u => !desejados.includes(u) && u !== criadorId)
    for (const uid of adicionar) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO agenda_tarefa_participantes (id, tarefa_id, usuario_id) VALUES ($1,$2,$3)
         ON CONFLICT (tarefa_id, usuario_id) DO NOTHING`,
        randomUUID(), tarefaId, uid,
      )
    }
    if (remover.length) {
      const ph = remover.map((_, i) => `$${i + 2}`).join(',')
      await prisma.$executeRawUnsafe(
        `DELETE FROM agenda_tarefa_participantes WHERE tarefa_id = $1 AND usuario_id IN (${ph})`,
        tarefaId, ...remover,
      )
    }
    await this.recomputeConcluida(tarefaId)
  }

  /** Membro dá (ou retira) ciência da finalização. */
  async darCiencia(tarefaId: string, usuarioId: string, ciente: boolean) {
    await prisma.$executeRawUnsafe(
      `UPDATE agenda_tarefa_participantes SET ciente_em = ${ciente ? 'CURRENT_TIMESTAMP' : 'NULL'}
       WHERE tarefa_id = $1 AND usuario_id = $2`,
      tarefaId, usuarioId,
    )
    await this.recomputeConcluida(tarefaId)
    return this.getById(tarefaId)
  }

  // ── Leitura ──────────────────────────────────────────────────────
  /**
   * Lista tarefas onde o usuário é MEMBRO (criador OU participante).
   * Sem `usuarioId` (master c/ todasDoTenant): vê todas.
   */
  async list(filtros: {
    usuarioId?: string
    apenasAbertas?: boolean
    apenasConcluidas?: boolean
    dataInicio?: string
    dataFim?: string
    empresaId?: string | null
  }) {
    const where: Record<string, unknown> = {}
    if (filtros.usuarioId) {
      const memberIds = (await prisma.$queryRawUnsafe<any[]>(
        `SELECT tarefa_id FROM agenda_tarefa_participantes WHERE usuario_id = $1`, filtros.usuarioId,
      )).map(r => r.tarefa_id)
      where.OR = [
        { criadorId: filtros.usuarioId },
        ...(memberIds.length ? [{ id: { in: memberIds } }] : []),
      ]
    }
    if (filtros.apenasAbertas) where.concluida = false
    if (filtros.apenasConcluidas) where.concluida = true
    if (filtros.empresaId) where.empresaId = filtros.empresaId
    if (filtros.dataInicio || filtros.dataFim) {
      const prazo: Record<string, Date> = {}
      if (filtros.dataInicio) prazo.gte = new Date(filtros.dataInicio + 'T00:00:00.000Z')
      if (filtros.dataFim) prazo.lte = new Date(filtros.dataFim + 'T23:59:59.999Z')
      where.prazo = prazo
    }
    const tarefas = await prisma.agendaTarefa.findMany({
      where,
      orderBy: [{ concluida: 'asc' }, { prazo: 'asc' }],
      include: {
        criador: { select: { id: true, name: true, image: true } },
        lembretes: { orderBy: { minutosAntes: 'asc' } },
      },
    })
    const membros = await this.membrosDeTarefas(tarefas.map(t => t.id))
    return tarefas.map(t => ({ ...t, membros: membros.get(t.id) ?? [] }))
  }

  async getById(id: string) {
    const tarefa = await prisma.agendaTarefa.findUniqueOrThrow({
      where: { id },
      include: {
        criador: { select: { id: true, name: true, image: true } },
        lembretes: { orderBy: { minutosAntes: 'asc' } },
      },
    })
    const membros = (await this.membrosDeTarefas([id])).get(id) ?? []
    return { ...tarefa, membros }
  }

  // ── Escrita ──────────────────────────────────────────────────────
  async create(input: {
    titulo: string
    descricao?: string | null
    prazo: string
    horaPrazo?: string | null
    prioridade?: 'BAIXA' | 'NORMAL' | 'ALTA'
    participantes?: string[]
    empresaId?: string | null
  }, criadorId: string) {
    const t = await prisma.agendaTarefa.create({
      data: {
        titulo: input.titulo,
        descricao: input.descricao ?? null,
        prazo: new Date(input.prazo + 'T00:00:00.000Z'),
        horaPrazo: input.horaPrazo ?? null,
        prioridade: input.prioridade ?? 'NORMAL',
        criadorId,
        empresaId: input.empresaId ?? null,
      },
    })
    await this.setMembros(t.id, input.participantes ?? [], criadorId)
    return this.getById(t.id)
  }

  async update(id: string, data: {
    titulo?: string
    descricao?: string | null
    prazo?: string
    horaPrazo?: string | null
    prioridade?: 'BAIXA' | 'NORMAL' | 'ALTA'
    participantes?: string[]
  }) {
    const updateData: Record<string, unknown> = {}
    if (data.titulo !== undefined) updateData.titulo = data.titulo
    if (data.descricao !== undefined) updateData.descricao = data.descricao
    if (data.prazo !== undefined) updateData.prazo = new Date(data.prazo + 'T00:00:00.000Z')
    if (data.horaPrazo !== undefined) updateData.horaPrazo = data.horaPrazo
    if (data.prioridade !== undefined) updateData.prioridade = data.prioridade
    if (Object.keys(updateData).length) {
      await prisma.agendaTarefa.update({ where: { id }, data: updateData })
    }
    if (data.participantes !== undefined) {
      const t = await prisma.agendaTarefa.findUniqueOrThrow({ where: { id }, select: { criadorId: true } })
      await this.setMembros(id, data.participantes, t.criadorId)
    }
    return this.getById(id)
  }

  async delete(id: string) {
    return prisma.agendaTarefa.delete({ where: { id } })
  }

  // ── Lembretes ────────────────────────────────────────────────────
  async listLembretes(tarefaId: string) {
    return prisma.agendaTarefaLembrete.findMany({
      where: { tarefaId },
      orderBy: { minutosAntes: 'asc' },
    })
  }

  async saveLembretes(tarefaId: string, lembretes: Array<{ canal: AgendaLembreteCanal; minutosAntes: number }>) {
    await prisma.agendaTarefaLembrete.deleteMany({ where: { tarefaId } })
    if (lembretes.length === 0) return []
    await prisma.agendaTarefaLembrete.createMany({
      data: lembretes.map(l => ({ tarefaId, canal: l.canal, minutosAntes: l.minutosAntes })),
    })
    return this.listLembretes(tarefaId)
  }
}
