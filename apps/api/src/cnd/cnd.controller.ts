import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common'
import type { Response } from 'express'
import { CndService } from './cnd.service'

@Controller('api/cnd')
export class CndController {
  constructor(private readonly cndService: CndService) {}

  @Get(':id/pdf')
  async visualizarPdf(@Param('id') id: string, @Res() res: Response) {
    const pdfBase64 = await this.cndService.getPdf(id)
    if (!pdfBase64) throw new NotFoundException('PDF nao disponivel para esta consulta.')

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'inline; filename="cnd.pdf"')
    res.setHeader('Content-Length', pdfBuffer.length)
    res.send(pdfBuffer)
  }

  @Get(':id/download-pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const record = await this.cndService.getById(id)
    const pdfBase64 = await this.cndService.getPdf(id)
    if (!pdfBase64) throw new NotFoundException('PDF nao disponivel para esta consulta.')

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    const filename = `cnd_${record.documento}_${new Date().toISOString().slice(0, 10)}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    res.send(pdfBuffer)
  }
}
