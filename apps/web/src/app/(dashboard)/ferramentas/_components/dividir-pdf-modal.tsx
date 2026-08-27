'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Scissors, Loader2, Upload, Download, Check, FileArchive } from 'lucide-react'
import {
  Button, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { FERRAMENTAS } from './catalogo'
import { useUrlsPdf } from './baixar'

const FERRAMENTA = FERRAMENTAS.find((f) => f.slug === 'dividir-pdf')!

/** Largura da miniatura de cada página, em pixels. */
const LARGURA_MINIATURA = 150

type Modo = 'extrair' | 'soltar'

interface Pedaco {
  nome: string
  base64: string
  bytes: number
  paginas: number
}
interface Resultado {
  arquivos: Pedaco[]
  totalPaginas: number
  zip?: { nome: string; base64: string; bytes: number }
}

const fmtTamanho = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

/**
 * Lê uma escrita de páginas do jeito que se escreve numa impressora.
 *
 * "1-3, 7, 12-14" vira [1,2,3,7,12,13,14]. Aceita ponto e vírgula e espaço
 * como separadores porque quem digita não pensa em qual deles usar, e faixa
 * invertida ("5-2") é lida como 2-5 — a intenção é a mesma.
 */
function lerPaginas(texto: string, total: number): number[] {
  const saida = new Set<number>()

  for (const parte of texto.split(/[,;\s]+/).filter(Boolean)) {
    const faixa = parte.match(/^(\d+)\s*-\s*(\d+)$/)
    if (faixa) {
      const a = Number(faixa[1]), b = Number(faixa[2])
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
        if (i >= 1 && i <= total) saida.add(i)
      }
      continue
    }
    const n = Number(parte)
    if (Number.isInteger(n) && n >= 1 && n <= total) saida.add(n)
  }

  return [...saida].sort((a, b) => a - b)
}

/**
 * Divide um PDF — o caminho inverso do Juntar.
 *
 * As miniaturas são desenhadas no navegador, com o mesmo leitor de PDF que a
 * ferramenta de assinar usa. Escolher a página clicando na figura é mais
 * seguro que digitar o número: quem separa um anexo raramente sabe de cor em
 * que folha ele começa.
 */
