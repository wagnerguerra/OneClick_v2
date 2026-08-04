import { Injectable } from '@nestjs/common'

/**
 * Junta vários PDFs num só, na ordem recebida.
 *
 * A ordem é decidida pelo usuário na tela e chega pronta aqui — o servidor não
 * reordena nada, senão o resultado deixaria de corresponder ao que ele montou.
 */

export interface PdfEntrada {
  nome: string
  /** Conteúdo do arquivo em base64. */
  base64: string
}

export interface PdfJuntado {
  nome: string
  base64: string
  bytes: number
  paginas: number
}

@Injectable()
export class JuntarPdfService {
  async juntar(arquivos: PdfEntrada[], nomeSaida: string): Promise<PdfJuntado> {
    // Importação tardia: o pdf-lib só é carregado por quem usa a ferramenta.
    const { PDFDocument } = await import('pdf-lib')

    const saida = await PDFDocument.create()

    for (const a of arquivos) {
      let origem
      try {
        // `ignoreEncryption` cobre o caso comum de PDF com dono definido mas
        // sem senha de abertura — o de órgão público costuma vir assim, e
        // recusá-lo seria recusar metade do material do escritório.
        origem = await PDFDocument.load(Buffer.from(a.base64, 'base64'), { ignoreEncryption: true })
      } catch {
        // O nome do arquivo no erro é o que evita a caça ao culpado quando o
        // usuário juntou vinte de uma vez.
        throw new Error(`Não foi possível ler "${a.nome}". O arquivo pode estar corrompido ou protegido por senha.`)
      }

      const paginas = await saida.copyPages(origem, origem.getPageIndices())
      for (const p of paginas) saida.addPage(p)
    }

    const bytes = await saida.save()
    return {
      nome: nomeSaida.replace(/\.pdf$/i, '') + '.pdf',
      base64: Buffer.from(bytes).toString('base64'),
      bytes: bytes.length,
      paginas: saida.getPageCount(),
    }
  }
}
