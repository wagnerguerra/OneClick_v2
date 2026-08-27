'use client'

/**
 * "Alterar capa" do cliente.
 *
 * Duas portas para a mesma coisa: enviar uma imagem da máquina (o caminho que
 * já existia, agora gravando no cliente e não na configuração do módulo) ou
 * escolher entre fotos sugeridas pela atividade dele.
 *
 * A sugestão só devolve foto deitada e larga — a capa é uma faixa baixa em
 * `object-cover`, então retrato e imagem pequena chegam cortados ou borrados.
 * Cada opção mostra a resolução para a escolha ser informada.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Image as ImageIcon, Loader2, Upload, Search, Sparkles, Check, AlertTriangle } from 'lucide-react'
import { Button, Input, Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'
import { cn } from '@saas/ui'

type Foto = {
  id: string; thumb: string; full: string
  largura: number; altura: number
  autor: string; autorUrl: string; descricao: string
}
type Sugestoes = { fotos: Foto[]; termo: string; origem: string; temCnae: boolean; aviso?: string }

type Props = {
  open: boolean
  onOpenChange: (o: boolean) => void
  clienteId: string
  /** Chamado com a nova URL (ou null) para a capa atualizar sem recarregar. */
  onAplicada: (url: string | null) => void
  temCapaPropria: boolean
  /** Sem permissão fiscal o atalho "buscar atividade" nem aparece. */
  podeBuscarAtividade?: boolean
}

