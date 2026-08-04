import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Get,
  Param,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname, join } from 'path'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import type { Request, Response } from 'express'
import { AuthService } from '../auth/auth.service'

const UPLOADS_DIR = join(process.cwd(), 'uploads')
const MAX_SIZE = 20 * 1024 * 1024 // 20MB

/**
 * Extensões que esta rota nunca entrega, mesmo que o arquivo exista.
 *
 * A pasta `uploads/` guarda duas coisas de naturezas opostas: anexos que
 * precisam ser públicos (imagem de e-mail, PDF de proposta) e material
 * criptográfico que jamais pode sair (o certificado da empresa mora em
 * `uploads/certificado.pfx`, ao lado deles). Servir a pasta inteira entregava
 * a chave privada do escritório a quem soubesse o nome do arquivo.
 *
 * A lista é por extensão, e não por nome, para valer também para o arquivo que
 * alguém deixar ali amanhã.
 */
const EXTENSOES_PROIBIDAS = new Set([
  '.pfx', '.p12', '.pem', '.key', '.jks', '.keystore',
  '.crt', '.cer', '.der', '.env', '.sql', '.pkcs12',
])

@Controller('api/upload')
export class UploadController {
  constructor(private readonly authService: AuthService) {}

  /** Exige sessão válida. Cópia do padrão já usado nos demais controllers REST. */
  private async exigirSessao(req: Request): Promise<void> {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    }
    try {
      const session = await this.authService.auth.api.getSession({ headers })
      if (!session?.user?.id) throw new UnauthorizedException('Sessão inválida — faça login.')
    } catch {
      throw new UnauthorizedException('Sessão inválida — faça login.')
    }
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase()
          const name = `${randomUUID()}${ext}`
          cb(null, name)
        },
      }),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const blocked = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.dll']
        const ext = extname(file.originalname).toLowerCase()
        if (blocked.includes(ext)) {
          cb(new BadRequestException('Tipo de arquivo nao permitido por seguranca.'), false)
        } else {
          cb(null, true)
        }
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.')
    }

    // Retorna URL relativa pra que o frontend resolva o host dinamicamente.
    // Salvar URL absoluta congela o hostname (localhost) no banco e quebra
    // quando o app é acessado por IP de rede ou domínio diferente.
    const url = `/api/upload/${file.filename}`

    return { url, filename: file.filename }
  }

  @Post('certificado')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, _file, cb) => {
          cb(null, 'certificado.pfx')
        },
      }),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase()
        if (!['.pfx', '.p12'].includes(ext)) {
          cb(new BadRequestException('Apenas arquivos .pfx ou .p12 são aceitos.'), false)
        } else {
          cb(null, true)
        }
      },
    }),
  )
  async uploadCertificado(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    // Sem sessão, qualquer um na internet trocava o certificado da empresa por
    // outro — e passaria a assinar em nome dela.
    await this.exigirSessao(req)
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.')
    }
    return { ok: true, fileName: file.originalname, fileSize: file.size }
  }

  @Post('certificado-pf')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, _file, cb) => {
          cb(null, 'certificado-pf.pfx')
        },
      }),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase()
        if (!['.pfx', '.p12'].includes(ext)) {
          cb(new BadRequestException('Apenas arquivos .pfx ou .p12 são aceitos.'), false)
        } else {
          cb(null, true)
        }
      },
    }),
  )
  async uploadCertificadoPf(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    await this.exigirSessao(req)
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.')
    }
    return { ok: true, fileName: file.originalname, fileSize: file.size }
  }

  @Get(':filename')
  serve(@Param('filename') filename: string, @Res() res: Response) {
    // Sanitizar filename para evitar path traversal
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '')

    // 404, e não 403: quem sonda não fica sabendo que o arquivo existe.
    if (EXTENSOES_PROIBIDAS.has(extname(safe).toLowerCase())) {
      res.status(404).json({ message: 'Arquivo não encontrado.' })
      return
    }

    const filePath = join(UPLOADS_DIR, safe)

    if (!existsSync(filePath)) {
      res.status(404).json({ message: 'Arquivo não encontrado.' })
      return
    }

    res.sendFile(filePath)
  }

  /**
   * Serve arquivos de orçamentos migrados do legado (subpasta orcamentos-legado/).
   * Nomes preservados do legado podem ter parênteses, espaços e acentos —
   * sanitização aqui é só anti-path-traversal (../, /, \), não whitelisting.
   */
  @Get('orcamentos-legado/:filename')
  serveOrcamentoLegado(@Param('filename') filename: string, @Res() res: Response) {
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      res.status(400).json({ message: 'Nome inválido.' })
      return
    }
    const filePath = join(UPLOADS_DIR, 'orcamentos-legado', filename)
    if (!existsSync(filePath)) {
      res.status(404).json({ message: 'Arquivo não encontrado.' })
      return
    }
    res.sendFile(filePath)
  }

  /**
   * Serve anexos de fornecedores migrados do legado (subpasta fornecedores-legado/).
   * Mesmo padrão do orcamentos-legado: nomes preservados do v1 (cad_for_*.ext);
   * sanitização só anti-path-traversal.
   */
  @Get('fornecedores-legado/:filename')
  serveFornecedorLegado(@Param('filename') filename: string, @Res() res: Response) {
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      res.status(400).json({ message: 'Nome inválido.' })
      return
    }
    const filePath = join(UPLOADS_DIR, 'fornecedores-legado', filename)
    if (!existsSync(filePath)) {
      res.status(404).json({ message: 'Arquivo não encontrado.' })
      return
    }
    res.sendFile(filePath)
  }

  /** Serve anexos de pedidos de compra migrados do legado (sgq_com_arq → /files/aquisicoes). */
  @Get('aquisicoes-legado/:filename')
  serveAquisicaoLegado(@Param('filename') filename: string, @Res() res: Response) {
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      res.status(400).json({ message: 'Nome inválido.' })
      return
    }
    const filePath = join(UPLOADS_DIR, 'aquisicoes-legado', filename)
    if (!existsSync(filePath)) {
      res.status(404).json({ message: 'Arquivo não encontrado.' })
      return
    }
    res.sendFile(filePath)
  }
}
