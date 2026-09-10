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
 * A organização é por COMPETÊNCIA, não por tipo: contabilidade se organiza por
 * mês, e "cadê a guia de agosto?" é como a pessoa procura. Ano → mês →
 * categoria sai de graça dos campos, sem tabela de pastas para manter.
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
  criadoEm: Date
  lidoEm: Date | null
  /** Nome de quem enviou, quando foi o cliente. */
  enviadoPor: string | null
}

@Injectable()
export class PortalArquivosService {
  /**
   * As competências que têm algo para este cliente — a árvore de pastas.
   *
   * Sai de `groupBy` em vez de uma tabela de pastas porque a pasta é o próprio
   * dado: mês sem arquivo não é pasta vazia, é mês que não existe na tela.
   */
  async competencias(vinculo: VinculoPortal) {
    const linhas = await prisma.clienteArquivo.groupBy({
      by: ['competencia'],
      where: {
        clienteId: vinculo.clienteId,
        visivelParaCliente: true,
        competencia: { not: null },
        ...this.filtroDeCategoria(vinculo),
      },
      _count: { _all: true },
      orderBy: { competencia: 'desc' },
    })
    return linhas
      .filter(l => l.competencia)
      .map(l => ({ competencia: l.competencia as string, arquivos: l._count._all }))
  }

  /** Arquivos de uma competência (ou os mais recentes, quando não vem uma). */
  async listar(vinculo: VinculoPortal, competencia?: string): Promise<ArquivoDoPortal[]> {
    const arquivos = await prisma.clienteArquivo.findMany({
      where: {
        clienteId: vinculo.clienteId,
        visivelParaCliente: true,
        ...(competencia ? { competencia } : {}),
        ...this.filtroDeCategoria(vinculo),
      },
      orderBy: [{ competencia: 'desc' }, { createdAt: 'desc' }],
      take: competencia ? 500 : 40,
      select: {
        id: true, fileName: true, fileSize: true, mimeType: true, descricao: true,
        competencia: true, categoria: true, origem: true, createdAt: true, lidoEm: true,
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
    },
    userId: string,
  ) {
    if (!atendeNivel(vinculo, 'OPERACIONAL')) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Seu acesso é somente leitura.' })
    }
    if (input.categoria && !this.categoriaLiberada(vinculo, input.categoria)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem acesso a esta área.' })
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
