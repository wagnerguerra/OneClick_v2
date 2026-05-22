/**
 * SignatureService — gera a "célula esquerda" da assinatura de email
 * (forma orgânica branca + círculo verde + foto da pessoa) como uma PNG única,
 * pronta pra ser inserida no HTML da assinatura.
 *
 * Por que server-side? Email clients (Gmail, Outlook) fazem strip de
 * position:absolute, clip-path e SVG inline complexo — a única forma robusta
 * de ter a decoração orgânica é uma imagem pré-composta.
 *
 * Fluxo:
 *   1. Usuário faz upload da foto em /api/upload (existente)
 *   2. Frontend chama signature.composeFromUpload({ originalUrl })
 *   3. Backend lê o arquivo original do disco, compõe via sharp e salva em
 *      uploads/ um novo PNG (signature-composed-<random>.png)
 *   4. Retorna { url } — frontend atualiza signatureImageUrl do user com essa
 *      URL composta
 */

import { Injectable, BadRequestException } from '@nestjs/common'
import sharp from 'sharp'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { prisma } from '@saas/db'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

// Dimensões do componente "célula esquerda"
const CANVAS_W = 220
const CANVAS_H = 180
const CIRCLE_DIAMETER = 130 // foto + halo verde
const PHOTO_DIAMETER = 120
const BG_COLOR = '#3a3a3a'    // mesmo cinza do container do email
const GREEN = '#10b981'        // cor accent

@Injectable()
export class SignatureService {
  /**
   * Compõe a imagem da assinatura a partir de uma URL de upload já enviada.
   * `originalUrl` tem o formato `/api/upload/<filename>` — pegamos o arquivo
   * local correspondente em UPLOADS_DIR.
   */
  async composeFromUpload(userId: string, originalUrl: string): Promise<{ url: string }> {
    const match = originalUrl.match(/\/api\/upload\/([^/?#]+)$/i)
    if (!match) throw new BadRequestException('URL de upload inválida.')
    const filename = match[1]!
    const srcPath = path.join(UPLOADS_DIR, filename)

    try {
      await fs.access(srcPath)
    } catch {
      throw new BadRequestException('Arquivo de origem não encontrado em uploads/.')
    }

    // 1) Foto do usuário, redimensionada pra PHOTO_DIAMETER e recortada em círculo.
    const photoBuffer = await sharp(srcPath)
      .resize(PHOTO_DIAMETER, PHOTO_DIAMETER, { fit: 'cover', position: 'centre' })
      .composite([{
        input: Buffer.from(
          `<svg width="${PHOTO_DIAMETER}" height="${PHOTO_DIAMETER}">
             <circle cx="${PHOTO_DIAMETER / 2}" cy="${PHOTO_DIAMETER / 2}" r="${PHOTO_DIAMETER / 2}" fill="white"/>
           </svg>`,
        ),
        blend: 'dest-in',
      }])
      .png()
      .toBuffer()

    // 2) Canvas base — cinza-escuro do email, com a forma orgânica branca
    //    saindo da esquerda e o halo verde no centro.
    //    A "forma orgânica branca" é aproximada por um path SVG arredondado.
    const cx = 95   // centro horizontal do círculo (mais à esquerda)
    const cy = CANVAS_H / 2
    const haloR = CIRCLE_DIAMETER / 2 + 6 // 6px de margem verde além da foto
    const blobSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">
        <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="${BG_COLOR}"/>
        <!-- Forma orgânica branca: blob arredondado encostado na borda esquerda -->
        <path
          d="
            M 0 30
            Q 0 0, 30 0
            L 110 0
            Q 175 0, 175 50
            Q 175 ${CANVAS_H / 2}, 145 ${CANVAS_H - 30}
            Q 130 ${CANVAS_H}, 100 ${CANVAS_H}
            L 30 ${CANVAS_H}
            Q 0 ${CANVAS_H}, 0 ${CANVAS_H - 30}
            Z
          "
          fill="#ffffff"
        />
        <!-- Halo verde atrás da foto -->
        <circle cx="${cx}" cy="${cy}" r="${haloR}" fill="${GREEN}"/>
      </svg>
    `
    const canvasBuffer = await sharp(Buffer.from(blobSvg)).png().toBuffer()

    // 3) Sobrepõe a foto circular sobre o halo verde
    const photoTop = Math.round(cy - PHOTO_DIAMETER / 2)
    const photoLeft = Math.round(cx - PHOTO_DIAMETER / 2)
    const finalBuffer = await sharp(canvasBuffer)
      .composite([{ input: photoBuffer, top: photoTop, left: photoLeft }])
      .png()
      .toBuffer()

    // 4) Salva no uploads/ e atualiza o user
    const composedFilename = `signature-${randomUUID()}.png`
    const composedPath = path.join(UPLOADS_DIR, composedFilename)
    await fs.writeFile(composedPath, finalBuffer)
    const composedUrl = `/api/upload/${composedFilename}`

    await prisma.user.update({
      where: { id: userId },
      data: { signatureImageUrl: composedUrl },
    })

    // Remove o arquivo original (não usado depois) — best-effort
    fs.unlink(srcPath).catch(() => { /* ignore */ })

    return { url: composedUrl }
  }
}
