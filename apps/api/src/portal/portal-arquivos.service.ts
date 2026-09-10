import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'

import { atendeNivel, podeNaArea, type VinculoPortal } from './portal-escopo'

/**
 * Porta-arquivos do Portal do Cliente.
 *
 * O vaivém de documento entre escritório e cliente, que hoje acontece por
 * e-mail e WhatsApp. Duas direções: o escritório PUBLICA (guias, relatórios) e
 * o cliente ENVIA (notas, extratos).
 *
 * Toda entrada aqui recebe o vínculo JÁ RESOLVIDO pela `portalProcedure` — este
 * serviço nunca resolve escopo por conta própria, e nenhuma consulta dele monta
 * `where` sem o `clienteId` que veio de lá.
 *
 * A navegação é por PASTA, no modelo do Drive, criada por quem usa. A primeira
 * versão usava a competência como pasta e a árvore saía dos próprios campos:
 * resolvia guia mensal e não resolvia o resto — "Contratos" e "Documentos
 * societários" não têm mês.
 *
 * `competencia` e `categoria` continuam no arquivo, mas como ATRIBUTO:
 * a categoria é quem decide o recorte por área (ver `CATEGORIA_EXIGE_AREA`), e
 * a competência serve ao escritório e à busca. Nenhuma das duas navega.
 */

/** Categorias conhecidas. Texto livre no banco; isto é só a ordem da tela. */
export const CATEGORIAS = [
  { chave: 'guias', rotulo: 'Guias e impostos' },
  { chave: 'folha', rotulo: 'Folha de pagamento' },
  { chave: 'notas', rotulo: 'Notas fiscais' },
  { chave: 'contabil', rotulo: 'Contábil' },
  { chave: 'societario', rotulo: 'Societário' },
  { chave: 'outros', rotulo: 'Outros' },
] as const

/**
 * Categorias que só aparecem para quem tem a ÁREA correspondente.
 *
 * É onde o eixo de áreas do vínculo encosta no porta-arquivos: o RH do cliente
 * não precisa das guias, e o financeiro não precisa ver salário. O que não está
 * mapeado aqui é visível para qualquer nível — societário e contratos não são
 * segredo dentro da empresa do cliente.
 */
const CATEGORIA_EXIGE_AREA: Record<string, string[]> = {
  folha: ['pessoal', 'trabalhista'],
  guias: ['fiscal'],
  notas: ['fiscal'],
  contabil: ['contabil'],
}

export interface ArquivoDoPortal {
  id: string
  fileName: string
  fileSize: number | null
  mimeType: string | null
  descricao: string | null
  competencia: string | null
  categoria: string | null
  origem: string
  pastaId: string | null
  criadoEm: Date
  lidoEm: Date | null
  /** Nome de quem enviou, quando foi o cliente. */
  enviadoPor: string | null
}

@Injectable()
export class PortalArquivosService {
  /**
   * O conteúdo de uma pasta: subpastas, arquivos e o caminho até a raiz.
   *
   * Uma chamada só porque a tela precisa das três coisas ao mesmo tempo, e
   * porque quem monta o caminho precisa ter validado a pasta antes — separar
   * abriria a porta para listar arquivos de uma pasta de outro cliente.
   */
  async abrirPasta(vinculo: VinculoPortal, pastaId?: string | null) {
    // Pasta de outro cliente nao existe para quem esta aqui. Validar ANTES de
    // qualquer listagem e o que impede a navegacao por id adivinhado.
    if (pastaId) {
      const dona = await prisma.portalPasta.findFirst({
        where: { id: pastaId, clienteId: vinculo.clienteId },
        select: { id: true },
      })
      if (!dona) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta nao encontrada.' })
    }

    const [pastas, arquivos, caminho] = await Promise.all([
      prisma.portalPasta.findMany({
        where: { clienteId: vinculo.clienteId, paiId: pastaId ?? null },
        orderBy: { nome: 'asc' },
        select: {
          id: true, nome: true, origem: true, criadaEm: true,
          _count: { select: { filhas: true, arquivos: true } },
        },
      }),
      this.listar(vinculo, pastaId ?? null),
      this.caminho(vinculo.clienteId, pastaId ?? null),
    ])

    return {
      pastas: pastas.map(p => ({
        id: p.id, nome: p.nome, origem: p.origem, criadaEm: p.criadaEm,
        itens: p._count.filhas + p._count.arquivos,
      })),
      arquivos,
      caminho,
    }
  }

