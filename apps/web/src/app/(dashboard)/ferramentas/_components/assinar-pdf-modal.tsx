'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { PenLine, Loader2, Upload, Download, ChevronLeft, ChevronRight, Eraser } from 'lucide-react'
import {
  Button,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { EntityCombobox } from '@/components/ui/entity-combobox'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { FERRAMENTAS } from './catalogo'
import { useUrlPdf } from './baixar'

const FERRAMENTA = FERRAMENTAS.find((f) => f.slug === 'assinar-pdf')!

/** Largura em que a página é desenhada. A escala sai daí, e com ela a conversão para pontos PDF. */
const LARGURA_TELA = 660

interface Certificado {
  id: string
  titular: string
  documento: string
  tipo: string
  expiraEm: string
}
interface Assinado {
  nome: string
  base64: string
  bytes: number
  padesLevel: 'BES' | 'T'
  tsaInfo?: string
  titular: string
}
/** Retângulo em pixels da tela, origem no canto superior esquerdo. */
interface Retangulo { x: number; y: number; w: number; h: number }

const fmtTamanho = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

/**
 * Assina PDF com certificado A1 do cadastro, marcando a área na página.
 *
 * É o fluxo do Acrobat com o certificado instalado na máquina: escolhe-se onde
 * a assinatura aparece e pronto. A senha não é pedida porque o certificado já
 * está guardado no sistema — o mesmo motivo de o Acrobat não pedir depois de
 * instalado.
 */
export function AssinarPdfModal({ onClose }: { onClose: () => void }) {
  const [arquivo, setArquivo] = useState<{ nome: string; base64: string; bytes: number } | null>(null)
  const [certificados, setCertificados] = useState<Certificado[]>([])
  const [certificadoId, setCertificadoId] = useState('')
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(0)
  /** Escala usada no desenho — converte pixels da tela em pontos PDF. */
  const [escala, setEscala] = useState(1)
  const [alturaTela, setAlturaTela] = useState(0)
  const [area, setArea] = useState<Retangulo | null>(null)
  const [desenhando, setDesenhando] = useState<{ x0: number; y0: number } | null>(null)
  const [assinando, setAssinando] = useState(false)
  const [resultado, setResultado] = useState<Assinado | null>(null)
  const urlResultado = useUrlPdf(resultado)
  const [carregandoPagina, setCarregandoPagina] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<any>(null)

  useEffect(() => {
    ;(trpc.ferramentas as any).certificadosParaAssinar.query()
      .then((c: Certificado[]) => {
        setCertificados(c || [])
        // Um só: já vem escolhido. Obrigar a selecionar o único item da lista
        // é um passo que não decide nada.
        if (c?.length === 1) setCertificadoId(c[0]!.id)
      })
      .catch(() => setCertificados([]))
  }, [])

  /** Desenha a página pedida e guarda a escala usada. */
  const desenharPagina = useCallback(async (n: number) => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas) return
    setCarregandoPagina(true)
    try {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const s = LARGURA_TELA / base.width
      const viewport = page.getViewport({ scale: s })
      canvas.width = viewport.width
      canvas.height = viewport.height
      setEscala(s)
      setAlturaTela(viewport.height)
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
    } finally {
      setCarregandoPagina(false)
    }
  }, [])

  // Depende de `arquivo` de propósito: o canvas só existe depois que o estado
  // muda e a tela é redesenhada. Chamar o desenho dentro do `aceitar` pegava a
  // referência ainda vazia e não pintava nada — só a troca de página, mais
  // tarde, encontrava o canvas pronto.
  useEffect(() => {
    if (arquivo && docRef.current) void desenharPagina(pagina)
  }, [arquivo, pagina, desenharPagina])

  const aceitar = useCallback(async (lista: FileList | null) => {
    const f = lista?.[0]
    if (!f) return
    if (!/\.pdf$/i.test(f.name)) {
      await alerts.warning('Arquivo inválido', 'Selecione um arquivo PDF.')
      return
    }
    const buffer = await f.arrayBuffer()
    const base64 = btoa(Array.from(new Uint8Array(buffer), (b) => String.fromCharCode(b)).join(''))

    // O worker é servido de /public — o empacotador do Next não resolve o
    // caminho interno do pacote de forma confiável entre versões.
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise

    docRef.current = doc
    setArquivo({ nome: f.name, base64, bytes: f.size })
    setTotalPaginas(doc.numPages)
    setPagina(1)
    setArea(null)
    setResultado(null)
  }, [])

  // ── seleção da área ──
  //
  // Eventos de PONTEIRO com captura, e não de mouse. Com mouse, qualquer coisa
  // que tirasse o cursor de cima da folha no meio do gesto — o próprio corpo do
  // modal rolando, a borda da página — disparava o "soltar" e o retângulo
  // recém-criado era descartado por ser pequeno demais. A captura prende o
  // gesto ao elemento até o dedo/botão levantar, aconteça o que acontecer.
  const posicaoNaFolha = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const aoPressionar = (e: React.PointerEvent<HTMLElement>) => {
    if (assinando) return
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
    const p = posicaoNaFolha(e)
    setDesenhando({ x0: p.x, y0: p.y })
    setArea({ x: p.x, y: p.y, w: 0, h: 0 })
  }
  const aoMover = (e: React.PointerEvent<HTMLElement>) => {
    if (!desenhando) return
    const p = posicaoNaFolha(e)
    setArea({
      x: Math.min(desenhando.x0, p.x), y: Math.min(desenhando.y0, p.y),
      w: Math.abs(p.x - desenhando.x0), h: Math.abs(p.y - desenhando.y0),
    })
  }
  const aoSoltar = (e: React.PointerEvent<HTMLElement>) => {
    if (!desenhando) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDesenhando(null)
    // Clique sem arrastar não é uma área — sem isso sobraria um retângulo de
    // tamanho zero e a assinatura sairia invisível sem ninguém entender.
    setArea((a) => (a && a.w > 12 && a.h > 8 ? a : null))
  }

  const assinar = async () => {
    if (!arquivo) return
    if (!certificadoId) {
      await alerts.warning('Falta o certificado', 'Escolha com qual certificado o documento será assinado.')
      return
    }
    setAssinando(true)
    setResultado(null)
    try {
      const r = await (trpc.ferramentas as any).assinarPdf.mutate({
        nome: arquivo.nome,
        pdfBase64: arquivo.base64,
        certificadoId,
        // Tela (origem em cima) → pontos PDF (origem embaixo). É a conversão
        // que só o navegador pode fazer, porque só aqui se sabe a escala.
        area: area ? {
          pagina,
          x: area.x / escala,
          y: (alturaTela - area.y - area.h) / escala,
          largura: area.w / escala,
          altura: area.h / escala,
        } : undefined,
      }) as Assinado
      setResultado(r)
    } catch (e) {
      await alerts.error('Falha ao assinar', (e as Error).message)
    } finally {
      setAssinando(false)
    }
  }

  const cert = certificados.find((c) => c.id === certificadoId)

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !assinando) onClose() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeaderIcon icon={PenLine} color="emerald">
          <DialogTitle>{FERRAMENTA.titulo}</DialogTitle>
          <DialogDescription>{FERRAMENTA.descricao}</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="max-h-[70vh] space-y-4 overflow-y-auto">
          {!arquivo ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void aceitar(e.dataTransfer.files) }}
              onClick={() => inputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-12 text-center hover:bg-muted/20"
            >
              <Upload className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">Solte o PDF aqui, ou clique para escolher</p>
              <p className="text-[12px] text-muted-foreground">Um arquivo por vez</p>
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden"
                onChange={(e) => { void aceitar(e.target.files); e.target.value = '' }} />
            </div>
          ) : (
            <>
              {/* Grudada no topo: a barra saía de vista ao rolar até a área de
                  assinatura, e o usuário ficava sem ver que faltava escolher o
                  certificado — só encontrava um botão desabilitado. */}
              <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 bg-background/95 px-1 py-2 backdrop-blur">
                {/* Combobox e não seleção simples: a lista tem um certificado
                    por cliente, e rolar centenas atrás de um nome é inviável. */}
                <EntityCombobox
                  className="w-[340px]"
                  items={certificados.map((c) => ({
                    id: c.id,
                    label: c.titular,
                    sublabel: `${c.documento} · vence ${new Date(c.expiraEm).toLocaleDateString('pt-BR')}`,
                  }))}
                  value={certificadoId}
                  onSelect={setCertificadoId}
                  placeholder="Escolha o certificado"
                  searchPlaceholder="Buscar por nome ou documento..."
                  emptyText="Nenhum certificado válido"
                  disabled={assinando}
                />

                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-sm" disabled={pagina <= 1 || carregandoPagina}
                    onClick={() => { setPagina((p) => p - 1); setArea(null) }}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[76px] text-center text-[12px] text-muted-foreground tabular-nums">
                    {pagina} / {totalPaginas}
                  </span>
                  <Button variant="outline" size="icon-sm" disabled={pagina >= totalPaginas || carregandoPagina}
                    onClick={() => { setPagina((p) => p + 1); setArea(null) }}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {area && (
                  <Button variant="outline" size="sm" onClick={() => setArea(null)} disabled={assinando}>
                    <Eraser className="h-3.5 w-3.5" />Limpar área
                  </Button>
                )}
              </div>

              <p className="text-[12px] text-muted-foreground">
                Arraste sobre a página para marcar onde a assinatura aparece.
                {' '}Sem marcar, o documento é assinado sem carimbo visível.
              </p>

              <div className="flex justify-center">
                <div
                  data-folha
                  className="relative select-none border border-border shadow-sm"
                  style={{
                    width: LARGURA_TELA,
                    cursor: assinando ? 'default' : 'crosshair',
                    // Sem isto, o gesto no toque vira rolagem do modal.
                    touchAction: 'none',
                  }}
                  onPointerDown={aoPressionar}
                  onPointerMove={aoMover}
                  onPointerUp={aoSoltar}
                  onPointerCancel={aoSoltar}
                >
                  <canvas ref={canvasRef} className="block w-full" />
                  {carregandoPagina && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {area && (
                    <div
                      className="pointer-events-none absolute border-2 bg-emerald-500/15"
                      style={{ left: area.x, top: area.y, width: area.w, height: area.h, borderColor: FERRAMENTA.cor }}
                    >
                      {cert && area.h > 26 && (
                        <span className="block truncate px-1 pt-0.5 text-[9px] font-semibold" style={{ color: FERRAMENTA.cor }}>
                          {cert.titular}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {resultado && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <div className="text-[13px]">
                    <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                      Assinado por {resultado.titular}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      PAdES-{resultado.padesLevel}
                      {resultado.padesLevel === 'T' ? ' · com carimbo do tempo' : ' · sem carimbo do tempo'}
                    </p>
                    {/* Sem carimbo, a data da assinatura passa a ser a do
                        servidor — e o leitor de PDF avisa isso. O motivo da
                        falha fica à vista, em vez de o documento sair em
                        silêncio num nível abaixo do esperado. */}
                    {resultado.padesLevel === 'BES' && resultado.tsaInfo && (
                      <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                        {resultado.tsaInfo}
                      </p>
                    )}
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a href={urlResultado} download={resultado.nome}>
                      <Download className="h-3.5 w-3.5" />
                      <span className="max-w-[240px] truncate">{resultado.nome}</span>
                      <span className="text-[11px] text-muted-foreground">{fmtTamanho(resultado.bytes)}</span>
                    </a>
                  </Button>
                </div>
              )}
            </>
          )}

          {arquivo && certificados.length === 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              Nenhum certificado A1 válido com senha guardada. Cadastre em Certificados Digitais.
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          {/* O motivo do bloqueio fica à vista. Botão desabilitado sem
              explicação é o que fez "marquei a área e nada acontece". */}
          {arquivo && !certificadoId && certificados.length > 0 && (
            <span className="mr-auto text-[12px] text-amber-600 dark:text-amber-400">
              Escolha o certificado para assinar
            </span>
          )}
          {arquivo && (
            <Button variant="outline" size="sm" disabled={assinando}
              onClick={() => { docRef.current = null; setArquivo(null); setArea(null); setResultado(null) }}>
              Trocar arquivo
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={assinando}>Fechar</Button>
          <Button variant="success" size="sm" onClick={assinar} disabled={assinando || !arquivo || !certificadoId}>
            {assinando
              ? <><Loader2 className="h-4 w-4 animate-spin" />Assinando…</>
              : <><PenLine className="h-4 w-4" />Assinar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
