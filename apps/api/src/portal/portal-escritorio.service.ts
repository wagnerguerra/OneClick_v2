import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'


/**
 * Portal do Cliente — o lado do ESCRITÓRIO.
 *
 * É por aqui que o documento entra no portal: publicar uma guia, pedir um
 * extrato, acompanhar o que o cliente enviou e o que ele já leu. Sem isto, o
 * porta-arquivos do cliente é uma tela vazia — a Fase 1 só existe com as duas
 * pontas.
 *
 * Escopo aqui é o INTERNO (empresa/tenant), o oposto do `portal-arquivos`, que
 * é escopado por cliente. Os dois nunca se misturam: aquele recebe o vínculo
 * pronto e nunca sabe de empresa; este só é chamado por procedure interna e
 * nunca sabe de vínculo.
 */

/**
 * Recorte por empresa — mesma regra do `empresaFilter` de `cliente.service`.
 *
 * Replicada aqui, e não importada, porque lá ela é uma função local de um
 * arquivo de 1500 linhas: exportá-la criaria dependência deste serviço com o
 * serviço inteiro de clientes. São três linhas, e o que importa é o
 * comportamento — inclusive o `__none__`, que faz a consulta não devolver NADA
 * quando não há empresa nem master, em vez de devolver tudo.
 */
function clienteDaEmpresa(isMaster?: boolean, empresaId?: string | null) {
  if (empresaId) return { empresaId }
  return isMaster ? {} : { empresaId: '__none__' }
}

/** Deve casar com as categorias que o portal exibe (`portal-arquivos`). */
const CATEGORIAS_VALIDAS = new Set(['guias', 'folha', 'notas', 'contabil', 'societario', 'outros'])

@Injectable()
export class PortalEscritorioService {
  /**
   * Publica (ou despublica) um arquivo no portal do cliente.
   *
   * Publicar é ato deliberado, arquivo por arquivo: `visivelParaCliente` nasce
   * false justamente porque a tabela guarda muita coisa interna sobre o cliente
   * que não é para ele.
   */
  async publicarArquivo(
    input: {
      arquivoId: string
      visivel: boolean
      competencia?: string | null
      categoria?: string | null
      pastaId?: string | null
    },
    escopo: { isMaster?: boolean; empresaId?: string | null },
  ) {
    if (input.competencia && !/^\d{6}$/.test(input.competencia)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Competência deve ser AAAAMM.' })
    }
    if (input.categoria && !CATEGORIAS_VALIDAS.has(input.categoria)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Categoria desconhecida.' })
    }

    // A competência é OPCIONAL desde que a navegação passou a ser por pasta.
    // Antes ela era obrigatória porque ERA a pasta; agora é atributo, e exigir
    // mês para publicar um contrato ou um documento societário — que não têm
    // mês — só produziria competência inventada.
    //
    // Pasta de destino precisa ser DESTE cliente. Sem esta checagem, um id de
    // pasta de outro cliente colocaria o arquivo fora do alcance de quem
    // deveria vê-lo — ou, pior, dentro do alcance de quem não deveria.
    if (input.pastaId) {
      const arquivo = await prisma.clienteArquivo.findFirst({
        where: { id: input.arquivoId, cliente: this.clienteNoEscopo(escopo) },
        select: { clienteId: true },
      })
      const pasta = arquivo
        ? await prisma.portalPasta.findFirst({
            where: { id: input.pastaId, clienteId: arquivo.clienteId },
            select: { id: true },
          })
        : null
      if (!pasta) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta de destino não encontrada.' })
      }
    }

