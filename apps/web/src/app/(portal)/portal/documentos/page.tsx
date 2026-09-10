'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FolderOpen, Folder, FolderPlus, Upload, Download, Loader2, Clock, AlertCircle,
  FileText, ArrowUpFromLine, Inbox, ChevronRight, Home, Trash2,
} from 'lucide-react'
import { cn } from '@saas/ui'

import { trpc } from '@/lib/trpc'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { usePortal } from '../../_lib/contexto'

/**
 * Porta-arquivos do cliente.
 *
 * A navegação é por PASTA, no modelo do Drive: o cliente cria as suas, entra,
 * envia dentro delas. A primeira versão navegava por competência e resolvia só
 * a guia mensal — "Contratos" e "Documentos societários" não têm mês.
 *
 * A tela tem dois blocos, nesta ordem de propósito:
 *  1. o que o escritório ESPERA dela (pendências) — é o que a trouxe aqui;
 *  2. as pastas e os arquivos.
 * Abrir pela lista de arquivos e esconder a pendência lá embaixo inverteria a
 * razão de a pessoa ter entrado.
 */

interface Pasta {
  id: string
  nome: string
  origem: string
  criadaEm: string
  /** Subpastas + arquivos — o "3 itens" do card. */
  itens: number
}

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

function tamanho(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Dias até o prazo. Negativo = atrasado. */
function diasAte(prazo: string): number {
  const alvo = new Date(prazo)
  alvo.setHours(23, 59, 59, 999)
  return Math.ceil((alvo.getTime() - Date.now()) / 86_400_000)
}

export default function PortalDocumentosPage() {
  const { clienteId, vinculo } = usePortal()
  const podeEditar = vinculo?.nivel !== 'CONSULTA'

  const [pastaId, setPastaId] = useState<string | null>(null)
  const [pastas, setPastas] = useState<Pasta[]>([])
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [caminho, setCaminho] = useState<Array<{ id: string; nome: string }>>([])
  const [pendencias, setPendencias] = useState<Solicitacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [criandoPasta, setCriandoPasta] = useState(false)
  const [nomeNovaPasta, setNomeNovaPasta] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  /** Solicitação que o envio vai resolver, quando veio de uma pendência. */
  const alvoRef = useRef<Solicitacao | null>(null)

  const abrir = useCallback(async (destino: string | null) => {
    if (!clienteId) return
    setCarregando(true)
    setAviso(null)
    try {
      const [conteudo, pend] = await Promise.all([
        (trpc.portal as any).arquivos.abrirPasta.query({ clienteId, pastaId: destino }),
        (trpc.portal as any).solicitacoes.pendentes.query({ clienteId }),
      ]) as [{ pastas: Pasta[]; arquivos: Arquivo[]; caminho: Array<{ id: string; nome: string }> }, Solicitacao[]]
      setPastas(conteudo.pastas)
      setArquivos(conteudo.arquivos)
      setCaminho(conteudo.caminho)
      setPendencias(pend)
      setPastaId(destino)
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [clienteId])

  useEffect(() => { abrir(null) }, [abrir])

  async function criarPasta() {
    const nome = nomeNovaPasta.trim()
    if (!nome) return
    try {
      await (trpc.portal as any).arquivos.criarPasta.mutate({ clienteId, nome, paiId: pastaId })
      setNomeNovaPasta('')
      setCriandoPasta(false)
      await abrir(pastaId)
    } catch (e) {
      setAviso((e as Error).message)
    }
  }

  async function excluirPasta(p: Pasta) {
    if (p.itens > 0) {
      setAviso(`"${p.nome}" não está vazia. Esvazie antes de apagar.`)
      return
    }
    try {
      await (trpc.portal as any).arquivos.excluirPasta.mutate({ clienteId, pastaId: p.id })
      await abrir(pastaId)
    } catch (e) {
      setAviso((e as Error).message)
    }
  }

  async function baixar(a: Arquivo) {
    try {
      const r = await (trpc.portal as any).arquivos.abrir.mutate({ clienteId, arquivoId: a.id }) as
        { fileUrl: string; fileName: string }
      window.open(resolveAssetUrl(r.fileUrl), '_blank', 'noopener')
      // O recibo acabou de ser gravado no servidor; refletir aqui evita a linha
      // continuar dizendo "não lido" depois de aberta.
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
      // O upload passa pelo endpoint de sempre; o vínculo com o cliente e com a
      // pasta é feito depois, pela rota do portal, que é quem conhece o escopo.
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
        // Envio livre cai na pasta aberta; envio que resolve pendência herda a
        // competência e a categoria do pedido.
        pastaId,
        competencia: alvo?.competencia ?? null,
        categoria: alvo?.categoria ?? null,
        solicitacaoId: alvo?.id ?? null,
      })
      await abrir(pastaId)
      setAviso(alvo ? `Pendência "${alvo.titulo}" resolvida.` : 'Arquivo enviado.')
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setEnviando(null)
      alvoRef.current = null
      if (inputRef.current) inputRef.current.value = ''
    }
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
        {podeEditar && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setCriandoPasta(true); setNomeNovaPasta('') }}
              className="inline-flex items-center gap-2 rounded-lg border border-[#dbe7fb] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#1a6dff] hover:bg-[#f2f7ff] dark:border-[#1b2739] dark:bg-[#0e1726] dark:hover:bg-[#16233a]"
            >
              <FolderPlus className="h-4 w-4" /> Nova pasta
            </button>
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
          </div>
        )}
      </section>

      {aviso && (
        <p className="rounded-lg border border-[#dbe7fb] bg-[#f2f7ff] px-4 py-2.5 text-[13px] text-[#0b4fd0] dark:border-[#1b2739] dark:bg-[#16233a] dark:text-[#7db0ff]">
          {aviso}
        </p>
      )}

      {/* 1. O que estão esperando de você. */}
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
                    atrasada ? 'border-[#f0c9b4] dark:border-[#4a2c17]' : 'border-[#e6ebf2] dark:border-[#1b2739]',
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
                      {s.descricao ? `${s.descricao}` : 'Sem detalhes'}
                      {dias !== null && (
                        <> · <span className={atrasada ? 'font-semibold text-[#c2510f] dark:text-[#e09a6a]' : ''}>
                          {atrasada
                            ? `atrasado há ${Math.abs(dias)} dia(s)`
                            : dias === 0 ? 'vence hoje' : `faltam ${dias} dia(s)`}
                        </span></>
                      )}
                    </p>
                  </div>
                  {podeEditar && (
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

      {/* 2. Pastas e arquivos. */}
      <section className="flex flex-col gap-4">
        {/* Caminho — clicável em cada nível, como no Drive. */}
        <nav className="flex flex-wrap items-center gap-1 text-[13px]">
          <button
            type="button"
            onClick={() => abrir(null)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-slate-100 dark:hover:bg-[#16233a]',
              caminho.length === 0 ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-500',
            )}
          >
            <Home className="h-3.5 w-3.5" /> Meus documentos
          </button>
          {caminho.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              <button
                type="button"
                onClick={() => abrir(c.id)}
                className={cn(
                  'rounded-md px-2 py-1 hover:bg-slate-100 dark:hover:bg-[#16233a]',
                  i === caminho.length - 1
                    ? 'font-semibold text-slate-900 dark:text-slate-100'
                    : 'text-slate-500',
                )}
              >
                {c.nome}
              </button>
            </span>
          ))}
        </nav>

        {/* Criação de pasta — some assim que resolve, como no Drive. */}
        {criandoPasta && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#dbe7fb] bg-white p-3 dark:border-[#1b2739] dark:bg-[#0e1726]">
            <Folder className="h-4 w-4 shrink-0 text-[#1a6dff]" />
            <input
              autoFocus
              value={nomeNovaPasta}
              onChange={e => setNomeNovaPasta(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') criarPasta()
                if (e.key === 'Escape') { setCriandoPasta(false); setNomeNovaPasta('') }
              }}
              placeholder="Nome da pasta"
              className="min-w-[180px] flex-1 rounded-md border border-[#e6ebf2] bg-transparent px-3 py-1.5 text-[13px] outline-none focus:border-[#1a6dff] dark:border-[#1b2739]"
            />
            <button
              type="button" onClick={criarPasta} disabled={!nomeNovaPasta.trim()}
              className="rounded-md bg-[#1a6dff] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              Criar
            </button>
            <button
              type="button" onClick={() => { setCriandoPasta(false); setNomeNovaPasta('') }}
              className="px-2 py-1.5 text-[12px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Cancelar
            </button>
          </div>
        )}

        {carregando ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : pastas.length === 0 && arquivos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#dbe7fb] bg-white py-14 text-center dark:border-[#1b2739] dark:bg-[#0e1726]">
            <FolderOpen className="h-9 w-9 text-slate-300" />
            <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-300">
              {caminho.length === 0 ? 'Nada por aqui ainda' : 'Pasta vazia'}
            </p>
            <p className="max-w-sm text-[12.5px] text-slate-500">
              {caminho.length === 0
                ? 'Quando o escritório publicar guias ou relatórios, eles aparecem aqui — e o que você enviar também.'
                : 'Envie um arquivo ou crie uma subpasta.'}
            </p>
          </div>
        ) : (
          <>
            {/* Pastas primeiro, em grade — a leitura do Drive. */}
            {pastas.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {pastas.map(p => (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => abrir(p.id)}
                    onKeyDown={e => { if (e.key === 'Enter') abrir(p.id) }}
                    className="group flex cursor-pointer items-center gap-3 rounded-xl border border-[#e6ebf2] bg-white p-3.5 transition-shadow hover:shadow-md dark:border-[#1b2739] dark:bg-[#0e1726]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eaf1ff] text-[#1a6dff] dark:bg-[#16233a]">
                      <Folder className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">
                        {p.nome}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {p.itens === 0 ? 'vazia' : `${p.itens} item(ns)`}
                        {p.origem === 'ESCRITORIO' && ' · do escritório'}
                      </p>
                    </div>
                    {/* Apagar só aparece no hover e só em pasta vazia — some a
                        chance de clicar sem querer em pasta com conteúdo. */}
                    {podeEditar && p.itens === 0 && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); excluirPasta(p) }}
                        className="shrink-0 text-slate-300 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                        title="Apagar pasta vazia"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Arquivos da pasta. */}
            {arquivos.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-[#e6ebf2] bg-white dark:border-[#1b2739] dark:bg-[#0e1726]">
                <div className="divide-y divide-[#f1f5f9] dark:divide-[#16233a]">
                  {arquivos.map(a => (
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
                              foi a própria empresa que mandou evita a pergunta
                              "quem mandou isso?". */}
                          {a.origem === 'CLIENTE'
                            ? <>Enviado por {a.enviadoPor ?? 'você'}</>
                            : <>Publicado pelo escritório</>}
                          {' · '}{tamanho(a.fileSize)}
                          {' · '}{new Date(a.criadoEm).toLocaleDateString('pt-BR')}
                          {a.categoria && ` · ${ROTULO_CATEGORIA[a.categoria] ?? a.categoria}`}
                        </p>
                      </div>
                      {/* Recibo — só no que o escritório publicou. "Não lido" no
                          que a própria pessoa enviou não diria nada. */}
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
            )}
          </>
        )}
      </section>
    </div>
  )
}
