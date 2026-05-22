import { Controller, Post, Get, Param, Req, Res, UploadedFile, UploadedFiles, UseInterceptors, Inject, Sse, BadRequestException, HttpStatus } from '@nestjs/common'
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express'
import { Observable, filter, map } from 'rxjs'
import type { Request, Response } from 'express'
import { prisma } from '@saas/db'
import { DanfeService } from './danfe.service'
import { DanfeLoteService } from './danfe-lote.service'
import { DanfeLoteEventsService } from './danfe-lote-events.service'
import { XmlInvalidoError } from './danfe.parser'
import { AuthService } from '../auth/auth.service'

/**
 * Controller HTTP do módulo DANFE.
 * - POST /api/danfe/upload  — 1 XML, processamento síncrono
 * - POST /api/danfe/batch   — N XMLs ou .zip, processamento async (retorna 202 com loteId)
 * - GET  /api/danfe/:id/pdf — stream do PDF
 * - GET  /api/danfe/:id/xml — stream do XML original
 * - GET  /api/danfe/lote/:id/zip — stream de ZIP com todos os PDFs do lote
 * - GET  /api/danfe/lote/events?loteId=X — SSE de progresso do lote
 *
 * Auth: endpoints REST rodam fora do middleware tRPC, então leio a sessão
 * direto via better-auth (mesmo padrão do trpc.controller.ts createContext).
 */
@Controller('api/danfe')
export class DanfeController {
  constructor(
    @Inject(DanfeService) private readonly svc: DanfeService,
    @Inject(DanfeLoteService) private readonly loteSvc: DanfeLoteService,
    @Inject(DanfeLoteEventsService) private readonly events: DanfeLoteEventsService,
    private readonly authService: AuthService,
  ) {}

  /** Resolve a sessão direto do cookie via better-auth. Retorna { userId, empresaId }
   *  ou throw 401 se não houver sessão válida. */
  private async resolveSession(req: Request): Promise<{ userId: string; empresaId: string | null }> {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    try {
      const session = await this.authService.auth.api.getSession({ headers })
      if (!session?.user?.id) {
        throw new BadRequestException('Sessão inválida — faça login.')
      }
      const u = session.user as Record<string, unknown>
      return {
        userId: session.user.id,
        empresaId: (u.empresaId as string | undefined) ?? null,
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e
      throw new BadRequestException('Sessão inválida — faça login.')
    }
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))  // 10MB max por XML
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request) {
    if (!file) throw new BadRequestException('Arquivo ausente.')
    const { userId, empresaId } = await this.resolveSession(req)
    const xmlString = file.buffer.toString('utf8')
    try {
      const r = await this.svc.processarXml(xmlString, {
        uploadedById: userId,
        empresaId,
      })
      return { ok: true, id: r.id, chave: r.chave }
    } catch (e: any) {
      if (e.code === 'DUPLICADO') {
        return { ok: false, code: 'DUPLICADO', message: e.message, danfeId: e.danfeId }
      }
      if (e instanceof XmlInvalidoError) {
        throw new BadRequestException(e.message)
      }
      throw e
    }
  }

  @Post('batch')
  @UseInterceptors(FilesInterceptor('files', 50, { limits: { fileSize: 100 * 1024 * 1024 } }))  // 100MB max por arquivo (ZIP grande), até 50 arquivos
  async batch(@UploadedFiles() files: Express.Multer.File[] | undefined, @Req() req: Request, @Res() res: Response) {
    if (!files?.length) throw new BadRequestException('Nenhum arquivo enviado.')
    const { userId, empresaId } = await this.resolveSession(req)
    const arquivos = files.map(f => ({ buffer: f.buffer, nome: f.originalname }))
    try {
      const r = await this.loteSvc.iniciar(arquivos, {
        uploadedById: userId,
        empresaId,
      })
      res.status(HttpStatus.ACCEPTED).json({ ok: true, loteId: r.loteId, totalXmls: r.totalXmls })
    } catch (e: any) {
      throw new BadRequestException(e.message ?? 'Falha ao iniciar lote')
    }
  }


  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const d = await this.svc.getById(id)
    if (!d) { res.status(404).send('DANFE não encontrada'); return }
    if (!d.pdfKey) {
      // Tenta gerar on-demand a partir do XML
      try { await this.svc.regerarPdf(id) } catch { res.status(500).send('PDF indisponível'); return }
      const reload = await this.svc.getById(id)
      if (!reload?.pdfKey) { res.status(500).send('PDF indisponível'); return }
      d.pdfKey = reload.pdfKey
    }
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${d.chave}.pdf"`)
    this.svc.getStorage().readStream(d.pdfKey).pipe(res)
  }

  @Get(':id/xml')
  async xml(@Param('id') id: string, @Res() res: Response) {
    const d = await this.svc.getById(id)
    if (!d) { res.status(404).send('DANFE não encontrada'); return }

    // Prioriza o nome ORIGINAL do arquivo (vindo do Drive/Pasta/Lote) se houver.
    // Fallback: chave de acesso, que é o nome canônico da NFe na SEFAZ.
    const synced = await prisma.driveSyncedFile.findFirst({
      where: { danfeId: d.id, fileName: { not: null } },
      orderBy: { processadoEm: 'desc' },
      select: { fileName: true },
    })
    const fileNameRaw = synced?.fileName ?? `${d.chave}.xml`
    // Sanitiza pra evitar quebra do header HTTP (CR/LF/quote) e força extensão .xml
    const safeName = fileNameRaw
      .replace(/[\r\n"\\]/g, '_')
      .replace(/\.(xml)?$/i, '') + '.xml'

    res.setHeader('Content-Type', 'application/xml')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`)
    this.svc.getStorage().readStream(d.xmlKey).pipe(res)
  }

  @Get('lote/:id/zip')
  async loteZip(@Param('id') id: string, @Res() res: Response) {
    const { stream, fileName } = await this.loteSvc.streamZipPdfs(id)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    stream.pipe(res)
  }

  /** SSE: stream de eventos do lote (progress, item, done). Filtra por loteId via query. */
  @Sse('lote/events')
  loteEvents(@Req() req: Request): Observable<MessageEvent> {
    const loteId = (req.query.loteId as string | undefined) ?? null
    return this.events.events$.pipe(
      filter(ev => !loteId || ev.loteId === loteId),
      map(ev => ({ data: JSON.stringify(ev) }) as MessageEvent),
    )
  }
}
