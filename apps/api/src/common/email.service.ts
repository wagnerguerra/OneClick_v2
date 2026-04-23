import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import * as nodemailer from 'nodemailer'

@Injectable()
export class EmailService {
  private async getTransport(): Promise<nodemailer.Transporter | null> {
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE'] } },
    })
    const map = new Map(configs.map(c => [c.key, c.value]))

    const host = map.get('SMTP_HOST') || process.env.SMTP_HOST || ''
    const port = Number(map.get('SMTP_PORT') || process.env.SMTP_PORT || '587')
    const user = map.get('SMTP_USER') || process.env.SMTP_USER || ''
    const pass = map.get('SMTP_PASS') || process.env.SMTP_PASS || ''
    const secure = (map.get('SMTP_SECURE') || process.env.SMTP_SECURE || 'false').toLowerCase() === 'true'

    if (!host) {
      console.warn('[EmailService] SMTP_HOST não configurado, e-mail desabilitado')
      return null
    }

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    })
  }

  async sendMail(opts: { to: string | string[]; subject: string; html: string; from?: string }): Promise<boolean> {
    try {
      const transport = await this.getTransport()
      if (!transport) {
        console.warn('[EmailService] Transporte SMTP não disponível, e-mail não enviado')
        return false
      }

      const fromAddr = opts.from || process.env.SMTP_USER || 'sistema@oneclick.com.br'
      const to = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to

      await transport.sendMail({
        from: fromAddr,
        to,
        subject: opts.subject,
        html: opts.html,
      })

      console.log(`[EmailService] E-mail enviado para ${to}: ${opts.subject}`)
      return true
    } catch (e) {
      console.error('[EmailService] Falha ao enviar e-mail:', (e as Error).message)
      return false
    }
  }
}
