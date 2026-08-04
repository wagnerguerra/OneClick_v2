'use client'

import { useState, useRef, useCallback } from 'react'
import { FileText, Loader2, Upload, X, Download, FileCheck2 } from 'lucide-react'
import {
  Button, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { FERRAMENTAS } from './catalogo'
import { useUrlsPdf } from './baixar'

const FERRAMENTA = FERRAMENTAS.find((f) => f.slug === 'html-pdf')!

interface ArquivoSelecionado {
  nome: string
  conteudo: string
  bytes: number
}
interface PdfGerado {
  nome: string
  base64: string
  bytes: number
}

const fmtTamanho = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

/**
 * HTML → PDF. Porte do aplicativo de mesa que a equipe já usava.
 *
 * O motor é o mesmo (Chrome sem interface, com o CSS de impressão anexado),
 * então o PDF sai igual ao que se conhece. O que muda é a origem: lá era uma
 * pasta do computador, aqui são os arquivos que o usuário solta na tela.
 */
export function HtmlPdfModal({ onClose }: { onClose: () => void }) {
  const [arquivos, setArquivos] = useState<ArquivoSelecionado[]>([])
  const [unico, setUnico] = useState(false)
  const [convertendo, setConvertendo] = useState(false)
  const [gerados, setGerados] = useState<PdfGerado[]>([])
  const [arrastando, setArrastando] = useState(false)
  /** `total` 0 = etapa sem passos contáveis (a barra fica indeterminada). */
  const [progresso, setProgresso] = useState<{ feitos: number; total: number; rotulo: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const urls = useUrlsPdf(gerados)

  const aceitar = useCallback(async (lista: FileList | null) => {
    if (!lista) return
    const htmls = Array.from(lista).filter((f) => /\.(html?|htm)$/i.test(f.name))
    const ignorados = lista.length - htmls.length
    if (ignorados > 0) {
      await alerts.warning('Arquivos ignorados', `${ignorados} arquivo(s) não são HTML e ficaram de fora.`)
    }
    if (htmls.length === 0) return

    const lidos = await Promise.all(htmls.map(async (f) => ({
      nome: f.name,
      conteudo: await f.text(),
      bytes: f.size,
    })))
    // Repetidos são substituídos pela versão nova, e a ordem alfabética é a
    // mesma do aplicativo de mesa — importa no PDF consolidado.
    setArquivos((atuais) => {
      const mapa = new Map(atuais.map((a) => [a.nome, a]))
      for (const a of lidos) mapa.set(a.nome, a)
      return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    })
    setGerados([])
  }, [])

  const converter = async () => {
    if (arquivos.length === 0) return
    setConvertendo(true)
    setGerados([])
    const entrada = arquivos.map(({ nome, conteudo }) => ({ nome, conteudo }))
    const prontos: PdfGerado[] = []

    try {
      if (unico) {
        // Documento único é UMA impressão, sem passos intermediários para
        // contar: a barra fica indeterminada em vez de fingir percentual.
        setProgresso({ feitos: 0, total: 0, rotulo: 'Montando o documento único…' })
        prontos.push(await (trpc.ferramentas as any).htmlParaPdfUnico.mutate({ arquivos: entrada }))
      } else {
        // Em lotes, e não tudo de uma vez, para o usuário ver a barra andar.
        // O tamanho é um meio-termo: o servidor abre o navegador uma vez por
        // chamada, então lote de 1 daria o progresso mais fino ao custo de
        // reabrir o navegador a cada arquivo.
        const LOTE = 3
        for (let i = 0; i < entrada.length; i += LOTE) {
          const parte = entrada.slice(i, i + LOTE)
          setProgresso({
            feitos: i,
            total: entrada.length,
            rotulo: parte.length === 1 ? parte[0]!.nome : `${parte.length} arquivos`,
          })
          const r = await (trpc.ferramentas as any).htmlParaPdf.mutate({ arquivos: parte })
          prontos.push(...(r as PdfGerado[]))
          setProgresso({ feitos: Math.min(i + LOTE, entrada.length), total: entrada.length, rotulo: '' })
        }
      }

      setGerados(prontos)
    } catch (e) {
      // O que já converteu fica disponível: perder oito PDFs prontos porque o
      // nono falhou obrigaria a refazer tudo.
      setGerados(prontos)
      await alerts.error(
        'Falha na conversão',
        prontos.length > 0
          ? `${(e as Error).message}\n\n${prontos.length} arquivo(s) já convertido(s) continuam disponíveis abaixo.`
          : (e as Error).message,
      )
    } finally {
      setProgresso(null)
      setConvertendo(false)
    }
  }

  return (
    // Fechar no meio de uma conversão deixaria o trabalho rodando sem destino:
    // o botão some e o clique fora não fecha enquanto está convertendo.
    <Dialog open onOpenChange={(o) => { if (!o && !convertendo) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeaderIcon icon={FileText} color="rose">
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
            <p className="text-sm font-medium">Solte os arquivos aqui, ou clique para escolher</p>
            <p className="text-[12px] text-muted-foreground">Somente .html e .htm · até 30 arquivos por vez</p>
            <input
              ref={inputRef} type="file" multiple accept=".html,.htm,text/html" className="hidden"
              onChange={(e) => { void aceitar(e.target.files); e.target.value = '' }}
            />
          </div>

          {arquivos.length > 0 && (
            <>
              <div className="divide-y divide-border/60 rounded-lg border border-border">
                {arquivos.map((a) => (
                  <div key={a.nome} className="flex items-center gap-3 px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[13px]" title={a.nome}>{a.nome}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{fmtTamanho(a.bytes)}</span>
                    <button
                      type="button"
                      onClick={() => { setArquivos((l) => l.filter((x) => x.nome !== a.nome)); setGerados([]) }}
                      title="Remover da lista"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={convertendo}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox" checked={unico} onChange={(e) => { setUnico(e.target.checked); setGerados([]) }}
                  className="h-4 w-4" disabled={convertendo}
                />
                Gerar um PDF único, na ordem da lista
              </label>
            </>
          )}

          {progresso && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                <span className="truncate">
                  {progresso.total > 0
                    ? `Convertendo ${Math.min(progresso.feitos + 1, progresso.total)} de ${progresso.total}`
                    : progresso.rotulo}
                  {progresso.rotulo && progresso.total > 0 ? ` · ${progresso.rotulo}` : ''}
                </span>
                {progresso.total > 0 && (
                  <span className="shrink-0 tabular-nums">
                    {Math.round((progresso.feitos / progresso.total) * 100)}%
                  </span>
                )}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                {progresso.total > 0 ? (
                  <div className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${(progresso.feitos / progresso.total) * 100}%`, backgroundColor: FERRAMENTA.cor }} />
                ) : (
                  // Sem passos para contar, a faixa percorre a barra — anuncia
                  // "trabalhando" sem inventar um percentual que não existe.
                  <div className="h-full w-1/3 animate-[indeterminado_1.2s_ease-in-out_infinite] rounded-full"
                    style={{ backgroundColor: FERRAMENTA.cor }} />
                )}
              </div>
              <style>{`@keyframes indeterminado {
                0% { transform: translateX(-100%) }
                100% { transform: translateX(300%) }
              }`}</style>
            </div>
          )}

          {gerados.length > 0 && (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <p className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">
                {gerados.length === 1 ? 'PDF pronto' : `${gerados.length} PDFs prontos`}
              </p>
              {/* Vários arquivos ficam para o usuário baixar um a um: disparar
                  vários downloads de uma vez faz o navegador bloquear todos
                  menos o primeiro, sem avisar ninguém. */}
              <div className="flex flex-wrap gap-2">
                {gerados.map((p, i) => (
                  <Button key={p.nome} asChild variant="outline" size="sm">
                    <a href={urls[i]} download={p.nome}>
                      <Download className="h-3.5 w-3.5" />
                      <span className="max-w-[240px] truncate">{p.nome}</span>
                      <span className="text-[11px] text-muted-foreground">{fmtTamanho(p.bytes)}</span>
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {arquivos.length > 0 && (
            <Button variant="outline" size="sm"
              onClick={() => { setArquivos([]); setGerados([]) }} disabled={convertendo}>
              Limpar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={convertendo}>Fechar</Button>
          <Button variant="success" size="sm" onClick={converter} disabled={convertendo || arquivos.length === 0}>
            {convertendo
              ? <><Loader2 className="h-4 w-4 animate-spin" />Convertendo…</>
              : <><FileCheck2 className="h-4 w-4" />Converter {arquivos.length > 1 ? `(${arquivos.length})` : ''}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
