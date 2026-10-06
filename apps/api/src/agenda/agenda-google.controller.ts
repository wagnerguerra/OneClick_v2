import { Controller, Get, Inject, Logger, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { AgendaGoogleService } from './agenda-google.service'

/**
 * Retorno do consentimento do Google (GOOGLE_CALENDAR_REDIRECT_URI de produção
 * = /api/google-calendar/callback). O Google redireciona o NAVEGADOR para cá;
 * a conta é ligada ao usuário do `state` ASSINADO (ver assinarState) e a pessoa
 * volta para a Agenda com o resultado na URL.
 */
@Controller('api/google-calendar')
export class AgendaGoogleController {
  private readonly logger = new Logger('AgendaGoogle')

  constructor(@Inject(AgendaGoogleService) private readonly google: AgendaGoogleService) {}

  private voltar(res: Response, resultado: 'conectado' | 'erro', motivo?: string) {
    const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || '').replace(/\/+$/, '')
    const q = new URLSearchParams({ google: resultado, ...(motivo ? { motivo } : {}) })
    res.redirect(302, `${base}/agenda?${q.toString()}`)
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') erro: string | undefined,
    @Res() res: Response,
  ) {
    if (erro) return this.voltar(res, 'erro', erro === 'access_denied' ? 'Acesso não autorizado no Google.' : 'O Google recusou a conexão.')
    const userId = this.google.verificarState(state)
    if (!userId || !code) return this.voltar(res, 'erro', 'Link de conexão inválido ou expirado. Tente conectar de novo.')
    try {
      await this.google.handleCallback(code, userId)
      return this.voltar(res, 'conectado')
    } catch (e) {
      this.logger.warn(`Callback do Google falhou (usuário ${userId}): ${(e as Error).message}`)
      return this.voltar(res, 'erro', 'Não foi possível concluir a conexão com o Google.')
    }
  }
}
