import { Controller, Get, Param, Res, BadRequestException, NotFoundException } from '@nestjs/common'
import type { Response } from 'express'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Serve os artefatos do aplicativo OneClick Chat Desktop (Electron):
 *   - `latest.yml` pro electron-updater detectar nova versão
 *   - `.exe` do instalador NSIS gerado por `electron-builder --win`
 *   - `.blockmap` pro auto-update diferencial
 *
 * Os arquivos ficam em `scripts/chat-desktop/dist/` no repositório. Em produção,
 * o docker-compose deve montar esse diretório como volume read-only no container
 * da API pra que esses arquivos fiquem acessíveis.
 *
 * Endpoint configurado no `package.json` do chat-desktop:
 *   "build.publish.url": "https://app.oneclick.central-rnc.com.br/api/chat-desktop-updates"
 */
@Controller('api/chat-desktop-updates')
export class ChatDesktopUpdatesController {
  private getDistPath(): string {
    return path.resolve(process.cwd(), '..', '..', 'scripts', 'chat-desktop', 'dist')
  }

  /** Debug: lista os artefatos disponíveis. */
  @Get()
  list() {
    const dir = this.getDistPath()
    if (!fs.existsSync(dir)) {
      return { ok: false, error: `Pasta não encontrada: ${dir}` }
    }
    const files = fs.readdirSync(dir).filter(f =>
      f.endsWith('.exe') || f.endsWith('.yml') || f.endsWith('.blockmap'),
    )
    return { ok: true, dir, files }
  }

  /** Serve um arquivo específico. Path traversal bloqueado + whitelist de extensões. */
  @Get(':filename')
  async serveFile(@Param('filename') filename: string, @Res() res: Response) {
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Nome de arquivo inválido.')
    }
    if (!/\.(exe|yml|yaml|blockmap)$/i.test(filename)) {
      throw new BadRequestException('Extensão não suportada.')
    }

    const dir = this.getDistPath()
    const filepath = path.join(dir, filename)
    if (!fs.existsSync(filepath)) {
      throw new NotFoundException(`Arquivo não encontrado: ${filename}`)
    }
    const stat = fs.statSync(filepath)
    if (!stat.isFile()) throw new NotFoundException('Não é um arquivo.')

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
