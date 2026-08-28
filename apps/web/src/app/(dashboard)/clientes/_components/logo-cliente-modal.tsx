'use client'

/**
 * Logomarca do cliente — envio manual ou busca na internet, pelo site da
 * empresa ou pelo nome dela.
 *
 * A busca parte do domínio (que costuma estar no e-mail do cadastro) e olha
 * onde a marca de fato mora: o site da empresa e os serviços de ícone. Não
 * acerta sempre — por isso a aba de envio manual vem primeiro e o domínio é
 * editável, para o caso do e-mail não apontar para o site.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ImageIcon, Loader2, Upload, Search, Globe, Check, AlertTriangle } from 'lucide-react'
import { Button, Input, Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'
import { cn } from '@saas/ui'

type Logo = {
  url: string; fonte: string
  largura: number | null; altura: number | null
  bytes: number; tipo: string
  vetorial: boolean
}
type Sugestoes = { logos: Logo[]; dominio: string; origem: string; aviso?: string }

/**
 * A origem vira frase. "e-mail do cadastro" pede "veio do"; "palpite pelo nome"
 * e "busca na web" já são frases inteiras e ficariam tortas com o prefixo.
 */
function rotuloOrigem(origem: string): string {
  if (origem.startsWith('e-mail')) return `veio do ${origem}`
  return origem
}

type Props = {
  open: boolean
  onOpenChange: (o: boolean) => void
  clienteId: string
  onAplicada: (url: string) => void
}

function tamanho(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}

export function LogoClienteModal({ open, onOpenChange, clienteId, onAplicada }: Props) {
  const [aba, setAba] = useState<'computador' | 'internet'>('computador')
  const [enviando, setEnviando] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [aplicandoUrl, setAplicandoUrl] = useState<string | null>(null)
  const [dominio, setDominio] = useState('')
  const [sug, setSug] = useState<Sugestoes | null>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)

  const buscar = useCallback(async (dominioBusca?: string) => {
    setBuscando(true)
    try {
      const r = await (trpc.cliente as never as {
        sugerirLogos: { query: (i: { clienteId: string; dominio?: string }) => Promise<Sugestoes> }
      }).sugerirLogos.query({ clienteId, ...(dominioBusca ? { dominio: dominioBusca } : {}) })
      setSug(r)
      if (!dominioBusca) setDominio(r.dominio)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setBuscando(false) }
  }, [clienteId])

  useEffect(() => {
    if (!open) { setSug(null); setDominio(''); setAba('computador') }
  }, [open])

  useEffect(() => {
    if (open && aba === 'internet' && !sug && !buscando) void buscar()
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
      const logoUrl = data.url && data.url.startsWith('http') ? data.url : `${apiUrl}/api/upload/${data.filename}`
      await trpc.cliente.update.mutate({ id: clienteId, data: { logoUrl } as never })
      onAplicada(logoUrl)
      await alerts.success('Logomarca atualizada', 'A imagem foi salva no cadastro do cliente.')
      onOpenChange(false)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setEnviando(false) }
  }

  async function aplicar(logo: Logo) {
    setAplicandoUrl(logo.url)
    try {
      const r = await (trpc.cliente as never as {
        aplicarLogoSugerida: { mutate: (i: { clienteId: string; url: string }) => Promise<{ logoUrl: string }> }
      }).aplicarLogoSugerida.mutate({ clienteId, url: logo.url })
      onAplicada(r.logoUrl)
      await alerts.success('Logomarca atualizada', 'A imagem foi baixada para o servidor e aplicada.')
      onOpenChange(false)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setAplicandoUrl(null) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeaderIcon icon={ImageIcon} color="sky">
          <DialogTitle>Logomarca do cliente</DialogTitle>
          <DialogDescription>
            Envie o arquivo ou procure pela marca — pelo site da empresa ou pelo nome dela.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-4">
          <div className="flex items-center gap-1 border-b border-border">
            {([['computador', 'Do computador', Upload], ['internet', 'Buscar na internet', Globe]] as const).map(([id, label, Icone]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAba(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
                  aba === id ? 'border-sky-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icone className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {aba === 'computador' && (
            <>
              <button
                type="button"
                onClick={() => inputArquivo.current?.click()}
                disabled={enviando}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-10 text-sm text-muted-foreground transition-colors hover:border-sky-400 hover:bg-muted/40 disabled:opacity-60"
              >
                {enviando ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                <span className="font-medium text-foreground">Escolher arquivo do computador</span>
                <span className="text-xs">PNG com fundo transparente fica melhor sobre a capa</span>
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
            </>
          )}

          {aba === 'internet' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={dominio}
                    onChange={(e) => setDominio(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscar(dominio) } }}
                    placeholder="site ou nome da empresa — ex.: adriabrasil.com"
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => void buscar(dominio)} disabled={buscando}>
                  {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Procurar'}
                </Button>
              </div>

              {sug && sug.dominio && (
                <p className="text-xs text-muted-foreground">
                  Procurando em <span className="font-medium text-foreground">{sug.dominio}</span>
                  {sug.origem && sug.origem !== 'domínio digitado' ? <> · {rotuloOrigem(sug.origem)}</> : null}
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
                  <Loader2 className="h-4 w-4 animate-spin" /> Procurando a marca…
                </div>
              )}

              {!buscando && sug && sug.logos.length > 0 && (
                <div className="nice-scrollbar grid max-h-[320px] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
                  {sug.logos.map(logo => (
                    <button
                      key={logo.url}
                      type="button"
                      onClick={() => void aplicar(logo)}
                      disabled={!!aplicandoUrl}
                      className="group relative flex flex-col items-center gap-1 rounded-lg border border-border p-2 transition-shadow hover:shadow-md disabled:opacity-60"
                      title={logo.url}
                    >
                      {/* Xadrez por baixo: logo com fundo transparente some no branco. */}
                      <span
                        className="flex h-20 w-full items-center justify-center rounded"
                        style={{
                          backgroundImage: 'linear-gradient(45deg,#0000000d 25%,transparent 25%,transparent 75%,#0000000d 75%),linear-gradient(45deg,#0000000d 25%,transparent 25%,transparent 75%,#0000000d 75%)',
                          backgroundSize: '12px 12px',
                          backgroundPosition: '0 0,6px 6px',
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logo.url} alt="" className="max-h-16 max-w-full object-contain" loading="lazy" />
                      </span>
                      <span className="w-full truncate text-[10px] text-muted-foreground">
                        {/* Vetor não tem tamanho fixo: dizer "32×32" assustaria
                            à toa, quando na verdade é o melhor resultado. */}
                        {logo.vetorial
                          ? 'vetorial'
                          : logo.largura ? `${logo.largura}×${logo.altura}` : tamanho(logo.bytes)} · {logo.fonte}
                      </span>
                      {aplicandoUrl === logo.url && (
                        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                        </span>
                      )}
                      {aplicandoUrl !== logo.url && (
                        <span className="absolute inset-0 hidden items-center justify-center rounded-lg bg-sky-600/40 group-hover:flex">
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

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
