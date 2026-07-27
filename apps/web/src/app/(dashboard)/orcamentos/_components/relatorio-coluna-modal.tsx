'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Button, Input, Label, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BarChart3, FileSpreadsheet, FileText, Printer, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import * as XLSX from 'xlsx'
import { renderPdf } from '../../ferramentas/fiscal/nfse-pdf/_lib/pdf'

interface Linha {
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
  observacoes: string
}
interface ResumoBucket { nome: string; count: number; soma: number }
interface Resumo { count: number; somaTotal: number; ticketMedio: number; porArea: ResumoBucket[]; porTipo: ResumoBucket[] }
interface Resultado { resumo: Resumo; linhas: Linha[] }

interface CampoDef { key: string; label: string }

const brl = (n: number) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dt = (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—')

function formatCampo(l: Linha, key: string): string {
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

interface Props {
  open: boolean
  onClose: () => void
  status: string
  statusLabel: string
  moduleColor: string
}

export function RelatorioColunaModal({ open, onClose, status, statusLabel, moduleColor }: Props) {
  const CAMPOS: CampoDef[] = [
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
    { key: 'observacoes', label: 'Observações' },
  ]
  const DEFAULT_CAMPOS = ['numero', 'cliente', 'valorTotal', 'natureza', 'areas', 'responsavel', 'createdAt']

  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [tipo, setTipo] = useState<'' | 'MENSAL' | 'EXTRA'>('')
  const [areasSel, setAreasSel] = useState<Set<string>>(new Set())
  const [campos, setCampos] = useState<Set<string>>(new Set(DEFAULT_CAMPOS))
  const [areaOptions, setAreaOptions] = useState<Array<{ areaId: string; nome: string }>>([])
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  // Reseta ao (re)abrir e carrega áreas selecionáveis.
  useEffect(() => {
    if (!open) return
    setResultado(null)
    setDataInicio(''); setDataFim(''); setTipo(''); setAreasSel(new Set()); setCampos(new Set(DEFAULT_CAMPOS))
    ;(trpc.orcamento as unknown as { listAreasSelecionaveis: { query: () => Promise<Array<{ areaId: string; nome: string }>> } })
      .listAreasSelecionaveis.query()
      .then(setAreaOptions)
      .catch(() => setAreaOptions([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const camposSelecionados = CAMPOS.filter(c => campos.has(c.key))

  const gerar = useCallback(async () => {
    setLoading(true)
    try {
      const input: Record<string, unknown> = { status }
      if (dataInicio) input.dataInicio = dataInicio
      if (dataFim) input.dataFim = dataFim
      if (tipo) input.tipo = tipo
      if (areasSel.size > 0) input.areas = [...areasSel]
      const res = await (trpc.orcamento as unknown as { reportColuna: { query: (i: unknown) => Promise<Resultado> } })
        .reportColuna.query(input)
      setResultado(res)
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível gerar o relatório.')
    } finally {
      setLoading(false)
    }
  }, [status, dataInicio, dataFim, tipo, areasSel])

  function toggleCampo(key: string) {
    setCampos(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  function toggleArea(id: string) {
    setAreasSel(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const nomeArquivo = `relatorio-${status.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`

  // ── Monta o corpo da tabela (headers + linhas) a partir dos campos escolhidos ──
  function tabela(): { headers: string[]; rows: string[][] } {
    const headers = camposSelecionados.map(c => c.label)
    const rows = (resultado?.linhas ?? []).map(l => camposSelecionados.map(c => formatCampo(l, c.key)))
    return { headers, rows }
  }

  // ── Excel (summary + tabela numa aba) ──
  function exportExcel() {
    if (!resultado) return
    const { resumo } = resultado
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
    const { headers, rows } = tabela()
    aoa.push(headers)
    rows.forEach(r => aoa.push(r))
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório')
    XLSX.writeFile(wb, `${nomeArquivo}.xlsx`)
  }

  // ── CSV (summary + tabela; separador ';' — padrão pt-BR) ──
  function exportCsv() {
    if (!resultado) return
    const { resumo } = resultado
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
    const { headers, rows } = tabela()
    lines.push(headers.map(esc).join(';'))
    rows.forEach(r => lines.push(r.map(esc).join(';')))
    // BOM p/ o Excel abrir acentos corretamente.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    baixarBlob(blob, `${nomeArquivo}.csv`)
  }

  // ── PDF (download direto via pdfmake) ──
  async function exportPdf() {
    if (!resultado) return
    try {
      const { resumo } = resultado
      const { headers, rows } = tabela()
      const rgb = moduleColor.includes('#') ? (moduleColor.match(/#([0-9a-fA-F]{6})/)?.[0] ?? '#fb7185') : '#fb7185'
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
    } catch (e) {
      alerts.error('Erro', 'Falha ao gerar o PDF. Tente "Imprimir" como alternativa.')
      console.warn('[relatorio-coluna] pdf error', (e as Error).message)
    }
  }

  // ── Imprimir (abre janela formatada → o usuário salva como PDF) ──
  function imprimir() {
    if (!resultado) return
    const { resumo } = resultado
    const { headers, rows } = tabela()
    const w = window.open('', '_blank', 'width=1000,height=800')
    if (!w) { alerts.warning('Bloqueado', 'Permita pop-ups para imprimir o relatório.'); return }
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
  }

  function baixarBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[920px] max-h-[90vh] overflow-y-auto">
        <DialogHeaderIcon icon={BarChart3} color="violet">
          <DialogTitle>Relatório — {statusLabel}</DialogTitle>
          <DialogDescription>Consulta apenas os orçamentos desta coluna. Configure os filtros e os campos e gere o resumo.</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-5">
          {/* Filtros */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Período — de</Label>
              <Input type="date" className="h-9 text-sm" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Período — até</Label>
              <Input type="date" className="h-9 text-sm" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Tipo de serviço</Label>
              <Select value={tipo || '__all__'} onValueChange={v => setTipo(v === '__all__' ? '' : v as 'MENSAL' | 'EXTRA')}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="MENSAL">Mensal</SelectItem>
                  <SelectItem value="EXTRA">Extra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Áreas selecionadas</Label>
              <div className="h-9 flex items-center text-xs text-muted-foreground">{areasSel.size === 0 ? 'Todas' : `${areasSel.size} selecionada(s)`}</div>
            </div>
          </div>

          {/* Área que solicitou (chips) */}
          {areaOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">Área que solicitou</Label>
              <div className="flex flex-wrap gap-1.5">
                {areaOptions.map(a => {
                  const active = areasSel.has(a.areaId)
                  return (
                    <button
                      key={a.areaId}
                      type="button"
                      onClick={() => toggleArea(a.areaId)}
                      className={cn('px-2.5 h-7 rounded-full text-xs font-medium border transition-colors',
                        active ? 'text-white border-transparent' : 'bg-card border-border text-muted-foreground hover:bg-muted/50')}
                      style={active ? { backgroundColor: moduleColor } : undefined}
                    >
                      {a.nome}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Campos a exibir */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">Campos do relatório</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 rounded-lg border border-border bg-muted/20 p-3">
              {CAMPOS.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded cursor-pointer" style={{ accentColor: moduleColor }}
                    checked={campos.has(c.key)} onChange={() => toggleCampo(c.key)} />
                  <span className="truncate">{c.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Button size="sm" style={{ backgroundColor: moduleColor }} className="text-white gap-1.5" onClick={gerar} disabled={loading || camposSelecionados.length === 0}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              {resultado ? 'Atualizar relatório' : 'Gerar relatório'}
            </Button>
            {camposSelecionados.length === 0 && <span className="ml-2 text-xs text-destructive">Selecione ao menos um campo.</span>}
          </div>

          {/* Resultado */}
          {resultado && (
            <div className="space-y-4">
              {/* Resumo */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Orçamentos</p>
                  <p className="text-xl font-bold tabular-nums">{resultado.resumo.count}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor total</p>
                  <p className="text-xl font-bold tabular-nums">{brl(resultado.resumo.somaTotal)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ticket médio</p>
                  <p className="text-xl font-bold tabular-nums">{brl(resultado.resumo.ticketMedio)}</p>
                </div>
              </div>

              {(resultado.resumo.porArea.length > 0 || resultado.resumo.porTipo.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {resultado.resumo.porArea.length > 0 && (
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="px-3 py-1.5 bg-muted/40 text-[11px] font-semibold">Por área</div>
                      <div className="divide-y divide-border/60">
                        {resultado.resumo.porArea.map(a => (
                          <div key={a.nome} className="flex items-center justify-between px-3 py-1.5 text-xs">
                            <span className="truncate">{a.nome}</span>
                            <span className="text-muted-foreground shrink-0">{a.count} · {brl(a.soma)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {resultado.resumo.porTipo.length > 0 && (
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="px-3 py-1.5 bg-muted/40 text-[11px] font-semibold">Por tipo</div>
                      <div className="divide-y divide-border/60">
                        {resultado.resumo.porTipo.map(t => (
                          <div key={t.nome} className="flex items-center justify-between px-3 py-1.5 text-xs">
                            <span className="truncate">{t.nome}</span>
                            <span className="text-muted-foreground shrink-0">{t.count} · {brl(t.soma)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Prévia da lista */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-1.5 bg-muted/40 text-[11px] font-semibold">Orçamentos ({resultado.linhas.length})</div>
                <div className="max-h-[280px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr>{camposSelecionados.map(c => <th key={c.key} className="text-left font-semibold px-3 py-2 whitespace-nowrap border-b border-border">{c.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {resultado.linhas.length === 0 ? (
                        <tr><td colSpan={camposSelecionados.length} className="px-3 py-6 text-center text-muted-foreground">Nenhum orçamento nesta coluna com os filtros aplicados.</td></tr>
                      ) : resultado.linhas.map(l => (
                        <tr key={l.id} className="hover:bg-muted/30">
                          {camposSelecionados.map(c => <td key={c.key} className="px-3 py-1.5 whitespace-nowrap border-b border-border/50 max-w-[240px] truncate" title={formatCampo(l, c.key)}>{formatCampo(l, c.key)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="flex-wrap gap-2">
          {resultado && (
            <div className="flex flex-wrap gap-2 mr-auto">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}><FileText className="h-4 w-4" />CSV</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportPdf}><FileText className="h-4 w-4" />Baixar PDF</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={imprimir}><Printer className="h-4 w-4" />Imprimir</Button>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
