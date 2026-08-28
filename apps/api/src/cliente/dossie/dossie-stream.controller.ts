import { Controller, Param, Post, Query, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { DossieService } from './dossie.service'
import { AuthService } from '../../auth/auth.service'

/**
 * Coleta do dossiê narrada passo a passo.
 *
 * A rota tRPC continua existindo e é a que o agendador usa. Esta aqui existe só
 * para a tela: a coleta encadeia até três provedores de CNPJ e pode levar
 * dezenas de segundos, e um spinner mudo nesse tempo não diz se está
 * trabalhando, se travou ou se o provedor caiu.
 *
 * POST + fetch/ReadableStream (e não EventSource) pelo mesmo motivo do chat de
 * IA do orçamento: EventSource só faz GET e não deixa mandar corpo. Auth pela
 * sessão Better Auth, via cookie same-origin.
 */
@Controller('api/clientes')
export class DossieStreamController {
  constructor(
    private readonly dossie: DossieService,
    private readonly authService: AuthService,
  ) {}

  @Post(':id/dossie/coletar-stream')
  async coletar(
    @Param('id') clienteId: string,
    @Query('forcar') forcar: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const headers = new Headers()
    for (const [chave, valor] of Object.entries(req.headers)) {
      if (valor) headers.set(chave, Array.isArray(valor) ? valor.join(', ') : valor)
    }
    const sessao = await this.authService.auth.api.getSession({ headers })
    if (!sessao?.user) {
      res.status(401).json({ error: 'Não autenticado' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // nginx: desliga o buffer
    res.flushHeaders()

    const enviar = (evento: unknown) => {
      res.write(`data: ${JSON.stringify(evento)}\n\n`)
    }

    try {
      const resultado = await this.dossie.enriquecer(clienteId, {
        forcar: forcar === '1' || forcar === 'true',
        usuarioId: sessao.user.id,
        passo: (p) => enviar({ tipo: 'passo', ...p }),
      })
      enviar({ tipo: 'fim', resultado })
    } catch (e) {
      // O erro vai pelo stream, não pelo status: os cabeçalhos já foram
      // enviados, e um throw aqui fecharia a conexão sem explicação nenhuma.
      enviar({ tipo: 'fim', resultado: { ok: false, motivo: (e as Error).message } })
    } finally {
      res.end()
    }
  }
}
