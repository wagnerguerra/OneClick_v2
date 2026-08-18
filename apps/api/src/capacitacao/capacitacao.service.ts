import { Injectable } from '@nestjs/common'
import { prisma, getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import type {
  CriarCapacitacaoInput, AtualizarCapacitacaoInput, ListarCapacitacoesInput,
  AutorizarCapacitacaoInput, AvaliarCapacitacaoInput, ConfirmarPresencaInput,
  CapacitacaoMetodoInput,
} from '@saas/types'

/**
 * Capacitações da Qualidade — port do `sgq_capacitacoes` do v1.
 *
 * O ciclo é: solicita → autoriza → acontece → avalia a eficácia. O que dá
 * utilidade ao módulo é justamente o fim desse ciclo: 124 das 299 capacitações
 * do v1 nunca foram avaliadas, e não havia como enxergar isso.
 *
 * Levantamento do legado: docs/migracao-capacitacoes-v1.md
 */

function dataDeISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}
function horaOuNulo(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}
const hojeISO = () => new Date().toISOString().slice(0, 10)

@Injectable()
export class CapacitacaoService {
  // ── Leitura ───────────────────────────────────────────────

  async listar(
    input: ListarCapacitacoesInput,
    ctx: { userId: string; empresaId?: string | null; verTodas: boolean },
  ) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const filtros: Record<string, unknown>[] = []
    if (input.status) filtros.push({ status: input.status })
    if (input.ambito) filtros.push({ ambito: input.ambito })
    if (input.metodoId) filtros.push({ metodoId: input.metodoId })
    if (input.de || input.ate) {
      filtros.push({
        dataInicio: {
          ...(input.de ? { gte: dataDeISO(input.de) } : {}),
          ...(input.ate ? { lte: dataDeISO(input.ate) } : {}),
        },
      })
    }
    if (search) {
      filtros.push({
        OR: [
          { titulo: { contains: search, mode: 'insensitive' } },
          { instrutor: { contains: search, mode: 'insensitive' } },
          { organizacao: { contains: search, mode: 'insensitive' } },
        ],
      })
    }

    // Passou do prazo e segue sem avaliação. É o buraco que o v1 tinha: o
    // prazo existia no cadastro e ninguém era cobrado por ele.
    if (input.avaliacaoVencida) {
      filtros.push({
        prazoAvaliacao: { lt: dataDeISO(hojeISO()) },
        avaliadaEm: null,
        status: { notIn: ['CANCELADA', 'FINALIZADA'] },
      })
    }

    // Sem `ver_todas`, enxerga o que solicitou e aquilo de que participa —
    // participar de uma capacitação e não poder abri-la seria pior que o v1.
    if (!ctx.verTodas || input.somenteMinhas) {
      filtros.push({
        OR: [
          { solicitanteId: ctx.userId },
          { participantes: { some: { usuarioId: ctx.userId } } },
        ],
      })
    }

    const where = { empresaId: ctx.empresaId ?? null, ...(filtros.length ? { AND: filtros } : {}) }
    const orderBy = sortBy ? { [sortBy]: sortDir } : { dataInicio: 'desc' as const }

