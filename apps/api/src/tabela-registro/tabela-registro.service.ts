import { Injectable } from '@nestjs/common'
import { prisma, getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import type {
  CriarTabelaRegistroInput, AtualizarTabelaRegistroInput,
  NovaVersaoTabelaInput, ListarTabelasRegistroInput,
} from '@saas/types'

/**
 * Tabelas de Registros — port do `sgq_tabelas` do v1, no mesmo desenho de
 * Documentos Internos: identidade + versões + ponteiro para a vigente.
 * Sem arquivos e sem aprovação, porque o v1 não tinha e o conteúdo é
 * normativo (os cinco campos do controle de registros da ISO).
 *
 * O mapa de processos é COMPARTILHADO com Documentos Internos
 * (`documento_processos`) — no v1 ambos apontam para a mesma `sgq_proc`.
 */

function dataDeISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

@Injectable()
export class TabelaRegistroService {
  async listar(input: ListarTabelasRegistroInput, empresaId?: string | null) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const filtros: Record<string, unknown>[] = []
    if (input.processoId) filtros.push({ processoId: input.processoId })
    if (search) filtros.push({ nome: { contains: search, mode: 'insensitive' } })

    const where = { empresaId: empresaId ?? null, ...(filtros.length ? { AND: filtros } : {}) }
    const orderBy = sortBy ? { [sortBy]: sortDir } : { nome: 'asc' as const }

    const [data, total] = await Promise.all([
      prisma.tabelaRegistro.findMany({
        where, orderBy, skip, take,
        select: {
          id: true, legacyId: true, nome: true,
          processo: { select: { id: true, nome: true } },
          versaoAtual: { select: { id: true, versao: true, dataVersao: true, retencao: true } },
          _count: { select: { versoes: true } },
        },
      }),
      prisma.tabelaRegistro.count({ where }),
    ])
    return buildPaginatedResponse(data, total, page, limit)
  }

  async getById(id: string, empresaId?: string | null) {
    const t = await prisma.tabelaRegistro.findFirst({
      where: { id, empresaId: empresaId ?? null },
      include: {
        processo: { select: { id: true, nome: true } },
        versaoAtual: { select: { id: true, versao: true } },
        versoes: { orderBy: { versao: 'desc' } },
      },
    })
    if (!t) throw new Error('Registro não encontrado.')

    // O autor vira nome já no payload: id do v2 quando a pessoa existe,
    // resíduo do v1 quando é ex-colaborador (registradoPorNome importado).
    const ids = [...new Set(t.versoes.map((v) => v.registradoPorId).filter((x): x is string => !!x))]
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : []
    const nomePorId = new Map(users.map((u) => [u.id, u.name]))
    return {
      ...t,
      versoes: t.versoes.map((v) => ({
        ...v,
        registradoPorNome: v.registradoPorNome ?? (v.registradoPorId ? nomePorId.get(v.registradoPorId) ?? null : null),
      })),
    }
  }

  /** Cria o registro já com a versão 0 — controle sem conteúdo não existe. */
  async criar(input: CriarTabelaRegistroInput, usuarioId: string, empresaId?: string | null) {
    return prisma.$transaction(async (tx) => {
      const t = await tx.tabelaRegistro.create({
        data: {
          empresaId: empresaId ?? null,
          nome: input.nome.trim(),
          processoId: input.processoId || null,
        },
        select: { id: true },
      })
      const v = await tx.tabelaRegistroVersao.create({
        data: {
          tabelaId: t.id,
          versao: 0,
          dataVersao: dataDeISO(input.dataVersao),
          armazenamento: input.armazenamento || null,
          protecao: input.protecao || null,
          recuperacao: input.recuperacao || null,
          retencao: input.retencao || null,
          disposicao: input.disposicao || null,
          registradoPorId: usuarioId,
        },
        select: { id: true },
      })
      await tx.tabelaRegistro.update({ where: { id: t.id }, data: { versaoAtualId: v.id } })
      return t
    })
  }

  async atualizar(input: AtualizarTabelaRegistroInput, empresaId?: string | null) {
    const { id, ...campos } = input
    await this.getById(id, empresaId)
    return prisma.tabelaRegistro.update({
      where: { id },
      data: {
        ...(campos.nome !== undefined ? { nome: campos.nome.trim() } : {}),
        ...(campos.processoId !== undefined ? { processoId: campos.processoId || null } : {}),
      },
      select: { id: true },
    })
  }

  /** Nova versão: numera pela última + 1 e vira a vigente, numa transação. */
  async novaVersao(input: NovaVersaoTabelaInput, usuarioId: string, empresaId?: string | null) {
    const t = await this.getById(input.tabelaId, empresaId)
    return prisma.$transaction(async (tx) => {
      const ultima = await tx.tabelaRegistroVersao.findFirst({
        where: { tabelaId: t.id },
        orderBy: { versao: 'desc' },
        select: { versao: true },
      })
      const v = await tx.tabelaRegistroVersao.create({
        data: {
          tabelaId: t.id,
          versao: (ultima?.versao ?? -1) + 1,
          dataVersao: dataDeISO(input.dataVersao),
          armazenamento: input.armazenamento || null,
          protecao: input.protecao || null,
          recuperacao: input.recuperacao || null,
          retencao: input.retencao || null,
          disposicao: input.disposicao || null,
          registradoPorId: usuarioId,
        },
        select: { id: true, versao: true },
      })
      await tx.tabelaRegistro.update({ where: { id: t.id }, data: { versaoAtualId: v.id } })
      return v
    })
  }

  async excluir(id: string, empresaId?: string | null) {
    await this.getById(id, empresaId)
    // Zera o ponteiro antes: a FK da vigente atrapalharia a ordem do cascade.
    await prisma.tabelaRegistro.update({ where: { id }, data: { versaoAtualId: null } })
    await prisma.tabelaRegistro.delete({ where: { id } })
    return { id }
  }

  /** O mapa de processos compartilhado com Documentos Internos. */
  async listarProcessos(empresaId?: string | null) {
    return prisma.documentoProcesso.findMany({
      where: { empresaId: empresaId ?? null, ativo: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true },
    })
  }
}
