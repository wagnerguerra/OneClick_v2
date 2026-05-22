import { Injectable } from '@nestjs/common'
import { buffer as readableToBuffer } from 'node:stream/consumers'
import type { Readable } from 'node:stream'
import { prisma } from '@saas/db'
import { gerarPDF } from 'nfe-danfe-pdf'
import { parseNFeXml, XmlInvalidoError, type ParsedNFe } from './danfe.parser'
import { DanfeStorage } from './danfe.storage'

/**
 * Service do módulo DANFE. Recebe XML de NFe autorizada, gera PDF DANFE
 * (leiaute oficial SEFAZ via lib `nfe-danfe-pdf`) e armazena ambos.
 *
 * Reutilizado tanto pelo upload single (1 arquivo) quanto pelo batch
 * (descompacta ZIP e processa cada XML — ver danfe-lote.service.ts).
 */
@Injectable()
export class DanfeService {
  private readonly storage = new DanfeStorage()

  /** Renderiza PDFKit.Document como Buffer (consome todos os chunks do stream).
   *  A lib `nfe-danfe-pdf` v1.0.3 já chama `doc.end()` internamente antes de retornar,
   *  então NÃO chamamos de novo (causaria "stream.push() after EOF"). O readable
   *  fica em paused state com os chunks bufferados; `stream/consumers.buffer()` drena. */
  private async pdfDocToBuffer(doc: unknown): Promise<Buffer> {
    return readableToBuffer(doc as Readable)
  }

  /**
   * Processa UM XML: valida, gera PDF, salva XML+PDF, persiste row.
   * Throw `XmlInvalidoError` se inválido. Throw com `code: 'DUPLICADO'` se já existe.
   */
  async processarXml(
    xmlString: string,
    opts: { uploadedById: string; empresaId?: string | null; loteId?: string | null; clienteId?: string | null },
  ): Promise<{ id: string; chave: string; parsed: ParsedNFe; isNew: boolean }> {
    const parsed = parseNFeXml(xmlString)  // throw XmlInvalidoError

    // Duplicidade: chave é unique. Se já existe, retorna o existente sem regerar.
    const existente = await prisma.danfe.findUnique({ where: { chave: parsed.chave } })
    if (existente) {
      const err = new Error(`NFe ${parsed.chave} já cadastrada (id=${existente.id})`) as any
      err.code = 'DUPLICADO'
      err.danfeId = existente.id
      throw err
    }

    // Salva XML primeiro (mais barato; se falhar não tem PDF órfão)
    const xmlKey = await this.storage.saveXml(parsed.chave, xmlString)

    // Gera PDF via lib (recebe XML string, devolve PDFKit doc)
    let pdfKey: string | null = null
    try {
      const doc = await gerarPDF(xmlString, {
        cancelada: parsed.status === 'CANCELADA',
        textoRodape: 'Gerado por OneClick — DANFE auxiliar conforme leiaute SEFAZ',
      })
      const pdfBuffer = await this.pdfDocToBuffer(doc)
      pdfKey = await this.storage.savePdf(parsed.chave, pdfBuffer)
    } catch (e) {
      // Falha na geração do PDF: ainda persistimos a row (XML salvo), pdfKey null.
      // UI mostra status "PDF pendente" e permite reprocessar.
      console.warn(`[danfe] falha ao gerar PDF da chave ${parsed.chave}:`, (e as Error).message)
    }

    const danfe = await prisma.danfe.create({
      data: {
        chave: parsed.chave,
        modelo: parsed.modelo,
        numero: parsed.numero,
        serie: parsed.serie,
        emitenteCnpj: parsed.emitenteCnpj,
        emitenteRazao: parsed.emitenteRazao,
        destCnpjCpf: parsed.destCnpjCpf,
        destRazao: parsed.destRazao,
        valorTotal: parsed.valorTotal,
        dataEmissao: parsed.dataEmissao,
        dataAutorizacao: parsed.dataAutorizacao,
        status: parsed.status,
        protocolo: parsed.protocolo,
        xmlKey,
        pdfKey,
        empresaId: opts.empresaId ?? null,
        uploadedById: opts.uploadedById,
        loteId: opts.loteId ?? null,
        clienteId: opts.clienteId ?? null,
      },
    })

    return { id: danfe.id, chave: parsed.chave, parsed, isNew: true }
  }

