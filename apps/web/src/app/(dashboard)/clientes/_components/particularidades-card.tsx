'use client'

import { useState, useEffect, useCallback } from 'react'
import { StickyNote, Save, Loader2, User, Clock, Lock } from 'lucide-react'
import { Button, Card, RichEditor, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'

interface ParticularidadeRow {
  clienteAreaContratadaId: string
  areaNome: string
  texto: string
  updatedByNome: string | null
  updatedAt: string | null
  canEdit: boolean
}

export function ParticularidadesCard({ clienteId }: { clienteId: string }) {
  const [rows, setRows] = useState<ParticularidadeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (trpc.cliente as any).particularidadesListar.query({ clienteId })
      setRows(result)
      setDirty(new Set())
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [clienteId])

  useEffect(() => { fetchData() }, [fetchData])

  // Mantém uma área selecionada válida após cada carregamento.
  useEffect(() => {
    const first = rows[0]
    if (!first) { setActiveId(null); return }
    setActiveId(prev => (prev && rows.some(r => r.clienteAreaContratadaId === prev)) ? prev : first.clienteAreaContratadaId)
  }, [rows])

  function updateTexto(id: string, texto: string) {
    setRows(prev => prev.map(r => r.clienteAreaContratadaId === id ? { ...r, texto } : r))
    setDirty(prev => new Set(prev).add(id))
  }

  async function handleSave(id: string) {
    const row = rows.find(r => r.clienteAreaContratadaId === id)
    if (!row) return
    setSavingId(id)
    try {
      await (trpc.cliente as any).particularidadesSalvar.mutate({
        clienteAreaContratadaId: id,
        texto: row.texto,
      })
      setDirty(prev => { const n = new Set(prev); n.delete(id); return n })
      await fetchData()
      await alerts.success('Salvo', 'Particularidades atualizadas.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSavingId(null) }
  }

  if (loading) {
    return (
      <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando particularidades...
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Nenhuma area contratada encontrada.</p>
        <p className="text-xs mt-1">Contrate areas na aba Servicos primeiro.</p>
      </Card>
    )
  }

  const active = rows.find(r => r.clienteAreaContratadaId === activeId) ?? null
  const activeDirty = active ? dirty.has(active.clienteAreaContratadaId) : false
  const activeSaving = active ? savingId === active.clienteAreaContratadaId : false

  return (
    <Card>
      {/* Header */}
      <div className="border-b border-border/60 bg-muted/20 px-5 py-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-emerald-600" /> Particularidades por Area
        </h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">Notas e observacoes especificas de cada area contratada.</p>
      </div>

      <div className="flex min-h-[450px]">
        {/* Pills laterais */}
        <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 space-y-1">
          {rows.map(row => {
            const isActive = row.clienteAreaContratadaId === activeId
            const hasText = !!row.texto.trim()
            return (
              <button
                key={row.clienteAreaContratadaId}
                type="button"
                onClick={() => setActiveId(row.clienteAreaContratadaId)}
                className={cn(
                  'flex items-center gap-2 w-full rounded-md px-3 py-2 text-[11px] font-medium transition-colors text-left',
                  isActive ? 'text-white shadow-sm' : 'text-muted-foreground hover:bg-muted/60',
                )}
                style={isActive ? { backgroundColor: MODULE_COLOR } : undefined}
              >
                <span className="flex-1 truncate">{row.areaNome}</span>
                {!row.canEdit && <Lock className="h-3 w-3 shrink-0 opacity-70" />}
                {dirty.has(row.clienteAreaContratadaId)
                  ? <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', isActive ? 'bg-white' : 'bg-amber-500')} />
                  : hasText
                    ? <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: isActive ? '#fff' : MODULE_COLOR }} />
                    : <span className="h-1.5 w-1.5 shrink-0" />}
              </button>
            )
          })}
        </div>

        {/* Conteudo */}
        {active && (
          <div key={active.clienteAreaContratadaId} className="flex-1 min-w-0 flex flex-col" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
            <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <h4 className="text-[13px] font-semibold text-foreground truncate">{active.areaNome}</h4>
                {activeDirty && <span className="text-[10px] text-amber-600 font-medium shrink-0">alterado</span>}
                {!active.canEdit && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0" title="So o responsavel pela area, o gestor da area ou o master podem editar.">
                    <Lock className="h-3 w-3" /> somente leitura
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
                {active.updatedByNome && (
                  <span className="flex items-center gap-1"><User className="h-3 w-3" /> {active.updatedByNome}</span>
                )}
                {active.updatedAt && (
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(active.updatedAt).toLocaleDateString('pt-BR')}</span>
                )}
                {active.canEdit && (
                  <Button
                    variant="success" size="sm"
                    onClick={() => handleSave(active.clienteAreaContratadaId)}
                    disabled={!activeDirty || activeSaving}
                    className="gap-1.5 h-7"
                  >
                    {activeSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Salvar
                  </Button>
                )}
              </div>
            </div>

            <div className="p-5 flex-1">
              <RichEditor
                value={active.texto}
                onChange={html => updateTexto(active.clienteAreaContratadaId, html)}
                placeholder={`Particularidades da area ${active.areaNome}...`}
                maxHeight={380}
                readOnly={!active.canEdit}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/60 bg-muted/20 px-5 py-2.5">
        <p className="text-[11px] text-muted-foreground">
          {rows.filter(r => r.texto.trim()).length} de {rows.length} areas com particularidades preenchidas
        </p>
      </div>
    </Card>
  )
}
