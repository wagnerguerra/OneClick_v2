import { Controller, Get, Post, Query, Req, Res, Inject, HttpStatus } from '@nestjs/common'
import type { Request, Response } from 'express'
import { WhatsappCloudService } from './whatsapp-cloud.service'
import { WhatsappService } from './whatsapp.service'

// Webhook público da Meta Cloud API.
//  GET  → verificação (hub.challenge) com o Verify Token.
//  POST → mensagens/status; valida X-Hub-Signature-256 com APP_SECRET.
@Controller('api/whatsapp')
export class WhatsappWebhookController {
  constructor(
    @Inject(WhatsappCloudService) private readonly cloud: WhatsappCloudService,
    @Inject(WhatsappService) private readonly service: WhatsappService,
  ) {}

  @Get('webhook')
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const { verifyToken } = await this.cloud.getCreds()
    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      return res.status(HttpStatus.OK).send(challenge)
    }
    return res.status(HttpStatus.FORBIDDEN).send('forbidden')
  }

  @Post('webhook')
  async receber(@Req() req: Request & { rawBody?: Buffer }, @Res() res: Response) {
    const signature = req.headers['x-hub-signature-256'] as string | undefined
    const raw = req.rawBody
    if (raw && !(await this.cloud.verificarAssinatura(raw, signature))) {
      return res.status(HttpStatus.UNAUTHORIZED).send('invalid signature')
    }
    // Responde 200 rápido (a Meta re-tenta se demorar) e processa em background.
    res.status(HttpStatus.OK).send('ok')
    this.service.processInbound(req.body).catch(() => {})
  }
}