    const [data, total] = await Promise.all([
      prisma.capacitacao.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true, legacyId: true, titulo: true, ambito: true, status: true,
          dataInicio: true, cargaHoraria: true, custo: true,
          instrutor: true, organizacao: true,
          prazoAvaliacao: true, avaliadaEm: true, objetivosAtingidos: true,
          metodo: { select: { id: true, nome: true } },
          _count: { select: { participantes: true, anexos: true } },
        },
      }),
      prisma.capacitacao.count({ where }),
    ])

    const hoje = dataDeISO(hojeISO())
    const linhas = data.map(c => ({
      ...c,
      cargaHoraria: c.cargaHoraria === null ? null : Number(c.cargaHoraria),
      custo: c.custo === null ? null : Number(c.custo),
      // Derivado no backend, como manda o padrão da casa — o front compõe,
      // não recalcula a regra.
      avaliacaoVencida: Boolean(
        c.prazoAvaliacao && !c.avaliadaEm && c.prazoAvaliacao < hoje
        && c.status !== 'CANCELADA' && c.status !== 'FINALIZADA',
      ),
    }))

    return buildPaginatedResponse(linhas, total, page, limit)
  }

  async assertPodeVer(
    id: string,
    ctx: { userId: string; empresaId?: string | null; verTodas: boolean },
  ) {
    if (ctx.verTodas) { await this.exigir(id, ctx.empresaId); return }
    const c = await prisma.capacitacao.findFirst({
      where: {
        id,
        empresaId: ctx.empresaId ?? null,
        OR: [
          { solicitanteId: ctx.userId },
          { participantes: { some: { usuarioId: ctx.userId } } },
        ],
      },
      select: { id: true },
    })
    if (!c) throw new Error('Capacitação não encontrada.')
  }

  async getById(id: string, empresaId?: string | null) {
    const c = await prisma.capacitacao.findFirst({
      where: { id, empresaId: empresaId ?? null },
      include: {
        metodo: { select: { id: true, nome: true } },
        participantes: { orderBy: { criadoEm: 'asc' } },
        anexos: { orderBy: { criadoEm: 'desc' } },
        mensagens: { orderBy: { criadoEm: 'asc' } },
        logs: { orderBy: { criadoEm: 'desc' }, take: 100 },
      },
    })
    if (!c) throw new Error('Capacitação não encontrada.')
    return {
      ...c,
      cargaHoraria: c.cargaHoraria === null ? null : Number(c.cargaHoraria),
      custo: c.custo === null ? null : Number(c.custo),
    }
  }

  // ── Escrita ───────────────────────────────────────────────

  async criar(input: CriarCapacitacaoInput, usuarioId: string, empresaId?: string | null) {
    const c = await prisma.capacitacao.create({
      data: {
        empresaId: empresaId ?? null,
        titulo: input.titulo.trim(),
        ambito: input.ambito,
        metodoId: input.metodoId || null,
        instrutor: input.instrutor?.trim() || null,
        organizacao: input.organizacao?.trim() || null,
        local: input.local?.trim() || null,
        dataInicio: dataDeISO(input.dataInicio),
        dataFim: input.dataFim ? dataDeISO(input.dataFim) : null,
        horaInicio: horaOuNulo(input.horaInicio),
        horaFim: horaOuNulo(input.horaFim),
        cargaHoraria: input.cargaHoraria ?? null,
        custo: input.custo ?? null,
        descricao: input.descricao || null,
        prazoAvaliacao: input.prazoAvaliacao ? dataDeISO(input.prazoAvaliacao) : null,
        status: 'SOLICITADA',
        solicitanteId: usuarioId,
        solicitadaEm: dataDeISO(hojeISO()),
        participantes: {
          create: [...new Set(input.participantesIds ?? [])].map(usuarioId => ({ usuarioId })),
        },
      },
      select: { id: true },
    })
    await this.registrarLog(c.id, usuarioId, 'CAPACITACAO_CRIADA')
    return c
  }

  async atualizar(input: AtualizarCapacitacaoInput, usuarioId: string, empresaId?: string | null) {
    const { id, participantesIds, ...campos } = input
    await this.exigir(id, empresaId)

    await prisma.$transaction(async tx => {
      await tx.capacitacao.update({
        where: { id },
        data: {
          ...(campos.titulo !== undefined ? { titulo: campos.titulo.trim() } : {}),
          ...(campos.ambito !== undefined ? { ambito: campos.ambito } : {}),
          ...(campos.metodoId !== undefined ? { metodoId: campos.metodoId || null } : {}),
          ...(campos.instrutor !== undefined ? { instrutor: campos.instrutor?.trim() || null } : {}),
          ...(campos.organizacao !== undefined ? { organizacao: campos.organizacao?.trim() || null } : {}),
          ...(campos.local !== undefined ? { local: campos.local?.trim() || null } : {}),
          ...(campos.dataInicio !== undefined ? { dataInicio: dataDeISO(campos.dataInicio) } : {}),
          ...(campos.dataFim !== undefined ? { dataFim: campos.dataFim ? dataDeISO(campos.dataFim) : null } : {}),
          ...(campos.horaInicio !== undefined ? { horaInicio: horaOuNulo(campos.horaInicio) } : {}),
          ...(campos.horaFim !== undefined ? { horaFim: horaOuNulo(campos.horaFim) } : {}),
          ...(campos.cargaHoraria !== undefined ? { cargaHoraria: campos.cargaHoraria ?? null } : {}),
          ...(campos.custo !== undefined ? { custo: campos.custo ?? null } : {}),
          ...(campos.descricao !== undefined ? { descricao: campos.descricao || null } : {}),
          ...(campos.prazoAvaliacao !== undefined
            ? { prazoAvaliacao: campos.prazoAvaliacao ? dataDeISO(campos.prazoAvaliacao) : null }
            : {}),
        },
      })

      // A lista de participantes é substituída inteira quando vem no payload —
      // é como a tela edita. Mas quem JÁ confirmou presença não é removido:
      // a confirmação é um fato que aconteceu, e apagá-la reescreveria a
      // história da capacitação.
      if (participantesIds !== undefined) {
        const desejados = new Set(participantesIds)
        // Só os que têm usuário entram nesta conta. Participante sem ID é
        // resíduo do legado (ex-colaborador, guardado pelo nome) e a tela nem
        // o oferece para escolher — a edição não pode removê-lo por omissão.
        const atuais = (await tx.capacitacaoParticipante.findMany({
          where: { capacitacaoId: id, usuarioId: { not: null } },
          select: { usuarioId: true, confirmado: true },
        })).filter((p): p is { usuarioId: string; confirmado: boolean } => p.usuarioId !== null)

        const remover = atuais
          .filter(p => !desejados.has(p.usuarioId) && !p.confirmado)
          .map(p => p.usuarioId)
        if (remover.length) {
          await tx.capacitacaoParticipante.deleteMany({
            where: { capacitacaoId: id, usuarioId: { in: remover } },
          })
        }
        const existentes = new Set(atuais.map(p => p.usuarioId))
        const novos = [...desejados].filter(u => !existentes.has(u))
        if (novos.length) {
          await tx.capacitacaoParticipante.createMany({
            data: novos.map(usuarioId => ({ capacitacaoId: id, usuarioId })),
          })
        }
      }
    })

    await this.registrarLog(id, usuarioId, 'CAPACITACAO_EDITADA')
    return { id }
  }

  /** Manda para autorização — o passo que o perfil `apr/` do v1 recebia. */
  async solicitarAutorizacao(id: string, usuarioId: string, empresaId?: string | null) {
    const c = await this.exigir(id, empresaId)
    if (c.status !== 'SOLICITADA') throw new Error('Só uma solicitação nova pode ir para autorização.')
    await prisma.capacitacao.update({ where: { id }, data: { status: 'AGUARDANDO_AUTORIZACAO' } })
    await this.registrarLog(id, usuarioId, 'ENVIADA_PARA_AUTORIZACAO')
    return { id }
  }

  async autorizar(input: AutorizarCapacitacaoInput, usuarioId: string, empresaId?: string | null) {
    const c = await this.exigir(input.id, empresaId)
    if (c.status !== 'AGUARDANDO_AUTORIZACAO') {
      throw new Error('Esta capacitação não está aguardando autorização.')
    }
    await prisma.capacitacao.update({
      where: { id: input.id },
      data: input.autorizar
        ? { status: 'AUTORIZADA', autorizadaEm: dataDeISO(hojeISO()), autorizadaPorId: usuarioId }
        // Recusa volta para o solicitante ajustar, e não guarda autorizador:
        // ninguém autorizou.
        : { status: 'SOLICITADA', autorizadaEm: null, autorizadaPorId: null },
    })
    await this.registrarLog(
      input.id, usuarioId,
      input.autorizar ? 'AUTORIZADA' : 'AUTORIZACAO_RECUSADA',
      input.observacao || undefined,
    )
    return { id: input.id }
  }

  /**
   * Avaliação de eficácia — o fim do ciclo, e o que o v1 mais deixava pela
   * metade (124 das 299 nunca chegaram aqui).
   */
  async avaliar(input: AvaliarCapacitacaoInput, usuarioId: string, empresaId?: string | null) {
    await this.exigir(input.id, empresaId)
    await prisma.capacitacao.update({
      where: { id: input.id },
      data: {
        status: 'AVALIADA',
        avaliadaEm: dataDeISO(hojeISO()),
        avaliadorId: usuarioId,
        objetivosAtingidos: input.objetivosAtingidos,
        avaliacaoForma: input.avaliacaoForma,
        avaliacaoEvidencia: input.avaliacaoEvidencia || null,
        avaliacaoAcoes: input.avaliacaoAcoes || null,
      },
    })
    await this.registrarLog(
      input.id, usuarioId, 'AVALIADA',
      input.objetivosAtingidos ? 'Objetivos atingidos' : 'Objetivos NÃO atingidos',
    )
    return { id: input.id }
  }

  async finalizar(id: string, usuarioId: string, empresaId?: string | null) {
    const c = await this.exigir(id, empresaId)
    if (c.status !== 'AVALIADA') throw new Error('Só se finaliza depois de avaliar a eficácia.')
    await prisma.capacitacao.update({ where: { id }, data: { status: 'FINALIZADA' } })
    await this.registrarLog(id, usuarioId, 'FINALIZADA')
    return { id }
  }

  async cancelar(id: string, usuarioId: string, motivo: string, empresaId?: string | null) {
    await this.exigir(id, empresaId)
    await prisma.capacitacao.update({ where: { id }, data: { status: 'CANCELADA' } })
    await this.registrarLog(id, usuarioId, 'CANCELADA', motivo)
    return { id }
  }

  async excluir(id: string, empresaId?: string | null) {
    await this.exigir(id, empresaId)
    await prisma.capacitacao.delete({ where: { id } })
    return { id }
  }

  // ── Participantes ─────────────────────────────────────────

  /**
   * Confirmação de presença. O próprio participante confirma a sua — é o
   * evento mais frequente do log do v1 (605 de 4.198).
   */
  async confirmarPresenca(input: ConfirmarPresencaInput, usuarioId: string, empresaId?: string | null) {
    await this.exigir(input.capacitacaoId, empresaId)
    await prisma.capacitacaoParticipante.update({
      where: {
        capacitacaoId_usuarioId: {
          capacitacaoId: input.capacitacaoId,
          usuarioId: input.usuarioId,
        },
      },
      data: {
        confirmado: input.confirmado,
        confirmadoEm: input.confirmado ? dataDeISO(hojeISO()) : null,
      },
    })
    await this.registrarLog(
      input.capacitacaoId, usuarioId,
      input.confirmado ? 'PRESENCA_CONFIRMADA' : 'PRESENCA_DESFEITA',
    )
    return { ok: true }
  }

  /** Usuários para o seletor de participantes. */
  async listarUsuarios(empresaId?: string | null) {
    return prisma.user.findMany({
      where: empresaId ? { empresaId } : {},
      select: { id: true, name: true, email: true, image: true },
      orderBy: { name: 'asc' },
    })
  }

  // ── Métodos (cadastro) ────────────────────────────────────

  async listarMetodos(empresaId?: string | null, incluirInativos = false) {
    return prisma.capacitacaoMetodo.findMany({
      where: { empresaId: empresaId ?? null, ...(incluirInativos ? {} : { ativo: true }) },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
  }

  async criarMetodo(input: CapacitacaoMetodoInput, empresaId?: string | null) {
    return prisma.capacitacaoMetodo.create({
      data: { empresaId: empresaId ?? null, nome: input.nome.trim(), ordem: input.ordem, ativo: input.ativo },
      select: { id: true },
    })
  }

  async atualizarMetodo(id: string, input: Partial<CapacitacaoMetodoInput>, empresaId?: string | null) {
    const m = await prisma.capacitacaoMetodo.findFirst({
      where: { id, empresaId: empresaId ?? null }, select: { id: true },
    })
    if (!m) throw new Error('Método não encontrado.')
    return prisma.capacitacaoMetodo.update({
      where: { id },
      data: {
        ...(input.nome !== undefined ? { nome: input.nome.trim() } : {}),
        ...(input.ordem !== undefined ? { ordem: input.ordem } : {}),
        ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
      },
      select: { id: true },
    })
  }

  // ── Mensagens ─────────────────────────────────────────────

  async adicionarMensagem(id: string, texto: string, usuarioId: string, empresaId?: string | null) {
    await this.exigir(id, empresaId)
    return prisma.capacitacaoMensagem.create({
      data: { capacitacaoId: id, autorId: usuarioId, texto },
      select: { id: true },
    })
  }

  // ── Internos ──────────────────────────────────────────────

  private async exigir(id: string, empresaId?: string | null) {
    const c = await prisma.capacitacao.findFirst({
      where: { id, empresaId: empresaId ?? null },
      select: { id: true, titulo: true, status: true, solicitanteId: true },
    })
    if (!c) throw new Error('Capacitação não encontrada.')
    return c
  }

  /** Falha de log nunca derruba a operação que a originou. */
  private async registrarLog(capacitacaoId: string, usuarioId: string | null, evento: string, detalhe?: string) {
    await prisma.capacitacaoLog.create({
      data: { capacitacaoId, usuarioId, evento, detalhe: detalhe ?? null },
    }).catch(() => undefined)
  }
}
