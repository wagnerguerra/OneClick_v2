import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Get,
  Param,
  Res,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname, join } from 'path'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import type { Response } from 'express'

const UPLOADS_DIR = join(process.cwd(), 'uploads')
const MAX_SIZE = 20 * 1024 * 1024 // 20MB

@Controller('api/upload')
export class UploadController {
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
  uploadCertificado(@UploadedFile() file: Express.Multer.File) {
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
  uploadCertificadoPf(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.')
    }
    return { ok: true, fileName: file.originalname, fileSize: file.size }
  }

  @Get(':filename')
  serve(@Param('filename') filename: string, @Res() res: Response) {
    // Sanitizar filename para evitar path traversal
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '')
    const filePath = join(UPLOADS_DIR, safe)

    if (!existsSync(filePath)) {
      res.status(404).json({ message: 'Arquivo não encontrado.' })
      return
    }

    res.sendFile(filePath)
  }
}
