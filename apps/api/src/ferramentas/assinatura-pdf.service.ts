import { Injectable } from '@nestjs/common'
import * as path from 'path'
import * as fs from 'fs/promises'
import { prisma } from '@saas/db'
import { decryptPassword, parseCipher } from '../certificado-digital/crypto.helper'
import { PdfSignService } from '../contrato/pdf-sign.service'

/**
 * Assinatura de PDF com certificado A1 do cadastro, com carimbo visível na
 * área que o usuário escolheu.
 *
 * O comportamento pedido é o do Acrobat com o certificado instalado na máquina:
 * marca-se a área e assina, sem pedir senha. Aqui o certificado e a senha já
 * estão guardados, então o passo da senha some pelo mesmo motivo.
 *
 * São DUAS coisas somadas, e vale saber que são separadas:
 *   1. o carimbo — desenho na página, o que se vê;
 *   2. a assinatura — PAdES-BES (ou T, com carimbo do tempo), o que vale.
 * O documento é válido mesmo sem o carimbo; o carimbo sozinho não vale nada.
 */

const STORAGE_ROOT = path.resolve(process.cwd(), 'uploads', 'certificados')

export interface AreaAssinatura {
  /** Página, começando em 1. */
  pagina: number
  /** Cantos em pontos PDF, origem no canto inferior esquerdo. */
  x: number
  y: number
  largura: number
  altura: number
}

export interface PdfAssinado {
  nome: string
  base64: string
  bytes: number
  padesLevel: 'BES' | 'T'
  tsaInfo?: string
  titular: string
}

@Injectable()
export class AssinaturaPdfService {
  constructor(private readonly pdfSign: PdfSignService) {}

  /** Certificados que dá para usar: com arquivo, com senha e ainda válidos. */
  async listarCertificados(empresaId: string | null) {
    const hoje = new Date()
    const certs = await prisma.certificadoDigital.findMany({
      where: {
        ...(empresaId ? { empresaId } : {}),
        arquivoPath: { not: null },
        senhaCifrada: { not: null },
        status: { not: 'RENOVADO' },
      },
      select: {
        id: true, titular: true, documento: true, tipo: true, expiraEm: true,
      },
      orderBy: { expiraEm: 'desc' },
    })
    // Vencido não assina: o arquivo continua no cadastro para histórico, mas
    // oferecê-lo aqui seria oferecer uma assinatura que ninguém aceita.
    return certs
      .filter((c) => c.expiraEm >= hoje)
      .map((c) => ({
        id: c.id,
        titular: c.titular,
        documento: c.documento,
        tipo: c.tipo,
        expiraEm: c.expiraEm,
      }))
  }

  async assinar(input: {
    nome: string
    pdfBase64: string
    certificadoId: string
    area?: AreaAssinatura
    motivo?: string
    local?: string
    empresaId: string | null
  }): Promise<PdfAssinado> {
    const cert = await prisma.certificadoDigital.findFirst({
      where: { id: input.certificadoId, ...(input.empresaId ? { empresaId: input.empresaId } : {}) },
      select: { id: true, titular: true, documento: true, arquivoPath: true, senhaCifrada: true, expiraEm: true },
    })
    if (!cert) throw new Error('Certificado não encontrado.')
    if (!cert.arquivoPath) throw new Error(`O certificado de ${cert.titular} não tem arquivo guardado.`)
    if (!cert.senhaCifrada) throw new Error(`O certificado de ${cert.titular} não tem senha guardada.`)
    if (cert.expiraEm < new Date()) {
      throw new Error(`O certificado de ${cert.titular} está vencido.`)
    }

    const certPath = path.join(STORAGE_ROOT, cert.arquivoPath)
    try {
      await fs.access(certPath)
    } catch {
      throw new Error(`O arquivo do certificado de ${cert.titular} não foi encontrado no servidor.`)
    }

    const senha = decryptPassword(parseCipher(cert.senhaCifrada))

    // Sempre passa pelo pdf-lib, com ou sem carimbo. O motivo é o formato do
    // índice interno: PDF moderno (o do Chrome, por exemplo) usa "xref stream",
    // e o node-signpdf só entende a tabela clássica — ele falha com "Expected
    // xref at NaN". Regravar com `useObjectStreams: false` produz a tabela
    // antiga, que ele lê.
    const original: Buffer<ArrayBuffer> = Buffer.from(input.pdfBase64, 'base64')
    const pdf = await this.prepararParaAssinar(original, input.area, cert.titular, cert.documento)

    const assinado = await this.pdfSign.assinarPdf(pdf, {
      certPath,
      certPassword: senha,
      nomeSignatario: cert.titular,
      motivo: input.motivo || 'Assinatura digital',
      local: input.local || 'Brasil',
      withTimestamp: true,
    })

    return {
      nome: input.nome.replace(/\.pdf$/i, '') + '_assinado.pdf',
      base64: assinado.buffer.toString('base64'),
      bytes: assinado.buffer.length,
      padesLevel: assinado.padesLevel,
      tsaInfo: assinado.tsaInfo,
      titular: cert.titular,
    }
  }

