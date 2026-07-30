import { Injectable } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads')

export interface CotacaoPdfInput {
  cotacao: { code: number; titulo: string | null; observacoes: string | null; prazoResposta: Date | null }
  itens: Array<{ descricao: string; unidade: string | null; quantidade: number }>
  /** Quando informado, o PDF sai personalizado para aquele fornecedor. */
  fornecedor: { razaoSocial: string; contato: string | null } | null
  empresa: { razaoSocial: string; nomeFantasia: string | null; logoUrl: string | null } | null
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const dataBR = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : null

/**
 * PDF do pedido de cotação — o documento que vai ao fornecedor. Traz a lista de
 * itens com as colunas de preço **em branco**, para ele preencher e devolver.
 * Mesmo caminho do módulo de contratos: HTML → puppeteer.
 */
@Injectable()
export class CotacaoPdfService {
  async gerar(input: CotacaoPdfInput): Promise<Buffer> {
    const logo = await this.loadImageAsDataUri(input.empresa?.logoUrl)
    const html = this.buildHtml(input, logo)

    // Lazy import — puppeteer é pesado, só carrega quando é preciso.
    const puppeteer = await import('puppeteer')
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      return Buffer.from(await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '14mm', right: '12mm', bottom: '16mm', left: '12mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `<div style="width:100%;font-family:Arial,sans-serif;font-size:7.5pt;color:#6b7280;padding:0 12mm;display:flex;justify-content:space-between">
          <span>Pedido de cotação nº ${input.cotacao.code}</span>
          <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>`,
      }))
    } finally {
      await browser.close()
    }
  }

  private buildHtml(input: CotacaoPdfInput, logoDataUri: string | null): string {
    const { cotacao, itens, fornecedor, empresa } = input
    const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || ''
    const prazo = dataBR(cotacao.prazoResposta)

    const linhas = itens.map((i, idx) => `
      <tr>
        <td class="c-num">${idx + 1}</td>
        <td>${esc(i.descricao)}</td>
        <td class="c-un">${esc(i.unidade ?? '')}</td>
        <td class="c-qtd">${i.quantidade}</td>
        <td class="c-preencher"></td>
        <td class="c-preencher"></td>
      </tr>`).join('')

    return `
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 10pt; }
  .topo { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
          border-bottom: 2px solid #d97706; padding-bottom: 10px; margin-bottom: 16px; }
  .topo img { max-height: 46px; max-width: 190px; object-fit: contain; }
  .topo .emp { font-size: 11pt; font-weight: bold; }
  .doc { text-align: right; }
  .doc .tit { font-size: 13pt; font-weight: bold; letter-spacing: -.3px; }
  .doc .num { font-size: 10pt; color: #6b7280; }

  .bloco { margin-bottom: 14px; }
  .bloco h2 { font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: #6b7280;
              margin: 0 0 5px; font-weight: bold; }
  .caixa { border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px 10px; }
  .caixa p { margin: 0 0 3px; }
  .destaque { background: #fffbeb; border-color: #fcd34d; }

  table { width: 100%; border-collapse: collapse; }
  thead th { background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 7px; font-size: 8.5pt;
             text-transform: uppercase; letter-spacing: .04em; text-align: left; }
  tbody td { border: 1px solid #d1d5db; padding: 6px 7px; vertical-align: top; }
  .c-num { width: 26px; text-align: center; color: #6b7280; }
  .c-un { width: 58px; }
  .c-qtd { width: 46px; text-align: right; }
  .c-preencher { width: 92px; background: #fffdf5; }
  tfoot td { border: 1px solid #d1d5db; padding: 7px; font-size: 9pt; }

  .condicoes { margin-top: 14px; }
  .linha-preencher { border-bottom: 1px solid #9ca3af; height: 15px; }
  .grid2 { display: flex; gap: 12px; }
  .grid2 > div { flex: 1; }
  .rodape-nota { margin-top: 16px; font-size: 8.5pt; color: #6b7280; line-height: 1.5; }
</style>

<div class="topo">
  <div>
    ${logoDataUri ? `<img src="${logoDataUri}" alt="${esc(empresaNome)}" />` : `<div class="emp">${esc(empresaNome)}</div>`}
  </div>
  <div class="doc">
    <div class="tit">PEDIDO DE COTAÇÃO</div>
    <div class="num">nº ${cotacao.code}</div>
  </div>
</div>

${fornecedor ? `
<div class="bloco">
  <h2>Fornecedor</h2>
  <div class="caixa">
    <p><strong>${esc(fornecedor.razaoSocial)}</strong></p>
    ${fornecedor.contato ? `<p>A/C: ${esc(fornecedor.contato)}</p>` : ''}
  </div>
</div>` : ''}

${cotacao.titulo || prazo ? `
<div class="bloco">
  <div class="caixa ${prazo ? 'destaque' : ''}">
    ${cotacao.titulo ? `<p><strong>${esc(cotacao.titulo)}</strong></p>` : ''}
    ${prazo ? `<p>Favor enviar a proposta até <strong>${prazo}</strong>.</p>` : ''}
  </div>
</div>` : ''}

<div class="bloco">
  <h2>Itens — preencher as duas últimas colunas</h2>
  <table>
    <thead>
      <tr>
        <th></th>
        <th>Descrição do item</th>
        <th>Unid.</th>
        <th style="text-align:right">Qtd.</th>
        <th>Preço unit.</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="text-align:right"><strong>Frete</strong></td>
        <td colspan="2" class="c-preencher"></td>
      </tr>
      <tr>
        <td colspan="4" style="text-align:right"><strong>Total da proposta</strong></td>
        <td colspan="2" class="c-preencher"></td>
      </tr>
    </tfoot>
  </table>
</div>

<div class="bloco condicoes">
  <h2>Condições comerciais</h2>
  <div class="caixa">
    <div class="grid2">
      <div><p>Prazo de entrega</p><div class="linha-preencher"></div></div>
      <div><p>Prazo de pagamento</p><div class="linha-preencher"></div></div>
    </div>
    <div class="grid2" style="margin-top:10px">
      <div><p>Forma de pagamento</p><div class="linha-preencher"></div></div>
      <div><p>Validade da proposta</p><div class="linha-preencher"></div></div>
    </div>
    <div style="margin-top:10px"><p>Observações</p><div class="linha-preencher"></div><div class="linha-preencher" style="margin-top:9px"></div></div>
  </div>
</div>

${cotacao.observacoes ? `
<div class="bloco">
  <h2>Observações do pedido</h2>
  <div class="caixa"><p>${esc(cotacao.observacoes).replace(/\n/g, '<br />')}</p></div>
</div>` : ''}

<p class="rodape-nota">
  Este documento é um <strong>pedido de cotação</strong> e não constitui compromisso de compra.
  A cotação de itens que não puderem ser atendidos pode ser deixada em branco — basta indicar
  &ldquo;não atendemos&rdquo; na linha correspondente.
</p>`
  }

  /**
   * Carrega a logo como data-URI. Aceita caminho relativo (asset do frontend),
   * `/api/upload/...` (filesystem da API) ou URL absoluta. Falha graciosa: sem
   * logo o PDF sai com o nome da empresa em texto.
   */
  private async loadImageAsDataUri(url: string | null | undefined): Promise<string | null> {
    if (!url) return null
    try {
      if (url.startsWith('/') && !url.startsWith('/api/')) {
        const safe = url.replace(/^\//, '').replace(/[^a-zA-Z0-9._/\-]/g, '')
        const webPublic = path.resolve(process.cwd(), '..', 'web', 'public', safe)
        try { return this.bufferToDataUri(await fs.readFile(webPublic), safe) } catch { /* segue */ }
      }
      const rel = url.match(/\/api\/upload\/([^/?#]+)$/)
      if (rel?.[1]) {
        const filename = rel[1].replace(/[^a-zA-Z0-9._-]/g, '')
        try { return this.bufferToDataUri(await fs.readFile(path.join(UPLOADS_DIR, filename)), filename) } catch { /* segue */ }
      }
      if (!/^https?:\/\//.test(url)) return null
      const res = await fetch(url)
      if (!res.ok) return null
      const buf = Buffer.from(await res.arrayBuffer())
      return `data:${res.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`
    } catch { return null }
  }

  private bufferToDataUri(buf: Buffer, filename: string): string {
    const ext = (filename.split('.').pop() || 'png').toLowerCase()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  }
}
