import { Injectable } from '@nestjs/common'

/**
 * Conversão de HTML em PDF — porte do aplicativo de mesa `D:\RELATORIOS\App`.
 *
 * O motor é o mesmo dos dois lados (Chrome sem interface), então o PDF sai
 * igual ao que a equipe já conhece. O que muda é a origem do arquivo: lá era
 * uma pasta do computador, aqui é o que o usuário envia pelo navegador.
 */

/**
 * CSS anexado a toda página antes de imprimir.
 *
 * Cada regra abaixo existe por causa de um sintoma real, e removê-la traz o
 * sintoma de volta — por isso o motivo fica junto da regra.
 */
const CSS_IMPRESSAO = `
/* 1. Animações de entrada.
   Os relatórios usam "animation: rise .5s ease-out both", que segura o
   elemento em opacity:0 até a animação rodar. O Chrome sem interface imprime
   antes disso e o bloco sai invisível — o sintoma clássico é um PDF quase em
   branco, onde só aparece o que NÃO tem animação. */
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
}

/* 2. Cores de fundo.
   Sem isto o Chrome descarta fundos e sombras ao imprimir, achatando os
   cartões contra o papel branco. */
html {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* 3. Quebra de página.
   Mantém cada bloco inteiro numa página só. Quando o bloco é maior que a
   página o Chrome ignora a regra e quebra assim mesmo, então isto é seguro
   mesmo em relatório longo. Os seletores cobrem as estruturas em uso. */
li, tr, figure, blockquote,
.card, .stat, .note, .atividade, .resumo,
main > section, main > article, .wrap > section {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* Título nunca fica órfão no rodapé, separado do conteúdo que ele abre. */
h1, h2, h3, .card-head, .linha-topo {
  break-after: avoid;
  page-break-after: avoid;
}
`

export interface ArquivoHtml {
  nome: string
  conteudo: string
}

export interface PdfGerado {
  nome: string
  base64: string
  bytes: number
}

@Injectable()
export class HtmlPdfService {
  /** Um PDF por arquivo enviado. */
  async converter(arquivos: ArquivoHtml[]): Promise<PdfGerado[]> {
    return this.comNavegador(async (imprimir) => {
      const saida: PdfGerado[] = []
      for (const a of arquivos) {
        const pdf = await imprimir(this.comCssDeImpressao(a.conteudo))
        saida.push({ nome: this.nomePdf(a.nome), base64: pdf.toString('base64'), bytes: pdf.length })
      }
      return saida
    })
  }

  /**
   * Vários relatórios num PDF só, sem depender de ferramenta de junção:
   * monta uma página única e imprime uma vez.
   *
   * Cada relatório entra num shadow root próprio. Isso resolve o conflito de
   * CSS — todos usam as mesmas classes (.card, .stat) e variáveis em :root — e,
   * ao contrário de <iframe>, o conteúdo continua participando da paginação,
   * então o "break-inside: avoid" segue valendo e os cartões não são cortados.
   */
  async consolidar(arquivos: ArquivoHtml[], nomeSaida: string): Promise<PdfGerado> {
    const html = this.montarConsolidado(arquivos)
    return this.comNavegador(async (imprimir) => {
      const pdf = await imprimir(html)
      return { nome: this.nomePdf(nomeSaida), base64: pdf.toString('base64'), bytes: pdf.length }
    })
  }

  private montarConsolidado(arquivos: ArquivoHtml[]): string {
    const partes: string[] = [
      '<meta charset="utf-8"><title>Consolidado</title>',
      '<style>html,body{margin:0;padding:0}.doc+.doc{break-before:page;page-break-before:always}</style>',
    ]

    // Todos os <template> primeiro e os <div class="doc"> depois. Intercalados,
    // o seletor ".doc + .doc" não casa — o irmão anterior seria o template — e a
    // quebra de página entre relatórios simplesmente não acontece.
    arquivos.forEach((a, i) => {
      partes.push(`<template id="t${i + 1}">`)
      partes.push(a.conteudo)
      partes.push(`<style>\n${CSS_IMPRESSAO}\n</style>`)
      partes.push('</template>')
    })
    arquivos.forEach((_, i) => partes.push(`<div class="doc" data-t="t${i + 1}"></div>`))

    // Dentro de um shadow root não existem :root nem body — o equivalente é :host.
    partes.push(`<script>
document.querySelectorAll('.doc').forEach(function (host) {
  var sh = host.attachShadow({ mode: 'open' });
  sh.appendChild(document.getElementById(host.dataset.t).content.cloneNode(true));
  sh.querySelectorAll('style').forEach(function (s) {
    s.textContent = s.textContent
      .replace(/:root/g, ':host')
      .replace(/(^|[}\\s;])body(\\s*[,{])/g, '$1:host$2')
      .replace(/(^|[}\\s;])html(\\s*[,{])/g, '$1:host$2');
  });
});
</script>`)
    return partes.join('\n')
  }

  private comCssDeImpressao(html: string): string {
    // Anexado ao FIM, como no aplicativo de mesa: assim vence o CSS do próprio
    // relatório sem precisar de !important em tudo.
    return `${html}\n<style>\n${CSS_IMPRESSAO}\n</style>\n`
  }

  private nomePdf(nome: string): string {
    return `${nome.replace(/\.(html?|htm)$/i, '')}.pdf`
  }

  /**
   * Abre o navegador uma vez e imprime tudo dentro dele.
   *
   * Subir um Chrome por arquivo custaria segundos a cada relatório; com dez
   * arquivos a diferença deixa de ser detalhe.
   */
  private async comNavegador<T>(trabalho: (imprimir: (html: string) => Promise<Buffer>) => Promise<T>): Promise<T> {
    // Importação tardia — o puppeteer é pesado e só carrega quando é preciso.
    const puppeteer = await import('puppeteer')
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    try {
      const imprimir = async (html: string): Promise<Buffer> => {
        const page = await browser.newPage()
        try {
          // `load` e não `networkidle0`: o HTML chega inteiro, sem buscar nada
          // de fora, e esperar rede ociosa só somaria espera inútil.
          await page.setContent(html, { waitUntil: 'load' })
          return Buffer.from(await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', right: '8mm', bottom: '12mm', left: '8mm' },
          }))
        } finally {
          await page.close()
        }
      }
      return await trabalho(imprimir)
    } finally {
      await browser.close()
    }
  }
}