  /** Regera o PDF de um Danfe existente (em caso de erro inicial ou layout atualizado). */
  async regerarPdf(id: string): Promise<{ ok: boolean }> {
    const d = await prisma.danfe.findUnique({ where: { id } })
    if (!d) throw new Error('DANFE não encontrada')

    const xmlString = (await this.storage.readBuffer(d.xmlKey)).toString('utf8')
    const doc = await gerarPDF(xmlString, {
      cancelada: d.status === 'CANCELADA',
      textoRodape: 'Gerado por OneClick — DANFE auxiliar conforme leiaute SEFAZ',
    })
    const pdfBuffer = await this.pdfDocToBuffer(doc)
    const pdfKey = await this.storage.savePdf(d.chave, pdfBuffer)
    await prisma.danfe.update({ where: { id }, data: { pdfKey } })
    return { ok: true }
  }

  // ─────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────

  async list(input: {
    page?: number; limit?: number; search?: string
    emitenteCnpj?: string; destCnpjCpf?: string
    dataInicio?: string; dataFim?: string; status?: string
    loteId?: string; clienteId?: string
  }) {
    const page = input.page ?? 1
    const limit = Math.min(input.limit ?? 30, 100)
    const skip = (page - 1) * limit

    const where: any = {}
    if (input.emitenteCnpj) where.emitenteCnpj = input.emitenteCnpj
    if (input.destCnpjCpf)  where.destCnpjCpf  = input.destCnpjCpf
    if (input.status)       where.status       = input.status
    if (input.loteId)       where.loteId       = input.loteId
    if (input.clienteId)    where.clienteId    = input.clienteId
    if (input.dataInicio || input.dataFim) {
      where.dataEmissao = {}
      if (input.dataInicio) where.dataEmissao.gte = new Date(input.dataInicio)
      if (input.dataFim)    where.dataEmissao.lte = new Date(input.dataFim)
    }
    if (input.search) {
      const s = input.search.trim()
      where.OR = [
        { chave:         { contains: s, mode: 'insensitive' } },
        { emitenteRazao: { contains: s, mode: 'insensitive' } },
        { destRazao:     { contains: s, mode: 'insensitive' } },
        { emitenteCnpj:  { contains: s } },
        { destCnpjCpf:   { contains: s } },
      ]
    }

    const [data, total] = await Promise.all([
      prisma.danfe.findMany({
        where,
        orderBy: { dataEmissao: 'desc' },
        skip, take: limit,
        include: { uploadedBy: { select: { id: true, name: true } } },
      }),
      prisma.danfe.count({ where }),
    ])
    return {
      data, total, page, limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    }
  }

