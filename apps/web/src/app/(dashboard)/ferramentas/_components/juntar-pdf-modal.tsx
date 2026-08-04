'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Combine, Loader2, Upload, X, Download, GripVertical } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Button, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { FERRAMENTAS } from './catalogo'

const FERRAMENTA = FERRAMENTAS.find((f) => f.slug === 'juntar-pdf')!

interface PdfSelecionado {
  /** Chave estável do arrasto: nome repetido existe, e índice muda ao reordenar. */
  id: string
  nome: string
  base64: string
  bytes: number
  /** Endereço temporário do arquivo, usado só para a prévia. */
  url: string
}

interface Resultado {
  nome: string
  base64: string
  bytes: number
  paginas: number
}

const fmtTamanho = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

function baixar(nome: string, base64: string) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Lê o arquivo em base64, sem o prefixo "data:...;base64," que o leitor devolve. */
function lerBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error(`Falha ao ler ${f.name}`))
    r.readAsDataURL(f)
  })
}

/**
 * Junta vários PDFs num só.
 *
 * A prévia usa o próprio leitor de PDF do navegador num quadro pequeno — evita
 * trazer uma biblioteca de renderização só para mostrar a primeira página. O
 * quadro não recebe cliques, senão o leitor capturaria o arrasto e o cartão
 * nunca sairia do lugar.
 */