export function CapaClienteModal({ open, onOpenChange, clienteId, onAplicada, temCapaPropria, podeBuscarAtividade }: Props) {
  const [aba, setAba] = useState<'computador' | 'sugestoes'>('computador')
  const [enviando, setEnviando] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [aplicandoId, setAplicandoId] = useState<string | null>(null)
  const [termo, setTermo] = useState('')
  const [sug, setSug] = useState<Sugestoes | null>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)

  const buscar = useCallback(async (termoBusca?: string) => {
    setBuscando(true)
    try {
      const r = await (trpc.cliente as never as {
        sugerirCapas: { query: (i: { clienteId: string; termo?: string }) => Promise<Sugestoes> }
      }).sugerirCapas.query({ clienteId, ...(termoBusca ? { termo: termoBusca } : {}) })
      setSug(r)
      // Primeira busca: mostra no campo o termo que o servidor deduziu, para o
      // usuário entender de onde veio o resultado e poder corrigir.
      if (!termoBusca) setTermo(r.termo)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setBuscando(false)
    }
  }, [clienteId])

  useEffect(() => {
    if (!open) { setSug(null); setTermo(''); setAba('computador'); return }
  }, [open])

  useEffect(() => {
    if (open && aba === 'sugestoes' && !sug && !buscando) void buscar()
  }, [open, aba, sug, buscando, buscar])

  async function enviarArquivo(file: File) {
    setEnviando(true)
    try {
      const apiUrl = getApiUrl()
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
      if (!res.ok) throw new Error(`Falha no upload (${res.status})`)
      const data = await res.json()
      const fileUrl = data.url && data.url.startsWith('http') ? data.url : `${apiUrl}/api/upload/${data.filename}`
      await (trpc.cliente as never as {
        setCapaCliente: { mutate: (i: { clienteId: string; url: string | null }) => Promise<unknown> }
      }).setCapaCliente.mutate({ clienteId, url: fileUrl })
      onAplicada(fileUrl)
      await alerts.success('Capa atualizada', 'A imagem de fundo deste cliente foi atualizada.')
      onOpenChange(false)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setEnviando(false) }
  }

  async function aplicarSugestao(foto: Foto) {
    setAplicandoId(foto.id)
    try {
      const r = await (trpc.cliente as never as {
        aplicarCapaSugerida: { mutate: (i: { clienteId: string; url: string }) => Promise<{ coverImage: string }> }
      }).aplicarCapaSugerida.mutate({ clienteId, url: foto.full })
      onAplicada(r.coverImage)
      await alerts.success('Capa atualizada', 'A imagem escolhida foi salva no servidor e aplicada.')
      onOpenChange(false)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setAplicandoId(null) }
  }

  async function removerCapa() {
    const ok = await alerts.confirm({
      title: 'Remover a capa deste cliente?',
      text: 'Ele volta a usar a capa padrão do módulo.',
      icon: 'warning', confirmText: 'Remover',
    })
    if (!ok) return
    try {
      await (trpc.cliente as never as {
        setCapaCliente: { mutate: (i: { clienteId: string; url: string | null }) => Promise<unknown> }
      }).setCapaCliente.mutate({ clienteId, url: null })
      onAplicada(null)
      await alerts.success('Capa removida', 'O cliente voltou a usar a capa padrão.')
      onOpenChange(false)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function buscarAtividade() {
    setBuscando(true)
    try {
      const r = await (trpc.cliente as never as {
        buscarAtividadeParaCapa: { mutate: (i: { clienteId: string }) => Promise<{ termo: string; origem: string }> }
      }).buscarAtividadeParaCapa.mutate({ clienteId })
      if (!r.termo) { alerts.error('Sem resultado', 'A Receita não devolveu a atividade deste cliente.'); return }
      setTermo(r.termo)
      await buscar(r.termo)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setBuscando(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[860px]">
        <DialogHeaderIcon icon={ImageIcon} color="sky">
          <DialogTitle>Alterar capa do cliente</DialogTitle>
          <DialogDescription>
            A imagem vale só para este cliente. Sem capa própria, ele usa a capa padrão do módulo.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-4">
          {/* Abas */}
          <div className="flex items-center gap-1 border-b border-border">
            {([['computador', 'Do computador', Upload], ['sugestoes', 'Sugestões da internet', Sparkles]] as const).map(([id, label, Icone]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAba(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
                  aba === id
                    ? 'border-sky-500 text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icone className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {aba === 'computador' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => inputArquivo.current?.click()}
                disabled={enviando}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-10 text-sm text-muted-foreground transition-colors hover:border-sky-400 hover:bg-muted/40 disabled:opacity-60"
              >
                {enviando ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                <span className="font-medium text-foreground">Escolher imagem do computador</span>
                <span className="text-xs">Deitada, a partir de 1280px de largura, para cobrir a faixa sem borrar</span>
              </button>
              <input
                ref={inputArquivo}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void enviarArquivo(file)
                  e.target.value = ''
                }}
              />
            </div>
          )}

          {aba === 'sugestoes' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscar(termo) } }}
                    placeholder="Ex.: estoque atacadista, marmoraria, oficina mecânica"
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => void buscar(termo)} disabled={buscando}>
                  {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                </Button>
              </div>

              {sug && (
                <p className="text-xs text-muted-foreground">
                  Busca por <span className="font-medium text-foreground">{sug.termo || '—'}</span>
                  {sug.origem ? <> · origem: {sug.origem}</> : null}
                  {!sug.temCnae && podeBuscarAtividade && (
                    <>
                      {' · '}
                      <button type="button" onClick={() => void buscarAtividade()} className="font-medium text-sky-600 hover:underline">
                        buscar a atividade na Receita
                      </button>
                    </>
                  )}
                </p>
              )}

              {sug?.aviso && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{sug.aviso}</span>
                </div>
              )}

              {buscando && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Procurando imagens…
                </div>
              )}

              {!buscando && sug && sug.fotos.length === 0 && !sug.aviso && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma imagem deitada e grande o bastante para esse termo. Tente outra palavra.
                </p>
              )}

              {!buscando && sug && sug.fotos.length > 0 && (
                <div className="nice-scrollbar grid max-h-[340px] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                  {sug.fotos.map(foto => (
                    <button
                      key={foto.id}
                      type="button"
                      onClick={() => void aplicarSugestao(foto)}
                      disabled={!!aplicandoId}
                      className="group relative overflow-hidden rounded-lg border border-border transition-shadow hover:shadow-md disabled:opacity-60"
                      title={foto.descricao || 'Usar esta imagem'}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={foto.thumb} alt={foto.descricao} className="h-24 w-full object-cover" loading="lazy" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                        {foto.largura}×{foto.altura}
                      </span>
                      {aplicandoId === foto.id && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                        </span>
                      )}
                      {aplicandoId !== foto.id && (
                        <span className="absolute inset-0 hidden items-center justify-center bg-sky-600/40 group-hover:flex">
                          <Check className="h-6 w-6 text-white" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="sm:justify-between">
          {temCapaPropria ? (
            <Button variant="soft-destructive" size="sm" onClick={() => void removerCapa()}>
              Remover capa deste cliente
            </Button>
          ) : <span />}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