export function DividirPdfModal({ onClose }: { onClose: () => void }) {
  const [arquivo, setArquivo] = useState<{ nome: string; base64: string; bytes: number } | null>(null)
  const [miniaturas, setMiniaturas] = useState<string[]>([])
  const [carregando, setCarregando] = useState(false)
  const [modo, setModo] = useState<Modo>('extrair')
  const [escolhidas, setEscolhidas] = useState<Set<number>>(new Set())
  const [texto, setTexto] = useState('')
  const [dividindo, setDividindo] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const urls = useUrlsPdf(resultado?.arquivos ?? VAZIO)

  // O zip não é PDF e não passa pelo mesmo auxiliar; o endereço é criado aqui.
  const [urlZip, setUrlZip] = useState<string>()
  useEffect(() => {
    if (!resultado?.zip) { setUrlZip(undefined); return }
    const bin = atob(resultado.zip.base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
    setUrlZip(url)
    return () => URL.revokeObjectURL(url)
  }, [resultado])

  const aceitar = useCallback(async (lista: FileList | null) => {
    const f = lista?.[0]
    if (!f) return
    if (!/\.pdf$/i.test(f.name)) {
      await alerts.warning('Arquivo inválido', 'Selecione um arquivo PDF.')
      return
    }

    setCarregando(true)
    try {
      const buffer = await f.arrayBuffer()
      const base64 = btoa(Array.from(new Uint8Array(buffer), (b) => String.fromCharCode(b)).join(''))

      // O worker é servido de /public — o empacotador do Next não resolve o
      // caminho interno do pacote de forma confiável entre versões.
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      // `any` pelo mesmo motivo da ferramenta de assinar: a assinatura de
      // `render` muda entre versões do leitor, e o tipo publicado não
      // acompanha o que a versão instalada aceita.
      const doc: any = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise

      const figuras: string[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: LARGURA_MINIATURA / base.width })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
        figuras.push(canvas.toDataURL('image/png'))
      }

      setArquivo({ nome: f.name, base64, bytes: f.size })
      setMiniaturas(figuras)
      setEscolhidas(new Set())
      setTexto('')
      setResultado(null)
    } catch (e) {
      await alerts.error('Não foi possível abrir', (e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [])

  /** Clique na miniatura e campo de texto mexem na MESMA escolha. */
  const alternar = (n: number) => {
    setEscolhidas((atual) => {
      const nova = new Set(atual)
      if (nova.has(n)) nova.delete(n)
      else nova.add(n)
      setTexto([...nova].sort((a, b) => a - b).join(', '))
      return nova
    })
    setResultado(null)
  }

  const digitar = (v: string) => {
    setTexto(v)
    setEscolhidas(new Set(lerPaginas(v, miniaturas.length)))
    setResultado(null)
  }

  const dividir = async () => {
    if (!arquivo) return
    if (modo === 'extrair' && escolhidas.size === 0) return
    setDividindo(true)
    setResultado(null)
    try {
      const r = await (trpc.ferramentas as any).dividirPdf.mutate({
        nome: arquivo.nome,
        base64: arquivo.base64,
        modo,
        paginas: modo === 'extrair' ? [...escolhidas].sort((a, b) => a - b) : undefined,
      }) as Resultado
      setResultado(r)
    } catch (e) {
      await alerts.error('Falha ao dividir', (e as Error).message)
    } finally {
      setDividindo(false)
    }
  }

  const limpar = () => {
    setArquivo(null); setMiniaturas([]); setEscolhidas(new Set())
    setTexto(''); setResultado(null)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !dividindo) onClose() }}>
      <DialogContent className="max-w-4xl">
        <DialogHeaderIcon icon={Scissors} color="amber">
          <DialogTitle>{FERRAMENTA.titulo}</DialogTitle>
          <DialogDescription>{FERRAMENTA.descricao}</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="max-h-[70vh] space-y-4 overflow-y-auto">
          {!arquivo ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); void aceitar(e.dataTransfer.files) }}
              onClick={() => !carregando && inputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors',
                arrastando ? 'bg-muted/40' : 'border-border hover:bg-muted/20',
              )}
              style={arrastando ? { borderColor: FERRAMENTA.cor } : undefined}
            >
              {carregando ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                  <p className="text-sm font-medium">Abrindo as páginas…</p>
                </>
              ) : (
                <>
                  <Upload className="h-7 w-7 text-muted-foreground" />
                  <p className="text-sm font-medium">Solte o PDF aqui, ou clique para escolher</p>
                  <p className="text-[12px] text-muted-foreground">Um arquivo por vez</p>
                </>
              )}
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden"
                onChange={(e) => { void aceitar(e.target.files); e.target.value = '' }} />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={arquivo.nome}>
                  {arquivo.nome}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {miniaturas.length} {miniaturas.length === 1 ? 'página' : 'páginas'} · {fmtTamanho(arquivo.bytes)}
                </span>
                <Button variant="outline" size="sm" onClick={limpar} disabled={dividindo}>
                  Trocar arquivo
                </Button>
              </div>

              {/* Os dois usos ficam à vista, e não escondidos num menu: são
                  tarefas diferentes, e quem chega aqui já sabe qual quer. */}
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { v: 'extrair' as Modo, t: 'Separar páginas escolhidas', d: 'Vira um documento só, na ordem em que aparecem.' },
                  { v: 'soltar' as Modo, t: 'Cada página num arquivo', d: `Gera ${miniaturas.length} arquivos, um por folha.` },
                ]).map((o) => (
                  <button
                    key={o.v} type="button" disabled={dividindo}
                    onClick={() => { setModo(o.v); setResultado(null) }}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-left transition-colors',
                      modo === o.v ? 'bg-muted/40' : 'border-border hover:bg-muted/20',
                    )}
                    style={modo === o.v ? { borderColor: FERRAMENTA.cor } : undefined}
                  >
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                      {modo === o.v && <Check className="h-3.5 w-3.5" style={{ color: FERRAMENTA.cor }} />}
                      {o.t}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{o.d}</span>
                  </button>
                ))}
              </div>

              {modo === 'extrair' && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[13px] font-medium">Páginas</label>
                    <input
                      value={texto} onChange={(e) => digitar(e.target.value)} disabled={dividindo}
                      placeholder="ex.: 1-3, 7, 12"
                      className="h-9 min-w-[180px] flex-1 rounded-md border border-border bg-background px-3 text-sm"
                    />
                    <span className="text-[12px] text-muted-foreground">
                      {escolhidas.size === 0
                        ? 'ou clique nas páginas abaixo'
                        : `${escolhidas.size} de ${miniaturas.length} escolhida(s)`}
                    </span>
                  </div>

                  <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
                    {miniaturas.map((src, i) => {
                      const n = i + 1
                      const marcada = escolhidas.has(n)
                      return (
                        <button
                          key={n} type="button" disabled={dividindo} onClick={() => alternar(n)}
                          className={cn(
                            'group relative overflow-hidden rounded-lg border bg-card transition-all',
                            marcada ? 'ring-2' : 'border-border hover:border-muted-foreground/40',
                          )}
                          style={marcada
                            ? { borderColor: FERRAMENTA.cor, boxShadow: `0 0 0 2px ${FERRAMENTA.cor}` }
                            : undefined}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`Página ${n}`} className="block w-full" />
                          <span className={cn(
                            'absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                            marcada ? 'text-white' : 'bg-black/65 text-white',
                          )} style={marcada ? { backgroundColor: FERRAMENTA.cor } : undefined}>
                            {n}
                          </span>
                          {marcada && (
                            <span className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-white"
                              style={{ backgroundColor: FERRAMENTA.cor }}>
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              {resultado && (
                <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="flex-1 text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">
                      {resultado.arquivos.length === 1
                        ? `Pronto — ${resultado.arquivos[0]!.paginas} página(s)`
                        : `Pronto — ${resultado.arquivos.length} arquivos`}
                    </p>
                    {/* Com muitos pedaços, o zip é a saída: baixar trinta
                        arquivos um a um é trabalho manual. */}
                    {resultado.zip && (
                      <Button asChild variant="success" size="sm">
                        <a href={urlZip} download={resultado.zip.nome}>
                          <FileArchive className="h-3.5 w-3.5" />
                          Baixar todos (.zip)
                          <span className="text-[11px] opacity-80">{fmtTamanho(resultado.zip.bytes)}</span>
                        </a>
                      </Button>
                    )}
                  </div>

                  <div className="nice-scrollbar flex max-h-[200px] flex-wrap gap-2 overflow-y-auto">
                    {resultado.arquivos.map((p, i) => (
                      <Button key={p.nome} asChild variant="outline" size="sm">
                        <a href={urls[i]} download={p.nome}>
                          <Download className="h-3.5 w-3.5" />
                          <span className="max-w-[220px] truncate">{p.nome}</span>
                          <span className="text-[11px] text-muted-foreground">{fmtTamanho(p.bytes)}</span>
                        </a>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={dividindo}>Fechar</Button>
          <Button variant="success" size="sm" onClick={dividir}
            disabled={dividindo || !arquivo || (modo === 'extrair' && escolhidas.size === 0)}>
            {dividindo
              ? <><Loader2 className="h-4 w-4 animate-spin" />Dividindo…</>
              : <><Scissors className="h-4 w-4" />
                  {modo === 'extrair'
                    ? `Separar ${escolhidas.size > 0 ? `(${escolhidas.size})` : ''}`
                    : `Dividir em ${miniaturas.length}`}
                </>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Referência estável: um array novo a cada repintura recriaria os endereços. */
const VAZIO: Pedaco[] = []
