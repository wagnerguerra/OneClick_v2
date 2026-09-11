import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import {
  resolverEscopo,
  filtroDeCliente,
  alcancaCliente,
  type ContextoInterno,
} from './gestao-arquivos-escopo'
import { GestaoArquivosNotificacaoService } from './gestao-arquivos-notificacao.service'

/**
 * Gestão de Arquivos — o porta-arquivos visto do lado do ESCRITÓRIO.
 *
 * O Portal (Fase 1) deu ao cliente uma pasta para enviar e receber documento.
 * Faltava o outro lado: uma tela onde o escritório vê o que chegou, de todos os
 * clientes de uma vez, sabe o que ainda não olhou, e responde por quem fez o
 * quê. Sem isso, o arquivo que o cliente manda só é descoberto se alguém abrir
 * o cadastro daquele cliente por acaso.
 *
 * Os dados são os MESMOS do portal (`cliente_arquivos`, `portal_pastas`) — não
 * há cópia. O que muda é o recorte: aqui é por responsabilidade interna
 * (`gestao-arquivos-escopo`), lá é por vínculo do cliente (`portal-escopo`).
 */

/** Eventos registrados na trilha. Texto, não enum: a lista cresce com o uso. */
export const EVENTOS = {
  ABRIU: 'ABRIU',
  EXCLUIU: 'EXCLUIU',
  RESTAUROU: 'RESTAUROU',
} as const

@Injectable()
export class GestaoArquivosService {
  constructor(private readonly notificacao: GestaoArquivosNotificacaoService) {}

  /**
   * Clientes que já têm alguém no portal — o universo do módulo.
   *
   * Cliente sem usuário de portal fica de fora de propósito: não há como chegar
   * arquivo por lá, então ele só poluiria a lista. É o mesmo critério que o
   * pedido descreve ("clientes que já possuem usuários cadastrados").
   */
  async listarClientes(ctx: ContextoInterno) {
    const escopo = await resolverEscopo(ctx)

    const clientes = await prisma.cliente.findMany({
      where: {
        ...filtroDeCliente(escopo, ctx),
        usuariosPortal: { some: { ativo: true } },
      },
      select: {
        id: true,
        razaoSocial: true,
        nomeFantasia: true,
        documento: true,
        tipoDocumento: true,
        status: true,
        _count: { select: { usuariosPortal: { where: { ativo: true } } } },
      },
      orderBy: { razaoSocial: 'asc' },
      take: 500,
    })
    if (clientes.length === 0) return []

    const ids = clientes.map(c => c.id)

    // "Novo" é por pessoa: conta o que ESTE usuário ainda não abriu. Só entram
    // arquivos que vieram do cliente — o que o próprio escritório publicou não
    // faz sentido destacar como novidade para o escritório.
    const naoVistos = await prisma.clienteArquivo.groupBy({
      by: ['clienteId'],
      where: {
        clienteId: { in: ids },
        excluidoEm: null,
        origem: 'CLIENTE',
        visualizacoes: { none: { userId: ctx.userId } },
      },
      _count: { _all: true },
    })
    const novosPorCliente = new Map(naoVistos.map(n => [n.clienteId, n._count._all]))

    const totais = await prisma.clienteArquivo.groupBy({
      by: ['clienteId'],
      where: { clienteId: { in: ids }, excluidoEm: null },
      _count: { _all: true },
    })
    const totalPorCliente = new Map(totais.map(t => [t.clienteId, t._count._all]))

    return clientes.map(c => ({
      id: c.id,
      razaoSocial: c.razaoSocial,
      nomeFantasia: c.nomeFantasia,
      documento: c.documento,
      tipoDocumento: c.tipoDocumento,
      status: c.status,
      usuariosPortal: c._count.usuariosPortal,
      arquivos: totalPorCliente.get(c.id) ?? 0,
      novos: novosPorCliente.get(c.id) ?? 0,
    }))
  }

