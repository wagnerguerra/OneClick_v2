'use client'

import { useState, useRef, useCallback } from 'react'
import { Wrench, FileText, Loader2, Upload, X, Download, FileCheck2 } from 'lucide-react'
import { Button, Card, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-ti, #3b82f6)'

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

/** Baixa um arquivo que já está na memória, sem passar de novo pelo servidor. */
function baixar(nome: string, base64: string) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  // Sem revoke o blob fica preso na memória da aba até recarregar a página.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function FerramentasPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
          style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
          <Wrench className="h-6 w-6" />
        </div>
        <div>
          <h1>Ferramentas</h1>
          <p className="text-sm text-muted-foreground">Utilitários de uso geral</p>
        </div>
      </div>

      <ConversorHtmlPdf />
    </div>
  )
}

/**
 * HTML → PDF. Porte do aplicativo de mesa que a equipe já usava.
 *
 * O motor é o mesmo (Chrome sem interface, com o CSS de impressão anexado),
 * então o PDF sai igual ao que se conhece. O que muda é a origem: lá era uma
 * pasta do computador, aqui são os arquivos que o usuário solta na tela.
 */
function ConversorHtmlPdf() {
  const [arquivos, setArquivos] = useState<ArquivoSelecionado[]>([])
  const [unico, setUnico] = useState(false)
  const [convertendo, setConvertendo] = useState(false)
  const [gerados, setGerados] = useState<PdfGerado[]>([])
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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
    try {
      const entrada = arquivos.map(({ nome, conteudo }) => ({ nome, conteudo }))
      const saida = unico
        ? [await (trpc.ferramentas as any).htmlParaPdfUnico.mutate({ arquivos: entrada })]
        : await (trpc.ferramentas as any).htmlParaPdf.mutate({ arquivos: entrada })
      setGerados(saida as PdfGerado[])
      // Um arquivo só: baixa direto, que é o desfecho esperado de qualquer jeito.
      if ((saida as PdfGerado[]).length === 1) {
        const p = (saida as PdfGerado[])[0]!
        baixar(p.nome, p.base64)
      }
    } catch (e) {
      await alerts.error('Falha na conversão', (e as Error).message)
    } finally {
      setConvertendo(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border/60 bg-muted/20 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 15%, transparent)`, color: MODULE_COLOR }}>
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[15px] font-semibold">HTML → PDF</p>
          <p className="text-[13px] text-muted-foreground">
            Converte relatórios em HTML para PDF, um por arquivo ou tudo num documento só.
          </p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); void aceitar(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
            arrastando ? 'bg-muted/40' : 'border-border hover:bg-muted/20',
          )}
          style={arrastando ? { borderColor: MODULE_COLOR } : undefined}
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
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox" checked={unico} onChange={(e) => { setUnico(e.target.checked); setGerados([]) }}
                  className="h-4 w-4"
                />
                Gerar um PDF único, na ordem da lista
              </label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm"
                  onClick={() => { setArquivos([]); setGerados([]) }} disabled={convertendo}>
                  Limpar
                </Button>
                <Button variant="success" size="sm" onClick={converter} disabled={convertendo}>
                  {convertendo
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Convertendo…</>
                    : <><FileCheck2 className="h-4 w-4" />Converter {arquivos.length > 1 ? `(${arquivos.length})` : ''}</>}
                </Button>
              </div>
            </div>
          </>
        )}

        {gerados.length > 0 && (
          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <p className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">
              {gerados.length === 1 ? 'PDF pronto' : `${gerados.length} PDFs prontos`}
            </p>
            {/* Vários arquivos ficam para o usuário baixar um a um: disparar
                vários downloads de uma vez faz o navegador bloquear todos menos
                o primeiro, sem avisar ninguém. */}
            <div className="flex flex-wrap gap-2">
              {gerados.map((p) => (
                <Button key={p.nome} variant="outline" size="sm" onClick={() => baixar(p.nome, p.base64)}>
                  <Download className="h-3.5 w-3.5" />
                  <span className="max-w-[280px] truncate">{p.nome}</span>
                  <span className="text-[11px] text-muted-foreground">{fmtTamanho(p.bytes)}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