    const alterados = await prisma.clienteArquivo.updateMany({
      // O `cliente` no where é o escopo interno: sem ele, um id de arquivo de
      // outro tenant seria publicado a partir daqui.
      where: { id: input.arquivoId, cliente: this.clienteNoEscopo(escopo) },
      data: {
        visivelParaCliente: input.visivel,
        ...(input.competencia !== undefined ? { competencia: input.competencia } : {}),
        ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
        ...(input.pastaId !== undefined ? { pastaId: input.pastaId } : {}),
      },
    })
    if (alterados.count === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Arquivo não encontrado.' })
    }
    return { ok: true }
  }

  /**
   * Pastas do cliente, achatadas com o caminho no nome.
   *
   * Achatar em vez de devolver árvore porque o consumidor é um `select` da
   * tela de publicação: "Contratos / Aditivos" diz onde o arquivo vai cair sem
   * exigir que a pessoa navegue. Cliente com centenas de pastas ia pedir outra
   * coisa; nenhum tem, e o `take` segura o caso patológico.
   */
  async listarPastas(clienteId: string) {
    const pastas = await prisma.portalPasta.findMany({
      where: { clienteId },
      orderBy: { nome: 'asc' },
      take: 300,
      select: { id: true, nome: true, paiId: true },
    })
    const porId = new Map(pastas.map(p => [p.id, p]))

    const caminhoDe = (id: string): string => {
      const partes: string[] = []
      let atual: string | null = id
      for (let i = 0; atual && i < 20; i++) {
        const p = porId.get(atual)
        if (!p) break
        partes.unshift(p.nome)
        atual = p.paiId
      }
      return partes.join(' / ')
    }

    return pastas
      .map(p => ({ id: p.id, caminho: caminhoDe(p.id) }))
      .sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt-BR'))
  }

  /** Solicitações do cliente, abertas e fechadas, para o painel do escritório. */
  async listarSolicitacoes(clienteId: string) {
    const linhas = await prisma.portalSolicitacao.findMany({
      where: { clienteId },
      orderBy: [{ situacao: 'asc' }, { prazo: 'asc' }, { criadaEm: 'desc' }],
      take: 60,
      select: {
        id: true, titulo: true, descricao: true, competencia: true, categoria: true,
        prazo: true, situacao: true, atendidaEm: true, criadaEm: true,
        arquivos: { select: { id: true, fileName: true, fileUrl: true, createdAt: true } },
      },
    })
    return linhas
  }

  /**
   * Pede um documento ao cliente.
   *
   * O pedido vira pendência na tela dele, com prazo. É o que transforma o
   * porta-arquivos em processo — sem isso, o cliente segue sendo cobrado por
   * WhatsApp e o arquivo chega por onde sempre chegou.
   */
  async criarSolicitacao(
    input: {
      clienteId: string
      titulo: string
      descricao?: string | null
      competencia?: string | null
      categoria?: string | null
      prazo?: string | null
    },
    ctx: { userId: string; isMaster?: boolean; empresaId?: string | null },
  ) {
    const cliente = await prisma.cliente.findFirst({
      where: { id: input.clienteId, ...this.clienteNoEscopo(ctx) },
      select: { id: true },
    })
    if (!cliente) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado ou fora do seu acesso.' })
    }
    if (input.competencia && !/^\d{6}$/.test(input.competencia)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Competência deve ser AAAAMM.' })
    }

    // Sem ninguém do lado de lá, o pedido não chega a lugar nenhum. Recusar é
    // melhor do que criar uma pendência que ninguém nunca verá.
    const comAcesso = await prisma.clienteUsuario.count({
      where: { clienteId: input.clienteId, ativo: true },
    })
    if (comAcesso === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Este cliente ainda não tem usuário no portal. Cadastre um na aba Usuários antes de solicitar documentos.',
      })
    }

    return prisma.portalSolicitacao.create({
      data: {
        clienteId: input.clienteId,
        titulo: input.titulo.trim(),
        descricao: input.descricao?.trim() || null,
        competencia: input.competencia || null,
        categoria: input.categoria || null,
        prazo: input.prazo ? new Date(input.prazo) : null,
        criadaPorId: ctx.userId,
      },
      select: { id: true },
    })
  }

  /** Cancela um pedido — some da tela do cliente, mas fica no histórico. */
  async cancelarSolicitacao(id: string, escopo: { isMaster?: boolean; empresaId?: string | null }) {
    const alterados = await prisma.portalSolicitacao.updateMany({
      where: { id, situacao: 'PENDENTE', cliente: this.clienteNoEscopo(escopo) },
      data: { situacao: 'CANCELADA' },
    })
    if (alterados.count === 0) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Solicitação não encontrada ou já atendida.',
      })
    }
    return { ok: true }
  }

  /** Cliente dentro do escopo interno de quem está chamando. */
  private clienteNoEscopo(escopo: { isMaster?: boolean; empresaId?: string | null }) {
    return clienteDaEmpresa(escopo.isMaster, escopo.empresaId)
  }
}
