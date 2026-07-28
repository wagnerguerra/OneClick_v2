'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Paperclip, Upload, Loader2, Trash2, Pencil, MessageSquare, History,
  Download, Send, FileText, X,
} from 'lucide-react'
import {
  Button, Card, Input, cn,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'

interface AnexoRow {
  id: string
  descricao: string | null
  fileUrl: string
  fileName: string
  mimeType: string | null
  tamanho: number | null
  createdAt: string
  uploadedBy: { id: string; name: string; image: string | null } | null
}
interface MensagemRow {
  id: string
  texto: string
  createdAt: string
  autorId: string | null
  autor: { id: string; name: string; image: string | null } | null
}
interface EventoRow {
  id: string
  type: string
  version: number
  changes: unknown
  createdAt: string
  user: { id: string; name: string } | null
}

const EVENTO_LABEL: Record<string, string> = {
  created: 'Cadastrou o fornecedor',
  updated: 'Atualizou os dados',
  deleted: 'Excluiu o fornecedor',
}

function fmtData(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtTamanho(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function FornecedorIsoTabs({ fornecedorId, currentUserId }: { fornecedorId: string; currentUserId?: string }) {
  return (
    <Card className="overflow-hidden">
      <Tabs defaultValue="anexos" orientation="vertical" className="flex min-h-[420px]">
        <TabsList variant="pills" className="w-[140px] shrink-0 border-r border-border bg-muted/30 p-3 items-center">
          <TabsTrigger variant="pills" value="anexos" icon={<Paperclip className="h-4 w-4" />}>Anexos</TabsTrigger>
          <TabsTrigger variant="pills" value="mensagens" icon={<MessageSquare className="h-4 w-4" />}>Mensagens</TabsTrigger>
          <TabsTrigger variant="pills" value="historico" icon={<History className="h-4 w-4" />}>Histórico</TabsTrigger>
        </TabsList>
        <div className="flex-1 min-w-0">
          <TabsContent value="anexos" className="p-5"><AnexosTab fornecedorId={fornecedorId} /></TabsContent>
          <TabsContent value="mensagens" className="p-5"><MensagensTab fornecedorId={fornecedorId} currentUserId={currentUserId} /></TabsContent>
          <TabsContent value="historico" className="p-5"><HistoricoTab fornecedorId={fornecedorId} /></TabsContent>
        </div>
      </Tabs>
    </Card>
  )
}

// ── Anexos ───────────────────────────────────────────────────
function AnexosTab({ fornecedorId }: { fornecedorId: string }) {
  const [anexos, setAnexos] = useState<AnexoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.fornecedor as any).listAnexos.query({ fornecedorId })
      .then((d: AnexoRow[]) => setAnexos(d || []))
      .catch(() => setAnexos([]))
      .finally(() => setLoading(false))
  }, [fornecedorId])
  useEffect(() => { carregar() }, [carregar])

  async function enviar(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file, file.name)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error(`Upload falhou (HTTP ${res.status})`)
      const data = await res.json() as { url: string; filename: string }
      await (trpc.fornecedor as any).addAnexo.mutate({
        fornecedorId, descricao: descricao.trim() || undefined,
        fileUrl: data.url, fileName: file.name, mimeType: file.type || undefined, tamanho: file.size,
      })
      setDescricao('')
      carregar()
    } catch (e) { alerts.error('Erro ao anexar', (e as Error).message) }
    finally { setUploading(false) }
  }

  async function salvarDescricao(id: string) {
    try { await (trpc.fornecedor as any).updateAnexo.mutate({ id, descricao: editDesc.trim() || undefined }); setEditId(null); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function excluir(a: AnexoRow) {
    const ok = await alerts.confirm({ title: 'Excluir anexo?', text: a.fileName, icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try { await (trpc.fornecedor as any).removeAnexo.mutate({ id: a.id }); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) enviar(f) }}
        className={cn('rounded-lg border border-dashed p-4 text-center transition-colors', dragOver ? 'border-primary bg-primary/5' : 'border-border')}
      >
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-6 w-6 text-muted-foreground" />
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição (opcional)" className="h-9 max-w-sm" />
          <Button type="button" variant="success" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar arquivo
          </Button>
          <p className="text-[11px] text-muted-foreground">ou arraste um arquivo aqui</p>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = '' }} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
      ) : anexos.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhum anexo.</p>
      ) : (
        <div className="divide-y divide-border/60 rounded-lg border border-border">
          {anexos.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 group">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                {editId === a.id ? (
                  <div className="flex items-center gap-2">
                    <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Descrição" className="h-8 text-sm" autoFocus />
                    <Button type="button" size="xs" variant="success" onClick={() => salvarDescricao(a.id)}>Salvar</Button>
                    <Button type="button" size="xs" variant="outline" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium truncate">{a.descricao || a.fileName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {a.fileName} {a.tamanho ? `· ${fmtTamanho(a.tamanho)}` : ''} · {a.uploadedBy?.name ?? '—'} · {fmtData(a.createdAt)}
                    </p>
                  </>
                )}
              </div>
              {editId !== a.id && (
                <>
                  <a href={resolveAssetUrl(a.fileUrl)} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted" title="Abrir/baixar"><Download className="h-4 w-4" /></a>
                  <button type="button" onClick={() => { setEditId(a.id); setEditDesc(a.descricao ?? '') }} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100" title="Editar descrição"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => excluir(a)} className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 opacity-0 group-hover:opacity-100" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Mensagens ────────────────────────────────────────────────
function MensagensTab({ fornecedorId, currentUserId }: { fornecedorId: string; currentUserId?: string }) {
  const [msgs, setMsgs] = useState<MensagemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editTexto, setEditTexto] = useState('')

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.fornecedor as any).listMensagens.query({ fornecedorId })
      .then((d: MensagemRow[]) => setMsgs(d || []))
      .catch(() => setMsgs([]))
      .finally(() => setLoading(false))
  }, [fornecedorId])
  useEffect(() => { carregar() }, [carregar])

  async function enviar() {
    if (!texto.trim()) return
    setEnviando(true)
    try { await (trpc.fornecedor as any).addMensagem.mutate({ fornecedorId, texto: texto.trim() }); setTexto(''); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviando(false) }
  }
  async function salvarEdicao(id: string) {
    if (!editTexto.trim()) return
    try { await (trpc.fornecedor as any).updateMensagem.mutate({ id, texto: editTexto.trim() }); setEditId(null); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function excluir(id: string) {
    const ok = await alerts.confirm({ title: 'Excluir mensagem?', text: 'Esta ação não pode ser desfeita.', icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try { await (trpc.fornecedor as any).removeMensagem.mutate({ id }); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Escreva uma interação/observação..." className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
        <Button type="button" size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5 mt-0.5" disabled={enviando || !texto.trim()} onClick={enviar}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
      ) : msgs.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhuma interação registrada.</p>
      ) : (
        <div className="space-y-3">
          {msgs.map((m) => {
            const meuAutor = !!currentUserId && m.autorId === currentUserId
            return (
              <div key={m.id} className="rounded-lg border border-border p-3 group">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[13px] font-semibold">{m.autor?.name ?? 'Usuário'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{fmtData(m.createdAt)}</span>
                    {meuAutor && editId !== m.id && (
                      <>
                        <button type="button" onClick={() => { setEditId(m.id); setEditTexto(m.texto) }} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100" title="Editar"><Pencil className="h-3 w-3" /></button>
                        <button type="button" onClick={() => excluir(m.id)} className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 opacity-0 group-hover:opacity-100" title="Excluir"><Trash2 className="h-3 w-3" /></button>
                      </>
                    )}
                  </div>
                </div>
                {editId === m.id ? (
                  <div className="space-y-2">
                    <textarea value={editTexto} onChange={(e) => setEditTexto(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
                    <div className="flex items-center gap-2 justify-end">
                      <Button type="button" size="xs" variant="outline" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /> Cancelar</Button>
                      <Button type="button" size="xs" variant="success" onClick={() => salvarEdicao(m.id)}>Salvar</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">{m.texto}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Histórico (eventos) ──────────────────────────────────────
function HistoricoTab({ fornecedorId }: { fornecedorId: string }) {
  const [eventos, setEventos] = useState<EventoRow[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    ;(trpc.fornecedor as any).getEvents.query({ id: fornecedorId })
      .then((d: EventoRow[]) => setEventos(d || []))
      .catch(() => setEventos([]))
      .finally(() => setLoading(false))
  }, [fornecedorId])

  if (loading) return <div className="flex items-center justify-center py-8 text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
  if (eventos.length === 0) return <p className="text-center text-sm text-muted-foreground py-8">Sem histórico.</p>

  return (
    <div className="space-y-2">
      {eventos.map((e) => {
        const nChanges = e.changes && typeof e.changes === 'object' ? Object.keys(e.changes as Record<string, unknown>).length : 0
        return (
          <div key={e.id} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2">
            <History className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{EVENTO_LABEL[e.type] ?? e.type}{nChanges > 0 ? ` · ${nChanges} campo${nChanges > 1 ? 's' : ''}` : ''}</p>
              <p className="text-[11px] text-muted-foreground">{e.user?.name ?? 'Sistema'} · {fmtData(e.createdAt)} · v{e.version}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
