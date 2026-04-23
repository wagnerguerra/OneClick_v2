import { Injectable } from '@nestjs/common'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from '@saas/db'

@Injectable()
export class AuthService {
  public readonly auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:4000',
    basePath: '/api/auth',
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        // TODO: integrar Resend para envio real de email
        // Por enquanto, loga a URL no console para dev
        console.log(`[Reset Password] ${user.email} → ${url}`)
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
    },
    trustedOrigins: (request) => {
      const origins = [
        process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ]
      // Adicionar origens extras configuradas via env
      if (process.env.TRUSTED_ORIGINS) {
        origins.push(...process.env.TRUSTED_ORIGINS.split(','))
      }
      // Aceitar dinamicamente o origin da rede local (192.168.*)
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
  })

  async handleRequest(request: Request) {
    return this.auth.handler(request)
  }
}
