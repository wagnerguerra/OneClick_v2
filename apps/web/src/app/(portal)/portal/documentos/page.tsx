'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FolderOpen, Upload, Download, Loader2, Clock, AlertCircle,
  FileText, ArrowUpFromLine, Inbox,
} from 'lucide-react'
import { cn } from '@saas/ui'

import { trpc } from '@/lib/trpc'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { usePortal } from '../../_lib/contexto'

/**
 * Porta-arquivos do cliente — Fase 1.
 *
 * O vaivém de documento que hoje acontece por e-mail e WhatsApp. A organização
 * é por COMPETÊNCIA porque é assim que contabilidade se organiza, e "cadê a
 * guia de agosto?" é como a pessoa procura.
 *
 * A tela tem três blocos, nesta ordem de propósito:
 *  1. o que o escritório ESPERA dela (pendências) — é o que a trouxe aqui;
 *  2. o envio;
 *  3. o histórico por competência.
 * Abrir com a lista de arquivos e esconder a pendência lá embaixo inverteria a
 * razão de a pessoa ter entrado.
 */

interface Competencia { competencia: string; arquivos: number }

interface Arquivo {
  id: string
  fileName: string
  fileSize: number | null
  mimeType: string | null
  descricao: string | null
  competencia: string | null
  categoria: string | null
  origem: string
  criadoEm: string
  lidoEm: string | null
  enviadoPor: string | null
}

interface Solicitacao {
  id: string
  titulo: string
  descricao: string | null
  prazo: string | null
  competencia: string | null
  categoria: string | null
}

