import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import * as nodemailer from 'nodemailer'
import { Resend } from 'resend'

/**
 * Service de e-mail com dois providers:
 *   - Resend (preferido) — quando RESEND_API_KEY está configurado (env ou SystemConfig)
 *   - SMTP via Nodemailer — fallback
 *
 * Reply-To é definido com o endereço inbound do HelpDesk pra permitir que o
 * solicitante responda direto do cliente de e-mail e o webhook crie uma
 * mensagem no ticket original (Fase 8 — Resend Inbound).
 */
@Injectable()
export class EmailService {
  private resendClient: Resend | null = null
  private resendKey: string | null = null

  private async getResend(): Promise<Resend | null> {
    // Tenta carregar de SystemConfig + env
    let key = process.env.RESEND_API_KEY || ''
    try {
      const cfg = await prisma.systemConfig.findUnique({ where: { key: 'RESEND_API_KEY' } })
      if (cfg?.value) key = cfg.value
    } catch { /* sem table ainda */ }
    if (!key) return null
    if (key !== this.resendKey) {
      this.resendClient = new Resend(key)
      this.resendKey = key
    }
    return this.resendClient
  }

  private async getSmtpTransport(): Promise<nodemailer.Transporter | null> {
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE'] } },
    })
    const map = new Map(configs.map(c => [c.key, c.value]))

    const host = map.get('SMTP_HOST') || process.env.SMTP_HOST || ''
    const port = Number(map.get('SMTP_PORT') || process.env.SMTP_PORT || '587')
    const user = map.get('SMTP_USER') || process.env.SMTP_USER || ''
    const pass = map.get('SMTP_PASS') || process.env.SMTP_PASS || ''
    const secure = (map.get('SMTP_SECURE') || process.env.SMTP_SECURE || 'false').toLowerCase() === 'true'

    if (!host) return null

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    })
  }

  private async resolveFrom(opts: { from?: string }): Promise<string> {
    if (opts.from) return opts.from
    let configFrom = ''
    try {
      const fromConfig = await prisma.systemConfig.findUnique({ where: { key: 'SMTP_FROM' } })
      configFrom = fromConfig?.value ?? ''
    } catch { /* silencioso */ }
    return configFrom || process.env.SMTP_FROM || process.env.SMTP_USER || 'sistema@oneclick.com.br'
  }

  async sendMail(opts: {
    to: string | string[]
    subject: string
    html: string
    from?: string
    replyTo?: string
    /** `cid` (Content-ID) marca o anexo como inline — embute no corpo via
     *  `<img src="cid:<id>">`. Útil pra imagens do corpo do e-mail. */
    attachments?: Array<{ filename: string; content: Buffer | string; encoding?: string; cid?: string }>
  }): Promise<boolean> {
    const fromAddr = await this.resolveFrom({ from: opts.from })
    const to = Array.isArray(opts.to) ? opts.to : [opts.to]

    // 1. Tenta Resend
    const resend = await this.getResend()
    if (resend) {
      try {
        const res = await resend.emails.send({
          from: fromAddr,
          to,
          subject: opts.subject,
          html: opts.html,
          replyTo: opts.replyTo,
          attachments: opts.attachments?.map(a => ({
            filename: a.filename,
            content: typeof a.content === 'string' ? a.content : a.content.toString('base64'),
            // Resend usa content_id (snake_case) — quando setado, attachment vira inline.
            ...(a.cid ? { content_id: a.cid } : {}),
          })),
        })
        if (res.error) throw new Error(res.error.message)
        console.log(`[EmailService/Resend] OK ${opts.subject} → ${to.join(', ')}`)
        return true
      } catch (e) {
        console.warn('[EmailService/Resend] Falhou, caindo pra SMTP:', (e as Error).message)
        // continua pro SMTP
      }
    }

    // 2. Fallback SMTP
    try {
      const transport = await this.getSmtpTransport()
      if (!transport) {
        console.warn('[EmailService] Nenhum provider disponível (Resend e SMTP não configurados)')
        return false
      }
      await transport.sendMail({
        from: fromAddr,
        to: to.join(', '),
        subject: opts.subject,
        html: opts.html,
        replyTo: opts.replyTo,
        // Nodemailer usa `cid` direto — quando setado, attachment vira inline
        // (Content-Disposition: inline). `<img src="cid:<id>">` no HTML resolve.
        attachments: opts.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          ...(a.cid ? { cid: a.cid } : {}),
        })),
      })
      console.log(`[EmailService/SMTP] OK ${opts.subject} → ${to.join(', ')}`)
      return true
    } catch (e) {
      console.error('[EmailService] Falha total:', (e as Error).message)
      return false
    }
  }
}
