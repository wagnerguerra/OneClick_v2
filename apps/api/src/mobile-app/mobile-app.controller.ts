import { Controller, Get, Param, Res, BadRequestException, NotFoundException } from '@nestjs/common'
import type { Response } from 'express'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Distribuição do app mobile (OneClick ERP — Android/iOS) pelo dashboard.
 *
 * Android: serve o `.apk`/`.aab` colocado em `scripts/mobile-dist/` (gerado via
 *   EAS e copiado pra cá), ou redireciona pro `MOBILE_ANDROID_URL` (ex: artefato
 *   do EAS) se definido.
 * iOS: não há instalador self-hosted pra devices arbitrários — usa-se um link de
 *   TestFlight/App Store em `MOBILE_IOS_URL`.
 *
 * Em produção o repo é montado em /repo-src (ver docker-compose) — tentamos isso
 * primeiro, igual ao chat-desktop.
 */
@Controller('api/mobile-app')
export class MobileAppController {
  private getDistPath(): string {
    const fromRepoSrc = '/repo-src/scripts/mobile-dist'
    if (fs.existsSync(fromRepoSrc)) return fromRepoSrc
    return path.resolve(process.cwd(), '..', '..', 'scripts', 'mobile-dist')
  }

  /** Info pro dashboard: o que está disponível pra Android e iOS. */
  @Get()
  info() {
    const dir = this.getDistPath()
    let apk: string | null = null
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.apk') || f.endsWith('.aab'))
      // Pega o mais recente por mtime.
      apk = files
        .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)[0]?.f ?? null
    }

    const androidUrl = process.env.MOBILE_ANDROID_URL || (apk ? `/api/mobile-app/${apk}` : null)
    const iosUrl = process.env.MOBILE_IOS_URL || null

    return {
      ok: true,
      android: androidUrl ? { url: androidUrl, file: apk } : null,
      ios: iosUrl ? { url: iosUrl } : null,
    }
  }

  /** Serve o binário Android. Path traversal bloqueado + whitelist de extensões. */
  @Get(':filename')
  async serveFile(@Param('filename') filename: string, @Res() res: Response) {
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Nome de arquivo inválido.')
    }
    if (!/\.(apk|aab)$/i.test(filename)) {
      throw new BadRequestException('Extensão não suportada.')
    }

    const dir = this.getDistPath()
    const filepath = path.join(dir, filename)
    if (!fs.existsSync(filepath)) {
      throw new NotFoundException(`Arquivo não encontrado: ${filename}`)
    }
    const stat = fs.statSync(filepath)
    if (!stat.isFile()) throw new NotFoundException('Não é um arquivo.')

    res.setHeader('Content-Type', 'application/vnd.android.package-archive')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', stat.size.toString())
    fs.createReadStream(filepath).pipe(res)
  }
}
