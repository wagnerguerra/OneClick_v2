import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import AdmZip from 'adm-zip'
import archiver from 'archiver'
import { PassThrough, type Readable } from 'stream'
import { DanfeService } from './danfe.service'
import { DanfeLoteEventsService } from './danfe-lote-events.service'

const MAX_XMLS_POR_LOTE = 500

/**
 * Processa upload em lote: aceita N arquivos XML OU 1 ZIP contendo XMLs.
 * Cria um `DanfeLote`, dispara processamento async em background, e emite
 * eventos SSE pra UI acompanhar progresso em tempo real.
 */
@Injectable()
export class DanfeLoteService {
  constructor(
    @Inject(DanfeService) private readonly danfeSvc: DanfeService,
    @Inject(DanfeLoteEventsService) private readonly events: DanfeLoteEventsService,
  ) {}

  /**
   * Extrai todos os XMLs de uma lista de arquivos:
   *  - Se vier `.zip`: descompacta em memória, pega todo `.xml`
   *  - Se vier `.xml`: passa direto
   *  - Outros formatos: ignora
   */
  private extrairXmls(arquivos: Array<{ buffer: Buffer; nome: string }>): Array<{ nome: string; conteudo: string }> {
    const xmls: Array<{ nome: string; conteudo: string }> = []
    for (const f of arquivos) {
      const lower = f.nome.toLowerCase()
      if (lower.endsWith('.zip')) {
        try {
          const zip = new AdmZip(f.buffer)
          for (const e of zip.getEntries()) {
            if (e.isDirectory) continue
            if (!e.entryName.toLowerCase().endsWith('.xml')) continue
            xmls.push({ nome: e.entryName, conteudo: e.getData().toString('utf8') })
          }
        } catch (e) {
          console.warn(`[danfe-lote] ZIP "${f.nome}" não pôde ser lido:`, (e as Error).message)
        }
      } else if (lower.endsWith('.xml')) {
        xmls.push({ nome: f.nome, conteudo: f.buffer.toString('utf8') })
      }
    }
    return xmls
  }

  /**
   * Cria o lote (status PROCESSANDO) e dispara o processamento async.
   * Retorna IMEDIATAMENTE com loteId — não bloqueia o request.
   */
  async iniciar(
    arquivos: Array<{ buffer: Buffer; nome: string }>,
    opts: { uploadedById: string; empresaId?: string | null; nomeLote?: string },
  ): Promise<{ loteId: string; totalXmls: number }> {
    const xmls = this.extrairXmls(arquivos)
    if (xmls.length === 0) {
      throw new Error('Nenhum XML válido encontrado nos arquivos enviados.')
    }
    if (xmls.length > MAX_XMLS_POR_LOTE) {
      throw new Error(`Limite de ${MAX_XMLS_POR_LOTE} XMLs por lote excedido (${xmls.length} recebidos).`)
    }

    const nome = opts.nomeLote
      || (arquivos.length === 1 ? arquivos[0]!.nome : `Lote de ${xmls.length} XMLs`)

    const lote = await prisma.danfeLote.create({
      data: {
        nome,
        totalXmls: xmls.length,
        uploadedById: opts.uploadedById,
        empresaId: opts.empresaId ?? null,
      },
    })

    // Processa em background, sem bloquear o controller
    void this.processarBackground(lote.id, xmls, opts)

    return { loteId: lote.id, totalXmls: xmls.length }
  }

  private async processarBackground(
    loteId: string,
    xmls: Array<{ nome: string; conteudo: string }>,
    opts: { uploadedById: string; empresaId?: string | null },
  ) {
    let sucesso = 0
    let erros = 0
    let processados = 0

    for (const xml of xmls) {
      let itemStatus: 'OK' | 'DUPLICADO' | 'INVALIDO' | 'ERRO_PDF' = 'OK'
      let chave: string | null = null
      let mensagem: string | null = null
      let danfeId: string | null = null

      try {
        const r = await this.danfeSvc.processarXml(xml.conteudo, {
          uploadedById: opts.uploadedById,
          empresaId: opts.empresaId,
          loteId,
        })
        chave = r.chave
        danfeId = r.id
        sucesso++
      } catch (e: any) {
        if (e.code === 'DUPLICADO') {
          itemStatus = 'DUPLICADO'
          chave = (e.message?.match(/\d{44}/) ?? [null])[0]
          danfeId = e.danfeId ?? null
          mensagem = 'NFe já cadastrada anteriormente'
        } else if (e.name === 'XmlInvalidoError') {
          itemStatus = 'INVALIDO'
          mensagem = e.message
          erros++
        } else {
          itemStatus = 'ERRO_PDF'
          mensagem = e.message?.slice(0, 500) ?? 'Erro desconhecido'
          erros++
        }
      }

      await prisma.danfeLoteItem.create({
        data: { loteId, fileName: xml.nome, chave, status: itemStatus, mensagem, danfeId },
      })

      processados++
      await prisma.danfeLote.update({
        where: { id: loteId },
        data: { processados, sucesso, erros },
      })

      this.events.emit({
        loteId, type: 'item',
        processados, totalXmls: xmls.length, sucesso, erros,
        itemStatus, fileName: xml.nome, chave: chave ?? undefined,
        mensagem: mensagem ?? undefined,
      })
    }

    await prisma.danfeLote.update({
      where: { id: loteId },
      data: { status: 'CONCLUIDO', concluidoEm: new Date() },
    })
    this.events.emit({ loteId, type: 'done', processados, sucesso, erros, totalXmls: xmls.length })
  }

