import {
  Body, Controller, Get, Headers, Post, Query, UnauthorizedException,
} from '@nestjs/common'
import { folhaBiUploadSchema } from '@saas/types'
import { FolhaBiService } from './folha-bi.service'

/**
 * Ingestao do BI de Folha. A ETL (Launcher, fora do login do OneClick) faz
 * UPLOAD dos dados ja apurados por competencia. Autenticacao por TOKEN DE
 * SERVICO (env FOLHA_SYNC_TOKEN) — NAO usa Better Auth (a ETL nao e um usuario).
 * Espelha o padrao do `bi-sync` (REST direto, path proprio).
 */
@Controller('api/folha-bi-sync')
export class FolhaBiSyncController {
  constructor(private readonly service: FolhaBiService) {}

  private assertToken(auth?: string) {
    const token = process.env.FOLHA_SYNC_TOKEN
    if (!token) throw new UnauthorizedException('FOLHA_SYNC_TOKEN nao configurado no servidor')
    const provided = (auth ?? '').replace(/^Bearer\s+/i, '')
    if (provided !== token) throw new UnauthorizedException('Token de servico invalido')
  }

  @Post('upload')
  async upload(@Headers('authorization') auth: string, @Body() body: unknown) {
    this.assertToken(auth)
    const data = folhaBiUploadSchema.parse(body)
    const saved = await this.service.upsertCache(data)
    return { ok: true, saved }
  }

  @Get('status')
  async status(@Headers('authorization') auth: string, @Query('clienteId') clienteId: string) {
    this.assertToken(auth)
    return this.service.status(clienteId)
  }
}
