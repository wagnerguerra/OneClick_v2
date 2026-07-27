'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, Card } from '@saas/ui'
import { BarChart3, FileSpreadsheet, FileText, Printer, Loader2, AlertCircle, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { ORCAMENTO_STATUS_LABELS } from '@saas/types'
import { alerts } from '@/lib/alerts'
import {
  getCampos, DEFAULT_CAMPOS, brl, formatCampo, imprimir,
  type Resultado, type CampoDef, type Linha,
} from '../_components/relatorio-coluna-lib'
import { ServicoDetalheModal } from '../_components/servico-detalhe-modal'
import { getApiUrl } from '@/lib/api-url'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

function RelatorioInner() {
  const params = useSearchParams()
  const status = params.get('status') || ''
  const statusLabel = (ORCAMENTO_STATUS_LABELS as Record<string, string>)[status] || status
  const allCampos = getCampos(statusLabel)
  const camposKeys = (params.get('campos') || '').split(',').filter(Boolean)
  const camposSel: CampoDef[] = camposKeys.length
    ? (camposKeys.map(k => allCampos.find(c => c.key === k)).filter(Boolean) as CampoDef[])
    : allCampos.filter(c => DEFAULT_CAMPOS.includes(c.key))

  const [loading, setLoading] = useState(true)
  const [res, setRes] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // Drill-down: clicar numa linha de "Por área"/"Por tipo" filtra a lista abaixo.
  const [filtroArea, setFiltroArea] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null)
  // Serviço aberto para edição (clique no item da coluna Itens/serviços).
  const [servicoModalId, setServicoModalId] = useState<string | null>(null)

  const paramsStr = params.toString()
  useEffect(() => {
    if (!status) { setErro('Coluna não informada.'); setLoading(false); return }
    setFiltroArea(null); setFiltroTipo(null)
    document.title = `Relatório — ${statusLabel}`
    const input: Record<string, unknown> = { status }
    const de = params.get('de'); const ate = params.get('ate'); const tipo = params.get('tipo')
    const areas = (params.get('areas') || '').split(',').filter(Boolean)
    if (de) input.dataInicio = de
    if (ate) input.dataFim = ate
    if (tipo) input.tipo = tipo
    if (areas.length) input.areas = areas
    setLoading(true)
    ;(trpc.orcamento as unknown as { reportColuna: { query: (i: unknown) => Promise<Resultado> } })
      .reportColuna.query(input)
      .then(setRes)
      .catch(e => setErro((e as Error).message || 'Falha ao gerar o relatório.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsStr])

  // Lista exibida = linhas filtradas pelo drill-down (área E tipo, se ativos).
  const linhasView = (res?.linhas ?? []).filter(l => {
    const okArea = !filtroArea || (filtroArea === '(sem área)' ? l.areas.length === 0 : l.areas.includes(filtroArea))
    const okTipo = !filtroTipo || l.natureza === filtroTipo
    return okArea && okTipo
  })
  const filtrando = !!filtroArea || !!filtroTipo
  const toggleArea = (nome: string) => setFiltroArea(prev => (prev === nome ? null : nome))
  const toggleTipo = (nome: string) => setFiltroTipo(prev => (prev === nome ? null : nome))

  // Coluna "Itens/serviços": itens com servicoId viram link → abre o serviço.
  function renderItens(l: Linha) {
    if (!l.itens.length) return '—'
    return (
      <span>
        {l.itens.map((it, i) => (
          <span key={i}>
            {it.servicoId ? (
              <button type="button" onClick={() => setServicoModalId(it.servicoId)} className="text-sky-600 dark:text-sky-400 hover:underline" title="Editar serviço">{it.descricao}</button>
            ) : it.descricao}
            {i < l.itens.length - 1 ? '; ' : ''}
          </span>
        ))}
      </span>
    )
  }

  // Download server-side por navegação (Content-Disposition) — imune ao bloqueio
  // de download por JS do navegador. Same-origin: o cookie de sessão viaja junto.
  function downloadUrl(formato: 'xlsx' | 'csv' | 'pdf') {
    const p = new URLSearchParams()
    p.set('status', status)
    const de = params.get('de'); const ate = params.get('ate'); const tipo = params.get('tipo'); const areas = params.get('areas')
    if (de) p.set('de', de)
    if (ate) p.set('ate', ate)
    if (tipo) p.set('tipo', tipo)
    if (areas) p.set('areas', areas)
    p.set('campos', camposSel.map(c => c.key).join(','))
    p.set('formato', formato)
    return `${getApiUrl()}/api/orcamento-report/coluna?${p.toString()}`
  }
  function onImprimir() {
    if (!res) return
    if (!imprimir(res, camposSel, statusLabel)) alerts.warning('Bloqueado', 'Permita pop-ups para imprimir.')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1>Relatório — {statusLabel}</h1>
            <p className="text-sm text-muted-foreground">Orçamentos da coluna “{statusLabel}” do kanban.</p>
          </div>
        </div>
        {res && res.linhas.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={downloadUrl('xlsx')} download><FileSpreadsheet className="h-4 w-4" />Excel</a></Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={downloadUrl('csv')} download><FileText className="h-4 w-4" />CSV</a></Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={downloadUrl('pdf')} download><FileText className="h-4 w-4" />Baixar PDF</a></Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onImprimir}><Printer className="h-4 w-4" />Imprimir</Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Gerando relatório...</div>
      ) : erro ? (
        <Card className="p-6 flex items-center gap-3 text-destructive"><AlertCircle className="h-5 w-5" />{erro}</Card>
      ) : res ? (
        <div className="space-y-4">
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Orçamentos</p>
              <p className="text-2xl font-bold tabular-nums">{res.resumo.count}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor total</p>
              <p className="text-2xl font-bold tabular-nums">{brl(res.resumo.somaTotal)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ticket médio</p>
              <p className="text-2xl font-bold tabular-nums">{brl(res.resumo.ticketMedio)}</p>
            </Card>
          </div>

          {(res.resumo.porArea.length > 0 || res.resumo.porTipo.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {res.resumo.porArea.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="px-3 py-1.5 bg-muted/40 text-[11px] font-semibold">Por área <span className="font-normal text-muted-foreground">— clique para filtrar</span></div>
                  <div className="divide-y divide-border/60">
                    {res.resumo.porArea.map(a => {
                      const active = filtroArea === a.nome
                      return (
                        <button key={a.nome} type="button" onClick={() => toggleArea(a.nome)}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${active ? 'bg-[var(--mod-comercial,#fb7185)]/10 font-semibold' : 'hover:bg-muted/40'}`}>
                          <span className="truncate flex items-center gap-1.5">
                            {active && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: MODULE_COLOR }} />}
                            {a.nome}
                          </span>
                          <span className="text-muted-foreground shrink-0">{a.count} · {brl(a.soma)}</span>
                        </button>
                      )
                    })}
                  </div>
                </Card>
              )}
              {res.resumo.porTipo.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="px-3 py-1.5 bg-muted/40 text-[11px] font-semibold">Por tipo <span className="font-normal text-muted-foreground">— clique para filtrar</span></div>
                  <div className="divide-y divide-border/60">
                    {res.resumo.porTipo.map(t => {
                      const active = filtroTipo === t.nome
                      return (
                        <button key={t.nome} type="button" onClick={() => toggleTipo(t.nome)}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${active ? 'bg-[var(--mod-comercial,#fb7185)]/10 font-semibold' : 'hover:bg-muted/40'}`}>
                          <span className="truncate flex items-center gap-1.5">
                            {active && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: MODULE_COLOR }} />}
                            {t.nome}
                          </span>
                          <span className="text-muted-foreground shrink-0">{t.count} · {brl(t.soma)}</span>
                        </button>
                      )
                    })}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Lista */}
          <Card className="overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 text-[11px] font-semibold border-b border-border flex items-center justify-between gap-2 flex-wrap">
              <span>Orçamentos ({filtrando ? `${linhasView.length} de ${res.linhas.length}` : res.linhas.length})</span>
              {filtrando && (
                <div className="flex items-center gap-1.5">
                  {filtroArea && (
                    <button type="button" onClick={() => setFiltroArea(null)} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium hover:bg-muted/50">
                      Área: {filtroArea} <X className="h-3 w-3" />
                    </button>
                  )}
                  {filtroTipo && (
                    <button type="button" onClick={() => setFiltroTipo(null)} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium hover:bg-muted/50">
                      Tipo: {filtroTipo} <X className="h-3 w-3" />
                    </button>
                  )}
                  <button type="button" onClick={() => { setFiltroArea(null); setFiltroTipo(null) }} className="text-[10px] font-medium text-muted-foreground hover:text-foreground underline">limpar</button>
                </div>
              )}
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/20">
                  <tr>{camposSel.map(c => <th key={c.key} className="text-left font-semibold px-3 py-2 whitespace-nowrap border-b border-border uppercase tracking-wider">{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {linhasView.length === 0 ? (
                    <tr><td colSpan={camposSel.length} className="px-3 py-10 text-center text-muted-foreground">Nenhum orçamento {filtrando ? 'com o filtro selecionado' : 'nesta coluna com os filtros aplicados'}.</td></tr>
                  ) : linhasView.map(l => (
                    <tr key={l.id} className="hover:bg-muted/30">
                      {camposSel.map(c => c.key === 'itens'
                        ? <td key={c.key} className="px-3 py-1.5 whitespace-nowrap border-b border-border/50">{renderItens(l)}</td>
                        : <td key={c.key} className="px-3 py-1.5 whitespace-nowrap border-b border-border/50 max-w-[320px] truncate" title={formatCampo(l, c.key)}>{formatCampo(l, c.key)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {servicoModalId && (
        <ServicoDetalheModal servicoId={servicoModalId} open={!!servicoModalId} onClose={() => setServicoModalId(null)} />
      )}
    </div>
  )
}

export default function RelatorioColunaPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando...</div>}>
      <RelatorioInner />
    </Suspense>
  )
}
