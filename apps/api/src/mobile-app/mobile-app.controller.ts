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

  /** Parseia version/build do nome do arquivo (ex: OneClick-ERP-1.0.0-1.apk). */
  private parseVersion(file: string): { version: string | null; build: number | null } {
    const m = file.match(/-(\d+\.\d+\.\d+)-(\d+)\.apk$/i)
    if (!m || !m[1] || !m[2]) return { version: null, build: null }
    return { version: m[1], build: Number(m[2]) }
  }

  /** Compara duas versões semver (a vs b). Retorna >0 se a > b. */
  private compareSemver(a: string | null, b: string | null): number {
    if (a === b) return 0
    if (a === null) return -1
    if (b === null) return 1
    const pa = a.split('.').map((n) => Number(n))
    const pb = b.split('.').map((n) => Number(n))
    for (let i = 0; i < 3; i++) {
      const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  }

  /** Info pro dashboard: histórico de versões disponíveis pra Android e iOS. */
  @Get()
  info() {
    const dir = this.getDistPath()

    interface VersionEntry {
      url: string
      file: string
      version: string | null
      build: number | null
      sizeMb: number
      mtime: string
    }

    let versions: VersionEntry[] = []
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.apk') || f.endsWith('.aab'))
      versions = files.map((file) => {
        const stat = fs.statSync(path.join(dir, file))
        const { version, build } = this.parseVersion(file)
        return {
          url: `/api/mobile-app/${file}`,
          file,
          version,
          build,
          sizeMb: Math.round((stat.size / (1024 * 1024)) * 10) / 10,
          mtime: stat.mtime.toISOString(),
        }
      })

      // Ordena desc por [version semver, build, mtime].
      versions.sort((a, b) => {
        const v = this.compareSemver(b.version, a.version)
        if (v !== 0) return v
        const bld = (b.build ?? 0) - (a.build ?? 0)
        if (bld !== 0) return bld
        return new Date(b.mtime).getTime() - new Date(a.mtime).getTime()
      })
    }

    const latest = versions[0] ?? null

    // Compat: shape antigo de `android` = { url, file } do mais recente.
    // Se MOBILE_ANDROID_URL setado, ele prevalece pra url do latest.
    let latestOut: VersionEntry | null = latest
    let android: { url: string; file: string | null } | null = null
    if (latest) {
      const url = process.env.MOBILE_ANDROID_URL || latest.url
      latestOut = { ...latest, url }
      android = { url, file: latest.file }
    }

    const iosUrl = process.env.MOBILE_IOS_URL || null

    return {
      ok: true,
      android,
      latest: latestOut,
      versions,
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
