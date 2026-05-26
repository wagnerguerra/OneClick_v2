import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import type {
  CreateProjetoInput,
  UpdateProjetoInput,
  ListProjetosInput,
  CreateTarefaInput,
  UpdateTarefaInput,
  ListTarefasInput,
  MoverTarefaInput,
  ReordenarTarefasInput,
  CreateProjetoTagInput,
  UpdateProjetoTagInput,
  AddComentarioTarefaInput,
  AddAnexoTarefaInput,
  TarefaStatus,
} from '@saas/types'

@Injectable()
export class ProjetoService {
  // ── Projetos ────────────────────────────────────────────────

  async listProjetos(input: ListProjetosInput) {
    const where: any = { isActive: true }
    if (input.status) where.status = input.status
    if (input.responsavelId) where.responsavelId = input.responsavelId
    if (input.search) {
      where.OR = [
        { nome: { contains: input.search, mode: 'insensitive' } },
        { descricao: { contains: input.search, mode: 'insensitive' } },
      ]
    }

    const orderBy: any = input.sortBy
      ? { [input.sortBy]: input.sortDir }
      : { createdAt: 'desc' }

    const [total, items] = await Promise.all([
      prisma.projeto.count({ where }),
      prisma.projeto.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: {
          _count: { select: { tarefas: true } },
        },
      }),
    ])

    // Enriquecer com responsável (lookup em batch) e tarefa "vencendo antes"
    // pra exibir no card do Kanban sem N+1.
    const responsavelIds = Array.from(
      new Set(items.map((p) => p.responsavelId).filter((x): x is string => !!x)),
    )
    const projetoIds = items.map((p) => p.id)

    const [responsaveis, proximasTarefas] = await Promise.all([
      responsavelIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: responsavelIds } },
            select: { id: true, name: true, image: true },
          })
        : Promise.resolve([]),
      projetoIds.length > 0
        ? prisma.projetoTarefa.findMany({
            where: {
              projetoId: { in: projetoIds },
              status: { notIn: ['CONCLUIDO', 'CANCELADO'] },
              prazo: { not: null },
            },
            select: { id: true, projetoId: true, titulo: true, prazo: true },
            orderBy: { prazo: 'asc' },
          })
        : Promise.resolve([]),
    ])

    const respById = new Map(responsaveis.map((u) => [u.id, u]))
    // Primeira tarefa (mais antiga em prazo) por projeto
    const tarefaPorProjeto = new Map<string, typeof proximasTarefas[number]>()
    for (const t of proximasTarefas) {
      if (!tarefaPorProjeto.has(t.projetoId)) tarefaPorProjeto.set(t.projetoId, t)
    }

    const enriched = items.map((p) => ({
      ...p,
      responsavel: p.responsavelId ? respById.get(p.responsavelId) ?? null : null,
      tarefaProximoVencimento: tarefaPorProjeto.get(p.id) ?? null,
    }))

    return { items: enriched, total, page: input.page, limit: input.limit }
  }

  async getProjetoById(id: string) {
    const projeto = await prisma.projeto.findUnique({
      where: { id },
      include: {
        tags: true,
        _count: { select: { tarefas: true, mensagens: true, anexos: true } },
      },
    })
    if (!projeto) throw new TRPCError({ code: 'NOT_FOUND', message: 'Projeto não encontrado' })
    // Enriquecer com responsavel
    const responsavel = projeto.responsavelId
      ? await prisma.user.findUnique({
          where: { id: projeto.responsavelId },
          select: { id: true, name: true, image: true },
        })
      : null
    return { ...projeto, responsavel }
  }

  async createProjeto(input: CreateProjetoInput, userId: string | null) {
    return prisma.projeto.create({
      data: {
        nome: input.nome,
        descricao: input.descricao ?? null,
        cor: input.cor ?? '#22d3ee',
        status: input.status ?? 'NOVO',
        responsavelId: input.responsavelId ?? userId ?? null,
        dataInicio: input.dataInicio ? new Date(input.dataInicio) : null,
        dataPrevisao: input.dataPrevisao ? new Date(input.dataPrevisao) : null,
      },
    })
  }

  async updateProjeto(id: string, input: UpdateProjetoInput, autorId: string | null = null) {
    const atual = await this.getProjetoById(id)

    // Detecta mudanças relevantes pra timeline do projeto
    const eventos: Array<{ tipo: string; antes: string | null; depois: string | null }> = []
    if (input.status !== undefined && input.status !== atual.status) {
      eventos.push({ tipo: 'status', antes: atual.status, depois: input.status })
    }
    if (input.responsavelId !== undefined && input.responsavelId !== atual.responsavelId) {
      eventos.push({
        tipo: 'responsavel',
        antes: atual.responsavelId ?? null,
        depois: input.responsavelId ?? null,
      })
    }
    if (input.dataPrevisao !== undefined) {
      const antes = atual.dataPrevisao?.toISOString() ?? null
      const depois = input.dataPrevisao ?? null
      if (antes !== depois) eventos.push({ tipo: 'prazo', antes, depois })
    }

    const projeto = await prisma.projeto.update({
      where: { id },
      data: {
        ...(input.nome !== undefined && { nome: input.nome }),
        ...(input.descricao !== undefined && { descricao: input.descricao }),
        ...(input.cor !== undefined && { cor: input.cor }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.responsavelId !== undefined && { responsavelId: input.responsavelId }),
        ...(input.dataInicio !== undefined && {
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : null,
        }),
        ...(input.dataPrevisao !== undefined && {
          dataPrevisao: input.dataPrevisao ? new Date(input.dataPrevisao) : null,
        }),
      },
    })

    // Grava eventos fora da update
    for (const ev of eventos) {
      await this.gravarEventoProjeto(id, ev.tipo, autorId, null, ev.antes, ev.depois)
    }

    return projeto
  }

  async deleteProjeto(id: string) {
    await this.getProjetoById(id)
    return prisma.projeto.update({
      where: { id },
      data: { isActive: false },
    })
  }

  // ── Tarefas ─────────────────────────────────────────────────

  async listTarefas(input: ListTarefasInput) {
    const where: any = { projetoId: input.projetoId }
    if (input.status) where.status = input.status
    if (input.responsavelId) where.responsavelId = input.responsavelId
    if (input.prioridade) where.prioridade = input.prioridade
    if (input.tagId) where.tags = { some: { tagId: input.tagId } }
    if (input.search) {
      where.OR = [
        { titulo: { contains: input.search, mode: 'insensitive' } },
        { descricao: { contains: input.search, mode: 'insensitive' } },
      ]
    }

    const orderBy: any = input.sortBy
      ? { [input.sortBy]: input.sortDir }
      : [{ ordem: 'asc' }, { createdAt: 'desc' }]

    const [total, items] = await Promise.all([
      prisma.projetoTarefa.count({ where }),
      prisma.projetoTarefa.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: {
          tags: { include: { tag: true } },
          _count: { select: { anexos: true, eventos: true, children: true } },
        },
      }),
    ])

    return { items, total, page: input.page, limit: input.limit }
  }

  // Lista completa pra kanban (sem paginação — devolve tudo por status)
  async listTarefasKanban(projetoId: string) {
    const tarefas = await prisma.projetoTarefa.findMany({
      where: { projetoId },
      orderBy: [{ status: 'asc' }, { ordem: 'asc' }],
      include: {
        tags: { include: { tag: true } },
        _count: { select: { anexos: true, eventos: true } },
      },
    })
    return tarefas
  }

  async getTarefaById(id: string) {
    const tarefa = await prisma.projetoTarefa.findUnique({
      where: { id },
      include: {
        tags: { include: { tag: true } },
        anexos: { orderBy: { createdAt: 'desc' } },
        eventos: { orderBy: { createdAt: 'desc' } },
        projeto: { select: { id: true, nome: true, cor: true } },
      },
    })
    if (!tarefa) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tarefa não encontrada' })
    return tarefa
  }

  async createTarefa(input: CreateTarefaInput, autorId: string | null) {
    // Próxima ordem dentro do status
    const maxOrdem = await prisma.projetoTarefa.aggregate({
      where: { projetoId: input.projetoId, status: input.status ?? 'BACKLOG' },
      _max: { ordem: true },
    })

    const tarefa = await prisma.projetoTarefa.create({
      data: {
        projetoId: input.projetoId,
        titulo: input.titulo,
        descricao: input.descricao ?? null,
        status: input.status ?? 'BACKLOG',
        prioridade: input.prioridade ?? 'MEDIA',
        responsavelId: input.responsavelId ?? null,
        prazo: input.prazo ? new Date(input.prazo) : null,
        estimativa: input.estimativa ?? null,
        parentId: input.parentId ?? null,
        ordem: (maxOrdem._max.ordem ?? -1) + 1,
        ...(input.tagIds && input.tagIds.length > 0 && {
          tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
        }),
      },
      include: { tags: { include: { tag: true } } },
    })

    await this.gravarEvento(tarefa.id, 'criou', autorId, null, null, null)

    return tarefa
  }

  async updateTarefa(id: string, input: UpdateTarefaInput, autorId: string | null) {
    const atual = await this.getTarefaById(id)

    // Detecta mudanças relevantes pra timeline
    const eventos: Array<{ tipo: string; antes: string | null; depois: string | null }> = []
    if (input.status !== undefined && input.status !== atual.status) {
      eventos.push({ tipo: 'status', antes: atual.status, depois: input.status })
    }
    if (input.responsavelId !== undefined && input.responsavelId !== atual.responsavelId) {
      eventos.push({ tipo: 'responsavel', antes: atual.responsavelId, depois: input.responsavelId ?? null })
    }
    if (input.prioridade !== undefined && input.prioridade !== atual.prioridade) {
      eventos.push({ tipo: 'prioridade', antes: atual.prioridade, depois: input.prioridade })
    }
    if (input.prazo !== undefined) {
      const antes = atual.prazo?.toISOString() ?? null
      const depois = input.prazo ?? null
      if (antes !== depois) eventos.push({ tipo: 'prazo', antes, depois })
    }

    const tarefa = await prisma.$transaction(async (tx) => {
      // Atualiza tarefa
      const updated = await tx.projetoTarefa.update({
        where: { id },
        data: {
          ...(input.titulo !== undefined && { titulo: input.titulo }),
          ...(input.descricao !== undefined && { descricao: input.descricao }),
          ...(input.status !== undefined && {
            status: input.status,
            concluidoEm: input.status === 'CONCLUIDO' ? new Date() : null,
          }),
          ...(input.prioridade !== undefined && { prioridade: input.prioridade }),
          ...(input.responsavelId !== undefined && { responsavelId: input.responsavelId }),
          ...(input.prazo !== undefined && { prazo: input.prazo ? new Date(input.prazo) : null }),
          ...(input.estimativa !== undefined && { estimativa: input.estimativa }),
          ...(input.parentId !== undefined && { parentId: input.parentId }),
        },
        include: { tags: { include: { tag: true } } },
      })

      // Substitui tags se fornecidas
      if (input.tagIds !== undefined) {
        await tx.projetoTarefaTag.deleteMany({ where: { tarefaId: id } })
        if (input.tagIds.length > 0) {
          await tx.projetoTarefaTag.createMany({
            data: input.tagIds.map((tagId) => ({ tarefaId: id, tagId })),
          })
        }
      }

      return updated
    })

    // Grava eventos fora da tx pra não bloquear
    for (const ev of eventos) {
      await this.gravarEvento(id, ev.tipo, autorId, null, ev.antes, ev.depois)
    }

    return tarefa
  }

  async deleteTarefa(id: string) {
    await this.getTarefaById(id)
    return prisma.projetoTarefa.delete({ where: { id } })
  }

  async moverTarefa(input: MoverTarefaInput, autorId: string | null) {
    const atual = await this.getTarefaById(input.id)
    const mudouStatus = atual.status !== input.status

    const tarefa = await prisma.projetoTarefa.update({
      where: { id: input.id },
      data: {
        status: input.status,
        ...(input.ordem !== undefined && { ordem: input.ordem }),
        ...(input.status === 'CONCLUIDO' && { concluidoEm: new Date() }),
        ...(mudouStatus && input.status !== 'CONCLUIDO' && atual.status === 'CONCLUIDO' && { concluidoEm: null }),
      },
    })

    if (mudouStatus) {
      await this.gravarEvento(input.id, 'status', autorId, null, atual.status, input.status)
    }

    return tarefa
  }

  async reordenarTarefas(input: ReordenarTarefasInput) {
    // Atualiza ordem em batch
    await prisma.$transaction(
      input.ids.map((id, ordem) =>
        prisma.projetoTarefa.update({
          where: { id },
          data: { ordem, status: input.status as TarefaStatus },
        }),
      ),
    )
    return { ok: true }
  }

  // ── Tags ────────────────────────────────────────────────────

  async listTags(projetoId: string) {
    return prisma.projetoTag.findMany({
      where: { projetoId },
      orderBy: { nome: 'asc' },
    })
  }

  async createTag(input: CreateProjetoTagInput) {
    return prisma.projetoTag.create({
      data: {
        projetoId: input.projetoId,
        nome: input.nome,
        cor: input.cor ?? '#94a3b8',
      },
    })
  }

  async updateTag(id: string, input: UpdateProjetoTagInput) {
    return prisma.projetoTag.update({
      where: { id },
      data: input,
    })
  }

  async deleteTag(id: string) {
    return prisma.projetoTag.delete({ where: { id } })
  }

  // ── Comentários (eventos tipo 'comentario') ─────────────────

  async addComentario(input: AddComentarioTarefaInput, autorId: string | null) {
    return prisma.projetoTarefaEvento.create({
      data: {
        tarefaId: input.tarefaId,
        tipo: 'comentario',
        autorId,
        comentario: input.texto,
      },
    })
  }

  // ── Anexos ──────────────────────────────────────────────────

  async addAnexo(input: AddAnexoTarefaInput, uploadedById: string | null) {
    const anexo = await prisma.projetoTarefaAnexo.create({
      data: {
        tarefaId: input.tarefaId,
        nome: input.nome,
        url: input.url,
        mimeType: input.mimeType ?? null,
        tamanho: input.tamanho,
        uploadedById,
      },
    })
    await this.gravarEvento(input.tarefaId, 'anexo', uploadedById, null, null, input.nome)
    return anexo
  }

  async removerAnexo(id: string) {
    return prisma.projetoTarefaAnexo.delete({ where: { id } })
  }

  // ── Mensagens do PROJETO ────────────────────────────────────

  async listMensagensProjeto(projetoId: string) {
    const msgs = await prisma.projetoMensagem.findMany({
      where: { projetoId },
      orderBy: { createdAt: 'desc' },
    })
    const autorIds = Array.from(new Set(msgs.map((m) => m.autorId).filter((x): x is string => !!x)))
    const autores = autorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: autorIds } },
          select: { id: true, name: true, image: true },
        })
      : []
    const autorMap = new Map(autores.map((u) => [u.id, u]))
    return msgs.map((m) => ({
      ...m,
      autor: m.autorId ? autorMap.get(m.autorId) ?? null : null,
    }))
  }

  async addMensagemProjeto(projetoId: string, texto: string, autorId: string | null) {
    const msg = await prisma.projetoMensagem.create({
      data: { projetoId, texto, autorId },
    })
    await this.gravarEventoProjeto(projetoId, 'mensagem', autorId, texto.slice(0, 200), null, null)
    return msg
  }

  // ── Anexos do PROJETO ───────────────────────────────────────

  async listAnexosProjeto(projetoId: string) {
    return prisma.projetoAnexo.findMany({
      where: { projetoId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async addAnexoProjeto(
    projetoId: string,
    nome: string,
    url: string,
    tamanho: number,
    mimeType: string | null,
    uploadedById: string | null,
  ) {
    const anexo = await prisma.projetoAnexo.create({
      data: { projetoId, nome, url, tamanho, mimeType, uploadedById },
    })
    await this.gravarEventoProjeto(projetoId, 'anexo', uploadedById, null, null, nome)
    return anexo
  }

  async removerAnexoProjeto(id: string) {
    return prisma.projetoAnexo.delete({ where: { id } })
  }

  // ── Eventos / Histórico do PROJETO ─────────────────────────

  async listEventosProjeto(projetoId: string) {
    const eventos = await prisma.projetoEvento.findMany({
      where: { projetoId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const autorIds = Array.from(new Set(eventos.map((e) => e.autorId).filter((x): x is string => !!x)))
    const autores = autorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: autorIds } },
          select: { id: true, name: true, image: true },
        })
      : []
    const autorMap = new Map(autores.map((u) => [u.id, u]))
    return eventos.map((e) => ({
      ...e,
      autor: e.autorId ? autorMap.get(e.autorId) ?? null : null,
    }))
  }

  // ── Configurações do módulo (singleton) ────────────────────

  async getConfig() {
    let cfg = await prisma.projetoConfig.findFirst()
    if (!cfg) {
      cfg = await prisma.projetoConfig.create({ data: {} })
    }
    return cfg
  }

  async updateConfig(data: { autoArquivarHabilitado?: boolean; autoArquivarDias?: number }) {
    const atual = await this.getConfig()
    return prisma.projetoConfig.update({
      where: { id: atual.id },
      data: {
        ...(data.autoArquivarHabilitado !== undefined && { autoArquivarHabilitado: data.autoArquivarHabilitado }),
        ...(data.autoArquivarDias !== undefined && { autoArquivarDias: data.autoArquivarDias }),
      },
    })
  }

  /**
   * Executa o auto-arquivamento: projetos com status=CONCLUIDO e updatedAt
   * mais antigo que (hoje - autoArquivarDias) são marcados como isActive=false.
   * Pode ser chamado manualmente (botão na config) ou por scheduler diário.
   */
  async executarAutoArquivar() {
    const cfg = await this.getConfig()
    if (!cfg.autoArquivarHabilitado) {
      return { ok: false, erro: 'Auto-arquivamento desabilitado', arquivados: 0 }
    }
    const limite = new Date()
    limite.setDate(limite.getDate() - cfg.autoArquivarDias)

    const result = await prisma.projeto.updateMany({
      where: {
        status: 'CONCLUIDO',
        isActive: true,
        updatedAt: { lt: limite },
      },
      data: { isActive: false },
    })

    await prisma.projetoConfig.update({
      where: { id: cfg.id },
      data: { ultimaExecucao: new Date(), ultimoTotalArquivados: result.count },
    })

    return { ok: true, arquivados: result.count }
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async gravarEvento(
    tarefaId: string,
    tipo: string,
    autorId: string | null,
    comentario: string | null,
    antes: string | null,
    depois: string | null,
  ) {
    await prisma.projetoTarefaEvento.create({
      data: { tarefaId, tipo, autorId, comentario, campoAntes: antes, campoDepois: depois },
    })
  }

  private async gravarEventoProjeto(
    projetoId: string,
    tipo: string,
    autorId: string | null,
    comentario: string | null,
    antes: string | null,
    depois: string | null,
  ) {
    await prisma.projetoEvento.create({
      data: { projetoId, tipo, autorId, comentario, campoAntes: antes, campoDepois: depois },
    })
  }
}
