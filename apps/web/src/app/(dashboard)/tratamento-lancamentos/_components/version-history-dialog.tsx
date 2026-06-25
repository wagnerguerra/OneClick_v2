'use client'

import { useState, useEffect, useCallback } from 'react'
import { History, Loader2, RotateCcw, ArrowLeft, Check, Eye } from 'lucide-react'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Button, Badge, Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Avatar, AvatarImage, AvatarFallback,
} from '@saas/ui'
import { cn } from '@saas/ui'
import type { TreatmentDefinition } from '@saas/types'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { computeDiff } from './version-diff'
import { normalizeDefinition } from './treatment-definition'
import { VersionOverview } from './version-overview'

interface VersionRow {
  id: string
  versionNumber: number
  note: string | null
  authorId: string | null
  authorName: string | null
  authorImage: string | null
  createdAt: string | Date
  isCurrent: boolean
}

/** Sentinela de "sem comparação" no picker (Radix Select não aceita value vazio). */
const NONE = '__none__'

/** Iniciais para o fallback do avatar do autor. */
function initials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase() || '?'
}

interface Props {
  modelId: string
  modelNome: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Se pode restaurar versões (sub-permissão gerenciar_modelos). */
  canManage: boolean
  /** Chamado após restaurar uma versão — o editor recarrega o modelo. */
  onRestored: () => void
}

const dtf = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtDate = (d: string | Date) => { try { return dtf.format(new Date(d)) } catch { return '—' } }

