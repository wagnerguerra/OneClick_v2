/**
 * Storage local pra XMLs e PDFs de DANFE.
 * Estrutura: apps/api/uploads/danfe/{xmls,pdfs}/<chave>.{xml,pdf}
 *
 * Quando migrar pra S3/Minio, trocar essa classe por uma que use @aws-sdk/client-s3.
 * O resto do código usa só `xmlKey`/`pdfKey` (strings opacas) — sem acoplamento.
 */

import { promises as fs, createReadStream, type ReadStream } from 'fs'
import path from 'path'

const UPLOADS_BASE = path.resolve(process.cwd(), 'uploads', 'danfe')

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

export class DanfeStorage {
  async saveXml(chave: string, content: Buffer | string): Promise<string> {
    const key = `xmls/${chave}.xml`
    const full = path.join(UPLOADS_BASE, key)
    await ensureDir(path.dirname(full))
    await fs.writeFile(full, content, typeof content === 'string' ? 'utf8' : undefined)
    return key
  }

  async savePdf(chave: string, buffer: Buffer): Promise<string> {
    const key = `pdfs/${chave}.pdf`
    const full = path.join(UPLOADS_BASE, key)
    await ensureDir(path.dirname(full))
    await fs.writeFile(full, buffer)
    return key
  }

  readStream(key: string): ReadStream {
    const full = path.join(UPLOADS_BASE, key)
    return createReadStream(full)
  }

  async readBuffer(key: string): Promise<Buffer> {
    const full = path.join(UPLOADS_BASE, key)
    return fs.readFile(full)
  }

  async exists(key: string): Promise<boolean> {
    try {
      const full = path.join(UPLOADS_BASE, key)
      await fs.access(full)
      return true
    } catch { return false }
  }

  async remove(key: string): Promise<void> {
    try {
      const full = path.join(UPLOADS_BASE, key)
      await fs.unlink(full)
    } catch { /* já removido */ }
  }
}