const ROTULO_CATEGORIA: Record<string, string> = {
  guias: 'Guias e impostos',
  folha: 'Folha de pagamento',
  notas: 'Notas fiscais',
  contabil: 'Contábil',
  societario: 'Societário',
  outros: 'Outros',
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** "202609" → "setembro de 2026". A competência é o eixo da tela. */
function rotuloCompetencia(c: string): string {
  const ano = c.slice(0, 4)
  const mes = Number(c.slice(4, 6))
  return `${MESES[mes - 1] ?? c} de ${ano}`
}

function tamanho(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function competenciaAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Dias até o prazo. Negativo = atrasado. */
function diasAte(prazo: string): number {
  const alvo = new Date(prazo)
  alvo.setHours(23, 59, 59, 999)
  return Math.ceil((alvo.getTime() - Date.now()) / 86_400_000)
}

export default function PortalDocumentosPage() {
  const { clienteId, vinculo } = usePortal()
  const podeEnviar = vinculo?.nivel !== 'CONSULTA'

  const [competencias, setCompetencias] = useState<Competencia[]>([])
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [pendencias, setPendencias] = useState<Solicitacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  /** Solicitação que o envio vai resolver, quando veio de uma pendência. */
  const alvoRef = useRef<Solicitacao | null>(null)

  const carregar = useCallback(async () => {
    if (!clienteId) return
    setCarregando(true)
    try {
      const [comps, pend] = await Promise.all([
        (trpc.portal as any).arquivos.competencias.query({ clienteId }),
        (trpc.portal as any).solicitacoes.pendentes.query({ clienteId }),
      ]) as [Competencia[], Solicitacao[]]
      setCompetencias(comps)
      setPendencias(pend)
      setSelecionada(s => s ?? comps[0]?.competencia ?? null)
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [clienteId])

  useEffect(() => { carregar() }, [carregar])

  // Lista da competência escolhida. Sem competência (cliente novo), mostra os
  // mais recentes — a tela nunca fica vazia por causa de um filtro.
  useEffect(() => {
    if (!clienteId) return
    ;(trpc.portal as any).arquivos.listar
      .query({ clienteId, ...(selecionada ? { competencia: selecionada } : {}) })
      .then((a: Arquivo[]) => setArquivos(a))
      .catch(() => setArquivos([]))
  }, [clienteId, selecionada])

  async function baixar(a: Arquivo) {
    try {
      const r = await (trpc.portal as any).arquivos.abrir.mutate({ clienteId, arquivoId: a.id }) as
        { fileUrl: string; fileName: string }
      window.open(resolveAssetUrl(r.fileUrl), '_blank', 'noopener')
      // O recibo de leitura acabou de ser gravado no servidor; refletir na
      // hora evita a linha continuar dizendo "não lido" depois de aberta.
      setArquivos(lista => lista.map(x => (x.id === a.id ? { ...x, lidoEm: new Date().toISOString() } : x)))
    } catch (e) {
      setAviso((e as Error).message)
    }
  }

  function escolherArquivo(solicitacao?: Solicitacao) {
    alvoRef.current = solicitacao ?? null
    inputRef.current?.click()
  }

  async function enviar(file: File) {
    const alvo = alvoRef.current
    setEnviando(alvo?.id ?? 'livre')
    setAviso(null)
    try {
      // O upload passa pelo endpoint de sempre; o vínculo com o cliente é feito
      // depois, pela rota do portal, que é quem conhece o escopo.
      const form = new FormData()
      form.append('file', file)
      const up = await fetch(`${getApiUrl()}/api/upload`, {
        method: 'POST', body: form, credentials: 'include',
      })
      if (!up.ok) throw new Error('Falha ao enviar o arquivo. Tente de novo.')
      const { url } = await up.json() as { url: string }

      await (trpc.portal as any).arquivos.enviar.mutate({
        clienteId,
        fileName: file.name,
        fileUrl: url,
        fileSize: file.size,
        mimeType: file.type || null,
        competencia: alvo?.competencia ?? selecionada ?? competenciaAtual(),
        categoria: alvo?.categoria ?? null,
        solicitacaoId: alvo?.id ?? null,
      })
      await carregar()
      setSelecionada(alvo?.competencia ?? selecionada ?? competenciaAtual())
      setAviso(alvo ? `Pendência "${alvo.titulo}" resolvida.` : 'Arquivo enviado.')
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setEnviando(null)
      alvoRef.current = null
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, Arquivo[]>()
    for (const a of arquivos) {
      const k = a.categoria ?? 'outros'
      mapa.set(k, [...(mapa.get(k) ?? []), a])
    }
    return [...mapa.entries()]
  }, [arquivos])

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando seus documentos…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) enviar(f) }}
      />

      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Documentos
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Guias e relatórios que o escritório publica, e os arquivos que você envia.
          </p>
        </div>
        {podeEnviar && (
          <button
            type="button"
            onClick={() => escolherArquivo()}
            disabled={enviando !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1a6dff] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0b4fd0] disabled:opacity-60"
          >
            {enviando === 'livre'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Upload className="h-4 w-4" />}
            Enviar arquivo
          </button>
        )}
      </section>

      {aviso && (
        <p className="rounded-lg border border-[#dbe7fb] bg-[#f2f7ff] px-4 py-2.5 text-[13px] text-[#0b4fd0] dark:border-[#1b2739] dark:bg-[#16233a] dark:text-[#7db0ff]">
          {aviso}
        </p>
      )}

      {/* 1. O que estão esperando de você. Vem primeiro porque é o que traz a
             pessoa aqui — e o que ela pode resolver agora. */}
      {pendencias.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-slate-900 dark:text-slate-100">
            <Clock className="h-4 w-4 text-[#d97b34]" />
            O escritório está esperando {pendencias.length === 1 ? 'um documento' : `${pendencias.length} documentos`}
          </h2>
          <div className="flex flex-col gap-2">
            {pendencias.map(s => {
              const dias = s.prazo ? diasAte(s.prazo) : null
              const atrasada = dias !== null && dias < 0
              return (
                <div
                  key={s.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 dark:bg-[#0e1726]',
                    atrasada
                      ? 'border-[#f0c9b4] dark:border-[#4a2c17]'
                      : 'border-[#e6ebf2] dark:border-[#1b2739]',
                  )}
                >
                  <span className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    atrasada ? 'bg-[#fdf0e6] text-[#d97b34]' : 'bg-[#eaf1ff] text-[#1a6dff]',
                  )}>
                    {atrasada ? <AlertCircle className="h-4 w-4" /> : <Inbox className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{s.titulo}</p>
                    <p className="text-[12px] text-slate-600 dark:text-slate-400">
                      {s.descricao ? `${s.descricao} · ` : ''}
                      {s.competencia ? `${rotuloCompetencia(s.competencia)}` : 'sem competência'}
                      {dias !== null && (
                        <> · <span className={atrasada ? 'font-semibold text-[#c2510f] dark:text-[#e09a6a]' : ''}>
                          {atrasada
                            ? `atrasado há ${Math.abs(dias)} dia(s)`
                            : dias === 0 ? 'vence hoje' : `faltam ${dias} dia(s)`}
                        </span></>
                      )}
                    </p>
                  </div>
                  {podeEnviar && (
                    <button
                      type="button"
                      onClick={() => escolherArquivo(s)}
                      disabled={enviando !== null}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#1a6dff] px-3 py-1.5 text-[12px] font-semibold text-[#1a6dff] hover:bg-[#eaf1ff] disabled:opacity-60 dark:hover:bg-[#16233a]"
                    >
                      {enviando === s.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <ArrowUpFromLine className="h-3.5 w-3.5" />}
                      Anexar
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 2. Histórico, por competência. */}
      <section className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* Árvore de pastas — a competência é a raiz. */}
        <aside className="flex flex-col gap-1.5">
          <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Competência
          </p>
          {competencias.length === 0 ? (
            <p className="px-1 text-[12px] text-slate-500">Nenhum arquivo ainda.</p>
          ) : (
            competencias.map(c => (
              <button
                key={c.competencia}
                type="button"
                onClick={() => setSelecionada(c.competencia)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
                  c.competencia === selecionada
                    ? 'bg-[#eaf1ff] font-semibold text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#16233a]',
                )}
              >
                <span className="truncate capitalize">{rotuloCompetencia(c.competencia)}</span>
                <span className="shrink-0 text-[11px] opacity-70">{c.arquivos}</span>
              </button>
            ))
          )}
        </aside>

        <div className="flex flex-col gap-4">
          {arquivos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#dbe7fb] bg-white py-14 text-center dark:border-[#1b2739] dark:bg-[#0e1726]">
              <FolderOpen className="h-9 w-9 text-slate-300" />
              <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-300">
                Nenhum documento nesta competência
              </p>
              <p className="max-w-sm text-[12.5px] text-slate-500">
                Quando o escritório publicar guias ou relatórios, eles aparecem aqui —
                e o que você enviar também.
              </p>
            </div>
          ) : (
            porCategoria.map(([categoria, lista]) => (
              <div key={categoria} className="overflow-hidden rounded-2xl border border-[#e6ebf2] bg-white dark:border-[#1b2739] dark:bg-[#0e1726]">
                <p className="border-b border-[#eef2f7] px-4 py-2.5 text-[12px] font-semibold text-slate-700 dark:border-[#1b2739] dark:text-slate-300">
                  {ROTULO_CATEGORIA[categoria] ?? categoria}
                  <span className="ml-2 font-normal text-slate-400">{lista.length}</span>
                </p>
                <div className="divide-y divide-[#f1f5f9] dark:divide-[#16233a]">
                  {lista.map(a => (
                    <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f4f7fb] text-slate-500 dark:bg-[#16233a]">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-slate-900 dark:text-slate-100">
                          {a.fileName}
                        </p>
                        <p className="truncate text-[11.5px] text-slate-500">
                          {/* Origem primeiro: saber se veio do escritório ou se
                              foi a própria empresa que mandou é a informação
                              que evita a pergunta "quem mandou isso?". */}
                          {a.origem === 'CLIENTE'
                            ? <>Enviado por {a.enviadoPor ?? 'você'}</>
                            : <>Publicado pelo escritório</>}
                          {' · '}{tamanho(a.fileSize)}
                          {' · '}{new Date(a.criadoEm).toLocaleDateString('pt-BR')}
                          {a.descricao ? ` · ${a.descricao}` : ''}
                        </p>
                      </div>
                      {/* Recibo de leitura — só para o que o escritório publicou.
                          "Não lido" no que a própria pessoa enviou não diria nada. */}
                      {a.origem !== 'CLIENTE' && (
                        <span className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          a.lidoEm
                            ? 'bg-[#e9f6ee] text-[#1f9254] dark:bg-[#12291f] dark:text-[#6dc79b]'
                            : 'bg-[#fdf0e6] text-[#d97b34] dark:bg-[#332115] dark:text-[#e09a6a]',
                        )}>
                          {a.lidoEm ? 'visto' : 'não lido'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => baixar(a)}
                        title="Baixar"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#1a6dff] dark:hover:bg-[#16233a]"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