  /** Da raiz ate a pasta atual — o rastro de migalhas da tela. */
  private async caminho(clienteId: string, pastaId: string | null) {
    const trilha: Array<{ id: string; nome: string }> = []
    let atual = pastaId
    // Teto de 20 niveis: o modelo nao tem ciclo (o pai e criado antes da
    // filha), mas consulta em laco sem limite e o tipo de coisa que trava o
    // servidor se o dado for corrompido por SQL manual.
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
   * Cria uma pasta.
   *
   * Nome duplicado lado a lado e recusado antes de chegar ao banco: a mensagem
   * do Postgres ("Unique constraint failed") nao ajuda ninguem.
   */
  async criarPasta(
    vinculo: VinculoPortal,
    input: { nome: string; paiId?: string | null },
    userId: string,
  ) {
    if (!atendeNivel(vinculo, 'OPERACIONAL')) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Seu acesso e somente leitura.' })
    }
    const nome = input.nome.trim()
    if (nome.length < 1) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'De um nome a pasta.' })
    }
    if (input.paiId) {
      const pai = await prisma.portalPasta.findFirst({
        where: { id: input.paiId, clienteId: vinculo.clienteId },
        select: { id: true },
      })
      if (!pai) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta nao encontrada.' })
    }

    const existente = await prisma.portalPasta.findFirst({
      where: { clienteId: vinculo.clienteId, paiId: input.paiId ?? null, nome },
      select: { id: true },
    })
    if (existente) {
      throw new TRPCError({ code: 'CONFLICT', message: `Ja existe uma pasta "${nome}" aqui.` })
    }

    return prisma.portalPasta.create({
      data: {
        clienteId: vinculo.clienteId,
        nome,
        paiId: input.paiId ?? null,
        origem: 'CLIENTE',
        criadaPorId: userId,
      },
      select: { id: true, nome: true },
    })
  }

  /**
   * Apaga uma pasta VAZIA.
   *
   * So vazia, de proposito: o `onDelete: Cascade` do banco levaria as subpastas
   * junto, e o `SetNull` soltaria os arquivos na raiz sem ninguem perceber.
   * Exigir o esvaziamento antes torna a perda impossivel por acidente.
   */
  async excluirPasta(vinculo: VinculoPortal, pastaId: string) {
    if (!atendeNivel(vinculo, 'OPERACIONAL')) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Seu acesso e somente leitura.' })
    }
    const pasta = await prisma.portalPasta.findFirst({
      where: { id: pastaId, clienteId: vinculo.clienteId },
      select: { id: true, _count: { select: { filhas: true, arquivos: true } } },
    })
    if (!pasta) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta nao encontrada.' })
    if (pasta._count.filhas + pasta._count.arquivos > 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A pasta nao esta vazia. Mova ou apague o que esta dentro antes.',
      })
    }
    await prisma.portalPasta.delete({ where: { id: pasta.id } })
    return { ok: true }
  }

  /** Arquivos de uma pasta. `null` = raiz. */
  async listar(vinculo: VinculoPortal, pastaId?: string | null): Promise<ArquivoDoPortal[]> {
    const arquivos = await prisma.clienteArquivo.findMany({
      where: {
        clienteId: vinculo.clienteId,
        visivelParaCliente: true,
        pastaId: pastaId ?? null,
        ...this.filtroDeCategoria(vinculo),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
      select: {
        id: true, fileName: true, fileSize: true, mimeType: true, descricao: true,
        competencia: true, categoria: true, origem: true, createdAt: true, lidoEm: true,
        pastaId: true,
        user: { select: { name: true } },
      },
    })
    return arquivos.map(a => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      descricao: a.descricao,
      competencia: a.competencia,
      categoria: a.categoria,
      origem: a.origem,
      pastaId: a.pastaId,
      criadoEm: a.createdAt,
      lidoEm: a.lidoEm,
      enviadoPor: a.origem === 'CLIENTE' ? (a.user?.name ?? null) : null,
    }))
  }

  /**
   * URL do arquivo, e o recibo de leitura junto.
   *
   * Marcar aqui, e não na listagem, é o que dá sentido ao recibo: aparecer na
   * lista não é ler. Só o primeiro acesso conta — reabrir não reescreve a data,
   * senão "lido em" viraria "aberto pela última vez", que é outra informação.
   */
  async abrir(vinculo: VinculoPortal, arquivoId: string, userId: string) {
    const arquivo = await prisma.clienteArquivo.findFirst({
      // `clienteId` no where, e não um findUnique por id: sem ele, um id
      // adivinhado devolveria arquivo de outro cliente.
      where: { id: arquivoId, clienteId: vinculo.clienteId, visivelParaCliente: true },
      select: { id: true, fileUrl: true, fileName: true, categoria: true, lidoEm: true },
    })
    if (!arquivo || !this.categoriaLiberada(vinculo, arquivo.categoria)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Arquivo não encontrado.' })
    }

    if (!arquivo.lidoEm) {
      await prisma.clienteArquivo.update({
        where: { id: arquivo.id },
        data: { lidoEm: new Date(), lidoPorId: userId },
      })
    }
    return { fileUrl: arquivo.fileUrl, fileName: arquivo.fileName }
  }

  /**
   * O cliente envia um arquivo.
   *
   * O upload em si já aconteceu (`POST /api/upload` devolve a URL); aqui o
   * arquivo é VINCULADO ao cliente. Nível CONSULTA não envia — é o que separa
   * quem só acompanha de quem opera.
   */
  async enviar(
    vinculo: VinculoPortal,
    input: {
      fileName: string
      fileUrl: string
      fileSize?: number | null
      mimeType?: string | null
      competencia?: string | null
      categoria?: string | null
      descricao?: string | null
      solicitacaoId?: string | null
      pastaId?: string | null
    },
    userId: string,
  ) {
    if (!atendeNivel(vinculo, 'OPERACIONAL')) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Seu acesso é somente leitura.' })
    }
    if (input.categoria && !this.categoriaLiberada(vinculo, input.categoria)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem acesso a esta área.' })
    }

    // Pasta de outro cliente nao serve de destino.
    if (input.pastaId) {
      const pasta = await prisma.portalPasta.findFirst({
        where: { id: input.pastaId, clienteId: vinculo.clienteId },
        select: { id: true },
      })
      if (!pasta) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta nao encontrada.' })
    }

    // Solicitação só é aceita se for DESTE cliente e ainda estiver aberta.
    let solicitacaoId: string | null = null
    if (input.solicitacaoId) {
      const s = await prisma.portalSolicitacao.findFirst({
        where: { id: input.solicitacaoId, clienteId: vinculo.clienteId, situacao: 'PENDENTE' },
        select: { id: true },
      })
      if (!s) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Esta solicitação não está mais aberta.' })
      }
      solicitacaoId = s.id
    }

    const arquivo = await prisma.$transaction(async (tx) => {
      const criado = await tx.clienteArquivo.create({
        data: {
          clienteId: vinculo.clienteId,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          fileSize: input.fileSize ?? null,
          mimeType: input.mimeType ?? null,
          descricao: input.descricao ?? null,
          competencia: input.competencia ?? null,
          categoria: input.categoria ?? null,
          origem: 'CLIENTE',
          pastaId: input.pastaId ?? null,
          // O que o cliente envia é visível para ele por definição — foi ele
          // que mandou. O contrário seria ele perder o próprio arquivo de vista.
          visivelParaCliente: true,
          userId,
          solicitacaoId,
        },
        select: { id: true, fileName: true },
      })

      if (solicitacaoId) {
        await tx.portalSolicitacao.update({
          where: { id: solicitacaoId },
          data: { situacao: 'ATENDIDA', atendidaEm: new Date(), atendidaPor: userId },
        })
      }
      return criado
    })

    return arquivo
  }

  /** O que o escritório está esperando deste cliente. */
  async solicitacoesPendentes(vinculo: VinculoPortal) {
    const pendentes = await prisma.portalSolicitacao.findMany({
      where: { clienteId: vinculo.clienteId, situacao: 'PENDENTE' },
      orderBy: [{ prazo: 'asc' }, { criadaEm: 'asc' }],
      select: {
        id: true, titulo: true, descricao: true, prazo: true,
        competencia: true, categoria: true, criadaEm: true,
      },
    })
    // Pendência de área que a pessoa não acessa não é dela — mostrar só geraria
    // uma cobrança que ela não tem como resolver.
    return pendentes.filter(s => this.categoriaLiberada(vinculo, s.categoria))
  }

  // ── Internos ─────────────────────────────────────────────────────────────

  /**
   * Recorte por área, em forma de `where` do Prisma.
   *
   * Categoria sem exigência passa para todos; categoria exigente só entra se o
   * vínculo tiver alguma das áreas que a liberam. Arquivo sem categoria também
   * passa: é o legado, que não foi classificado, e esconder o que o escritório
   * publicou de propósito seria pior do que mostrar.
   */
  private filtroDeCategoria(vinculo: VinculoPortal) {
    const bloqueadas = Object.entries(CATEGORIA_EXIGE_AREA)
      .filter(([, areas]) => !areas.some(a => podeNaArea(vinculo, a)))
      .map(([categoria]) => categoria)
    if (bloqueadas.length === 0) return {}
    return { OR: [{ categoria: null }, { categoria: { notIn: bloqueadas } }] }
  }

  /** Mesma regra do filtro, para uma categoria só. */
  private categoriaLiberada(vinculo: VinculoPortal, categoria: string | null): boolean {
    if (!categoria) return true
    const exigidas = CATEGORIA_EXIGE_AREA[categoria]
    if (!exigidas) return true
    return exigidas.some(a => podeNaArea(vinculo, a))
  }
}
