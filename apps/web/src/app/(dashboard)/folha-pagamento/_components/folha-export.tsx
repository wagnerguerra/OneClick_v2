'use client'

import { useState, useEffect } from 'react'
import { Download, Loader2, FileText, Building2 } from 'lucide-react'
import { Button, Card } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Importacao { id: string; competencia: string; status: string; totalLancamentos: number }
interface Filial { id: string; codigoFilial: string; cnpj: string }

export function FolhaExportTab({ clienteId }: { clienteId: string }) {
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [filiais, setFiliais] = useState<Filial[]>([])
  const [selectedFilial, setSelectedFilial] = useState('TODAS')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    trpc.folha.listarImportacoes.query({ clienteId })
      .then(r => {
        const contabilizados = (r as Importacao[]).filter(i => i.status === 'contabilizado' || i.status === 'exportado')
        setImportacoes(contabilizados)
        if (contabilizados.length > 0) setSelectedId(contabilizados[0]!.id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clienteId])

  useEffect(() => {
    if (!selectedId) { setFiliais([]); return }
    trpc.folha.listarFiliaisImportacao.query({ importacaoId: selectedId })
      .then(r => { setFiliais(r as Filial[]); setSelectedFilial('TODAS') })
      .catch(() => {})
  }, [selectedId])

  async function downloadTxt(nomeArquivo: string, conteudo: string) {
    const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = nomeArquivo; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleExportar(tipo: 'DEBITO' | 'CREDITO') {
    if (!selectedId) return
    const filialId = selectedFilial !== 'TODAS' ? selectedFilial : undefined
    setExporting(tipo)
    try {
      const res = await trpc.folha.exportar.mutate({ importacaoId: selectedId, tipo, filialId }) as { nomeArquivo: string; conteudo: string; totalLinhas: number }
      downloadTxt(res.nomeArquivo, res.conteudo)
      alerts.success('Exportado', `${res.nomeArquivo} — ${res.totalLinhas} linhas`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setExporting(null) }
  }

  async function handleExportarTodasFiliais(tipo: 'DEBITO' | 'CREDITO') {
    if (!selectedId || filiais.length === 0) return
    setExporting(`ALL_${tipo}`)
    try {
      let total = 0
      for (const filial of filiais) {
        const res = await trpc.folha.exportar.mutate({ importacaoId: selectedId, tipo, filialId: filial.id }) as { nomeArquivo: string; conteudo: string; totalLinhas: number }
        downloadTxt(res.nomeArquivo, res.conteudo)
        total += res.totalLinhas
      }
      alerts.success('Exportado', `${filiais.length} arquivo(s) de ${tipo} — ${total} linhas total`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setExporting(null) }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  const selected = importacoes.find(i => i.id === selectedId)
  const filialLabel = selectedFilial === 'TODAS' ? 'Todas as filiais' : filiais.find(f => f.id === selectedFilial)?.codigoFilial ?? ''

  return (
    <div className="space-y-5">
      {/* Seletores */}
      <div className="flex gap-4">
        <div className="flex-1 max-w-xs">
          <label className="text-[11px] font-semibold uppercase text-muted-foreground mb-1 block">Importação</label>
          {importacoes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma importação contabilizada.</p>
          ) : (
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {importacoes.map(imp => (
                <option key={imp.id} value={imp.id}>{imp.competencia} — {imp.totalLancamentos} lçtos ({imp.status})</option>
              ))}
            </select>
          )}
        </div>

        {filiais.length > 0 && (
          <div className="flex-1 max-w-xs">
            <label className="text-[11px] font-semibold uppercase text-muted-foreground mb-1 block">Filial</label>
            <select value={selectedFilial} onChange={e => setSelectedFilial(e.target.value)} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option value="TODAS">Todas as filiais (consolidado)</option>
              {filiais.map(f => (
                <option key={f.id} value={f.id}>{f.codigoFilial} — {f.cnpj}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {selected && (
        <>
          {/* Cards de exportação individual */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-6 border border-border/50 text-center">
              <FileText className="h-10 w-10 mx-auto mb-3 text-emerald-500 opacity-60" />
              <h4 className="text-sm font-semibold mb-1">Arquivo de Débito</h4>
              <p className="text-[11px] text-muted-foreground mb-4">{filialLabel}</p>
              <Button onClick={() => handleExportar('DEBITO')} disabled={!!exporting} className="gap-1.5 text-xs" style={{ backgroundColor: '#10b981', color: '#fff' }}>
                {exporting === 'DEBITO' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Exportar Débito
              </Button>
            </Card>

            <Card className="p-6 border border-border/50 text-center">
              <FileText className="h-10 w-10 mx-auto mb-3 text-red-500 opacity-60" />
              <h4 className="text-sm font-semibold mb-1">Arquivo de Crédito</h4>
              <p className="text-[11px] text-muted-foreground mb-4">{filialLabel}</p>
              <Button onClick={() => handleExportar('CREDITO')} disabled={!!exporting} className="gap-1.5 text-xs" style={{ backgroundColor: '#ef4444', color: '#fff' }}>
                {exporting === 'CREDITO' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Exportar Crédito
              </Button>
            </Card>
          </div>

          {/* Exportar todas as filiais separadas */}
          {filiais.length > 1 && (
            <Card className="p-5 border border-violet-200/50 bg-violet-50/20">
              <div className="flex items-center gap-3 mb-3">
                <Building2 className="h-4 w-4 text-violet-500" />
                <h4 className="text-sm font-semibold">Exportar por filial</h4>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Gera um arquivo separado para cada filial ({filiais.map(f => f.codigoFilial).join(', ')}).
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleExportarTodasFiliais('DEBITO')} disabled={!!exporting} variant="outline" className="gap-1.5 text-xs">
                  {exporting === 'ALL_DEBITO' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Débito por filial
                </Button>
                <Button size="sm" onClick={() => handleExportarTodasFiliais('CREDITO')} disabled={!!exporting} variant="outline" className="gap-1.5 text-xs">
                  {exporting === 'ALL_CREDITO' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Crédito por filial
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Formato */}
      <Card className="p-4 border border-border/50 bg-muted/10">
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Formato do arquivo de saída</h4>
        <pre className="text-[10px] font-mono text-muted-foreground leading-relaxed">
{`LOTE,DATA,DEBITO,CREDITO,VALOR,COMPLEMENTO,HISTORICO,DOCUMENTO,CNPJ
00001,20260331,2950,,9777.60,,VR REF FOLHA DE PAGAMENTO MÊS 03/2026 ADM - MTZ,DCTO,
00002,20260331,,1287,50105.58,,VR REF FOLHA DE PAGAMENTO MÊS 03/2026 ADM - MTZ,DCTO,`}
        </pre>
      </Card>
    </div>
  )
}
