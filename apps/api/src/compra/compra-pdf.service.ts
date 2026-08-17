import { Injectable } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads')

export interface CompraPdfInput {
  compra: {
    code: number
    status: string
    statusLabel: string
    formaPagamento: string | null
    prazoEntrega: string | null
    prazoPagamento: string | null
    frete: number | null
    observacoes: string | null
    dataSolicitacao: Date | null
    dataAprovacao: Date | null
    dataRecebimento: Date | null
    motivoReprovacao: string | null
    criadoEm: Date
  }
  itens: Array<{ descricao: string; unidade: string | null; quantidade: number; valorUnitario: number }>
  fornecedor: { razaoSocial: string; documento: string | null; contato: string | null } | null
  solicitante: string | null
  aprovador: string | null
  recebedor: string | null
  empresa: { razaoSocial: string; nomeFantasia: string | null; logoUrl: string | null } | null
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const dataBR = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : null

const brl = (v: number) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** CNPJ/CPF só com pontuação quando o tamanho bate — documento sujo sai como veio. */
function documentoBR(doc: string | null): string | null {
  if (!doc) return null
  const limpo = doc.replace(/[^\dA-Za-z]/g, '')
  if (limpo.length === 14) {
    return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12)}`
  }
  if (limpo.length === 11) {
    return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9)}`
  }
  return doc
}

/**
 * PDF do **pedido de compra** — o documento que se imprime, arquiva e envia ao
 * fornecedor depois de aprovado. Diferente do pedido de cotação (que sai com os
 * preços em branco para o fornecedor preencher): aqui os valores estão fechados.
 *
 * Mesmo caminho do resto da casa: HTML → puppeteer.
 */
