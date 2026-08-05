import { Injectable } from '@nestjs/common'

/**
 * Divide um PDF — o caminho inverso do Juntar.
 *
 * São dois usos que a mesma tela atende, e vale saber que são diferentes:
 *   - **extrair**: as páginas escolhidas viram UM documento só (tirar o anexo
 *     de um processo, separar o contrato do aditivo);
 *   - **soltar**: cada página vira um arquivo (lote de guias, um por cliente).
 *
 * Quem decide quais páginas é a tela; aqui só se confere se elas existem. A
 * ordem escolhida é respeitada: extrair "3, 1" produz o documento com a 3
 * antes da 1, porque quem pediu nessa ordem tinha um motivo.
 */

export type ModoDivisao = 'extrair' | 'soltar'

export interface PdfPedaco {
  nome: string
  base64: string
  bytes: number
  paginas: number
}

export interface ResultadoDivisao {
  arquivos: PdfPedaco[]
  /** Total de páginas do documento original — a tela confere o que mostrou. */
  totalPaginas: number
  /** Todos os pedaços num zip, quando é mais de um. */
  zip?: { nome: string; base64: string; bytes: number }
}

/** Acima disso, baixar um a um vira trabalho manual — o zip passa a ser a saída. */
const MINIMO_PARA_ZIP = 2

@Injectable()
export class DividirPdfService {
  async dividir(input: {
    nome: string
    base64: string
    modo: ModoDivisao
    /** Páginas escolhidas, começando em 1. Só vale no modo "extrair". */
    paginas?: number[]
  }): Promise<ResultadoDivisao> {
    // Importação tardia: o pdf-lib só é carregado por quem usa a ferramenta.
    const { PDFDocument } = await import('pdf-lib')

    let origem
    try {
      // `ignoreEncryption` cobre o PDF com dono definido mas sem senha de
      // abertura — o de órgão público costuma vir assim.
      origem = await PDFDocument.load(Buffer.from(input.base64, 'base64'), { ignoreEncryption: true })
    } catch {
      throw new Error(`Não foi possível ler "${input.nome}". O arquivo pode estar corrompido ou protegido por senha.`)
    }

    const totalPaginas = origem.getPageCount()
    const base = input.nome.replace(/\.pdf$/i, '')

    const arquivos = input.modo === 'extrair'
      ? [await this.extrair(origem, input.paginas ?? [], totalPaginas, base)]
      : await this.soltar(origem, totalPaginas, base)

    return {
      arquivos,
      totalPaginas,
      zip: arquivos.length >= MINIMO_PARA_ZIP ? await this.empacotar(arquivos, base) : undefined,
    }
  }

  /** As páginas escolhidas, na ordem escolhida, num documento só. */
  private async extrair(
    origem: Awaited<ReturnType<typeof import('pdf-lib').PDFDocument.load>>,
    paginas: number[],
    total: number,
    base: string,
  ): Promise<PdfPedaco> {
    if (paginas.length === 0) throw new Error('Escolha ao menos uma página.')

    const fora = paginas.filter((p) => p < 1 || p > total)
    if (fora.length > 0) {
      throw new Error(`O documento tem ${total} página(s) — não existe a página ${fora[0]}.`)
    }

    const { PDFDocument } = await import('pdf-lib')
    const saida = await PDFDocument.create()
    const copiadas = await saida.copyPages(origem, paginas.map((p) => p - 1))
    for (const p of copiadas) saida.addPage(p)

    // O nome carrega quais páginas são, para o arquivo se explicar sozinho na
    // pasta de downloads: "contrato_p3-5.pdf" diz mais que "contrato (1).pdf".
    const sufixo = paginas.length === 1 ? `p${paginas[0]}` : `p${this.resumirFaixas(paginas)}`
    return this.finalizar(saida, `${base}_${sufixo}.pdf`)
  }

  /** Cada página do documento vira um arquivo. */
  private async soltar(
    origem: Awaited<ReturnType<typeof import('pdf-lib').PDFDocument.load>>,
    total: number,
    base: string,
  ): Promise<PdfPedaco[]> {
    const { PDFDocument } = await import('pdf-lib')
    const pedacos: PdfPedaco[] = []

    // Zeros à esquerda para os arquivos ficarem em ordem no explorador — sem
    // isso, "10" aparece antes de "2".
    const casas = String(total).length

    for (let i = 0; i < total; i++) {
      const saida = await PDFDocument.create()
      const [pagina] = await saida.copyPages(origem, [i])
      saida.addPage(pagina!)
      pedacos.push(await this.finalizar(saida, `${base}_${String(i + 1).padStart(casas, '0')}.pdf`))
    }

    return pedacos
  }

  private async finalizar(
    doc: Awaited<ReturnType<typeof import('pdf-lib').PDFDocument.create>>,
    nome: string,
  ): Promise<PdfPedaco> {
    const bytes = await doc.save()
    return {
      nome,
      base64: Buffer.from(bytes).toString('base64'),
      bytes: bytes.length,
      paginas: doc.getPageCount(),
    }
  }

  /**
   * "1,2,3,7" vira "1-3+7".
   *
   * O nome do arquivo precisa caber na tela, e um documento de cinquenta
   * páginas produziria um nome ilegível se listasse uma a uma.
   */
  private resumirFaixas(paginas: number[]): string {
    const ordenadas = [...new Set(paginas)].sort((a, b) => a - b)
    const faixas: string[] = []
    let inicio = ordenadas[0]!
    let anterior = inicio

    for (const p of ordenadas.slice(1)) {
      if (p === anterior + 1) { anterior = p; continue }
      faixas.push(inicio === anterior ? `${inicio}` : `${inicio}-${anterior}`)
      inicio = p
      anterior = p
    }
    faixas.push(inicio === anterior ? `${inicio}` : `${inicio}-${anterior}`)

    return faixas.join('+')
  }

  /**
   * Junta os pedaços num zip.
   *
   * Sem compressão: PDF já é comprimido, e insistir gastaria tempo de servidor
   * para não economizar nada. O zip aqui é embalagem, não compactação.
   */
  private async empacotar(arquivos: PdfPedaco[], base: string) {
    const AdmZip = (await import('adm-zip')).default
    const zip = new AdmZip()
    for (const a of arquivos) zip.addFile(a.nome, Buffer.from(a.base64, 'base64'))
    const bytes = zip.toBuffer()

    return { nome: `${base}_dividido.zip`, base64: bytes.toString('base64'), bytes: bytes.length }
  }
}
