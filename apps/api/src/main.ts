import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true })

  app.useLogger(app.get(Logger))
  app.useBodyParser('json', { limit: '10mb' })
  app.useBodyParser('urlencoded', { extended: true, limit: '10mb' })

  app.enableCors({
    origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    credentials: true,
  })

  // Rota direta de download de backup (fora do tRPC)
  const express = app.getHttpAdapter().getInstance()
  const path = require('path')
  const fs = require('fs')
  express.get('/api/backup/download/:filename', (req: { params: { filename: string } }, res: { download: (p: string, f: string, cb: (e: Error) => void) => void; status: (n: number) => { json: (o: Record<string, string>) => void } }) => {
    const filename = req.params.filename
    if (!filename || filename.includes('..') || (!filename.endsWith('.zip') && !filename.endsWith('.sql'))) {
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
  await app.listen(port)
}

bootstrap()
