import { Injectable } from '@nestjs/common'
import { prisma, getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import { randomBytes } from 'crypto'
import type {
  CriarManifestacaoInput, AtualizarManifestacaoInput,
  ListarManifestacoesInput, ManifestacaoTipo,
} from '@saas/types'

/**
 * Manifestações da Qualidade — elogio, reclamação e sugestão.
 *
 * Uma engrenagem só para os três: o que muda entre eles é o formulário e o
 * fluxo, não a mecânica de registrar, tratar e encerrar. O `tipo` entra em toda
 * consulta, e é o router de cada módulo que o fixa — assim quem tem acesso a
 * Elogios não alcança Reclamações por um parâmetro trocado.
 */

/** Prefixo do protocolo por tipo — quem recebe o código sabe do que se trata. */
const PREFIXO: Record<ManifestacaoTipo, string> = {
  ELOGIO: 'ELO',
  RECLAMACAO: 'REC',
  SUGESTAO: 'SUG',
}

/**
 * Alfabeto do protocolo, sem os caracteres que se confundem lidos em voz alta
 * ou copiados de um papel: I, O, 0, 1.
 */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Situação inicial por tipo. Reclamação começa esperando o retorno ao cliente. */
const STATUS_INICIAL: Record<ManifestacaoTipo, string> = {
  ELOGIO: 'RECEBIDA',
  SUGESTAO: 'RECEBIDA',
  RECLAMACAO: 'AGUARDANDO_RETORNO',
}

@Injectable()
export class ManifestacaoService {
  /**
   * Gera o código que a pessoa leva embora: ELO-7K3M-92QF.
   *
   * É o único caminho de volta para quem registrou anonimamente — sem autor
   * guardado, não há "minhas manifestações" nem e-mail de aviso. Por isso a
   * unicidade é conferida no banco, e não confiada ao acaso.
   */
  private async gerarProtocolo(tipo: ManifestacaoTipo): Promise<string> {
    for (let tentativa = 0; tentativa < 10; tentativa++) {
      const bytes = randomBytes(8)
      const corpo = Array.from(bytes, b => ALFABETO[b % ALFABETO.length]).join('')
      const protocolo = `${PREFIXO[tipo]}-${corpo.slice(0, 4)}-${corpo.slice(4, 8)}`
      const existe = await prisma.manifestacao.findUnique({ where: { protocolo }, select: { id: true } })
      if (!existe) return protocolo
    }
    throw new Error('Não foi possível gerar o protocolo. Tente de novo.')
  }

  // ── Leitura ───────────────────────────────────────────────

  async listar(
    tipo: ManifestacaoTipo,
    input: ListarManifestacoesInput,
    ctx: { userId: string; empresaId?: string | null; verTodos: boolean; verPublicas?: boolean },
  ) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    // Sem `ver_todos`, a pessoa enxerga o que registrou — e, no caso das
    // sugestões, também o que foi publicado no mural. Anônima nunca aparece
    // aqui: sem autor gravado, ela não é "de ninguém".
    const escopo = ctx.verTodos && !input.somenteMinhas
      ? {}
      : {
        OR: [
          { autorId: ctx.userId },
          ...(ctx.verPublicas ? [{ publica: true }] : []),
        ],
      }

    const where = {
      tipo,
      empresaId: ctx.empresaId ?? null,
      ...escopo,
      ...(input.status ? { status: input.status } : {}),
      ...(input.origem ? { origem: input.origem } : {}),
      ...(input.areaId ? { areaId: input.areaId } : {}),
      ...(input.clienteId ? { clienteId: input.clienteId } : {}),
      ...(search
        ? {
          OR: [
            { titulo: { contains: search, mode: 'insensitive' as const } },
            { descricao: { contains: search, mode: 'insensitive' as const } },
            { protocolo: { contains: search.toUpperCase() } },
          ],
        }
        : {}),
    }

    const [linhas, total] = await Promise.all([
      prisma.manifestacao.findMany({
        where,
        orderBy: sortBy ? { [sortBy]: sortDir } : { criadoEm: 'desc' },
        skip,
        take,
        include: {
          autor: { select: { id: true, name: true, image: true } },
          cliente: { select: { id: true, razaoSocial: true } },
          area: { select: { id: true, name: true } },
          _count: { select: { mensagens: true, arquivos: true } },
        },
      }),
      prisma.manifestacao.count({ where }),
    ])

    return buildPaginatedResponse(linhas.map(l => this.semAutorSeAnonima(l)), total, page, limit)
  }

  async getById(tipo: ManifestacaoTipo, id: string, empresaId?: string | null) {
    const m = await prisma.manifestacao.findFirst({
      where: { id, tipo, empresaId: empresaId ?? null },
      include: {
        autor: { select: { id: true, name: true, image: true } },
        cliente: { select: { id: true, razaoSocial: true, documento: true } },
        area: { select: { id: true, name: true } },
        mensagens: { orderBy: { criadoEm: 'asc' } },
        arquivos: { orderBy: { criadoEm: 'asc' } },
        logs: { orderBy: { criadoEm: 'desc' } },
      },
    })
    if (!m) throw new Error('Registro não encontrado.')

    // Os elogiados são IDs; a tela precisa dos nomes.
    const elogiados = m.elogiadosIds.length > 0
      ? await prisma.user.findMany({
        where: { id: { in: m.elogiadosIds } },
        select: { id: true, name: true, image: true },
      })
      : []

    return { ...this.semAutorSeAnonima(m), elogiados }
  }

  /**
   * Consulta pública por protocolo.
   *
   * É o caminho de volta de quem registrou sem se identificar, e do cliente que
   * usou o link público. Devolve só o que a pessoa precisa acompanhar — sem
   * notas internas, sem log e sem quem tratou.
   */
  async porProtocolo(protocolo: string) {
    const m = await prisma.manifestacao.findUnique({
      where: { protocolo: protocolo.trim().toUpperCase() },
      select: {
        protocolo: true, tipo: true, status: true, titulo: true, descricao: true,
        criadoEm: true, resposta: true, respondidoEm: true, retornoCliente: true,
        retornoFinal: true, justificativa: true, procede: true, encerradoEm: true,
        mensagens: {
          where: { interna: false },
          orderBy: { criadoEm: 'asc' },
          select: { id: true, texto: true, criadoEm: true },
        },
      },
    })
    if (!m) throw new Error('Protocolo não encontrado. Confira o código.')
    return m
  }

  // ── Escrita ───────────────────────────────────────────────

  async criar(input: CriarManifestacaoInput, autorId: string | null, empresaId?: string | null) {
    const tipo = input.tipo
    const protocolo = await this.gerarProtocolo(tipo)

    const criado = await prisma.manifestacao.create({
      data: {
        empresaId: empresaId ?? null,
        protocolo,
        tipo,
        origem: input.origem,
        anonima: input.anonima,
        // A promessa do anonimato se cumpre aqui: não há autor a guardar.
        autorId: input.anonima ? null : autorId,
        clienteId: input.origem === 'CLIENTE' ? (input.clienteId || null) : null,
        informanteNome: input.informanteNome || null,
        informanteEmail: input.informanteEmail || null,
        informanteTelefone: input.informanteTelefone || null,
        canal: input.canal || null,
        areaId: input.areaId || null,
        elogiadosIds: input.elogiadosIds ?? [],
        titulo: input.titulo || null,
        descricao: input.descricao,
        dataOcorrido: input.dataOcorrido ? new Date(`${input.dataOcorrido}T00:00:00.000Z`) : null,
        status: STATUS_INICIAL[tipo],
        publica: tipo === 'SUGESTAO' ? input.publica : false,
      },
    })

    await this.registrarLog(criado.id, input.anonima ? null : autorId, 'Registro criado')
    return criado
  }

  async atualizar(input: AtualizarManifestacaoInput, tipo: ManifestacaoTipo, empresaId?: string | null) {
    const atual = await this.exigir(input.id, tipo, empresaId)

    // Anonimato não se desfaz por edição: prometido uma vez, vale para sempre.
    // Deixar reverter permitiria descobrir o autor de um registro que nasceu
    // sem dono — e ele não existe para ser recuperado.
    const { id, tipo: _t, anonima: _a, ...resto } = input

    return prisma.manifestacao.update({
      where: { id: atual.id },
      data: {
        ...resto,
        ...(resto.dataOcorrido !== undefined
          ? { dataOcorrido: resto.dataOcorrido ? new Date(`${resto.dataOcorrido}T00:00:00.000Z`) : null }
          : {}),
      } as never,
    })
  }

  /** Resposta da Qualidade — o caminho de elogio e sugestão. */
  async responder(
    input: { id: string; resposta: string; encerrar: boolean },
    tipo: ManifestacaoTipo,
    userId: string,
    empresaId?: string | null,
  ) {
    const atual = await this.exigir(input.id, tipo, empresaId)

    await prisma.manifestacao.update({
      where: { id: atual.id },
      data: {
        resposta: input.resposta,
        respondidoEm: new Date(),
        respondidoPorId: userId,
        status: input.encerrar ? 'ENCERRADA' : 'RESPONDIDA',
        ...(input.encerrar ? { encerradoEm: new Date(), encerradoPorId: userId } : {}),
      },
    })

    await this.registrarLog(atual.id, userId, input.encerrar ? 'Respondida e encerrada' : 'Respondida')
    return { ok: true }
  }

  /** Sugestão no mural, ou fora dele. */
  async publicar(id: string, publica: boolean, tipo: ManifestacaoTipo, userId: string, empresaId?: string | null) {
    const atual = await this.exigir(id, tipo, empresaId)
    await prisma.manifestacao.update({ where: { id: atual.id }, data: { publica } })
    await this.registrarLog(atual.id, userId, publica ? 'Publicada no mural' : 'Retirada do mural')
    return { ok: true }
  }

  async excluir(id: string, tipo: ManifestacaoTipo, empresaId?: string | null) {
    const atual = await this.exigir(id, tipo, empresaId)
    await prisma.manifestacao.delete({ where: { id: atual.id } })
    return { ok: true }
  }

  // ── Conversa ──────────────────────────────────────────────

  async adicionarMensagem(
    input: { id: string; texto: string; interna: boolean },
    tipo: ManifestacaoTipo,
    userId: string,
    empresaId?: string | null,
  ) {
    const atual = await this.exigir(input.id, tipo, empresaId)
    const msg = await prisma.manifestacaoMensagem.create({
      data: { manifestacaoId: atual.id, autorId: userId, texto: input.texto, interna: input.interna },
    })
    await this.registrarLog(atual.id, userId, input.interna ? 'Nota interna' : 'Mensagem ao interessado')
    return msg
  }

  // ── Apoio ─────────────────────────────────────────────────

  /**
   * Some com o autor quando o registro é anônimo.
   *
   * O `autorId` já nasce nulo, então isto é cinto e suspensório: protege de um
   * `include` que traga a relação por outro caminho, e deixa a intenção escrita
   * onde alguém for mexer.
   */
  private semAutorSeAnonima<T extends { anonima: boolean; autor?: unknown; autorId?: string | null }>(m: T): T {
    return m.anonima ? { ...m, autor: null, autorId: null } : m
  }

  private async exigir(id: string, tipo: ManifestacaoTipo, empresaId?: string | null) {
    const m = await prisma.manifestacao.findFirst({
      where: { id, tipo, empresaId: empresaId ?? null },
      select: { id: true, status: true, anonima: true, autorId: true },
    })
    if (!m) throw new Error('Registro não encontrado.')
    return m
  }

  private async registrarLog(manifestacaoId: string, usuarioId: string | null, evento: string, detalhe?: string) {
    await prisma.manifestacaoLog.create({
      data: { manifestacaoId, usuarioId, evento, detalhe: detalhe ?? null },
    }).catch(() => undefined)
  }
}