  // ─────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────

  async list(input: { page?: number; limit?: number }) {
    const page = input.page ?? 1
    const limit = Math.min(input.limit ?? 30, 100)
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      prisma.danfeLote.findMany({
        orderBy: { iniciadoEm: 'desc' },
        skip, take: limit,
        include: { uploadedBy: { select: { id: true, name: true } } },
      }),
      prisma.danfeLote.count(),
    ])
    return {
      data, total, page, limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    }
  }

  async getById(id: string) {
    return prisma.danfeLote.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        itens: {
          orderBy: { createdAt: 'asc' },
          include: { danfe: { select: { id: true, numero: true, emitenteRazao: true } } },
        },
      },
    })
  }

  /** Reprocessa apenas itens com erro (INVALIDO ou ERRO_PDF). Não retoca DUPLICADO.
   *  `_opts` mantido na assinatura pra preservar API contrato (ctx.userId/empresaId
   *  pode ser usado no futuro pra reprocessar criando novas rows). */
  async reprocessarErros(loteId: string, _opts: { uploadedById: string; empresaId?: string | null }) {
    const itensComErro = await prisma.danfeLoteItem.findMany({
      where: { loteId, status: { in: ['INVALIDO', 'ERRO_PDF'] } },
    })
    let regenerados = 0
    for (const item of itensComErro) {
      try {
        // Sem XML não dá pra reprocessar — INVALIDOs em geral nem tinham XML útil
        const danfeId = item.danfeId
        if (!danfeId) continue
        await this.danfeSvc.regerarPdf(danfeId)
        await prisma.danfeLoteItem.update({
          where: { id: item.id },
          data: { status: 'OK', mensagem: 'Reprocessado com sucesso' },
        })
        regenerados++
      } catch { /* permanece com erro */ }
    }
    return { regenerados, totalComErro: itensComErro.length }
  }

  /** Stream de ZIP com todos os PDFs OK de um lote, pra download. */
  async streamZipPdfs(loteId: string): Promise<{ stream: Readable; fileName: string }> {
    const itens = await prisma.danfeLoteItem.findMany({
      where: { loteId, status: { in: ['OK', 'DUPLICADO'] }, danfeId: { not: null } },
      include: { danfe: { select: { chave: true, pdfKey: true, numero: true } } },
    })
    const lote = await prisma.danfeLote.findUnique({ where: { id: loteId }, select: { nome: true } })

    const archive = archiver('zip', { zlib: { level: 6 } })
    const pass = new PassThrough()
    archive.pipe(pass)

    const storage = this.danfeSvc.getStorage()
    for (const item of itens) {
      if (!item.danfe?.pdfKey) continue
      try {
        const stream = storage.readStream(item.danfe.pdfKey)
        archive.append(stream, { name: `${item.danfe.chave}.pdf` })
      } catch { /* arquivo sumiu — pula */ }
    }
    void archive.finalize()

    const safeName = (lote?.nome ?? 'lote').replace(/[^a-z0-9._-]/gi, '_')
    return { stream: pass, fileName: `danfes-${safeName}.zip` }
  }

  async cancel(loteId: string) {
    // Marca como CANCELADO — não interrompe processamento já em curso
    // (next iteration verá o status e poderia parar; pra MVP basta marcar)
    await prisma.danfeLote.update({
      where: { id: loteId },
      data: { status: 'CANCELADO', concluidoEm: new Date() },
    })
    this.events.emit({ loteId, type: 'done' })
    return { ok: true }
  }
}
