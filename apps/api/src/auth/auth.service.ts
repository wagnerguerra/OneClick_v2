import { Injectable } from '@nestjs/common'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { twoFactor, bearer } from 'better-auth/plugins'
import { expo } from '@better-auth/expo'
import { prisma } from '@saas/db'
import { EmailService } from '../common/email.service'

@Injectable()
export class AuthService {
  // Tipo inferido do betterAuth() — não declarar explicitamente porque o tipo
  // genérico bate com a config específica passada, não com BetterAuthOptions base.
  public readonly auth!: ReturnType<typeof betterAuth>

  constructor(private readonly emailService: EmailService) {
    ;(this as any).auth = betterAuth({
      baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:4000',
      basePath: '/api/auth',
      database: prismaAdapter(prisma, {
        provider: 'postgresql',
      }),
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        // Token de reset: 30 minutos. Better Auth gera token criptograficamente
        // seguro (crypto.randomBytes), persiste em tabela Verification, e invalida
        // após o primeiro uso (single-use).
        resetPasswordTokenExpiresIn: 30 * 60,
        sendResetPassword: async ({ user, url }) => {
          const safeName = user.name?.trim() || user.email.split('@')[0] || 'usuário'
          const fromAddr = this.resolveResetFrom()
          const subject = 'Redefinição de senha'
          const html = this.buildResetPasswordHtml({ name: safeName, url })
          const ok = await this.emailService.sendMail({
            to: user.email,
            subject,
            html,
            from: fromAddr,
          })
          if (!ok) {
            // Não vaza pro frontend (Better Auth sempre devolve 200 pra não
            // revelar existência do email), mas registra pra debug.
            console.error(`[Auth/ResetPassword] Falha ao enviar email para ${user.email}`)
          }
        },
      },
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID ?? '',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        },
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 dias
        updateAge: 60 * 60 * 24, // atualiza a cada 24h
        cookieCache: {
          enabled: false, // Desabilita cache server-side da session — evita stale data apos verifyTotp
        },
      },
      trustedOrigins: (request) => {
        const origins = [
          process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          // App mobile (deep-link scheme) — fluxo Better Auth Expo
          'oneclick://',
        ]
        if (process.env.TRUSTED_ORIGINS) {
          origins.push(...process.env.TRUSTED_ORIGINS.split(','))
        }
        const origin = request?.headers?.get('origin')
        if (origin && (origin.includes('192.168.') || origin.includes('10.') || origin.includes('172.'))) {
          origins.push(origin)
        }
        return origins
      },
      user: {
        additionalFields: {
          role: {
            type: 'string',
            defaultValue: 'COLABORADOR_INTERNO',
            input: false,
          },
          isMaster: {
            type: 'boolean',
            defaultValue: false,
            input: false,
          },
          isEmpresaMaster: {
            type: 'boolean',
            defaultValue: false,
            input: false,
          },
          tenantId: {
            type: 'string',
            required: false,
            input: false,
          },
          empresaId: {
            type: 'string',
            required: false,
            input: false,
          },
        },
      },
      plugins: [
        twoFactor({
          issuer: 'OneClick SaaS',
        }),
        // Suporte ao app mobile (Expo): expo() trata o scheme oneclick:// e o
        // fluxo de cookie em SecureStore; bearer() habilita Authorization:
        // Bearer como alternativa ao cookie pra chamadas tRPC/REST do device.
        expo(),
        bearer(),
      ],
    })
  }

  /**
   * Valida se a senha informada corresponde ao usuário (reauth).
   * Usado para confirmar identidade antes de operações sensíveis (ex:
   * download de PFX, ver senha de certificado). Não cria sessão nova
   * persistente — usa o signInEmail do better-auth como verificador
   * (ele lança erro se a senha for inválida).
   */
  async verifyPassword(email: string, password: string): Promise<boolean> {
    try {
      const result = await this.auth.api.signInEmail({
        body: { email, password },
        asResponse: false,
      } as any)
      return !!result
    } catch {
      return false
    }
  }

  async handleRequest(request: Request) {
    return this.auth.handler(request)
  }

  /**
   * Resolve o endereço "From" do email de reset de senha.
   * Prioridade: RESEND_FROM_RESET → RESEND_FROM → SMTP_FROM → fallback.
   * Sempre prefixa com "OneClick" como display name.
   */
  private resolveResetFrom(): string {
    const fromEnv = process.env.RESEND_FROM_RESET
      || process.env.RESEND_FROM
      || process.env.SMTP_FROM
      || 'noreply@oneclick.central-rnc.com.br'
    // Se já vem como "Nome <email>", troca o nome pra OneClick.
    const match = fromEnv.match(/^.+?<(.+)>$/)
    const addr = match ? match[1] : fromEnv
    return `OneClick <${addr}>`
  }

  /**
   * Monta o HTML do email de redefinição de senha.
   * Inclui avisos de segurança (link expira em 30min, uso único, ignore se
   * não solicitado) e o link em formato tanto botão quanto texto puro.
   */
  private buildResetPasswordHtml(opts: { name: string; url: string }): string {
    const escapedName = this.escapeHtml(opts.name)
    const url = opts.url // Better Auth já entrega URL pronta com token
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redefinição de senha</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;color:#1f2937;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f5f7fa;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05);overflow:hidden;">
          <tr>
            <td style="padding:32px 40px 16px;text-align:center;border-bottom:1px solid #e5e7eb;">
              <div style="font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.5px;">OneClick</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px 8px;">
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#0f172a;">Redefinição de senha</h1>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">Olá, ${escapedName}.</p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;">Recebemos uma solicitação para redefinir a senha da sua conta OneClick. Clique no botão abaixo para escolher uma nova senha:</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 32px;">
              <a href="${url}" style="display:inline-block;background:#5ea3cb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;letter-spacing:0.2px;">Redefinir minha senha</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px;">
              <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">Ou copie e cole este link no navegador:</p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:#5ea3cb;word-break:break-all;">${url}</p>
              <div style="background:#f9fafb;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:4px;margin-bottom:8px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#92400e;">
                  <strong>Por segurança:</strong><br>
                  • Este link expira em <strong>30 minutos</strong>.<br>
                  • Só pode ser usado <strong>uma vez</strong>.<br>
                  • Se você não solicitou a redefinição, ignore este email — sua senha permanece a mesma.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:11px;line-height:1.6;color:#9ca3af;">
                Esta é uma mensagem automática enviada por OneClick.<br>
                Não responda a este email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
}
