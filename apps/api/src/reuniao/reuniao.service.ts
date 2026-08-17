import { Injectable } from '@nestjs/common'
import { prisma, getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import type {
  CriarReuniaoInput, AtualizarReuniaoInput, ListarReunioesInput,
  CriarReuniaoAcaoInput, AtualizarReuniaoAcaoInput, ConcluirReuniaoAcaoInput,
  ListarMinhasAcoesInput,
} from '@saas/types'

/**
 * Reuniões da Qualidade — port do `sgq_reunioes` do v1.
 *
 * A reunião é lançada depois de acontecer: guarda pauta, ata, quem participou e
 * o plano de ação que saiu dali. O plano de ação é o que dá utilidade diária ao
 * módulo — no v1 o menu já mostrava a contagem de ações vencidas.
 *
 * Levantamento do legado: docs/migracao-reunioes-v1.md
 */

/** Data pura (sem hora): o campo é DATE e não deve escorregar por fuso. */
function dataDeISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

/** Campo de hora vazio vem do form como '' — no banco isso é ausência, não "". */
function horaOuNulo(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

@Injectable()
export class ReuniaoService {
  // ── Leitura ───────────────────────────────────────────────

  async listar(
    input: ListarReunioesInput,
    ctx: { userId: string; empresaId?: string | null; verTodas: boolean },
  ) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const filtros: Record<string, unknown>[] = []

    if (input.tipo) filtros.push({ tipo: input.tipo })
    if (input.clienteId) filtros.push({ clienteId: input.clienteId })
    if (input.areaId) filtros.push({ areaId: input.areaId })

    if (input.de || input.ate) {
      filtros.push({
        data: {
          ...(input.de ? { gte: dataDeISO(input.de) } : {}),
          ...(input.ate ? { lte: dataDeISO(input.ate) } : {}),
        },
      })
    }

    if (search) {
      filtros.push({
        OR: [
          { titulo: { contains: search, mode: 'insensitive' } },
          { local: { contains: search, mode: 'insensitive' } },
          { cliente: { razaoSocial: { contains: search, mode: 'insensitive' } } },
        ],
      })
    }

    if (input.comAcaoPendente) filtros.push({ acoes: { some: { status: 'PENDENTE' } } })

    // Sem `ver_todas`, a pessoa enxerga o que registrou E aquilo de que
    // participou — participar de uma reunião e não poder reler a ata seria
    // pior do que o v1, onde quem abria o módulo via tudo.
    if (!ctx.verTodas || input.somenteMinhas) {
      filtros.push({
        OR: [
          { autorId: ctx.userId },
          { participantes: { some: { usuarioId: ctx.userId } } },
        ],
      })
    }

    const where = { empresaId: ctx.empresaId ?? null, ...(filtros.length ? { AND: filtros } : {}) }

    // Padrão: data da reunião, decrescente — a última é a que interessa.
    const orderBy = sortBy ? { [sortBy]: sortDir } : { data: 'desc' as const }

    const [data, total] = await Promise.all([
      prisma.reuniao.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true, numero: true, tipo: true, titulo: true, data: true,
          horaInicio: true, horaFim: true, local: true,
          cliente: { select: { id: true, razaoSocial: true } },
          area: { select: { id: true, name: true } },
          autor: { select: { id: true, name: true, image: true } },
          _count: { select: { participantes: true, acoes: true, arquivos: true } },
          // Contagem do que ficou pendente — é o que a listagem precisa
          // destacar, e sai numa consulta só em vez de N.
          acoes: { where: { status: 'PENDENTE' }, select: { id: true, prazo: true } },
        },
      }),
      prisma.reuniao.count({ where }),
    ])

    const hoje = dataDeISO(new Date().toISOString().slice(0, 10))
    const linhas = data.map(r => {
      const { acoes, ...resto } = r
      return {
        ...resto,
        acoesPendentes: acoes.length,
        acoesVencidas: acoes.filter(a => a.prazo && a.prazo < hoje).length,
      }
    })

    return buildPaginatedResponse(linhas, total, page, limit)
  }

  /**
   * Quem não tem `ver_todas` só alcança o que registrou ou de que participou.
   * A checagem vive aqui, e não no router, porque toda porta de entrada
   * (detalhe, mensagem, anexo) precisa dela.
   */
  async assertPodeVer(
    id: string,
    ctx: { userId: string; empresaId?: string | null; verTodas: boolean },
  ) {
    if (ctx.verTodas) {
      await this.exigir(id, ctx.empresaId)
      return
    }
    const r = await prisma.reuniao.findFirst({
      where: {
        id,
        empresaId: ctx.empresaId ?? null,
        OR: [
          { autorId: ctx.userId },
          { participantes: { some: { usuarioId: ctx.userId } } },
        ],
      },
      select: { id: true },
    })
    if (!r) throw new Error('Reunião não encontrada.')
  }

  /**
   * Editar a ata exige ter registrado, ou a permissão de gerenciar. Participar
   * dá direito de LER — não de reescrever o que o outro redigiu.
   */
  async assertPodeEditar(
    id: string,
    ctx: { userId: string; empresaId?: string | null; gerencia: boolean },
  ) {
    const r = await this.exigir(id, ctx.empresaId)
    if (ctx.gerencia || r.autorId === ctx.userId) return
    throw new Error('Só quem registrou a reunião (ou a Qualidade) pode editá-la.')
  }

  async getById(id: string, empresaId?: string | null) {
    const r = await prisma.reuniao.findFirst({
      where: { id, empresaId: empresaId ?? null },
      include: {
        cliente: { select: { id: true, razaoSocial: true, documento: true } },
        area: { select: { id: true, name: true } },
        autor: { select: { id: true, name: true, image: true } },
        participantes: {
          orderBy: [{ nome: 'asc' }],
          include: { usuario: { select: { id: true, name: true, image: true } } },
        },
        acoes: {
          orderBy: [{ status: 'asc' }, { prazo: 'asc' }],
          include: { responsavel: { select: { id: true, name: true, image: true } } },
        },
        arquivos: { orderBy: { criadoEm: 'desc' } },
        mensagens: { orderBy: { criadoEm: 'asc' } },
        logs: { orderBy: { criadoEm: 'desc' }, take: 100 },
      },
    })
    if (!r) throw new Error('Reunião não encontrada.')
    return r
  }

  // ── Escrita ───────────────────────────────────────────────

  async criar(input: CriarReuniaoInput, autorId: string, empresaId?: string | null) {
    const reuniao = await prisma.reuniao.create({
      data: {
        empresaId: empresaId ?? null,
        tipo: input.tipo,
        titulo: input.titulo.trim(),
        clienteId: input.clienteId || null,
        areaId: input.areaId || null,
        data: dataDeISO(input.data),
        horaInicio: horaOuNulo(input.horaInicio),
        horaFim: horaOuNulo(input.horaFim),
        local: input.local?.trim() || null,
        pauta: input.pauta || null,
        ata: input.ata || null,
        autorId,
        participantes: { create: this.normalizarParticipantes(input.participantes) },
      },
      select: { id: true },
    })
    await this.registrarLog(reuniao.id, autorId, 'REUNIAO_CRIADA')
    return reuniao
  }

  async atualizar(input: AtualizarReuniaoInput, usuarioId: string, empresaId?: string | null) {
    const { id, participantes, ...campos } = input
    await this.exigir(id, empresaId)

    await prisma.$transaction(async tx => {
      await tx.reuniao.update({
        where: { id },
        data: {
          ...(campos.tipo !== undefined ? { tipo: campos.tipo } : {}),
          ...(campos.titulo !== undefined ? { titulo: campos.titulo.trim() } : {}),
          ...(campos.clienteId !== undefined ? { clienteId: campos.clienteId || null } : {}),
          ...(campos.areaId !== undefined ? { areaId: campos.areaId || null } : {}),
          ...(campos.data !== undefined ? { data: dataDeISO(campos.data) } : {}),
          ...(campos.horaInicio !== undefined ? { horaInicio: horaOuNulo(campos.horaInicio) } : {}),
          ...(campos.horaFim !== undefined ? { horaFim: horaOuNulo(campos.horaFim) } : {}),
          ...(campos.local !== undefined ? { local: campos.local?.trim() || null } : {}),
          ...(campos.pauta !== undefined ? { pauta: campos.pauta || null } : {}),
          ...(campos.ata !== undefined ? { ata: campos.ata || null } : {}),
        },
      })

      // Lista de participantes é substituída inteira quando vem no payload —
      // é como a tela edita (um seletor múltiplo), e diff parcial aqui só
      // abriria espaço para divergência entre o que se vê e o que se grava.
      if (participantes !== undefined) {
        await tx.reuniaoParticipante.deleteMany({ where: { reuniaoId: id } })
        const novos = this.normalizarParticipantes(participantes)
        if (novos.length) {
          await tx.reuniaoParticipante.createMany({
            data: novos.map(p => ({ ...p, reuniaoId: id })),
          })
        }
      }
    })

    await this.registrarLog(id, usuarioId, 'REUNIAO_EDITADA')
    return { id }
  }

  async excluir(id: string, usuarioId: string, empresaId?: string | null) {
    await this.exigir(id, empresaId)
    // Satélites saem por cascade (ver as FKs da migração). O v1 fazia soft
    // delete com `ativo = 0` e nunca mais mostrava o registro em lugar nenhum
    // — guardar lixo invisível não ajudou ninguém em 10 anos.
    await prisma.reuniao.delete({ where: { id } })
    return { id, usuarioId }
  }

  // ── Plano de ação ─────────────────────────────────────────

  async criarAcao(input: CriarReuniaoAcaoInput, usuarioId: string, empresaId?: string | null) {
    await this.exigir(input.reuniaoId, empresaId)
    const acao = await prisma.reuniaoAcao.create({
      data: {
        reuniaoId: input.reuniaoId,
        descricao: input.descricao.trim(),
        responsavelId: input.responsavelId || null,
        // Nome só quando não há usuário: se há ID, o nome sai da relação e não
        // vira uma segunda verdade que envelhece.
        responsavelNome: input.responsavelId ? null : (input.responsavelNome?.trim() || null),
        prazo: input.prazo ? dataDeISO(input.prazo) : null,
        observacao: input.observacao || null,
      },
      select: { id: true },
    })
    await this.registrarLog(input.reuniaoId, usuarioId, 'ACAO_CRIADA', input.descricao.slice(0, 200))
    return acao
  }

  async atualizarAcao(input: AtualizarReuniaoAcaoInput, usuarioId: string, empresaId?: string | null) {
    const atual = await this.exigirAcao(input.id, empresaId)
    const { id, ...campos } = input

    const responsavelId = campos.responsavelId !== undefined
      ? (campos.responsavelId || null)
      : atual.responsavelId

    await prisma.reuniaoAcao.update({
      where: { id },
      data: {
        ...(campos.descricao !== undefined ? { descricao: campos.descricao.trim() } : {}),
        ...(campos.responsavelId !== undefined ? { responsavelId } : {}),
        ...(campos.responsavelNome !== undefined || campos.responsavelId !== undefined
          ? { responsavelNome: responsavelId ? null : (campos.responsavelNome?.trim() || null) }
          : {}),
        ...(campos.prazo !== undefined ? { prazo: campos.prazo ? dataDeISO(campos.prazo) : null } : {}),
        ...(campos.observacao !== undefined ? { observacao: campos.observacao || null } : {}),
      },
    })
    await this.registrarLog(atual.reuniaoId, usuarioId, 'ACAO_EDITADA')
    return { id }
  }

  async concluirAcao(input: ConcluirReuniaoAcaoInput, usuarioId: string, empresaId?: string | null) {
    const atual = await this.exigirAcao(input.id, empresaId)
    await prisma.reuniaoAcao.update({
      where: { id: input.id },
      data: input.concluida
        ? {
          status: 'CONCLUIDA',
          concluidoEm: new Date(),
          concluidoPorId: usuarioId,
          ...(input.observacao !== undefined && input.observacao !== null
            ? { observacao: input.observacao }
            : {}),
        }
        // Reabrir limpa a conclusão: deixar a data antiga aí dentro faria a
        // ação voltar a pendente carregando um "concluída em" mentiroso.
        : { status: 'PENDENTE', concluidoEm: null, concluidoPorId: null },
    })
    await this.registrarLog(
      atual.reuniaoId, usuarioId,
      input.concluida ? 'ACAO_CONCLUIDA' : 'ACAO_REABERTA',
    )
    return { id: input.id }
  }

  async excluirAcao(id: string, usuarioId: string, empresaId?: string | null) {
    const atual = await this.exigirAcao(id, empresaId)
    await prisma.reuniaoAcao.delete({ where: { id } })
    await this.registrarLog(atual.reuniaoId, usuarioId, 'ACAO_EXCLUIDA')
    return { id }
  }

  /**
   * Quem é dono da ação pode concluí-la sem precisar da permissão de gerenciar.
   * É o caso mais comum do módulo: o colaborador entra só para dar baixa no que
   * ficou no nome dele.
   */
  async ehResponsavel(acaoId: string, userId: string, empresaId?: string | null) {
    const a = await prisma.reuniaoAcao.findFirst({
      where: { id: acaoId, responsavelId: userId, reuniao: { empresaId: empresaId ?? null } },
      select: { id: true },
    })
    return Boolean(a)
  }

  /**
   * O que ficou pendente — a pergunta que o v1 só respondia como um número no
   * menu, sem dizer de quem nem de qual reunião.
   */
  async listarAcoes(
    input: ListarMinhasAcoesInput,
    ctx: { userId: string; empresaId?: string | null; podeVerTodas: boolean },
  ) {
    const { page, limit, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const hoje = dataDeISO(new Date().toISOString().slice(0, 10))
    const where = {
      reuniao: { empresaId: ctx.empresaId ?? null },
      ...(input.status ? { status: input.status } : {}),
      ...(input.todosResponsaveis && ctx.podeVerTodas ? {} : { responsavelId: ctx.userId }),
      ...(input.somenteVencidas ? { status: 'PENDENTE', prazo: { lt: hoje } } : {}),
    }

    const [data, total] = await Promise.all([
      prisma.reuniaoAcao.findMany({
        where,
        orderBy: sortBy ? { [sortBy]: sortDir } : [{ status: 'asc' }, { prazo: 'asc' }],
        skip,
        take,
        include: {
          responsavel: { select: { id: true, name: true, image: true } },
          reuniao: {
            select: {
              id: true, numero: true, titulo: true, data: true,
              cliente: { select: { id: true, razaoSocial: true } },
            },
          },
        },
      }),
      prisma.reuniaoAcao.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  // ── Mensagens ─────────────────────────────────────────────

  async adicionarMensagem(
    input: { id: string; texto: string },
    usuarioId: string,
    empresaId?: string | null,
  ) {
    await this.exigir(input.id, empresaId)
    return prisma.reuniaoMensagem.create({
      data: { reuniaoId: input.id, autorId: usuarioId, texto: input.texto },
      select: { id: true },
    })
  }

  async excluirMensagem(id: string, usuarioId: string, empresaId?: string | null) {
    const m = await prisma.reuniaoMensagem.findFirst({
      where: { id, reuniao: { empresaId: empresaId ?? null } },
      select: { id: true, autorId: true },
    })
    if (!m) throw new Error('Mensagem não encontrada.')
    if (m.autorId !== usuarioId) throw new Error('Só o autor pode apagar a própria mensagem.')
    await prisma.reuniaoMensagem.delete({ where: { id } })
    return { id }
  }

  // ── Internos ──────────────────────────────────────────────

  /**
   * Um participante é ou um usuário (por ID) ou um convidado (por nome) — nunca
   * os dois. O v1 guardava só nomes soltos num longtext, e por isso não dava
   * para responder "de quais reuniões o fulano participou".
   */
  private normalizarParticipantes(
    lista: CriarReuniaoInput['participantes'],
  ): { usuarioId: string | null; nome: string | null; presente: boolean }[] {
    const vistos = new Set<string>()
    const saida: { usuarioId: string | null; nome: string | null; presente: boolean }[] = []

    for (const p of lista ?? []) {
      const usuarioId = p.usuarioId || null
      const nome = usuarioId ? null : (p.nome?.trim() || null)
      if (!usuarioId && !nome) continue

      const chave = usuarioId ? `u:${usuarioId}` : `n:${nome!.toLowerCase()}`
      if (vistos.has(chave)) continue
      vistos.add(chave)

      saida.push({ usuarioId, nome, presente: p.presente ?? true })
    }
    return saida
  }

  private async exigir(id: string, empresaId?: string | null) {
    const r = await prisma.reuniao.findFirst({
      where: { id, empresaId: empresaId ?? null },
      select: { id: true, autorId: true, titulo: true },
    })
    if (!r) throw new Error('Reunião não encontrada.')
    return r
  }

  private async exigirAcao(id: string, empresaId?: string | null) {
    const a = await prisma.reuniaoAcao.findFirst({
      where: { id, reuniao: { empresaId: empresaId ?? null } },
      select: { id: true, reuniaoId: true, responsavelId: true, status: true },
    })
    if (!a) throw new Error('Ação não encontrada.')
    return a
  }

  /**
   * Trilha de auditoria. O v1 gravava frase pronta ("Editou a ação #115");
   * aqui o evento é código e o detalhe fica à parte, para dar para filtrar.
   * Falha de log nunca derruba a operação que a originou.
   */
  private async registrarLog(reuniaoId: string, usuarioId: string | null, evento: string, detalhe?: string) {
    await prisma.reuniaoLog.create({
      data: { reuniaoId, usuarioId, evento, detalhe: detalhe ?? null },
    }).catch(() => undefined)
  }
}
