import { Injectable } from '@nestjs/common'
import * as path from 'path'
import * as fs from 'fs/promises'
import { prisma } from '@saas/db'
import { decryptPassword, parseCipher } from '../certificado-digital/crypto.helper'
import { PdfSignService } from '../contrato/pdf-sign.service'
import type { PDFFont } from 'pdf-lib'
import { LOGO_N_BASE64 } from './logo-n'

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

/** Fuso do escritório — o contêiner roda em UTC. */
const FUSO = 'America/Sao_Paulo'

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
        arquivoHash: true, clienteId: true, updatedAt: true,
      },
      orderBy: { expiraEm: 'desc' },
    })

    // Vencido não assina: o arquivo continua no cadastro para histórico, mas
    // oferecê-lo aqui seria oferecer uma assinatura que ninguém aceita.
    const validos = certs.filter((c) => c.expiraEm >= hoje)

    // O MESMO arquivo pode estar cadastrado mais de uma vez — importações
    // diferentes gravaram o PFX duas vezes, uma vinculada a cliente e outra
    // não. Para assinar são o mesmo certificado, e a lista mostrava dois itens
    // idênticos, sem nada que os distinguisse. Agrupa pelo hash do arquivo, que
    // é o que de fato identifica o certificado; sem hash, cai no documento mais
    // a validade.
    const porArquivo = new Map<string, (typeof validos)[number]>()
    for (const c of validos) {
      const chave = c.arquivoHash || `doc:${c.documento}:${c.expiraEm.toISOString()}`
      const atual = porArquivo.get(chave)
      // Fica o registro mais completo: o que tem cliente vinculado e, entre
      // iguais nisso, o mais recente.
      const melhor = !atual
        || (!!c.clienteId && !atual.clienteId)
        || (!!c.clienteId === !!atual.clienteId && c.updatedAt > atual.updatedAt)
      if (melhor) porArquivo.set(chave, c)
    }

    return [...porArquivo.values()].map((c) => ({
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
    const pdf = await this.prepararParaAssinar(original, input.area, cert.titular)

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
    pdf: Buffer, area: AreaAssinatura | undefined, titular: string,
  ): Promise<Buffer<ArrayBuffer>> {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true })

    if (area) {
      const paginas = doc.getPages()
      const pagina = paginas[area.pagina - 1]
      if (!pagina) throw new Error(`O documento não tem a página ${area.pagina}.`)

      const fonte = await doc.embedFont(StandardFonts.Helvetica)
      const marca = await doc.embedPng(Buffer.from(LOGO_N_BASE64, 'base64'))

      // Duas colunas, como o carimbo que o Acrobat gera: à esquerda o nome em
      // corpo grande sobre a marca esmaecida, à direita a descrição miúda.
      const margem = 5
      const meio = area.x + area.largura * 0.5
      const larguraEsq = area.largura * 0.5 - margem * 1.5
      const larguraDir = area.largura * 0.5 - margem * 1.5
      const preto = rgb(0, 0, 0)

      // Moldura primeiro, para delimitar o carimbo contra o conteúdo da
      // página. Sem preenchimento: o que está embaixo continua legível.
      pagina.drawRectangle({
        x: area.x, y: area.y, width: area.largura, height: area.altura,
        borderColor: rgb(0.35, 0.35, 0.35), borderWidth: 0.75,
      })

      // A marca vem depois, para o texto ficar por cima. É bem clara de
      // propósito: é fundo, não conteúdo.
      const ladoMarca = Math.min(area.altura, larguraEsq) * 0.85
      pagina.drawImage(marca, {
        x: area.x + margem + (larguraEsq - ladoMarca) / 2,
        y: area.y + (area.altura - ladoMarca) / 2,
        width: ladoMarca,
        height: ladoMarca,
        opacity: 0.18,
      })

      // ── coluna esquerda: o nome, no maior corpo que couber ──
      const nome = titular.toUpperCase()
      let tamNome = Math.min(area.altura / 4, 22)
      let linhasNome = this.quebrar(nome, fonte, tamNome, larguraEsq)
      while (tamNome > 5 && linhasNome.length * tamNome * 1.12 > area.altura - margem * 2) {
        tamNome -= 0.5
        linhasNome = this.quebrar(nome, fonte, tamNome, larguraEsq)
      }
      let yEsq = area.y + area.altura - margem - tamNome
      for (const l of linhasNome) {
        pagina.drawText(l, { x: area.x + margem, y: yEsq, size: tamNome, font: fonte, color: preto })
        yEsq -= tamNome * 1.12
      }

      // ── coluna direita: a descrição, no formato do Acrobat ──
      const textoDir = () => [
        `Assinado de forma digital por ${nome}`,
        `Dados: ${this.dataAcrobat(new Date())}`,
      ]
      let tamDir = 8
      let linhasDir = textoDir().flatMap((t) => this.quebrar(t, fonte, tamDir, larguraDir))
      while (tamDir > 4 && linhasDir.length * tamDir * 1.18 > area.altura - margem * 2) {
        tamDir -= 0.25
        // Refaz a quebra a cada passo: o número de linhas muda com o corpo.
        linhasDir = textoDir().flatMap((t) => this.quebrar(t, fonte, tamDir, larguraDir))
      }
      let yDir = area.y + area.altura - margem - tamDir
      for (const l of linhasDir) {
        pagina.drawText(l, { x: meio + margem / 2, y: yDir, size: tamDir, font: fonte, color: preto })
        yDir -= tamDir * 1.18
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

  /**
   * Quebra o texto na largura disponível.
   *
   * Quebra também DENTRO da palavra quando ela sozinha não cabe — é o caso do
   * "INFORMATICA:05930393000156" dos certificados, que não tem espaço nenhum e,
   * sem isso, sairia cortado na borda da caixa.
   */
  private quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
    const saida: string[] = []
    let atual = ''
    const empurra = () => { if (atual) { saida.push(atual); atual = '' } }

    for (const palavra of String(texto).split(/\s+/).filter(Boolean)) {
      const candidato = atual ? `${atual} ${palavra}` : palavra
      if (fonte.widthOfTextAtSize(candidato, tamanho) <= largura) { atual = candidato; continue }
      empurra()
      if (fonte.widthOfTextAtSize(palavra, tamanho) <= largura) { atual = palavra; continue }
      // Palavra maior que a linha inteira: parte caractere a caractere.
      let pedaco = ''
      for (const ch of palavra) {
        if (fonte.widthOfTextAtSize(pedaco + ch, tamanho) > largura) { saida.push(pedaco); pedaco = ch }
        else pedaco += ch
      }
      atual = pedaco
    }
    empurra()
    return saida
  }

  /**
   * Data no formato que o Acrobat imprime: "2026.08.04 13:55:12 -03'00'".
   *
   * O fuso é o de Brasília, e não o do servidor: o contêiner roda em UTC, e a
   * hora impressa no documento tem de ser a que o signatário reconhece.
   */
  private dataAcrobat(d: Date): string {
    const partes = new Intl.DateTimeFormat('sv-SE', {
      timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(d).split(' ')
    const data = (partes[0] ?? '').replace(/-/g, '.')
    const hora = partes[1] ?? ''
    const offset = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, timeZoneName: 'longOffset' })
      .formatToParts(d).find((x) => x.type === 'timeZoneName')?.value ?? 'GMT-03:00'
    return `${data} ${hora} ${offset.replace('GMT', '').replace(':', "'")}'`
  }
}
