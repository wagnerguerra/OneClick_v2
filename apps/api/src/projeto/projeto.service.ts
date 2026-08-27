import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import type {
  CreateProjetoInput,
  UpdateProjetoInput,
  CreateRodadaInput,
  UpdateRodadaInput,
  CreateApontamentoInput,
  UpdateApontamentoInput,
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
    if (input.clienteId) where.clientes = { some: { clienteId: input.clienteId } }
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
          clientes: {
            select: { cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } } },
          },
          participantes: {
            select: { papel: true, user: { select: { id: true, name: true, image: true } } },
          },
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
      // O card quer a lista de gente, não a tabela de ligação.
      participantes: p.participantes.map((pp) => ({ ...pp.user, papel: pp.papel })),
      clientes: p.clientes.map((pc) => pc.cliente),
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
        clientes: {
          select: { cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } } },
        },
        participantes: {
          select: { papel: true, user: { select: { id: true, name: true, image: true } } },
        },
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
    return {
      ...projeto,
      responsavel,
      participantes: projeto.participantes.map((p) => ({ ...p.user, papel: p.papel })),
      clientes: projeto.clientes.map((c) => c.cliente),
    }
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
        ...(input.participantes?.length
          ? { participantes: { create: this.participantesUnicos(input.participantes, input.responsavelId ?? userId) } }
          : {}),
        ...(input.clientesIds?.length
          ? { clientes: { create: Array.from(new Set(input.clientesIds.filter(Boolean))).map(clienteId => ({ clienteId })) } }
          : {}),
      },
    })
  }

  /**
   * O responsável não entra como participante: ele já aparece à parte no
   * organograma, e repetido viraria a mesma pessoa em duas caixas.
   */
  private participantesUnicos(
    lista: Array<{ userId: string; papel?: string }>,
    responsavelId?: string | null,
  ): Array<{ userId: string; papel: string }> {
    const vistos = new Set<string>()
    const saida: Array<{ userId: string; papel: string }> = []
    for (const p of lista) {
      if (!p.userId || p.userId === responsavelId || vistos.has(p.userId)) continue
      vistos.add(p.userId)
      saida.push({ userId: p.userId, papel: p.papel ?? 'EXECUTANTE' })
    }
    return saida
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

    // Participantes: a lista que chega é a lista final. Trocar tudo é mais
    // simples e mais previsível do que calcular entra/sai — são poucos nomes.
    if (input.participantes !== undefined) {
      const responsavelFinal = input.responsavelId !== undefined ? input.responsavelId : atual.responsavelId
      const lista = this.participantesUnicos(input.participantes, responsavelFinal)
      await prisma.$transaction([
        prisma.projetoParticipante.deleteMany({ where: { projetoId: id } }),
        ...(lista.length > 0
          ? [prisma.projetoParticipante.createMany({ data: lista.map(p => ({ projetoId: id, userId: p.userId, papel: p.papel })) })]
          : []),
      ])
    }

    // Clientes envolvidos: mesma regra dos participantes — a lista que chega é
    // a lista final.
    if (input.clientesIds !== undefined) {
      const ids = Array.from(new Set(input.clientesIds.filter(Boolean)))
      await prisma.$transaction([
        prisma.projetoCliente.deleteMany({ where: { projetoId: id } }),
        ...(ids.length > 0
          ? [prisma.projetoCliente.createMany({ data: ids.map(clienteId => ({ projetoId: id, clienteId })) })]
          : []),
      ])
    }

    // Grava eventos fora da update
    for (const ev of eventos) {
      await this.gravarEventoProjeto(id, ev.tipo, autorId, null, ev.antes, ev.depois)
    }

    return projeto
  }

  /**
   * Filtro de tenancy no molde do `ativo.service`: a empresa ATIVA vale para
   * todos, master incluído — o poder do master é TROCAR de empresa, não ver
   * todas somadas. Registro global (empresaId nulo) acompanha qualquer empresa.
   */
  private tenantWhere(ctx?: { isMaster?: boolean; empresaId?: string }) {
    if (ctx?.empresaId) return { OR: [{ empresaId: ctx.empresaId }, { empresaId: null }] }
    return ctx?.isMaster ? {} : { empresaId: null }
  }

  /**
   * Clientes que podem ser vinculados a um projeto: os MENSAIS e ativos.
   *
   * Rota própria, e não a listagem do módulo Clientes, porque quem trabalha em
   * Projetos não tem necessariamente permissão de ver o cadastro de clientes —
   * e aqui só precisa de nome e id para escolher num campo.
   */
  async listClientesVinculaveis(busca?: string, ctx?: { isMaster?: boolean; empresaId?: string }) {
    const termo = (busca ?? '').trim()
    return prisma.cliente.findMany({
      where: {
        situacao: 'MENSAL',
        status: 'ATIVO',
        ...this.tenantWhere(ctx),
        ...(termo
          ? {
              OR: [
                { razaoSocial: { contains: termo, mode: 'insensitive' } },
                { nomeFantasia: { contains: termo, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, razaoSocial: true, nomeFantasia: true },
      orderBy: { razaoSocial: 'asc' },
      take: 50,
    })
  }

  /** Pessoas que podem ser responsável ou participante — só as da empresa. */
  async listPessoas(busca?: string, ctx?: { isMaster?: boolean; empresaId?: string }) {
    const termo = (busca ?? '').trim()
    return prisma.user.findMany({
      where: {
        isActive: true,
        ...this.tenantWhere(ctx),
        ...(termo ? { name: { contains: termo, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, image: true },
      orderBy: { name: 'asc' },
      take: 100,
    })
  }

  // ── Rodadas e apontamentos ──────────────────────────────────
  //
  // O ciclo do projeto: a TI entrega uma rodada, os envolvidos apontam o que
  // falta, a TI corrige e entrega a seguinte. Antes isso vivia em conversa de
  // corredor e no e-mail de cada um.

  async listRodadas(projetoId: string) {
    const rodadas = await prisma.projetoRodada.findMany({
      where: { projetoId },
      orderBy: { numero: 'desc' },
      include: {
        apontamentos: { orderBy: { criadoEm: 'asc' } },
      },
    })

    // Nome de quem apontou e de quem resolveu, em lote — a lista de rodadas
    // abre inteira e um lookup por apontamento seria N+1 na cara.
    const ids = new Set<string>()
    for (const r of rodadas) {
      if (r.criadoPor) ids.add(r.criadoPor)
      for (const a of r.apontamentos) {
        if (a.autorId) ids.add(a.autorId)
        if (a.resolvidoPor) ids.add(a.resolvidoPor)
      }
    }
    const pessoas = ids.size > 0
      ? await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, image: true } })
      : []
    const porId = new Map(pessoas.map(u => [u.id, u]))

    return rodadas.map(r => ({
      ...r,
      criadoPorUsuario: r.criadoPor ? porId.get(r.criadoPor) ?? null : null,
      abertos: r.apontamentos.filter(a => a.situacao === 'ABERTO').length,
      apontamentos: r.apontamentos.map(a => ({
        ...a,
        // Autor de dentro tem usuário; o analista do cliente costuma vir só
        // como nome digitado.
        autor: a.autorId ? porId.get(a.autorId) ?? null : null,
        resolvidoPorUsuario: a.resolvidoPor ? porId.get(a.resolvidoPor) ?? null : null,
      })),
    }))
  }

  /**
   * O número da rodada é sequencial dentro do projeto e o banco garante a
   * unicidade — dois cliques rápidos no botão não criam duas "Rodada 3".
   */
  async createRodada(input: CreateRodadaInput, userId: string | null) {
    const ultima = await prisma.projetoRodada.findFirst({
      where: { projetoId: input.projetoId },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    })
    return prisma.projetoRodada.create({
      data: {
        projetoId: input.projetoId,
        numero: (ultima?.numero ?? 0) + 1,
        titulo: input.titulo || null,
        descricao: input.descricao || null,
        entregueEm: input.entregueEm ? new Date(input.entregueEm) : null,
        criadoPor: userId,
      },
    })
  }

  async updateRodada(id: string, input: UpdateRodadaInput) {
    return prisma.projetoRodada.update({
      where: { id },
      data: {
        ...(input.titulo !== undefined && { titulo: input.titulo || null }),
        ...(input.descricao !== undefined && { descricao: input.descricao || null }),
        ...(input.entregueEm !== undefined && {
          entregueEm: input.entregueEm ? new Date(input.entregueEm) : null,
        }),
      },
    })
  }

  async deleteRodada(id: string) {
    // Os apontamentos vão junto (cascade): rodada apagada sem os apontamentos
    // dela deixaria registro órfão que ninguém sabe de onde veio.
    await prisma.projetoRodada.delete({ where: { id } })
    return { ok: true }
  }

  async createApontamento(input: CreateApontamentoInput, userId: string | null) {
    return prisma.projetoApontamento.create({
      data: {
        rodadaId: input.rodadaId,
        texto: input.texto,
        // Sem autor escolhido, o autor é quem está registrando.
        autorId: input.autorId ?? (input.autorNome ? null : userId),
        autorNome: input.autorNome || null,
      },
    })
  }

  async updateApontamento(id: string, input: UpdateApontamentoInput, userId: string | null) {
    const marcandoResolvido = input.situacao === 'RESOLVIDO'
    return prisma.projetoApontamento.update({
      where: { id },
      data: {
        ...(input.texto !== undefined && { texto: input.texto }),
        ...(input.situacao !== undefined && {
          situacao: input.situacao,
          // Quem resolveu e quando só fazem sentido enquanto está resolvido;
          // reabrir limpa os dois.
          resolvidoEm: marcandoResolvido ? new Date() : null,
          resolvidoPor: marcandoResolvido ? userId : null,
        }),
      },
    })
  }

  async deleteApontamento(id: string) {
    await prisma.projetoApontamento.delete({ where: { id } })
    return { ok: true }
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
