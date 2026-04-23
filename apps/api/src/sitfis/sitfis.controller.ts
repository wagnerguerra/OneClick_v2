import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common'
import type { Response } from 'express'
import { SitfisService } from './sitfis.service'

@Controller('api/sitfis')
export class SitfisController {
  constructor(private readonly sitfisService: SitfisService) {}

  /**
   * GET /api/sitfis/:id/pdf — Visualizar PDF inline no navegador
   */
  @Get(':id/pdf')
  async visualizarPdf(@Param('id') id: string, @Res() res: Response) {
    const pdfBase64 = await this.sitfisService.getPdf(id)
    if (!pdfBase64) {
      throw new NotFoundException('PDF não disponível para esta consulta.')
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'inline; filename="situacao-fiscal.pdf"')
    res.setHeader('Content-Length', pdfBuffer.length)
    res.send(pdfBuffer)
  }

  /**
   * GET /api/sitfis/:id/download-pdf — Download do PDF como attachment
   */
  @Get(':id/download-pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const record = await this.sitfisService.getById(id)
    const pdfBase64 = await this.sitfisService.getPdf(id)
    if (!pdfBase64) {
      throw new NotFoundException('PDF não disponível para esta consulta.')
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    const filename = `sitfis_${record.documento}_${new Date().toISOString().slice(0, 10)}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    res.send(pdfBuffer)
  }
}
