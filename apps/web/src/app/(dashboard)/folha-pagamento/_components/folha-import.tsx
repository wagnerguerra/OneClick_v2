'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, Loader2, FileText, Check, AlertTriangle, Trash2, Clock } from 'lucide-react'
import { Button, Input, Card, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Importacao {
  id: string; competencia: string; dataImportacao: string; arquivoOrigem: string | null
  status: string; totalLinhas: number; totalLancamentos: number; erros: unknown
}

export function FolhaImportTab({ clienteId }: { clienteId: string }) {
  const [competencia, setCompetencia] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [contabilizando, setContabilizando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Histórico persistido
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [loadingHist, setLoadingHist] = useState(true)

  // Resultado da última importação (transient)
  const [ultimoResultado, setUltimoResultado] = useState<{ importacaoId: string; secoes: number; totalLinhas: number; secoesDetalhes: Array<{ cnpj: string; setor: string; secao: string; eventos: number }> } | null>(null)
  const [contabResultado, setContabResultado] = useState<{ lancamentos: number; alertas: string[] } | null>(null)

  useEffect(() => { loadHistorico() }, [clienteId])

  async function loadHistorico() {
    setLoadingHist(true)
    try {
      const res = await trpc.folha.listarImportacoes.query({ clienteId })
      setImportacoes(res as Importacao[])
    } catch {} finally { setLoadingHist(false) }
  }

  async function handleImportar() {
    if (!arquivo || !competencia) { alerts.error('Erro', 'Selecione o arquivo e informe a competência (MM/AAAA)'); return }
    if (!/^\d{2}\/\d{4}$/.test(competencia)) { alerts.error('Erro', 'Competência deve estar no formato MM/AAAA'); return }

    setImporting(true)
    setUltimoResultado(null)
    setContabResultado(null)
    try {
      // Ler como Windows-1252 (ANSI) — encoding padrão do sistema de folha
      const buffer = await arquivo.arrayBuffer()
      const decoder = new TextDecoder('windows-1252')
      const conteudo = decoder.decode(buffer)
      const res = await trpc.folha.importar.mutate({ clienteId, competencia, conteudo, nomeArquivo: arquivo.name })
      setUltimoResultado(res as any)
      alerts.success('Importado', `${res.totalLinhas} eventos importados de ${res.secoes} seção(ões)`)
      loadHistorico()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setImporting(false) }
  }

  async function handleContabilizar(importacaoId: string) {
    setContabilizando(true)
    try {
      const res = await trpc.folha.contabilizar.mutate({ importacaoId })
      setContabResultado(res as any)
      const novosEventos = ((res as any).alertas as string[] ?? []).filter((a: string) => a.includes('adicionado à tabela'))
      const erros = ((res as any).alertas as string[] ?? []).filter((a: string) => !a.includes('adicionado à tabela'))
      if (novosEventos.length > 0 || erros.length > 0) {
        const msg = [`${(res as any).lancamentos} lançamentos`]
        if (novosEventos.length > 0) msg.push(`${novosEventos.length} evento(s) novo(s) adicionado(s) à tabela de-para`)
        if (erros.length > 0) msg.push(`${erros.length} erro(s)`)
        alerts.warning('Contabilizado', msg.join('. '))
      } else {
        alerts.success('Contabilizado', `${(res as any).lancamentos} lançamentos gerados!`)
      }
      loadHistorico()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setContabilizando(false) }
  }

  async function handleExcluir(id: string) {
    const ok = await alerts.confirmDelete('esta importação')
    if (!ok) return
    try {
      await trpc.folha.excluirImportacao.mutate({ id })
      setImportacoes(prev => prev.filter(i => i.id !== id))
      if (ultimoResultado?.importacaoId === id) { setUltimoResultado(null); setContabResultado(null) }
      alerts.success('Excluída', 'Importação removida')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const fmtData = (d: string) => {
    try { return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return d }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      importado: { label: 'Importado', cls: 'bg-violet-100 text-violet-700' },
      contabilizado: { label: 'Contabilizado', cls: 'bg-emerald-100 text-emerald-700' },
      exportado: { label: 'Exportado', cls: 'bg-violet-100 text-violet-700' },
    }
    const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
    return <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold', s.cls)}>{s.label}</span>
  }

  return (
    <div className="space-y-5">
      {/* Upload */}
      <Card className="p-5 border border-border/50">
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2"><Upload className="h-4 w-4 text-muted-foreground" />Nova Importação</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase text-muted-foreground">Competência</label>
            <Input value={competencia} onChange={e => {
              let v = e.target.value.replace(/\D/g, '').slice(0, 6)
              if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2)
              setCompetencia(v)
            }} placeholder="MM/AAAA" maxLength={7} className="h-9 text-xs" />
          </div>
          <div className="space-y-1.5 col-span-2">
            <label className="text-[11px] font-semibold uppercase text-muted-foreground">Arquivo TXT (Folha Analítica)</label>
            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept=".txt,.TXT" className="hidden" onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5 text-xs flex-1 justify-start h-9">
                <FileText className="h-3.5 w-3.5" />
                {arquivo ? arquivo.name : 'Selecionar arquivo...'}
              </Button>
              <Button size="sm" onClick={handleImportar} disabled={importing || !arquivo || !competencia} className="gap-1.5 h-9 text-xs" style={{ backgroundColor: '#8b5cf6', color: '#fff' }}>
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Importar
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Resultado da última importação */}
      {ultimoResultado && (
        <Card className="p-5 border border-emerald-200 bg-emerald-50/30">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-emerald-700"><Check className="h-4 w-4" />Importação Concluída</h4>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded border bg-white px-3 py-2 text-center"><p className="text-[10px] text-muted-foreground uppercase">Seções</p><p className="text-lg font-bold">{ultimoResultado.secoes}</p></div>
            <div className="rounded border bg-white px-3 py-2 text-center"><p className="text-[10px] text-muted-foreground uppercase">Eventos</p><p className="text-lg font-bold">{ultimoResultado.totalLinhas}</p></div>
            <div className="rounded border bg-white px-3 py-2 text-center"><p className="text-[10px] text-muted-foreground uppercase">Status</p><p className="text-sm font-semibold text-emerald-600">Importado</p></div>
          </div>
          <div className="overflow-x-auto rounded border bg-white">
            <table className="w-full text-xs">
              <thead><tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">CNPJ</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Setor</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Seção</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase text-muted-foreground">Eventos</th>
              </tr></thead>
              <tbody>
                {ultimoResultado.secoesDetalhes.map((s, i) => (
                  <tr key={i} className="border-b hover:bg-muted/10">
                    <td className="px-3 py-1.5 font-mono">{s.cnpj}</td>
                    <td className="px-3 py-1.5">{s.setor}</td>
                    <td className="px-3 py-1.5">{s.secao}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{s.eventos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button size="sm" onClick={() => handleContabilizar(ultimoResultado.importacaoId)} disabled={contabilizando} className="gap-1.5 text-xs" style={{ backgroundColor: '#8b5cf6', color: '#fff' }}>
              {contabilizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Contabilizar
            </Button>
            <p className="text-[11px] text-muted-foreground">Gerar lançamentos contábeis</p>
          </div>
        </Card>
      )}

      {/* Resultado da contabilização */}
      {contabResultado && (() => {
        const novos = contabResultado.alertas.filter(a => a.includes('adicionado à tabela'))
        const erros = contabResultado.alertas.filter(a => !a.includes('adicionado à tabela'))
        return (
          <Card className="p-5 border border-violet-200 bg-violet-50/30">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-violet-700"><Check className="h-4 w-4" />Contabilização Concluída — {contabResultado.lancamentos} lançamentos</h4>
            {novos.length > 0 && (
              <div className="rounded border border-violet-200 bg-violet-50 p-3 mb-2">
                <p className="text-xs font-semibold text-violet-700 mb-1 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{novos.length} evento(s) novo(s) adicionado(s) à tabela de-para</p>
                <p className="text-[10px] text-violet-600 mb-1">Configure as contas contábeis na aba Configuração para que esses eventos gerem lançamentos.</p>
                <ul className="text-[11px] text-violet-800 space-y-0.5 max-h-[150px] overflow-y-auto">
                  {novos.map((a, i) => <li key={i}>• {a}</li>)}
                </ul>
              </div>
            )}
            {erros.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-700 mb-1 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{erros.length} erro(s)</p>
                <ul className="text-[11px] text-amber-800 space-y-0.5 max-h-[150px] overflow-y-auto">
                  {erros.map((a, i) => <li key={i}>• {a}</li>)}
                </ul>
              </div>
            )}
          </Card>
        )
      })()}

      {/* Histórico de importações */}
      <Card className="border border-border/50">
        <div className="px-5 py-3 border-b border-border/60 bg-muted/20">
          <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />Histórico de Importações</h4>
        </div>
        <div className="p-4">
          {loadingHist ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : importacoes.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">Nenhuma importação realizada ainda.</p>
          ) : (
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Competência</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Data</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Arquivo</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground">Status</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase text-muted-foreground">Linhas</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase text-muted-foreground">Lançam.</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground w-[100px]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {importacoes.map(imp => (
                    <tr key={imp.id} className="border-b hover:bg-muted/10">
                      <td className="px-3 py-2 font-semibold">{imp.competencia}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtData(imp.dataImportacao)}</td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{imp.arquivoOrigem ?? '—'}</td>
                      <td className="px-3 py-2 text-center">{statusBadge(imp.status)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{imp.totalLinhas}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{imp.totalLancamentos}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleContabilizar(imp.id)} disabled={contabilizando} className="h-6 px-2 text-[10px] gap-1">
                            <Check className="h-3 w-3" />{imp.status === 'importado' ? 'Contabilizar' : 'Recontabilizar'}
                          </Button>
                          <button onClick={() => handleExcluir(imp.id)} className="rounded p-1 text-red-400 hover:text-red-600 hover:bg-red-50" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