  /**
   * Regrava o PDF no formato que o assinador entende e, se houver área,
   * desenha o carimbo.
   *
   * O carimbo vai ANTES da assinatura, de propósito: alterar o PDF depois
   * invalidaria a assinatura — é exatamente o que ela existe para detectar.
   */
  private async prepararParaAssinar(
    pdf: Buffer, area: AreaAssinatura | undefined, titular: string, documento: string,
  ): Promise<Buffer<ArrayBuffer>> {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true })

    if (area) {
      const paginas = doc.getPages()
      const pagina = paginas[area.pagina - 1]
      if (!pagina) throw new Error(`O documento não tem a página ${area.pagina}.`)

      const fonte = await doc.embedFont(StandardFonts.Helvetica)
      const negrito = await doc.embedFont(StandardFonts.HelveticaBold)
      const tinta = rgb(0.06, 0.25, 0.53)

      pagina.drawRectangle({
        x: area.x, y: area.y, width: area.largura, height: area.altura,
        borderColor: tinta, borderWidth: 1,
        color: rgb(1, 1, 1), opacity: 0.85, borderOpacity: 1,
      })

      // O texto se ajusta à caixa: área pequena não pode cortar o nome de quem
      // assinou, que é a informação essencial do carimbo.
      const margem = 4
      const util = area.largura - margem * 2
      const linhas: Array<{ texto: string; fonte: typeof fonte; tam: number }> = [
        { texto: 'Assinado digitalmente por', fonte, tam: 6.5 },
        { texto: titular, fonte: negrito, tam: 8 },
        { texto: documento ? `Documento: ${documento}` : '', fonte, tam: 6.5 },
        { texto: new Date().toLocaleString('pt-BR'), fonte, tam: 6.5 },
      ].filter((l) => l.texto)

      const alturaLinha = area.altura / (linhas.length + 0.6)
      let y = area.y + area.altura - margem - alturaLinha * 0.75

      for (const l of linhas) {
        let tam = Math.min(l.tam, alturaLinha * 0.85)
        // Encolhe até caber na largura, em vez de deixar transbordar a caixa.
        while (tam > 4 && l.fonte.widthOfTextAtSize(l.texto, tam) > util) tam -= 0.25
        pagina.drawText(l.texto, { x: area.x + margem, y, size: tam, font: l.fonte, color: tinta })
        y -= alturaLinha
      }
    }

    // `useObjectStreams: false` é o que garante a tabela xref clássica.
    // Copia para um Buffer novo: o Uint8Array do pdf-lib pode vir sobre
    // SharedArrayBuffer, que não casa com a assinatura de `assinarPdf`.
    const bytes = await doc.save({ useObjectStreams: false })
    const saida = Buffer.alloc(bytes.byteLength)
    saida.set(bytes)
    return saida
  }
}