export function VersionHistoryDialog({ modelId, modelNome, open, onOpenChange, canManage, onRestored }: Props) {
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [defs, setDefs] = useState<Record<string, TreatmentDefinition>>({})
  const [restoringId, setRestoringId] = useState<string | null>(null)
  // Versão sendo visualizada (null = modo lista) e versão de comparação ('' = nenhuma).
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [compareId, setCompareId] = useState('')

  // ---- Carrega a lista de versões ao abrir -------------------------------
  useEffect(() => {
    if (!open) return
    let active = true
    setLoadingList(true)
    setViewingId(null)
    setCompareId('')
    ;(async () => {
      try {
        const list = (await trpc.tratamentoLancamentos.getVersions.query({ id: modelId })) as VersionRow[]
        if (active) setVersions(list)
      } catch {
        if (active) alerts.error('Erro', 'Não foi possível carregar o histórico de versões.')
      } finally {
        if (active) setLoadingList(false)
      }
    })()
    return () => { active = false }
  }, [open, modelId])

  // ---- Busca (com cache) a definição completa de uma versão ---------------
  const ensureDef = useCallback(async (id: string) => {
    if (!id || defs[id]) return
    try {
      const v = await trpc.tratamentoLancamentos.getVersion.query({ versionId: id })
      // Normaliza: snapshots antigos podem não ter os arrays (mapa/palavraChave/
      // descricao) → o diff quebrava ao iterá-los.
      setDefs((d) => ({ ...d, [id]: normalizeDefinition(v.definition) }))
    } catch {
      // silencioso — a versão só não renderiza
    }
  }, [defs])

  // No modo visualização, garante a def da versão vista + a de comparação.
  useEffect(() => {
    if (!open || !viewingId) return
    void ensureDef(viewingId)
    if (compareId) void ensureDef(compareId)
  }, [open, viewingId, compareId, ensureDef])

  // ---- Derivados ----------------------------------------------------------
  const viewingVersion = viewingId ? versions.find((v) => v.id === viewingId) ?? null : null
  const viewingDef = viewingId ? defs[viewingId] : undefined
  const viewingIsCurrent = !!viewingVersion?.isCurrent
  const compareVersion = compareId ? versions.find((v) => v.id === compareId) ?? null : null
  const compareDef = compareId ? defs[compareId] : null
  const comparing = !!compareId

  const changes = viewingDef && compareDef ? computeDiff(compareDef, viewingDef) : []
  const totalChanges = changes.reduce((n, g) => n + g.changes.length, 0)
  const loadingView = !viewingDef || (comparing && !compareDef)

  // Cronologia do diff (sempre antigo → novo, independente de qual é a visualizada).
  const defIsNewer = !!viewingVersion && !!compareVersion && viewingVersion.versionNumber > compareVersion.versionNumber
  const olderVersion = compareVersion && viewingVersion
    ? (defIsNewer ? compareVersion : viewingVersion)
    : null
  const newerVersion = compareVersion && viewingVersion
    ? (defIsNewer ? viewingVersion : compareVersion)
    : null

  const verLabel = (v: VersionRow) => `v${v.versionNumber}${v.isCurrent ? ' (atual)' : ''} — ${fmtDate(v.createdAt)}`
  const verLabelShort = (v?: VersionRow | null) => (v ? `v${v.versionNumber}${v.isCurrent ? ' (atual)' : ''}` : '—')

  function openVersion(v: VersionRow) {
    setViewingId(v.id)
    setCompareId('')
  }

  async function handleRestore(v: VersionRow) {
    const ok = await alerts.confirm({
      title: `Restaurar a versão ${v.versionNumber}?`,
      text: 'Será criada uma nova versão a partir desta. As alterações não salvas no editor serão descartadas.',
      confirmText: 'Restaurar',
      icon: 'warning',
    })
    if (!ok) return
    setRestoringId(v.id)
    try {
      await trpc.tratamentoLancamentos.restoreVersion.mutate({ versionId: v.id })
      await alerts.success('Versão restaurada', `A versão ${v.versionNumber} virou a versão atual (nova versão gerada).`)
      onOpenChange(false)
      onRestored()
    } catch {
      alerts.error('Erro ao restaurar', 'Não foi possível restaurar esta versão.')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeaderIcon icon={History} color="violet">
          <DialogTitle>Histórico de versões do modelo</DialogTitle>
          <DialogDescription className="truncate">{modelNome}</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-4">
          {loadingList ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando histórico...
            </div>
          ) : versions.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma versão registrada.</p>
          ) : viewingVersion ? (
            /* ---- Modo VISUALIZAÇÃO (visão geral, com comparação opcional) ---- */
            <div className="space-y-4">
              {/* Banner da versão + picker de comparação */}
              <div className="space-y-3 rounded-[4px] border border-border/60 bg-muted/20 p-3">
                <div className={cn('flex items-start gap-2 text-xs',
                  viewingIsCurrent ? 'text-sky-700 dark:text-sky-300' : 'text-amber-700 dark:text-amber-300')}>
                  <Eye className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Visualizando a <strong>versão {viewingVersion.versionNumber}</strong>
                    {viewingIsCurrent ? ' (atual).' : ' (antiga — somente leitura).'}
                    {viewingVersion.authorName && <> Alterada por <strong>{viewingVersion.authorName}</strong>.</>}
                    {' '}{fmtDate(viewingVersion.createdAt)}.
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[11px] font-semibold text-muted-foreground">Comparar com</label>
                  <Select value={compareId || NONE} onValueChange={(v) => setCompareId(v === NONE ? '' : v)}>
                    <SelectTrigger className="h-8 w-[240px] text-xs bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Nenhuma (só visualizar)</SelectItem>
                      {versions.filter((v) => v.id !== viewingId).map((v) => (
                        <SelectItem key={v.id} value={v.id}>{verLabel(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {comparing && !loadingView && (
                    totalChanges === 0 ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> Sem diferenças
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        {totalChanges} diferença{totalChanges === 1 ? '' : 's'} de{' '}
                        <strong className="text-foreground">{verLabelShort(olderVersion)}</strong> para{' '}
                        <strong className="text-foreground">{verLabelShort(newerVersion)}</strong>
                      </span>
                    )
                  )}
                </div>
                {comparing && !loadingView && totalChanges > 0 && (
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-[2px] bg-emerald-400" /> adicionado</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-[2px] bg-rose-400" /> removido</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-[2px] bg-amber-400" /> alterado</span>
                  </div>
                )}
              </div>

              {loadingView ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando versão...
                </div>
              ) : (
                <VersionOverview
                  def={viewingDef!}
                  compareTo={compareDef}
                  compareLabel={verLabelShort(compareVersion)}
                  defIsNewer={defIsNewer}
                />
              )}
            </div>
          ) : (
            /* ---- Modo LISTA (primeira tela) ---- */
            <section className="space-y-2">
              <p className="text-[12px] text-muted-foreground">
                Clique em <strong>Visualizar</strong> para abrir a visão geral de uma versão e, opcionalmente, compará-la com outra.
              </p>
              <ul className="divide-y divide-border/50 rounded-[4px] border border-border/60">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 px-3 py-2">
                    <Badge variant={v.isCurrent ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                      v{v.versionNumber}{v.isCurrent ? ' · atual' : ''}
                    </Badge>
                    <Avatar className="h-6 w-6 shrink-0" title={v.authorName ?? 'Autor desconhecido'}>
                      {v.authorImage && <AvatarImage src={v.authorImage} alt={v.authorName ?? ''} />}
                      <AvatarFallback className="text-[9px]">{initials(v.authorName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-foreground">{v.note || <span className="italic text-muted-foreground">sem nota</span>}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {fmtDate(v.createdAt)}
                        {v.authorName && <> · por {v.authorName}</>}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => openVersion(v)}>
                      <Eye className="h-3.5 w-3.5" /> Visualizar
                    </Button>
                    {canManage && !v.isCurrent && (
                      <Button
                        variant="soft" size="sm" className="shrink-0"
                        disabled={restoringId !== null}
                        onClick={() => handleRestore(v)}
                      >
                        {restoringId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        Restaurar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </DialogBody>

        <DialogFooter>
          {viewingVersion ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setViewingId(null)}>
                <ArrowLeft className="h-4 w-4" /> Voltar à lista
              </Button>
              {canManage && !viewingIsCurrent && (
                <Button variant="soft" size="sm" disabled={restoringId !== null} onClick={() => handleRestore(viewingVersion)}>
                  {restoringId === viewingVersion.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Restaurar esta versão
                </Button>
              )}
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