export function JuntarPdfModal({ onClose }: { onClose: () => void }) {
  const [arquivos, setArquivos] = useState<PdfSelecionado[]>([])
  const [juntando, setJuntando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Endereço temporário vive enquanto o modal existe; sem a limpeza, cada
  // arquivo aberto ficaria preso na memória da aba até recarregar a página.
  useEffect(() => () => { arquivos.forEach((a) => URL.revokeObjectURL(a.url)) }, [arquivos])

  const sensores = useSensors(
    // Só começa a arrastar depois de alguns pixels: sem isso, o clique no
    // botão de remover viraria um arrasto de um pixel e não removeria nada.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const aceitar = useCallback(async (lista: FileList | null) => {
    if (!lista) return
    const pdfs = Array.from(lista).filter((f) => /\.pdf$/i.test(f.name))
    const ignorados = lista.length - pdfs.length
    if (ignorados > 0) {
      await alerts.warning('Arquivos ignorados', `${ignorados} arquivo(s) não são PDF e ficaram de fora.`)
    }
    if (pdfs.length === 0) return

    const lidos: PdfSelecionado[] = await Promise.all(pdfs.map(async (f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
      nome: f.name,
      base64: await lerBase64(f),
      bytes: f.size,
      url: URL.createObjectURL(f),
    })))
    // Novos entram no FIM: a ordem é do usuário, e reordenar por conta própria
    // desfaria o arranjo que ele acabou de montar.
    setArquivos((atuais) => [...atuais, ...lidos])
    setResultado(null)
  }, [])

  const remover = (id: string) => {
    setArquivos((l) => {
      const alvo = l.find((x) => x.id === id)
      if (alvo) URL.revokeObjectURL(alvo.url)
      return l.filter((x) => x.id !== id)
    })
    setResultado(null)
  }

  const aoSoltar = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setArquivos((l) => {
      const de = l.findIndex((x) => x.id === active.id)
      const para = l.findIndex((x) => x.id === over.id)
      return de < 0 || para < 0 ? l : arrayMove(l, de, para)
    })
    setResultado(null)
  }

  const juntar = async () => {
    if (arquivos.length < 2) return
    setJuntando(true)
    setResultado(null)
    try {
      const r = await (trpc.ferramentas as any).juntarPdf.mutate({
        arquivos: arquivos.map(({ nome, base64 }) => ({ nome, base64 })),
      }) as Resultado
      setResultado(r)
      baixar(r.nome, r.base64)
    } catch (e) {
      await alerts.error('Falha ao juntar', (e as Error).message)
    } finally {
      setJuntando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !juntando) onClose() }}>
      <DialogContent className="max-w-4xl">
        <DialogHeaderIcon icon={Combine} color="indigo">
          <DialogTitle>{FERRAMENTA.titulo}</DialogTitle>
          <DialogDescription>{FERRAMENTA.descricao}</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="max-h-[70vh] space-y-4 overflow-y-auto">
          <div
            onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); void aceitar(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
              arrastando ? 'bg-muted/40' : 'border-border hover:bg-muted/20',
            )}
            style={arrastando ? { borderColor: FERRAMENTA.cor } : undefined}
          >
            <Upload className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-medium">Solte os PDFs aqui, ou clique para escolher</p>
            <p className="text-[12px] text-muted-foreground">Somente .pdf · até 30 arquivos por vez</p>
            <input
              ref={inputRef} type="file" multiple accept=".pdf,application/pdf" className="hidden"
              onChange={(e) => { void aceitar(e.target.files); e.target.value = '' }}
            />
          </div>

          {arquivos.length > 0 && (
            <>
              <p className="text-[12px] text-muted-foreground">
                Arraste os cartões para definir a ordem do documento final.
              </p>
              <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
                <SortableContext items={arquivos.map((a) => a.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3">
                    {arquivos.map((a, i) => (
                      <CartaoPdf
                        key={a.id} arquivo={a} posicao={i + 1}
                        onRemover={() => remover(a.id)} desabilitado={juntando}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </>
          )}

          {resultado && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <p className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">
                Pronto — {resultado.paginas} página(s)
              </p>
              <Button variant="outline" size="sm" onClick={() => baixar(resultado.nome, resultado.base64)}>
                <Download className="h-3.5 w-3.5" />
                <span className="max-w-[240px] truncate">{resultado.nome}</span>
                <span className="text-[11px] text-muted-foreground">{fmtTamanho(resultado.bytes)}</span>
              </Button>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {arquivos.length > 0 && (
            <Button variant="outline" size="sm" disabled={juntando}
              onClick={() => { arquivos.forEach((a) => URL.revokeObjectURL(a.url)); setArquivos([]); setResultado(null) }}>
              Limpar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={juntando}>Fechar</Button>
          <Button variant="success" size="sm" onClick={juntar} disabled={juntando || arquivos.length < 2}>
            {juntando
              ? <><Loader2 className="h-4 w-4 animate-spin" />Juntando…</>
              : <><Combine className="h-4 w-4" />Juntar PDF {arquivos.length > 1 ? `(${arquivos.length})` : ''}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CartaoPdf({ arquivo, posicao, onRemover, desabilitado }: {
  arquivo: PdfSelecionado
  posicao: number
  onRemover: () => void
  desabilitado: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: arquivo.id, disabled: desabilitado })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-border bg-card',
        isDragging && 'z-10 opacity-60 shadow-lg',
      )}
    >
      {/* A prévia é o leitor do próprio navegador. `pointer-events-none` é o
          que permite arrastar o cartão: sem isso o leitor engole o mouse. */}
      <div className="relative h-[168px] bg-muted/40">
        <iframe
          src={`${arquivo.url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          title={arquivo.nome}
          className="pointer-events-none h-full w-full"
        />
        <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">
          {posicao}
        </span>
        <button
          type="button" onClick={onRemover} disabled={desabilitado} title="Remover"
          className="absolute right-1.5 top-1.5 rounded bg-black/65 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* A alça é a área de arrasto — deixar o cartão inteiro arrastável faria
          o botão de remover competir com o gesto. */}
      <div
        {...attributes} {...listeners}
        className={cn('flex items-center gap-1.5 border-t border-border/60 px-2 py-1.5',
          desabilitado ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')}
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[11px]" title={arquivo.nome}>{arquivo.nome}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{fmtTamanho(arquivo.bytes)}</span>
      </div>
    </div>
  )
}