@Injectable()
export class CompraPdfService {
  async gerar(input: CompraPdfInput): Promise<Buffer> {
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
          <span>Pedido de compra nº ${input.compra.code}</span>
          <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>`,
      }))
    } finally {
      await browser.close()
    }
  }

  private buildHtml(input: CompraPdfInput, logoDataUri: string | null): string {
    const { compra, itens, fornecedor, empresa } = input
    const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || ''

    const totalItens = itens.reduce((s, i) => s + i.valorUnitario * i.quantidade, 0)
    const frete = Number(compra.frete ?? 0)
    const total = totalItens + frete

    const linhas = itens.length
      ? itens.map((i, idx) => `
      <tr>
        <td class="c-num">${idx + 1}</td>
        <td>${esc(i.descricao)}</td>
        <td class="c-un">${esc(i.unidade ?? '')}</td>
        <td class="c-qtd">${i.quantidade}</td>
        <td class="c-val">${brl(i.valorUnitario)}</td>
        <td class="c-val">${brl(i.valorUnitario * i.quantidade)}</td>
      </tr>`).join('')
      : `<tr><td colspan="6" class="vazio">Nenhum item lançado neste pedido.</td></tr>`

    // Só entram as linhas que têm conteúdo — um quadro com três traços diz
    // menos do que um quadro menor e cheio.
    const condicoes = [
      ['Forma de pagamento', compra.formaPagamento],
      ['Prazo de pagamento', compra.prazoPagamento],
      ['Prazo de entrega', compra.prazoEntrega],
    ].filter(([, v]) => Boolean(v))

    const tramitacao = [
      ['Solicitado por', input.solicitante, dataBR(compra.dataSolicitacao)],
      ['Aprovado por', input.aprovador, dataBR(compra.dataAprovacao)],
      ['Recebido por', input.recebedor, dataBR(compra.dataRecebimento)],
    ].filter(([, quem]) => Boolean(quem))

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
  .doc .situacao { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 10px;
                   font-size: 8pt; font-weight: bold; text-transform: uppercase; letter-spacing: .04em;
                   background: #f3f4f6; color: #4b5563; border: 1px solid #d1d5db; }
  .doc .situacao.ok   { background: #ecfdf5; color: #047857; border-color: #6ee7b7; }
  .doc .situacao.ruim { background: #fef2f2; color: #b91c1c; border-color: #fca5a5; }

  .bloco { margin-bottom: 14px; }
  .bloco h2 { font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: #6b7280;
              margin: 0 0 5px; font-weight: bold; }
  .caixa { border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px 10px; }
  .caixa p { margin: 0 0 3px; }
  .caixa p:last-child { margin-bottom: 0; }
  .alerta { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }

  .colunas { display: flex; gap: 12px; }
  .colunas > div { flex: 1; }

  dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; }
  dt { color: #6b7280; }
  dd { margin: 0; }

  table { width: 100%; border-collapse: collapse; }
  thead th { background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 7px; font-size: 8.5pt;
             text-transform: uppercase; letter-spacing: .04em; text-align: left; }
  tbody td { border: 1px solid #d1d5db; padding: 6px 7px; vertical-align: top; }
  .c-num { width: 26px; text-align: center; color: #6b7280; }
  .c-un { width: 58px; }
  .c-qtd { width: 46px; text-align: right; }
  .c-val { width: 96px; text-align: right; white-space: nowrap; }
  .vazio { text-align: center; color: #6b7280; font-style: italic; }
  tfoot td { border: 1px solid #d1d5db; padding: 7px; font-size: 9.5pt; }
  tfoot .rot { text-align: right; }
  tfoot .grande { background: #fffbeb; font-size: 11pt; font-weight: bold; }

  .assinaturas { display: flex; gap: 26px; margin-top: 26px; }
  .assinaturas > div { flex: 1; text-align: center; }
  .assinaturas .linha { border-top: 1px solid #9ca3af; margin-bottom: 4px; }
  .assinaturas span { font-size: 8.5pt; color: #6b7280; }
</style>

<div class="topo">
  <div>
    ${logoDataUri ? `<img src="${logoDataUri}" alt="${esc(empresaNome)}" />` : `<div class="emp">${esc(empresaNome)}</div>`}
  </div>
  <div class="doc">
    <div class="tit">PEDIDO DE COMPRA</div>
    <div class="num">nº ${compra.code} &middot; ${dataBR(compra.criadoEm)}</div>
    <div class="situacao ${compra.status === 'APROVADO' || compra.status === 'RECEBIDO' || compra.status === 'AVALIADO' ? 'ok' : ''}${compra.status === 'REPROVADO' || compra.status === 'CANCELADO' ? 'ruim' : ''}">${esc(compra.statusLabel)}</div>
  </div>
</div>

<div class="bloco colunas">
  <div>
    <h2>Fornecedor</h2>
    <div class="caixa">
      ${fornecedor ? `
        <p><strong>${esc(fornecedor.razaoSocial)}</strong></p>
        ${documentoBR(fornecedor.documento) ? `<p>${esc(documentoBR(fornecedor.documento))}</p>` : ''}
        ${fornecedor.contato ? `<p>A/C: ${esc(fornecedor.contato)}</p>` : ''}
      ` : '<p>—</p>'}
    </div>
  </div>
  ${tramitacao.length ? `
  <div>
    <h2>Tramitação</h2>
    <div class="caixa">
      <dl>
        ${tramitacao.map(([rot, quem, quando]) =>
          `<dt>${rot}</dt><dd>${esc(quem)}${quando ? ` &middot; ${quando}` : ''}</dd>`).join('')}
      </dl>
    </div>
  </div>` : ''}
</div>

${condicoes.length ? `
<div class="bloco">
  <h2>Condições comerciais</h2>
  <div class="caixa">
    <dl>${condicoes.map(([rot, v]) => `<dt>${rot}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  </div>
</div>` : ''}

<div class="bloco">
  <h2>Itens</h2>
  <table>
    <thead>
      <tr>
        <th></th>
        <th>Descrição do item</th>
        <th>Unid.</th>
        <th style="text-align:right">Qtd.</th>
        <th style="text-align:right">Valor unit.</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
    <tfoot>
      ${frete > 0 ? `
      <tr>
        <td colspan="5" class="rot">Frete</td>
        <td class="c-val">${brl(frete)}</td>
      </tr>` : ''}
      <tr>
        <td colspan="5" class="rot grande">Total do pedido</td>
        <td class="c-val grande">${brl(total)}</td>
      </tr>
    </tfoot>
  </table>
</div>

${compra.motivoReprovacao ? `
<div class="bloco">
  <h2>Motivo da reprovação</h2>
  <div class="caixa alerta"><p>${esc(compra.motivoReprovacao).replace(/\n/g, '<br />')}</p></div>
</div>` : ''}

${compra.observacoes ? `
<div class="bloco">
  <h2>Observações</h2>
  <div class="caixa"><p>${esc(compra.observacoes).replace(/\n/g, '<br />')}</p></div>
</div>` : ''}

${compra.dataAprovacao ? '' : `
<div class="assinaturas">
  <div><div class="linha"></div><span>Solicitante</span></div>
  <div><div class="linha"></div><span>Aprovação</span></div>
</div>`}`
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