  /** Lista clientes com agregado de DANFEs (total, valor, última emissão).
   *  Inclui uma linha com `clienteId=null` pra DANFEs órfãs (upload manual sem cliente). */
  async listClientesComDanfes() {
    const rows = await prisma.danfe.groupBy({
      by: ['clienteId'],
      _count: { _all: true },
      _sum: { valorTotal: true },
      _max: { dataEmissao: true },
    })
    if (rows.length === 0) return []
    const ids = rows.map(r => r.clienteId).filter((id): id is string => !!id)
    const clientes = ids.length > 0
      ? await prisma.cliente.findMany({
          where: { id: { in: ids } },
          select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true },
        })
      : []
    const map = new Map(clientes.map(c => [c.id, c]))
    return rows
      .map(r => {
        if (r.clienteId === null) {
          // Linha virtual pra notas sem cliente vinculado
          return {
            clienteId: null,
            razaoSocial: 'Sem cliente vinculado',
            nomeFantasia: null,
            documento: '',
            totalDanfes: r._count?._all ?? 0,
            valorTotal: r._sum?.valorTotal ?? null,
            ultimaNota: r._max?.dataEmissao ?? null,
          }
        }
        const c = map.get(r.clienteId)
        if (!c) return null
        return {
          clienteId: c.id,
          razaoSocial: c.razaoSocial,
          nomeFantasia: c.nomeFantasia,
          documento: c.documento,
          totalDanfes: r._count?._all ?? 0,
          valorTotal: r._sum?.valorTotal ?? null,
          ultimaNota: r._max?.dataEmissao ?? null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (b.ultimaNota?.getTime() ?? 0) - (a.ultimaNota?.getTime() ?? 0))
  }

  /** Lista cards de DANFEs de um cliente pra galeria. Inclui só dados necessários
   *  pro card (sem XML/PDF, que ficam em endpoints próprios).
   *  Aceita clienteId='__null__' para listar DANFEs sem cliente vinculado. */
  async listGaleriaPorCliente(input: {
    clienteId: string
    page?: number
    limit?: number
    dataInicio?: string
    dataFim?: string
    status?: string
    competencia?: string  // YYYY-MM
  }) {
    const page = input.page ?? 1
    const limit = Math.min(input.limit ?? 60, 1000)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = input.clienteId === '__null__'
      ? { clienteId: null }
      : { clienteId: input.clienteId }
    if (input.status) where.status = input.status

    // Competência tem prioridade sobre dataInicio/dataFim (filtros equivalentes)
    if (input.competencia) {
      const [y, m] = input.competencia.split('-').map(Number)
      const inicio = new Date(y!, m! - 1, 1)
      const fim = new Date(y!, m!, 1)  // 1º dia do mês seguinte (exclusivo via lt)
      where.dataEmissao = { gte: inicio, lt: fim }
    } else if (input.dataInicio || input.dataFim) {
      const range: Record<string, Date> = {}
      if (input.dataInicio) range.gte = new Date(input.dataInicio)
      if (input.dataFim)    range.lte = new Date(input.dataFim)
      where.dataEmissao = range
    }

    const [rows, total] = await Promise.all([
      prisma.danfe.findMany({
        where,
        orderBy: { dataEmissao: 'desc' },
        skip, take: limit,
        select: {
          id: true, chave: true, numero: true, serie: true,
          emitenteRazao: true, emitenteCnpj: true,
          destRazao: true, destCnpjCpf: true,
          valorTotal: true, dataEmissao: true, status: true,
          pdfKey: true, loteId: true,
          // Identifica a origem da NFe: olha o DriveSyncedFile mais recente
          // associado (fileId revela: nfe-sefaz, local:, ou Drive ID).
          driveSyncedFiles: {
            orderBy: { processadoEm: 'desc' },
            take: 1,
            select: { fileId: true },
          },
        },
      }),
      prisma.danfe.count({ where }),
    ])

    // Determina origem normalizada por nota.
    //   - "lote"        → upload em lote (Danfe.loteId != null)
    //   - "nfe-sefaz"   → API NFeDistribuicaoDFe (fileId começa com "nfe-sefaz:")
    //   - "local"       → pasta local do PC (fileId começa com "local:")
    //   - "drive"       → Google Drive (fileId = Drive file ID natural)
    //   - "manual"      → upload direto sem lote nem DriveSyncedFile
    const data = rows.map((r) => {
      const sync = r.driveSyncedFiles[0]
      let origem: 'lote' | 'nfe-sefaz' | 'local' | 'drive' | 'manual' = 'manual'
      if (sync?.fileId?.startsWith('nfe-sefaz:')) origem = 'nfe-sefaz'
      else if (sync?.fileId?.startsWith('local:')) origem = 'local'
      else if (sync?.fileId) origem = 'drive'
      else if (r.loteId) origem = 'lote'
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { driveSyncedFiles: _ignored, ...rest } = r
      return { ...rest, origem }
    })

    return {
      data, total, page, limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    }
  }

  async getById(id: string) {
    return prisma.danfe.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        lote: { select: { id: true, nome: true } },
      },
    })
  }

  async deleteOne(id: string) {
    const d = await prisma.danfe.findUnique({ where: { id } })
    if (!d) return { ok: false }
    // Hard delete — remove arquivos + row
    if (d.xmlKey) await this.storage.remove(d.xmlKey)
    if (d.pdfKey) await this.storage.remove(d.pdfKey)
    await prisma.danfe.delete({ where: { id } })
    return { ok: true }
  }

  async getStats() {
    const [total, autorizadas, canceladas, mes] = await Promise.all([
      prisma.danfe.count(),
      prisma.danfe.count({ where: { status: 'AUTORIZADA' } }),
      prisma.danfe.count({ where: { status: 'CANCELADA' } }),
      prisma.danfe.count({
        where: { dataEmissao: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      }),
    ])
    return { total, autorizadas, canceladas, mes }
  }

  getStorage() { return this.storage }

  /** Re-export do erro pra usar no controller. */
  static XmlInvalidoError = XmlInvalidoError
}
