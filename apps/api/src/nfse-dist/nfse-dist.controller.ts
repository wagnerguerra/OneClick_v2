import { Controller, Get, Param, Res } from '@nestjs/common'
import type { Response } from 'express'
import { prisma } from '@saas/db'
import { DanfeStorage } from '../danfe/danfe.storage'

/**
 * Endpoints REST de NFS-e — equivalente do DanfeController.
 * Stream de XML e PDF pelo S3 (DanfeStorage compartilhado entre os 2 modules).
 */
@Controller('api/nfse')
export class NfseDistController {
  private readonly storage = new DanfeStorage()

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const nota = await prisma.notaServicoImportada.findUnique({ where: { id } })
    if (!nota) { res.status(404).send('NFS-e não encontrada'); return }
    if (!nota.pdfKey) {
      res.status(404).send('PDF não disponível (não foi gerado ou ainda está em processamento)')
      return
    }
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="nfse-${nota.numero}.pdf"`)
    this.storage.readStream(nota.pdfKey).pipe(res)
  }

  @Get(':id/xml')
  async xml(@Param('id') id: string, @Res() res: Response) {
    const nota = await prisma.notaServicoImportada.findUnique({ where: { id } })
    if (!nota) { res.status(404).send('NFS-e não encontrada'); return }
    // Padrão nacional: o nome canônico do XML é a chave de acesso (50 dígitos).
    // Fallback: "nfse-{numero}.xml" pra notas sem chave.
    const baseName = nota.chave ? nota.chave : `nfse-${nota.numero}`
    const safeName = baseName.replace(/[\r\n"\\]/g, '_').replace(/\.(xml)?$/i, '') + '.xml'
    res.setHeader('Content-Type', 'application/xml')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`)
    this.storage.readStream(nota.xmlKey).pipe(res)
  }
}
