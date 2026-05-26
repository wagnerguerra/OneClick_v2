'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, Paperclip, Download, X, FileText, Image as ImageIcon,
  History, Plus, Flag, Calendar, AlertCircle, MessageSquare,
} from 'lucide-react'
import { Card } from '@saas/ui'
import { AnexosDropzone, type AnexoStaged } from '../../../helpdesk/_components/anexos-dropzone'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface AnexoSalvo {
  id: string
  nome: string
  url: string
  mimeType: string | null
  tamanho: number
  createdAt: string | Date
}

interface Evento {
  id: string
  tipo: string
  comentario: string | null
  campoAntes: string | null
  campoDepois: string | null
  createdAt: string | Date
  autor: { id: string; name: string; image: string | null } | null
}

interface Props {
  projetoId: string
  canWrite: boolean
}

export function ProjetoSidebar({ projetoId, canWrite }: Props) {
  const [anexos, setAnexos] = useState<AnexoSalvo[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loadingAnexos, setLoadingAnexos] = useState(true)
  const [loadingEventos, setLoadingEventos] = useState(true)
  const [staged, setStaged] = useState<AnexoStaged[]>([])
  const [salvandoAnexos, setSalvandoAnexos] = useState(false)

  const fetchAnexos = useCallback(async () => {
    setLoadingAnexos(true)
    try {
      const data = await trpc.projetos.listAnexosProjeto.query({ projetoId })
      setAnexos(data as unknown as AnexoSalvo[])
    } finally {
      setLoadingAnexos(false)
    }
  }, [projetoId])

  const fetchEventos = useCallback(async () => {
    setLoadingEventos(true)
    try {
      const data = await trpc.projetos.listEventosProjeto.query({ projetoId })
      setEventos(data as unknown as Evento[])
    } finally {
      setLoadingEventos(false)
    }
  }, [projetoId])

  useEffect(() => {
    fetchAnexos()
    fetchEventos()
  }, [fetchAnexos, fetchEventos])

  // Quando arquivos chegam a `ready`, salvamos no backend
  useEffect(() => {
    const novos = staged.filter((s) => s.status === 'ready')
    if (novos.length === 0) return
    void (async () => {
      setSalvandoAnexos(true)
      try {
        for (const a of novos) {
          await trpc.projetos.addAnexoProjeto.mutate({
            projetoId,
            nome: a.fileName,
            url: a.fileUrl,
            tamanho: a.tamanho,
            mimeType: a.mimeType ?? null,
          })
        }
        setStaged([])
        await fetchAnexos()
        await fetchEventos()
      } catch (e) {
        alerts.error('Erro ao salvar anexo: ' + (e as Error).message)
      } finally {
        setSalvandoAnexos(false)
      }
    })()
  }, [staged, projetoId, fetchAnexos, fetchEventos])

  async function handleRemove(id: string) {
    const ok = await alerts.confirm({
      title: 'Remover anexo?',
      text: 'O arquivo será desvinculado do projeto.',
      confirmText: 'Remover',
    })
    if (!ok) return
    try {
      await trpc.projetos.removerAnexoProjeto.mutate({ id })
      fetchAnexos()
      fetchEventos()
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    }
  }

  return (
    <aside className="space-y-4 min-w-0">
      {/* ─── Anexos ─────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> Anexos
          </h3>
          <span className="text-[11px] text-muted-foreground">{anexos.length}</span>
        </div>

        {canWrite && (
          <div className="px-3 py-3 border-b border-border bg-muted/30">
            <AnexosDropzone value={staged} onChange={setStaged} compact />
            {salvandoAnexos && (
              <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
              </p>
            )}
          </div>
        )}

        {loadingAnexos ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : anexos.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-muted-foreground italic">
            Nenhum anexo
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
            {anexos.map((a) => (
              <AnexoItem key={a.id} anexo={a} canDelete={canWrite} onRemove={() => handleRemove(a.id)} />
            ))}
          </div>
        )}
      </Card>

      {/* ─── Histórico ──────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <History className="h-4 w-4" /> Histórico
          </h3>
          <span className="text-[11px] text-muted-foreground">{eventos.length}</span>
        </div>
        {loadingEventos ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : eventos.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-muted-foreground italic">
            Sem eventos
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
            {eventos.map((ev) => (
              <EventoItem key={ev.id} evento={ev} />
            ))}
          </div>
        )}
      </Card>
    </aside>
  )
}

function AnexoItem({
  anexo, canDelete, onRemove,
}: { anexo: AnexoSalvo; canDelete: boolean; onRemove: () => void }) {
  const isImg = anexo.mimeType?.startsWith('image/') ?? false
  return (
    <div className="flex items-center gap-2 px-3 py-2 group">
      <div className="h-7 w-7 rounded flex items-center justify-center bg-muted shrink-0">
        {isImg ? <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-foreground truncate">{anexo.nome}</div>
        <div className="text-[10px] text-muted-foreground">{fmtBytes(anexo.tamanho)}</div>
      </div>
      <a
        href={anexo.url}
        download={anexo.nome}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1 rounded hover:bg-muted text-muted-foreground"
        title="Baixar"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
      {canDelete && (
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remover"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function EventoItem({ evento }: { evento: Evento }) {
  const dt = new Date(evento.createdAt)
  const dataFmt = dt.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const meta = describeEvent(evento.tipo)
  const autorNome = evento.autor?.name ?? null

  return (
    <div className="flex items-start gap-2 px-3 py-2">
      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5" style={{ color: meta.cor }}>
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-foreground">
          {autorNome && <span className="font-medium">{autorNome} </span>}
          <span>{meta.label}</span>
          {evento.campoAntes !== null && evento.campoDepois !== null && (
            <span className="ml-1 text-[10px] text-muted-foreground">
              <code className="px-1 rounded bg-muted font-mono">{evento.campoAntes ?? '—'}</code>
              <span className="mx-1">→</span>
              <code className="px-1 rounded bg-muted font-mono">{evento.campoDepois ?? '—'}</code>
            </span>
          )}
          {evento.comentario && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{evento.comentario}</p>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{dataFmt}</div>
      </div>
    </div>
  )
}

function describeEvent(tipo: string): { icon: React.ReactNode; label: string; cor: string } {
  switch (tipo) {
    case 'status': return { icon: <Flag className="h-3 w-3" />, label: 'mudou status', cor: '#3b82f6' }
    case 'responsavel': return { icon: <AlertCircle className="h-3 w-3" />, label: 'mudou responsável', cor: '#a855f7' }
    case 'prazo': return { icon: <Calendar className="h-3 w-3" />, label: 'mudou prazo', cor: '#f59e0b' }
    case 'anexo': return { icon: <Paperclip className="h-3 w-3" />, label: 'anexou arquivo', cor: '#10b981' }
    case 'mensagem': return { icon: <MessageSquare className="h-3 w-3" />, label: 'enviou mensagem', cor: '#06b6d4' }
    case 'criou': return { icon: <Plus className="h-3 w-3" />, label: 'criou o projeto', cor: '#16a34a' }
    default: return { icon: <History className="h-3 w-3" />, label: tipo, cor: '#6b7280' }
  }
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