  /**
   * Garante que a pessoa alcança este cliente, e devolve o escopo já resolvido.
   *
   * Toda operação que recebe `clienteId` pela requisição passa por aqui. A
   * listagem filtrada não protege nada sozinha: sem esta checagem, trocar o id
   * na chamada daria acesso aos arquivos de qualquer cliente do tenant.
   */
  private async exigirAlcance(clienteId: string, ctx: ContextoInterno) {
    const escopo = await resolverEscopo(ctx)
    if (!alcancaCliente(escopo, clienteId)) {
      // NOT_FOUND, e não FORBIDDEN: um 403 confirmaria que o cliente existe
      // naquele id, que já é informação que a pessoa não deveria ter.
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }
    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, ...filtroDeCliente(escopo, ctx) },
      select: { id: true, razaoSocial: true, empresaId: true },
    })
    if (!cliente) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    return cliente
  }

  /** Conteúdo de uma pasta: subpastas e arquivos, com o destaque de "novo". */
  async listar(input: { clienteId: string; pastaId?: string | null }, ctx: ContextoInterno) {
    await this.exigirAlcance(input.clienteId, ctx)
    const pastaId = input.pastaId ?? null

    if (pastaId) {
      const existe = await prisma.portalPasta.findFirst({
        where: { id: pastaId, clienteId: input.clienteId },
        select: { id: true },
      })
      if (!existe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta não encontrada.' })
    }

    const [pastas, arquivos] = await Promise.all([
      prisma.portalPasta.findMany({
        where: { clienteId: input.clienteId, paiId: pastaId },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true },
      }),
      prisma.clienteArquivo.findMany({
        where: { clienteId: input.clienteId, pastaId, excluidoEm: null },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true, fileName: true, fileSize: true, mimeType: true,
          competencia: true, categoria: true, origem: true,
          visivelParaCliente: true, createdAt: true, lidoEm: true,
          user: { select: { name: true } },
          visualizacoes: { where: { userId: ctx.userId }, select: { vistoEm: true }, take: 1 },
        },
      }),
    ])

    return {
      caminho: await this.caminho(pastaId, input.clienteId),
      pastas,
      arquivos: arquivos.map(a => ({
        id: a.id,
        fileName: a.fileName,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        competencia: a.competencia,
        categoria: a.categoria,
        origem: a.origem,
        visivelParaCliente: a.visivelParaCliente,
        criadoEm: a.createdAt,
        enviadoPor: a.user?.name ?? null,
        lidoPeloCliente: a.lidoEm,
        // Só o que veio do cliente pode estar "novo": destacar como novidade um
        // arquivo que o próprio escritório publicou não diz nada a ninguém.
        novo: a.origem === 'CLIENTE' && a.visualizacoes.length === 0,
      })),
    }
  }

  /**
   * Trilha de pastas até a raiz, para a navegação e para o log.
   *
   * O teto de 20 níveis é proteção contra ciclo: se um `paiId` apontar para um
   * ancestral por bug ou escrita manual no banco, o laço para em vez de travar
   * a requisição. Mesma defesa do lado do portal.
   */
  private async caminho(pastaId: string | null, clienteId: string) {
    const trilha: Array<{ id: string; nome: string }> = []
    let atual = pastaId
    for (let i = 0; atual && i < 20; i++) {
      const p: { id: string; nome: string; paiId: string | null } | null =
        await prisma.portalPasta.findFirst({
          where: { id: atual, clienteId },
          select: { id: true, nome: true, paiId: true },
        })
      if (!p) break
      trilha.unshift({ id: p.id, nome: p.nome })
      atual = p.paiId
    }
    return trilha
  }

  /**
   * Abre o arquivo: marca como visto POR ESTA PESSOA e registra na trilha.
   *
   * O `createMany` com `skipDuplicates` em vez de upsert porque a visualização
   * é imutável — o que interessa é a PRIMEIRA vez que a pessoa abriu, não a
   * última. Reabrir não reescreve a data.
   */
  async abrir(arquivoId: string, ctx: ContextoInterno) {
    const arquivo = await this.exigirArquivo(arquivoId, ctx)

    await prisma.arquivoVisualizacao.createMany({
      data: [{ arquivoId, userId: ctx.userId }],
      skipDuplicates: true,
    })

    await this.registrar({
      clienteId: arquivo.clienteId,
      arquivoId,
      arquivoNome: arquivo.fileName,
      pastaId: arquivo.pastaId,
      evento: EVENTOS.ABRIU,
      ctx,
    })

    return { url: arquivo.fileUrl, fileName: arquivo.fileName }
  }

  /**
   * Exclui (logicamente) um arquivo.
   *
   * Exige `canDelete` no módulo — é o "ler" versus "ler e excluir" do lado do
   * escritório, e sai do `UserPermission` que já existe, sem sub-permissão
   * nova. A procedure no router já barra; a checagem aqui é a segunda tranca,
   * para o serviço não depender de quem o chama.
   */
  async excluir(input: { arquivoId: string; motivo?: string | null }, ctx: ContextoInterno) {
    const arquivo = await this.exigirArquivo(input.arquivoId, ctx)

    const r = await prisma.clienteArquivo.updateMany({
      where: { id: input.arquivoId, excluidoEm: null },
      data: { excluidoEm: new Date(), excluidoPorId: ctx.userId },
    })
    if (r.count === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo já estava excluído.' })
    }

    await this.registrar({
      clienteId: arquivo.clienteId,
      arquivoId: input.arquivoId,
      arquivoNome: arquivo.fileName,
      pastaId: arquivo.pastaId,
      evento: EVENTOS.EXCLUIU,
      detalhe: input.motivo?.trim() || null,
      ctx,
    })

    // E-mail nunca derruba a exclusão: o ato já aconteceu e está auditado.
    // Falha de SMTP não pode transformar uma operação concluída em erro na tela.
    await this.notificacao
      .disparar({
        evento: 'ARQUIVO_EXCLUIDO',
        clienteId: arquivo.clienteId,
        assunto: `Arquivo excluído — ${arquivo.fileName}`,
        corpo:
          `${ctx.userId ? 'Um usuário do escritório' : 'Alguém'} excluiu o arquivo ` +
          `"${arquivo.fileName}".` + (input.motivo ? `\n\nMotivo: ${input.motivo}` : ''),
      })
      .catch(() => undefined)

    return { ok: true }
  }

  /** Desfaz a exclusão. Só existe porque a exclusão é lógica. */
  async restaurar(arquivoId: string, ctx: ContextoInterno) {
    const arquivo = await this.exigirArquivo(arquivoId, ctx, { incluirExcluidos: true })

    const r = await prisma.clienteArquivo.updateMany({
      where: { id: arquivoId, excluidoEm: { not: null } },
      data: { excluidoEm: null, excluidoPorId: null },
    })
    if (r.count === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo não está excluído.' })
    }

    await this.registrar({
      clienteId: arquivo.clienteId,
      arquivoId,
      arquivoNome: arquivo.fileName,
      pastaId: arquivo.pastaId,
      evento: EVENTOS.RESTAUROU,
      ctx,
    })
    return { ok: true }
  }

  /** Resolve o arquivo e confirma que a pessoa alcança o cliente dele. */
  private async exigirArquivo(
    arquivoId: string,
    ctx: ContextoInterno,
    opts?: { incluirExcluidos?: boolean },
  ) {
    const arquivo = await prisma.clienteArquivo.findFirst({
      where: {
        id: arquivoId,
        ...(opts?.incluirExcluidos ? {} : { excluidoEm: null }),
      },
      select: { id: true, clienteId: true, fileName: true, fileUrl: true, pastaId: true },
    })
    if (!arquivo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Arquivo não encontrado.' })
    await this.exigirAlcance(arquivo.clienteId, ctx)
    return arquivo
  }

  /**
   * Grava uma linha na trilha.
   *
   * Guarda o NOME do arquivo e o CAMINHO da pasta, além dos ids: o log precisa
   * continuar legível depois que o arquivo for excluído ou a pasta renomeada.
   * Auditoria que só tem id vira lista de códigos mortos no dia em que alguém
   * precisa dela.
   */
  private async registrar(e: {
    clienteId: string
    arquivoId?: string | null
    arquivoNome?: string | null
    pastaId?: string | null
    evento: string
    detalhe?: string | null
    lado?: string
    ctx: ContextoInterno
  }) {
    const [usuario, trilha] = await Promise.all([
      prisma.user.findUnique({ where: { id: e.ctx.userId }, select: { name: true } }).catch(() => null),
      e.pastaId ? this.caminho(e.pastaId, e.clienteId) : Promise.resolve([]),
    ])

    await prisma.arquivoLog.create({
      data: {
        clienteId: e.clienteId,
        arquivoId: e.arquivoId ?? null,
        arquivoNome: e.arquivoNome ?? null,
        pastaId: e.pastaId ?? null,
        pastaCaminho: trilha.length ? trilha.map(t => t.nome).join(' / ') : null,
        evento: e.evento,
        lado: e.lado ?? 'ESCRITORIO',
        usuarioId: e.ctx.userId,
        usuarioNome: usuario?.name ?? null,
        detalhe: e.detalhe ?? null,
      },
    })
  }

  /** A trilha de um cliente, mais recente primeiro. */
  async listarLog(
    input: { clienteId: string; evento?: string | null; limite?: number },
    ctx: ContextoInterno,
  ) {
    await this.exigirAlcance(input.clienteId, ctx)
    return prisma.arquivoLog.findMany({
      where: {
        clienteId: input.clienteId,
        ...(input.evento ? { evento: input.evento } : {}),
      },
      orderBy: { criadoEm: 'desc' },
      take: Math.min(input.limite ?? 100, 500),
      select: {
        id: true, evento: true, lado: true, arquivoNome: true,
        pastaCaminho: true, usuarioNome: true, detalhe: true, criadoEm: true,
      },
    })
  }

  /** Arquivos excluídos do cliente — a lixeira, para restaurar. */
  async listarExcluidos(clienteId: string, ctx: ContextoInterno) {
    await this.exigirAlcance(clienteId, ctx)
    return prisma.clienteArquivo.findMany({
      where: { clienteId, excluidoEm: { not: null } },
      orderBy: { excluidoEm: 'desc' },
      take: 200,
      select: {
        id: true, fileName: true, competencia: true, categoria: true,
        excluidoEm: true,
        excluidoPor: { select: { name: true } },
      },
    })
  }
}
