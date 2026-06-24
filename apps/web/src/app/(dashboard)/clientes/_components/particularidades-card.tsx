'use client'

import { useState, useEffect, useCallback } from 'react'
import { StickyNote, Save, Loader2, User, Clock } from 'lucide-react'
import { Button, Card, RichEditor } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface ParticularidadeRow {
  clienteAreaContratadaId: string
  areaNome: string
  texto: string
  updatedByNome: string | null
  updatedAt: string | null
}

export function ParticularidadesCard({ clienteId }: { clienteId: string }) {
  const [rows, setRows] = useState<ParticularidadeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [dirty, setDirty] = useState<Set<string>>(new Set())

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
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSavingId(null) }
  }

  async function handleSaveAll() {
    for (const id of dirty) {
      await handleSave(id)
    }
    if (dirty.size > 0) await alerts.success('Salvo', 'Particularidades atualizadas.')
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

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-5 py-3">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-emerald-600" /> Particularidades por Area
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">Notas e observacoes especificas de cada area contratada.</p>
        </div>
        <Button variant="success" size="sm" onClick={handleSaveAll} disabled={dirty.size === 0 || savingId !== null} className="gap-1.5">
          {savingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/40">
        {rows.map(row => {
          const isDirty = dirty.has(row.clienteAreaContratadaId)
          const isSaving = savingId === row.clienteAreaContratadaId
          return (
            <div key={row.clienteAreaContratadaId} className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{row.areaNome}</span>
                  {isDirty && <span className="text-[10px] text-amber-600 font-medium">alterado</span>}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  {row.updatedByNome && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {row.updatedByNome}
                    </span>
                  )}
                  {row.updatedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {new Date(row.updatedAt).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                  <Button
                    variant="outline" size="sm"
                    onClick={() => handleSave(row.clienteAreaContratadaId)}
                    disabled={!isDirty || isSaving}
                    className="h-6 text-[10px] px-2"
                  >
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
              <RichEditor
                value={row.texto}
                onChange={html => updateTexto(row.clienteAreaContratadaId, html)}
                placeholder={`Particularidades da área ${row.areaNome}...`}
                maxHeight={260}
              />
            </div>
          )
        })}
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
