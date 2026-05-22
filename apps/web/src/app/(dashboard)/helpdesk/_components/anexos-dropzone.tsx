'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Loader2, Paperclip, X, Upload, FileText, Image as ImageIcon } from 'lucide-react'
import { cn } from '@saas/ui'
import { getApiUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'

export interface AnexoStaged {
  /** Nome original do arquivo (mostrado no card) */
  fileName: string
  /** URL pública após upload completo (vazia enquanto enviando) */
  fileUrl: string
  mimeType: string
  tamanho: number
  /** ID local pra remoção */
  id: string
  /** Status do upload */
  status: 'uploading' | 'ready' | 'error'
  /** Preview local pra imagens (ObjectURL) */
  previewUrl?: string
}

interface Props {
  /** Lista controlada — recomendado pra integrar com form do parent */
  value: AnexoStaged[]
  onChange: (anexos: AnexoStaged[]) => void
  /** Compacto = layout horizontal pra composers de mensagem */
  compact?: boolean
  className?: string
  /** Máximo de bytes por arquivo (default 20MB, alinhado ao UploadController) */
  maxBytes?: number
  /** Máximo de arquivos total */
  maxFiles?: number
}

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024
const DEFAULT_MAX_FILES = 10

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function isImage(mime: string): boolean {
  return mime.startsWith('image/')
}

/**
 * Dropzone reutilizável de anexos. Recebe value/onChange controlados;
 * faz upload pra /api/upload no momento do drop/paste e mantém os items
 * com `status: 'uploading' | 'ready' | 'error'`. O parent submete só os
 * `ready` (gravando como HelpdeskAnexo via trpc.helpdesk.addAnexo).
 *
 * Aceita:
 *  - drag/drop do desktop
 *  - click pra escolher
 *  - Ctrl+V (paste de imagem na área de transferência)
 *
 * Bloqueia extensões executáveis no client antes do POST.
 */
export function AnexosDropzone({
  value, onChange, compact = false, className,
  maxBytes = DEFAULT_MAX_BYTES, maxFiles = DEFAULT_MAX_FILES,
}: Props) {
  const [dragging, setDragging] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (file: File): Promise<string | null> => {
    const apiUrl = getApiUrl()
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`${apiUrl}/api/upload`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { url?: string; filename?: string }
      return data.url || (data.filename ? `${apiUrl}/api/upload/${data.filename}` : null)
    } catch (e) {
      console.warn('[Anexos] upload falhou:', (e as Error).message)
      return null
    }
  }, [])

  const handleFiles = useCallback(async (files: File[]) => {
    // Filtros locais
    const ok: File[] = []
    const blocked = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.dll']
    for (const f of files) {
      const ext = '.' + (f.name.split('.').pop() || '').toLowerCase()
      if (blocked.includes(ext)) {
        alerts.error('Bloqueado', `${f.name}: tipo não permitido por segurança.`)
        continue
      }
      if (f.size > maxBytes) {
        alerts.error('Muito grande', `${f.name}: ${fmtBytes(f.size)} > limite ${fmtBytes(maxBytes)}.`)
        continue
      }
      ok.push(f)
    }
    if (value.length + ok.length > maxFiles) {
      alerts.error('Limite', `Máximo de ${maxFiles} anexos.`)
      return
    }
    if (ok.length === 0) return

    // Adiciona como uploading
    const staged: AnexoStaged[] = ok.map(f => ({
      id: crypto.randomUUID(),
      fileName: f.name,
      fileUrl: '',
      mimeType: f.type || 'application/octet-stream',
      tamanho: f.size,
      status: 'uploading' as const,
      previewUrl: isImage(f.type) ? URL.createObjectURL(f) : undefined,
    }))
    onChange([...value, ...staged])

    // Faz upload em paralelo
    const uploadResults = await Promise.all(
      staged.map(async (s, i) => ({
        id: s.id,
        url: await upload(ok[i]!),
      })),
    )

    // Atualiza com a URL ou marca erro
    onChange(
      [...value, ...staged].map(item => {
        const r = uploadResults.find(x => x.id === item.id)
        if (!r) return item
        if (r.url) return { ...item, fileUrl: r.url, status: 'ready' as const }
        return { ...item, status: 'error' as const }
      }),
    )
  }, [value, onChange, upload, maxBytes, maxFiles])

  // Eventos de drag
  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    function onDragEnter(e: DragEvent) { e.preventDefault(); setDragging(true) }
    function onDragOver(e: DragEvent) { e.preventDefault() }
    function onDragLeave(e: DragEvent) {
      e.preventDefault()
      // Verifica se ainda está dentro do elemento
      const rect = el!.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        setDragging(false)
      }
    }
    function onDrop(e: DragEvent) {
      e.preventDefault()
      setDragging(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) void handleFiles(files)
    }
    el.addEventListener('dragenter', onDragEnter)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragenter', onDragEnter)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [handleFiles])

  // Paste global (Ctrl+V) — só quando o dropzone está montado
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items || [])
      const files: File[] = []
      for (const it of items) {
        if (it.kind === 'file') {
          const f = it.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length > 0) {
        e.preventDefault()
        void handleFiles(files)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [handleFiles])

  const remove = (id: string) => {
    const item = value.find(v => v.id === id)
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
    onChange(value.filter(v => v.id !== id))
  }

  return (
    <div className={className}>
      <div
        ref={dropRef}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'rounded-md border-2 border-dashed transition-colors cursor-pointer',
          compact ? 'px-3 py-2' : 'px-4 py-6',
          dragging ? 'border-cyan-400 bg-cyan-50/40 dark:bg-cyan-950/30' : 'border-border/60 hover:border-cyan-300',
        )}
      >
        <div className={cn('flex items-center justify-center gap-2 text-muted-foreground', compact ? 'text-[11px]' : 'text-xs')}>
          <Upload className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          <span>
            {compact ? 'Anexar arquivos' : 'Arraste arquivos, clique para escolher ou cole imagens (Ctrl+V)'}
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || [])
            if (files.length > 0) void handleFiles(files)
            e.target.value = ''
          }}
        />
      </div>

      {value.length > 0 && (
        <ul className={cn('mt-2 space-y-1.5', compact ? 'text-[11px]' : 'text-xs')}>
          {value.map(item => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded border px-2 py-1 bg-card"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.previewUrl} alt={item.fileName} className="h-8 w-8 rounded object-cover shrink-0" />
              ) : isImage(item.mimeType) ? (
                <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{item.fileName}</p>
                <p className="text-[10px] text-muted-foreground">{fmtBytes(item.tamanho)}</p>
              </div>
              {item.status === 'uploading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-600" />}
              {item.status === 'error' && <span className="text-[10px] text-rose-600 font-medium">erro</span>}
              {item.status === 'ready' && <Paperclip className="h-3 w-3 text-emerald-600" />}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(item.id) }}
                className="text-muted-foreground hover:text-rose-600 transition-colors"
                title="Remover"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
