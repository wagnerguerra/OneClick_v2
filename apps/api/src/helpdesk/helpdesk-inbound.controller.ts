import { Controller, Post, Body, Headers, HttpStatus, HttpException } from '@nestjs/common'
import { HelpdeskService } from './helpdesk.service'
import { OrcamentoService } from '../orcamento/orcamento.service'

/**
 * Webhook público para Resend Inbound — recebe e-mails encaminhados para
 * o endereço inbound configurado em /configuracoes → Helpdesk e converte
 * em tickets (ou mensagens, se assunto contém #HLP1234).
 *
 * Configurar no Resend Dashboard:
 *   - Adicionar domínio (DNS MX records apontando pro Resend)
 *   - Criar Inbound Address (suporte@dominio.com)
 *   - Webhook URL: https://app.oneclick.com.br/api/helpdesk/inbound
 *   - Webhook Secret: salvar em RESEND_INBOUND_SECRET (env ou SystemConfig)
 *
 * O payload do Resend Inbound segue formato:
 *   { from, from_name, to, subject, html, text, attachments[] }
 */

interface ResendInboundPayload {
  from?: string
  from_name?: string
  to?: string[]
  subject?: string
  html?: string
  text?: string
  attachments?: Array<{ filename: string; content: string; content_type?: string }>
}

@Controller('api/helpdesk')
export class HelpdeskInboundController {
  constructor(
    private readonly helpdeskService: HelpdeskService,
    private readonly orcamentoService: OrcamentoService,
  ) {}

  /** Texto plano → HTML simples, cortando a parte citada da resposta. */
  private limparResposta(texto: string): string {
    const cortes = [
      /^\s*Em .+ escreveu:\s*$/im,           // gmail pt
      /^\s*On .+ wrote:\s*$/im,               // gmail en
      /^_{5,}\s*$/m,                          // outlook separator
      /^\s*De:\s.+$/im,                       // outlook pt (De: ...)
      /^-{2,}\s*Mensagem original\s*-{2,}/im,
    ]
    let corpo = texto
    for (const re of cortes) {
      const m = corpo.match(re)
      if (m && m.index != null) corpo = corpo.slice(0, m.index)
    }
    // Remove linhas citadas (> ...) do fim
    corpo = corpo.split('\n').filter(l => !/^\s*>/.test(l)).join('\n').trim()
    const esc = corpo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return esc.replace(/\n/g, '<br>') || '(sem conteúdo)'
  }

  @Post('inbound')
  async handleInbound(
    @Body() body: ResendInboundPayload,
    @Headers('x-resend-secret') secretHeader: string | undefined,
  ) {
    // Verificação opcional de secret — se RESEND_INBOUND_SECRET está
    // configurado, exige o header bater. Senão (desenvolvimento), aceita
    // qualquer chamada — controlado pelo firewall/Cloudflare em produção.
    const expectedSecret = process.env.RESEND_INBOUND_SECRET
    if (expectedSecret && secretHeader !== expectedSecret) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    }

    if (!body || !body.from || !body.subject) {
      throw new HttpException('Payload inválido', HttpStatus.BAD_REQUEST)
    }

    // Resposta de e-mail de ORÇAMENTO (marcador #ORCNNNN no assunto) — encaminha
    // pro módulo de orçamentos em vez de virar ticket de helpdesk.
    const orcMatch = body.subject.match(/#ORC0*(\d+)/i)
    if (orcMatch) {
      try {
        const numero = parseInt(orcMatch[1]!, 10)
        const corpo = body.text ? this.limparResposta(body.text) : (body.html || '(sem conteúdo)')
        const r = await this.orcamentoService.registrarRespostaCliente(numero, { email: body.from!, nome: body.from_name ?? null }, corpo)
        console.log(`[Inbound→Orçamento] #ORC${numero} orcamentoId=${r.orcamentoId}`)
        return { ok: true, tipo: 'orcamento', ...r }
      } catch (e) {
        console.error('[Inbound→Orçamento] Erro:', (e as Error).message)
        throw new HttpException((e as Error).message, HttpStatus.INTERNAL_SERVER_ERROR)
      }
    }

    try {
      const r = await this.helpdeskService.processarInbound({
        from: body.from,
        fromName: body.from_name ?? null,
        subject: body.subject,
        html: body.html ?? null,
        text: body.text ?? null,
        attachments: body.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.content_type ?? null,
        })),
      })
      console.log(`[HelpdeskInbound] ${r.type} ticketId=${r.ticketId}`)
      return { ok: true, ...r }
    } catch (e) {
      console.error('[HelpdeskInbound] Erro:', (e as Error).message)
      throw new HttpException((e as Error).message, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}
