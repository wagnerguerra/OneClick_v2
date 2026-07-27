// Tipos + helpers compartilhados do "Relatório da coluna" (modal de config e
// página de resultados). Export em Excel/CSV/PDF + impressão.

import * as XLSX from 'xlsx'
import { renderPdf } from '../../ferramentas/fiscal/nfse-pdf/_lib/pdf'

export interface Linha {
  id: string
  numero: number
  cliente: string
  valorTotal: number
  natureza: string
  areas: string[]
  solicitante: string
  responsavel: string
  createdAt: string
  dataStatus: string | null
  validadeDias: number
  itens: string[]
  descontoAplicado: number
  formaPagamento: string
  textoInterno: string
  textoCliente: string
}
export interface ResumoBucket { nome: string; count: number; soma: number }
export interface Resumo { count: number; somaTotal: number; ticketMedio: number; porArea: ResumoBucket[]; porTipo: ResumoBucket[] }
export interface Resultado { resumo: Resumo; linhas: Linha[] }
export interface CampoDef { key: string; label: string }

export function getCampos(statusLabel: string): CampoDef[] {
  return [
    { key: 'numero', label: 'Número' },
    { key: 'cliente', label: 'Cliente' },
    { key: 'valorTotal', label: 'Valor total' },
    { key: 'natureza', label: 'Tipo (Extra/Mensal)' },
    { key: 'areas', label: 'Área(s)' },
    { key: 'solicitante', label: 'Solicitante' },
    { key: 'responsavel', label: 'Responsável' },
    { key: 'createdAt', label: 'Criado em' },
    { key: 'dataStatus', label: `Data na etapa (${statusLabel})` },
    { key: 'validadeDias', label: 'Validade (dias)' },
    { key: 'itens', label: 'Itens/serviços' },
    { key: 'descontoAplicado', label: 'Desconto' },
    { key: 'formaPagamento', label: 'Forma de pagamento' },
    { key: 'textoInterno', label: 'Texto Interno' },
    { key: 'textoCliente', label: 'Texto para o Cliente' },
  ]
}
export const DEFAULT_CAMPOS = ['numero', 'cliente', 'valorTotal', 'natureza', 'areas', 'responsavel', 'createdAt']

