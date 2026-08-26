'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Trash2, Pencil, Plus, Download, X } from 'lucide-react'
import { Button, Input, Card, Badge, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { classificarArquivo, formatarTamanho } from '@/lib/arquivo-tipo'
import { fmtData } from './compra-mensagens'

interface AnexoRow {
  id: string; descricao: string | null; fileUrl: string; fileName: string
  mimeType: string | null; tamanho: number | null; createdAt: string
  uploadedBy: { id: string; name: string; image: string | null } | null
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
                  <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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

