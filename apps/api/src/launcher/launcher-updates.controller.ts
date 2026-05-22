import { Controller, Get, Param, Res, BadRequestException, NotFoundException } from '@nestjs/common'
import type { Response } from 'express'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Serve os artefatos de build do Launcher Electron (latest.yml + .exe) pra que o
 * electron-updater possa fazer auto-update via LAN, sem precisar de servidor externo.
 *
 * Os arquivos ficam em `scripts/launcher/dist/` no repositório. A API expõe pelo
 * endpoint configurado no `package.json` do launcher (campo `build.publish.url`).
 */
@Controller('api/launcher-updates')
export class LauncherUpdatesController {
  /** Resolve a pasta dist do launcher a partir do cwd da API (apps/api → ../../scripts/launcher/dist). */
  private getLauncherDistPath(): string {
    return path.resolve(process.cwd(), '..', '..', 'scripts', 'launcher', 'dist')
  }

  /** Lista o que tem (debug) — útil pra verificar se a pasta tá acessível. */
  @Get()
  list() {
    const dir = this.getLauncherDistPath()
    if (!fs.existsSync(dir)) {
      return { ok: false, error: `Pasta não encontrada: ${dir}` }
    }
    const files = fs.readdirSync(dir).filter(f =>
      f.endsWith('.exe') || f.endsWith('.yml') || f.endsWith('.blockmap'),
    )
    return { ok: true, dir, files }
  }

  /** Serve qualquer arquivo da pasta dist do launcher. Bloqueia path traversal. */
  @Get(':filename')
  async serveFile(@Param('filename') filename: string, @Res() res: Response) {
    // Segurança: bloqueia path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Nome de arquivo inválido.')
    }
    // Só permite extensões conhecidas do electron-builder
    if (!/\.(exe|yml|yaml|blockmap)$/i.test(filename)) {
      throw new BadRequestException('Extensão não suportada.')
    }

    const dir = this.getLauncherDistPath()
    const filepath = path.join(dir, filename)
    if (!fs.existsSync(filepath)) {
      throw new NotFoundException(`Arquivo não encontrado: ${filename}`)
    }
    const stat = fs.statSync(filepath)
    if (!stat.isFile()) throw new NotFoundException('Não é um arquivo.')

    // Content type apropriado
    const ext = path.extname(filename).toLowerCase()
    const types: Record<string, string> = {
      '.exe': 'application/octet-stream',
      '.yml': 'text/yaml; charset=utf-8',
      '.yaml': 'text/yaml; charset=utf-8',
      '.blockmap': 'application/octet-stream',
    }
    res.setHeader('Content-Type', types[ext] ?? 'application/octet-stream')
    res.setHeader('Content-Length', stat.size.toString())
    fs.createReadStream(filepath).pipe(res)
  }
}
