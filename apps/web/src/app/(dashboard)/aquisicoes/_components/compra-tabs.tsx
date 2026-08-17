'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2, Trash2, Pencil, Plus,
  Download, Send, X,
} from 'lucide-react'
import { Button, Input, Card, Badge, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { classificarArquivo, formatarTamanho } from '@/lib/arquivo-tipo'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

interface AnexoRow {
  id: string; descricao: string | null; fileUrl: string; fileName: string
  mimeType: string | null; tamanho: number | null; createdAt: string
  uploadedBy: { id: string; name: string; image: string | null } | null
}
interface MensagemRow {
  id: string; texto: string; createdAt: string; autorId: string | null
  autor: { id: string; name: string; image: string | null } | null
}

function fmtData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
/**
 * Card lateral de arquivos do pedido — mesmo desenho do card de Arquivos da
 * tela do cliente: cabeçalho com "Adicionar", lista compacta com ícone por tipo
 * de arquivo, etiqueta e ações no hover.
 *
 * Fica ao lado das abas, e não dentro delas, porque anexo é referência que se
 * consulta enquanto se mexe no pedido — enterrado numa aba, some da vista
 * justamente na hora em que serve.
 */
export function AnexosCard({ compraId }: { compraId: string }) {
  const [anexos, setAnexos] = useState<AnexoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.compra as any).listAnexos.query({ compraId })
      .then((d: AnexoRow[]) => setAnexos(d || [])).catch(() => setAnexos([])).finally(() => setLoading(false))
  }, [compraId])
  useEffect(() => { carregar() }, [carregar])

  /** Envia em série: o endpoint de upload recebe um arquivo por vez. */
  async function enviar(files: File[]) {
    if (!files.length) return
    setUploading(true)
    let enviados = 0
    for (const file of files) {
      try {
        const fd = new FormData(); fd.append('file', file, file.name)
        const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', credentials: 'include', body: fd })
        if (!res.ok) throw new Error(`Upload falhou (HTTP ${res.status})`)
        const data = await res.json() as { url: string }
        await (trpc.compra as any).addAnexo.mutate({
          compraId, fileUrl: data.url, fileName: file.name,
          mimeType: file.type || undefined, tamanho: file.size,
        })
        enviados++
      } catch (e) { alerts.error('Erro ao anexar', `${file.name}: ${(e as Error).message}`) }
    }
    setUploading(false)
    if (enviados) { carregar(); alerts.success('Upload concluído', `${enviados} arquivo(s) enviado(s).`) }
  }

  async function salvarDescricao(id: string) {
    try { await (trpc.compra as any).updateAnexo.mutate({ id, descricao: editDesc.trim() || undefined }); setEditId(null); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function excluir(a: AnexoRow) {
    const ok = await alerts.confirm({ title: 'Excluir anexo?', text: a.fileName, icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try { await (trpc.compra as any).removeAnexo.mutate({ id: a.id }); carregar() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <Card
      className={cn('p-5 transition-colors', dragOver && 'ring-2 ring-primary/50')}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); enviar(Array.from(e.dataTransfer.files ?? [])) }}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h4 className="text-sm font-semibold truncate">Arquivos</h4>
        <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Adicionar
        </Button>
        <input ref={fileRef} type="file" multiple className="hidden"
          onChange={(e) => { enviar(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : anexos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum arquivo enviado. Arraste um arquivo aqui ou use Adicionar.</p>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto nice-scrollbar">
          {anexos.map((a) => {
            const tipo = classificarArquivo(a.fileName, a.mimeType)
            const Icone = tipo.icon
            return (
              <div key={a.id} className={cn('flex items-start gap-2 text-xs group rounded-md border border-border p-2 bg-muted/30 transition-colors', tipo.hover)}>
                <Icone className={cn('h-4 w-4 shrink-0 mt-0.5', tipo.cor)} />
                <div className="min-w-0 flex-1">
                  {editId === a.id ? (
                    // Edição empilhada: numa coluna de 320px, campo e botões
                    // lado a lado espremeriam o input a nada.
                    <div className="space-y-1.5">
                      <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Descrição" className="h-8 text-xs" autoFocus />
                      <div className="flex items-center justify-end gap-1.5">
                        <Button type="button" size="xs" variant="outline" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
                        <Button type="button" size="xs" variant="success" onClick={() => salvarDescricao(a.id)}>Salvar</Button>
                      </div>
                    </div>
                  ) : (<>
                    <div className="flex items-center gap-1.5">
                      <a href={resolveAssetUrl(a.fileUrl)} target="_blank" rel="noopener noreferrer" className="truncate font-medium hover:text-primary" title={a.fileName}>
                        {a.descricao || a.fileName}
                      </a>
                      <Badge variant="outline" className="h-4 px-1 text-[9px] shrink-0">{tipo.label}</Badge>
                    </div>
                    {/* O nome do arquivo só se repete quando há descrição — senão
                        a linha de baixo diria o mesmo que a de cima. */}
                    {a.descricao && <p className="text-muted-foreground truncate" title={a.fileName}>{a.fileName}</p>}
                    <p className="text-muted-foreground truncate">
                      {[formatarTamanho(a.tamanho), a.uploadedBy?.name, fmtData(a.createdAt)].filter(Boolean).join(' · ')}
                    </p>
                  </>)}
                </div>
                {editId !== a.id && (
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a href={resolveAssetUrl(a.fileUrl)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="Abrir / baixar">
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    <button type="button" onClick={() => { setEditId(a.id); setEditDesc(a.descricao ?? '') }} className="text-muted-foreground hover:text-foreground" title="Editar descrição">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => excluir(a)} className="text-destructive hover:text-destructive/80" title="Excluir arquivo">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export function MensagensTab({ compraId, currentUserId }: { compraId: string; currentUserId?: string }) {
  const [msgs, setMsgs] = useState<MensagemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editTexto, setEditTexto] = useState('')

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.compra as any).listMensagens.query({ compraId })
      .then((d: MensagemRow[]) => setMsgs(d || [])).catch(() => setMsgs([])).finally(() => setLoading(false))
  }, [compraId])
  useEffect(() => { carregar() }, [carregar])

  async function enviar() {
    if (!texto.trim()) return
    setEnviando(true)
    try { await (trpc.compra as any).addMensagem.mutate({ compraId, texto: texto.trim() }); setTexto(''); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) } finally { setEnviando(false) }
  }
  async function salvarEdicao(id: string) {
    if (!editTexto.trim()) return
    try { await (trpc.compra as any).updateMensagem.mutate({ id, texto: editTexto.trim() }); setEditId(null); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function excluir(id: string) {
    const ok = await alerts.confirm({ title: 'Excluir mensagem?', text: 'Esta ação não pode ser desfeita.', icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try { await (trpc.compra as any).removeMensagem.mutate({ id }); carregar() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Escreva uma interação..." className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
        <Button type="button" size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5 mt-0.5" disabled={enviando || !texto.trim()} onClick={enviar}>{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar</Button>
      </div>
      {loading ? <div className="flex items-center justify-center py-8 text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
        : msgs.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Nenhuma interação registrada.</p>
        : <div className="space-y-3">
            {msgs.map((m) => {
              const meuAutor = !!currentUserId && m.autorId === currentUserId
              return (
                <div key={m.id} className="rounded-lg border border-border p-3 group">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[13px] font-semibold">{m.autor?.name ?? 'Usuário'}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">{fmtData(m.createdAt)}</span>
                      {meuAutor && editId !== m.id && (<>
                        <button type="button" onClick={() => { setEditId(m.id); setEditTexto(m.texto) }} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100" title="Editar"><Pencil className="h-3 w-3" /></button>
                        <button type="button" onClick={() => excluir(m.id)} className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 opacity-0 group-hover:opacity-100" title="Excluir"><Trash2 className="h-3 w-3" /></button>
                      </>)}
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
                  ) : <p className="text-sm whitespace-pre-wrap break-words">{m.texto}</p>}
                </div>
              )
            })}
          </div>}
    </div>
  )
}
