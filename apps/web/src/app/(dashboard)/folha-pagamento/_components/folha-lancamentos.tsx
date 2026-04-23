'use client'

import { useState, useEffect } from 'react'
import { Loader2, Table2, Trash2 } from 'lucide-react'
import { Button, Input, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface Importacao { id: string; competencia: string; dataImportacao: string; status: string; totalLinhas: number; totalLancamentos: number; erros: unknown }
interface Lancamento { id: string; dataLancamento: string; contaDebito: number | null; contaCredito: number | null; valor: number; historico: string; tipo: string; codigoEvento: number; descricaoEvento: string; filial?: { codigoFilial: string } | null; setor?: { nome: string } | null }

export function FolhaLancamentosTab({ clienteId }: { clienteId: string }) {
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingLanc, setLoadingLanc] = useState(false)
  const [search, setSearch] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<'TODOS' | 'DEBITO' | 'CREDITO'>('TODOS')

  useEffect(() => {
    setLoading(true)
    trpc.folha.listarImportacoes.query({ clienteId })
      .then(r => { setImportacoes(r as Importacao[]); if ((r as any[]).length > 0) setSelectedId((r as any[])[0].id) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clienteId])

  useEffect(() => {
    if (!selectedId) { setLancamentos([]); return }
    setLoadingLanc(true)
    trpc.folha.listarLancamentos.query({ importacaoId: selectedId })
      .then(r => setLancamentos((r as any[]).map((l: any) => ({ ...l, valor: Number(l.valor) }))))
      .catch(() => setLancamentos([]))
      .finally(() => setLoadingLanc(false))
  }, [selectedId])

  async function handleExcluir(id: string) {
    const ok = await alerts.confirmDelete('esta importação e todos os seus lançamentos')
    if (!ok) return
    try {
      await trpc.folha.excluirImportacao.mutate({ id })
      setImportacoes(prev => prev.filter(i => i.id !== id))
      if (selectedId === id) { setSelectedId(''); setLancamentos([]) }
      alerts.success('Excluída', 'Importação removida')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const filtered = lancamentos.filter(l => {
    if (tipoFiltro !== 'TODOS' && l.tipo !== tipoFiltro) return false
    if (search) {
      const q = search.toLowerCase()
      return String(l.codigoEvento).includes(q) || l.descricaoEvento.toLowerCase().includes(q) || l.historico.toLowerCase().includes(q)
    }
    return true
  })

  const totalDebito = filtered.filter(l => l.tipo === 'DEBITO').reduce((s, l) => s + l.valor, 0)
  const totalCredito = filtered.filter(l => l.tipo === 'CREDITO').reduce((s, l) => s + l.valor, 0)

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      {/* Seletor de importação */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-[250px]">
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Importação</label>
          {importacoes.length === 0 ? (
            <p className="text-xs text-muted-foreground h-8 flex items-center">Nenhuma importação disponível</p>
          ) : (
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {importacoes.map(imp => (
                <option key={imp.id} value={imp.id}>{imp.competencia} — {imp.status} ({imp.totalLancamentos} lanç.)</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex-1 max-w-xs">
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Buscar</label>
          <Input placeholder="Código, descrição ou histórico..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Tipo</label>
          <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as any)} className="h-8 rounded border px-2 text-xs">
            <option value="TODOS">Todos</option>
            <option value="DEBITO">Débitos</option>
            <option value="CREDITO">Créditos</option>
          </select>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{filtered.length} lançamento(s)</span>
          {selectedId && (
            <Button size="sm" variant="outline" onClick={() => handleExcluir(selectedId)} className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50 h-7">
              <Trash2 className="h-3 w-3" />Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Totais */}
      {filtered.length > 0 && (
        <div className="flex gap-3">
          <div className="rounded border px-4 py-2 text-center flex-1 bg-emerald-50/30 border-emerald-200/50">
            <p className="text-[10px] text-muted-foreground uppercase">Total Débitos</p>
            <p className="text-sm font-bold tabular-nums text-emerald-700">{fmt(totalDebito)}</p>
          </div>
          <div className="rounded border px-4 py-2 text-center flex-1 bg-red-50/30 border-red-200/50">
            <p className="text-[10px] text-muted-foreground uppercase">Total Créditos</p>
            <p className="text-sm font-bold tabular-nums text-red-700">{fmt(totalCredito)}</p>
          </div>
        </div>
      )}

      {/* Tabela */}
      {loadingLanc ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          {selectedId ? 'Nenhum lançamento encontrado' : 'Selecione uma importação'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded border" style={{ maxHeight: '55vh' }}>
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/50">
              <tr className="border-b">
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground w-[60px]">Tipo</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground w-[70px]">Evento</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Descrição</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground w-[80px]">Débito</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground w-[80px]">Crédito</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase text-muted-foreground w-[110px]">Valor</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Histórico</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} className="border-b hover:bg-muted/10">
                  <td className="px-3 py-1.5 text-center">
                    <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold', l.tipo === 'DEBITO' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>{l.tipo === 'DEBITO' ? 'DÉB' : 'CRÉ'}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono font-semibold">{l.codigoEvento}</td>
                  <td className="px-3 py-1.5 truncate max-w-[200px]">{l.descricaoEvento}</td>
                  <td className="px-3 py-1.5 text-center font-mono text-muted-foreground">{l.contaDebito ?? '—'}</td>
                  <td className="px-3 py-1.5 text-center font-mono text-muted-foreground">{l.contaCredito ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmt(l.valor)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[250px]">{l.historico}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