export const brl = (n: number) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const dt = (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—')

export function formatCampo(l: Linha, key: string): string {
  switch (key) {
    case 'numero': return `#${l.numero}`
    case 'valorTotal': return brl(l.valorTotal)
    case 'descontoAplicado': return brl(l.descontoAplicado)
    case 'createdAt': return dt(l.createdAt)
    case 'dataStatus': return dt(l.dataStatus)
    case 'areas': return l.areas.length ? l.areas.join(', ') : '—'
    case 'itens': return l.itens.length ? l.itens.join('; ') : '—'
    case 'validadeDias': return l.validadeDias != null ? String(l.validadeDias) : '—'
    default: {
      const v = (l as unknown as Record<string, unknown>)[key]
      return v == null || v === '' ? '—' : String(v)
    }
  }
}

export function tabela(linhas: Linha[], campos: CampoDef[]): { headers: string[]; rows: string[][] } {
  const headers = campos.map(c => c.label)
  const rows = linhas.map(l => campos.map(c => formatCampo(l, c.key)))
  return { headers, rows }
}

function baixarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportExcel(res: Resultado, campos: CampoDef[], statusLabel: string, nomeArquivo: string) {
  const { resumo } = res
  const aoa: (string | number)[][] = []
  aoa.push([`Relatório — ${statusLabel}`])
  aoa.push([`Gerado em ${new Date().toLocaleString('pt-BR')}`])
  aoa.push([])
  aoa.push(['RESUMO'])
  aoa.push(['Total de orçamentos', resumo.count])
  aoa.push(['Valor total', resumo.somaTotal])
  aoa.push(['Ticket médio', resumo.ticketMedio])
  aoa.push([])
  aoa.push(['Por área', 'Qtd', 'Valor'])
  resumo.porArea.forEach(a => aoa.push([a.nome, a.count, a.soma]))
  aoa.push([])
  aoa.push(['Por tipo', 'Qtd', 'Valor'])
  resumo.porTipo.forEach(t => aoa.push([t.nome, t.count, t.soma]))
  aoa.push([])
  const { headers, rows } = tabela(res.linhas, campos)
  aoa.push(headers)
  rows.forEach(r => aoa.push(r))
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório')
  XLSX.writeFile(wb, `${nomeArquivo}.xlsx`)
}

export function exportCsv(res: Resultado, campos: CampoDef[], statusLabel: string, nomeArquivo: string) {
  const { resumo } = res
  const esc = (v: string | number) => {
    const s = String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines: string[] = []
  lines.push(esc(`Relatório — ${statusLabel}`))
  lines.push(esc(`Gerado em ${new Date().toLocaleString('pt-BR')}`))
  lines.push('')
  lines.push('RESUMO')
  lines.push(`${esc('Total de orçamentos')};${resumo.count}`)
  lines.push(`${esc('Valor total')};${resumo.somaTotal}`)
  lines.push(`${esc('Ticket médio')};${resumo.ticketMedio}`)
  lines.push('')
  lines.push('Por área;Qtd;Valor')
  resumo.porArea.forEach(a => lines.push(`${esc(a.nome)};${a.count};${a.soma}`))
  lines.push('')
  lines.push('Por tipo;Qtd;Valor')
  resumo.porTipo.forEach(t => lines.push(`${esc(t.nome)};${t.count};${t.soma}`))
  lines.push('')
  const { headers, rows } = tabela(res.linhas, campos)
  lines.push(headers.map(esc).join(';'))
  rows.forEach(r => lines.push(r.map(esc).join(';')))
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  baixarBlob(blob, `${nomeArquivo}.csv`)
}

export async function exportPdf(res: Resultado, campos: CampoDef[], statusLabel: string, moduleColor: string, nomeArquivo: string) {
  const { resumo } = res
  const { headers, rows } = tabela(res.linhas, campos)
  const rgb = moduleColor.match(/#([0-9a-fA-F]{6})/)?.[0] ?? '#fb7185'
  const doc = {
    pageSize: 'A4',
    pageOrientation: headers.length > 6 ? 'landscape' : 'portrait',
    pageMargins: [24, 28, 24, 28],
    defaultStyle: { fontSize: 8 },
    content: [
      { text: `Relatório — ${statusLabel}`, fontSize: 15, bold: true, color: rgb },
      { text: `Gerado em ${new Date().toLocaleString('pt-BR')}`, fontSize: 8, color: '#888', margin: [0, 2, 0, 8] },
      {
        columns: [
          { text: [{ text: 'Total de orçamentos\n', color: '#888', fontSize: 7 }, { text: String(resumo.count), bold: true, fontSize: 13 }] },
          { text: [{ text: 'Valor total\n', color: '#888', fontSize: 7 }, { text: brl(resumo.somaTotal), bold: true, fontSize: 13 }] },
          { text: [{ text: 'Ticket médio\n', color: '#888', fontSize: 7 }, { text: brl(resumo.ticketMedio), bold: true, fontSize: 13 }] },
        ],
        margin: [0, 0, 0, 10],
      },
      resumo.porArea.length ? { text: 'Por área', bold: true, fontSize: 9, margin: [0, 4, 0, 3] } : {},
      resumo.porArea.length ? {
        table: { widths: ['*', 40, 80], body: [
          [{ text: 'Área', bold: true }, { text: 'Qtd', bold: true }, { text: 'Valor', bold: true }],
          ...resumo.porArea.map(a => [a.nome, String(a.count), brl(a.soma)]),
        ] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8],
      } : {},
      resumo.porTipo.length ? { text: 'Por tipo', bold: true, fontSize: 9, margin: [0, 4, 0, 3] } : {},
      resumo.porTipo.length ? {
        table: { widths: ['*', 40, 80], body: [
          [{ text: 'Tipo', bold: true }, { text: 'Qtd', bold: true }, { text: 'Valor', bold: true }],
          ...resumo.porTipo.map(t => [t.nome, String(t.count), brl(t.soma)]),
        ] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 10],
      } : {},
      { text: `Orçamentos (${rows.length})`, bold: true, fontSize: 9, margin: [0, 4, 0, 3] },
      {
        table: {
          headerRows: 1,
          widths: headers.map(() => 'auto'),
          body: [
            headers.map(h => ({ text: h, bold: true, fillColor: '#f1f5f9', fontSize: 7 })),
            ...rows.map(r => r.map(c => ({ text: c, fontSize: 7 }))),
          ],
        },
        layout: 'lightHorizontalLines',
      },
    ],
  }
  const blob = await renderPdf(doc)
  baixarBlob(blob, `${nomeArquivo}.pdf`)
}

export function imprimir(res: Resultado, campos: CampoDef[], statusLabel: string) {
  const { resumo } = res
  const { headers, rows } = tabela(res.linhas, campos)
  const w = window.open('', '_blank', 'width=1000,height=800')
  if (!w) return false
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório — ${esc(statusLabel)}</title>
    <style>
      *{box-sizing:border-box} body{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#111;margin:24px;font-size:12px}
      h1{font-size:18px;margin:0} .sub{color:#888;font-size:11px;margin:2px 0 14px}
      .cards{display:flex;gap:24px;margin-bottom:14px} .card .lbl{color:#888;font-size:10px} .card .val{font-size:18px;font-weight:700}
      h2{font-size:13px;margin:12px 0 4px} table{border-collapse:collapse;width:100%;margin-bottom:12px}
      th,td{border-bottom:1px solid #e5e7eb;padding:4px 6px;text-align:left;font-size:10px} th{background:#f1f5f9}
      @media print{body{margin:8mm}}
    </style></head><body>
    <h1>Relatório — ${esc(statusLabel)}</h1>
    <div class="sub">Gerado em ${esc(new Date().toLocaleString('pt-BR'))}</div>
    <div class="cards">
      <div class="card"><div class="lbl">Total de orçamentos</div><div class="val">${resumo.count}</div></div>
      <div class="card"><div class="lbl">Valor total</div><div class="val">${esc(brl(resumo.somaTotal))}</div></div>
      <div class="card"><div class="lbl">Ticket médio</div><div class="val">${esc(brl(resumo.ticketMedio))}</div></div>
    </div>
    ${resumo.porArea.length ? `<h2>Por área</h2><table><tr><th>Área</th><th>Qtd</th><th>Valor</th></tr>${resumo.porArea.map(a => `<tr><td>${esc(a.nome)}</td><td>${a.count}</td><td>${esc(brl(a.soma))}</td></tr>`).join('')}</table>` : ''}
    ${resumo.porTipo.length ? `<h2>Por tipo</h2><table><tr><th>Tipo</th><th>Qtd</th><th>Valor</th></tr>${resumo.porTipo.map(t => `<tr><td>${esc(t.nome)}</td><td>${t.count}</td><td>${esc(brl(t.soma))}</td></tr>`).join('')}</table>` : ''}
    <h2>Orçamentos (${rows.length})</h2>
    <table><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
    ${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
    </body></html>`
  w.document.write(html)
  w.document.close()
  return true
}
