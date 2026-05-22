'use client'

import { useState, useEffect } from 'react'
import { Loader2, MessageSquare, Paperclip, Send, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'

/**
 * Painel inline de comentários + anexos por passo de execução.
 * Compartilhado entre /servicos (modal de checklist) e /meus-servicos.
 *
 * @param rightSlot conteudo opcional renderizado à direita da linha
 *                  de botões (Comentar/Anexar). Usado pelo modal de
 *                  checklist pra adicionar "Concluir" alinhado à direita.
 */
export function PassoExtras({ passoId, editavel, rightSlot }: {
  passoId: string
  editavel: boolean
  rightSlot?: React.ReactNode
}) {
  const [expandido, setExpandido] = useState<'none' | 'comentarios' | 'anexos'>('none')
  const [comentarios, setComentarios] = useState<Array<{ id: string; mensagem: string; createdAt: string; usuario: { name: string; image: string | null } | null }>>([])
  const [anexos, setAnexos] = useState<Array<{ id: string; fileName: string; fileUrl: string; fileSize: number | null; mimeType: string | null; createdAt: string }>>([])
  const [novoComentario, setNovoComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [totais, setTotais] = useState<{ comentarios: number; anexos: number }>({ comentarios: 0, anexos: 0 })

  async function fetchTotais() {
    try {
      const [c, a] = await Promise.all([
        (trpc.servico as any).listComentariosPasso.query({ execPassoId: passoId }),
        (trpc.servico as any).listAnexosPasso.query({ execPassoId: passoId }),
      ])
      setTotais({ comentarios: c?.length ?? 0, anexos: a?.length ?? 0 })
    } catch { /* sem perm */ }
  }

  useEffect(() => { fetchTotais() }, [passoId])

  async function abrirComentarios() {
    setExpandido(expandido === 'comentarios' ? 'none' : 'comentarios')
    if (expandido !== 'comentarios') {
      try {
        const data = await (trpc.servico as any).listComentariosPasso.query({ execPassoId: passoId })
        setComentarios(data || [])
      } catch { /* */ }
    }
  }

  async function abrirAnexos() {
    setExpandido(expandido === 'anexos' ? 'none' : 'anexos')
    if (expandido !== 'anexos') {
      try {
        const data = await (trpc.servico as any).listAnexosPasso.query({ execPassoId: passoId })
        setAnexos(data || [])
      } catch { /* */ }
    }
  }

  async function enviarComentario() {
    if (!novoComentario.trim() || enviando) return
    setEnviando(true)
    try {
      await (trpc.servico as any).addComentarioPasso.mutate({ execPassoId: passoId, mensagem: novoComentario.trim() })
      setNovoComentario('')
      const data = await (trpc.servico as any).listComentariosPasso.query({ execPassoId: passoId })
      setComentarios(data || [])
      setTotais(t => ({ ...t, comentarios: (data || []).length }))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviando(false) }
  }

  async function uploadAnexo(file: File) {
    if (file.size > 10 * 1024 * 1024) { alerts.error('Arquivo muito grande', 'Máx 10MB'); return }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
      if (!res.ok) throw new Error('Falha no upload')
      const uploaded = await res.json()
      await (trpc.servico as any).addAnexoPasso.mutate({
        execPassoId: passoId,
        fileName: file.name,
        fileUrl: uploaded.url,
        fileSize: file.size,
        mimeType: file.type,
      })
      const data = await (trpc.servico as any).listAnexosPasso.query({ execPassoId: passoId })
      setAnexos(data || [])
      setTotais(t => ({ ...t, anexos: (data || []).length }))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setUploading(false) }
  }

  async function removerAnexo(id: string) {
    if (!await alerts.confirmDelete('este anexo')) return
    try {
      await (trpc.servico as any).deleteAnexoPasso.mutate({ id })
      const data = await (trpc.servico as any).listAnexosPasso.query({ execPassoId: passoId })
      setAnexos(data || [])
      setTotais(t => ({ ...t, anexos: (data || []).length }))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px]">
        <button
          type="button"
          onClick={abrirComentarios}
          className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors', expandido === 'comentarios' && 'bg-muted text-foreground')}
        >
          <MessageSquare className="h-3 w-3" />
          {totais.comentarios > 0 ? `${totais.comentarios} comentário${totais.comentarios > 1 ? 's' : ''}` : 'Comentar'}
          {expandido === 'comentarios' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={abrirAnexos}
          className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors', expandido === 'anexos' && 'bg-muted text-foreground')}
        >
          <Paperclip className="h-3 w-3" />
          {totais.anexos > 0 ? `${totais.anexos} anexo${totais.anexos > 1 ? 's' : ''}` : 'Anexar'}
          {expandido === 'anexos' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {rightSlot && <div className="ml-auto">{rightSlot}</div>}
      </div>

      {expandido === 'comentarios' && (
        <div className="rounded border border-border/60 bg-muted/20 p-2 space-y-2">
          {comentarios.length > 0 ? (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {comentarios.map(c => (
                <div key={c.id} className="text-[11px] bg-card rounded p-1.5">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-semibold">{c.usuario?.name || 'Usuário'}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-[11px] whitespace-pre-wrap break-words">{c.mensagem}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">Nenhum comentário ainda.</p>
          )}
          {editavel && (
            <div className="flex items-end gap-1.5">
              <textarea
                value={novoComentario}
                onChange={e => setNovoComentario(e.target.value)}
                placeholder="Escreva um comentário..."
                rows={2}
                className="flex-1 text-[11px]"
              />
              <Button size="xs" onClick={enviarComentario} disabled={enviando || !novoComentario.trim()} className="gap-1 shrink-0" style={{ backgroundColor: '#10b981' }}>
                {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </Button>
            </div>
          )}
        </div>
      )}

      {expandido === 'anexos' && (
        <div className="rounded border border-border/60 bg-muted/20 p-2 space-y-2">
          {anexos.length > 0 ? (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {anexos.map(a => (
                <div key={a.id} className="flex items-center gap-2 text-[11px] bg-card rounded px-2 py-1 group">
                  <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                  <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" className="truncate flex-1 hover:underline" style={{ color: '#10b981' }}>
                    {a.fileName}
                  </a>
                  {a.fileSize && <span className="text-[10px] text-muted-foreground">{Math.round(a.fileSize / 1024)} KB</span>}
                  {editavel && (
                    <button type="button" onClick={() => removerAnexo(a.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">Nenhum anexo ainda.</p>
          )}
          {editavel && (
            <label className="flex items-center justify-center gap-1.5 text-[11px] py-1.5 px-3 border border-dashed border-border/60 rounded hover:bg-muted/30 cursor-pointer transition-colors">
              {uploading ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Enviando...</>
              ) : (
                <><Plus className="h-3 w-3" /> Adicionar arquivo</>
              )}
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) await uploadAnexo(f)
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  )
}
