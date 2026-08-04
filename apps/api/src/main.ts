import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { hidratarConfiguracoes } from './common/config-runtime'
import { AuthService } from './auth/auth.service'

// Habilita JSON.stringify de BigInt — necessário pra serializar campos
// Prisma BigInt (ex: HelpdeskTicket.totalPausadoMs) via tRPC. Number() é
// seguro até 2^53 ms (~285 mil anos).
;(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this as unknown as bigint)
}

async function bootstrap() {
  // Antes de qualquer serviço: o que foi configurado pela tela vale mais que o
  // que veio do contêiner, e há serviço que lê o ambiente na construção.
  const configsDoBanco = await hidratarConfiguracoes()

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true })

  app.useLogger(app.get(Logger))
  if (configsDoBanco > 0) {
    app.get(Logger).log(`${configsDoBanco} configuração(ões) carregada(s) do banco`)
  }

  // Desabilita ETag em todas as respostas. Express auto-gerava ETag para
  // /api/auth/get-session, fazendo o cliente receber 304 sem body — better-auth
  // ficava com sessão null e redirecionava pro login após autenticar.
  app.getHttpAdapter().getInstance().set('etag', false)
  // Não revelar o framework (Express) no header de resposta — reduz fingerprinting.
  app.getHttpAdapter().getInstance().disable('x-powered-by')
  app.useBodyParser('json', {
    limit: '100mb',  // suporta upload em lote de PFX em base64 (~558 arquivos)
    verify: (req: any, _res: any, buf: Buffer) => {
      // Preservar raw body para verificacao de assinatura do Stripe webhook
      if (req.url?.startsWith('/api/stripe/webhook')) {
        req.rawBody = buf
      }
    },
  })
  app.useBodyParser('urlencoded', { extended: true, limit: '100mb' })

  app.enableCors({
    origin: (origin, callback) => {
      // Permite: requisições sem origin (curl/SSR), origin configurada no env,
      // localhost/127.0.0.1 e qualquer IP em faixa RFC 1918 (rede privada):
      //   10.0.0.0/8 · 172.16.0.0/12 · 192.168.0.0/16
      // Em dev, ainda assim aceita qualquer origem como fallback.
      if (!origin) return callback(null, true)
      const allowed = process.env.NEXT_PUBLIC_APP_URL
      if (allowed && origin === allowed) return callback(null, true)

      const PRIVATE_LAN = /^https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?::\d+)?$/i
      if (PRIVATE_LAN.test(origin)) return callback(null, true)

      // Dev/legado: aceitar tudo. Em produção, restringir via NEXT_PUBLIC_APP_URL.
      if (process.env.NODE_ENV !== 'production') return callback(null, true)
      return callback(new Error(`CORS: origem não permitida (${origin})`))
    },
    credentials: true,
  })

  // Rotas diretas (fora do tRPC)
  const express = app.getHttpAdapter().getInstance()

  // Health check — usado pelo frontend pra detectar API fora do ar.
  // Sem auth, resposta minimal e rápida.
  express.get('/api/health', (_req: unknown, res: { json: (o: Record<string, unknown>) => void }) => {
    res.json({ ok: true, ts: Date.now(), uptime: process.uptime() })
  })
  const path = require('path')
  const fs = require('fs')
  const authService = app.get(AuthService)
  express.get('/api/backup/download/:filename', async (req: { params: { filename: string }; headers: Record<string, string | string[] | undefined> }, res: { download: (p: string, f: string, cb: (e: Error) => void) => void; status: (n: number) => { json: (o: Record<string, string>) => void } }) => {
    // O ZIP carrega o dump do banco e a pasta uploads/ — inclusive o
    // certificado da empresa. O nome tem carimbo de tempo ao segundo, o que
    // atrasa quem adivinha mas não impede: um dia inteiro cabe em 86.400
    // tentativas. Sem sessão, não sai.
    const cabecalhos = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) cabecalhos.set(k, Array.isArray(v) ? v.join(', ') : v)
    }
    const sessao = await authService.auth.api.getSession({ headers: cabecalhos }).catch(() => null)
    if (!sessao?.user?.id) {
      return res.status(401).json({ error: 'Sessao invalida' })
    }

    const filename = req.params.filename
    if (!filename || filename.includes('..') || !filename.endsWith('.zip')) {
      return res.status(400).json({ error: 'Arquivo invalido' })
    }
    const backupDir = path.resolve(process.cwd(), '..', '..', 'backups')
    const filepath = path.join(backupDir, filename)
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Arquivo nao encontrado' })
    }
    res.download(filepath, filename, (err: Error) => {
      if (err) console.error('Erro no download:', err)
    })
  })

  const port = process.env.PORT ?? 4000
  await app.listen(port, '0.0.0.0')
}

bootstrap()
