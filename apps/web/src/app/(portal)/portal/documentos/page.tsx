'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FolderPlus, Upload, Loader2, Clock, AlertCircle, Inbox, ArrowUpFromLine, X, Trash2,
  CheckCircle2, Info,
} from 'lucide-react'
import { cn } from '@saas/ui'

import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { usePortal } from '../../_lib/contexto'
import { PortalPageHeader } from '../../_components/portal-page-header'
import { Explorador, type Fonte } from '@/app/(dashboard)/gestao-arquivos/_components/explorador'
import { useFontesDoPortal } from './_components/fontes-portal'
import { LixeiraDoPortal } from './_components/lixeira-portal'

/**
 * Porta-arquivos do cliente.
 *
 * Mesmo explorador de três painéis do lado do escritório — árvore, lista,
 * pré-visualização —, com duas unidades: os documentos do sistema e a pasta do
 * cliente no Google Drive do escritório. Antes a navegação era em cards de
 * pasta, sem visualizador: abrir uma guia significava baixar o arquivo e
 * procurá-lo na pasta de downloads.
 *
 * A ordem dos blocos é deliberada:
 *  1. o que o escritório ESPERA dela (pendências) — é o que a trouxe aqui;
 *  2. os arquivos.
 * Abrir pela lista e esconder a pendência lá embaixo inverteria a razão de a
 * pessoa ter entrado.
 */

const COR_PORTAL = '#1a6dff'

interface Solicitacao {
  id: string
  titulo: string
  descricao: string | null
  prazo: string | null
  competencia: string | null
  categoria: string | null
}

function diasAte(prazo: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const d = new Date(prazo)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - hoje.getTime()) / 86_400_000)
}

/**
 * Faixa de aviso do portal.
 *
 * Sucesso some sozinho em 4s; erro FICA até alguém fechar. Um erro que
 * desaparece é um erro que ninguém leu — e aqui ele costuma significar que o
 * arquivo não chegou, que é justamente o que a pessoa precisa saber.
 */
function FaixaDeAviso({ aviso, onFechar }: {
  aviso: { tipo: 'sucesso' | 'erro' | 'info'; texto: string }
  onFechar: () => void
}) {
  useEffect(() => {
    if (aviso.tipo === 'erro') return
    const t = window.setTimeout(onFechar, 4000)
    return () => window.clearTimeout(t)
  }, [aviso, onFechar])

  const estilo = {
    sucesso: 'border-[#bfe3cd] bg-[#eefaf2] text-[#1c7a45] dark:border-[#1e3b2b] dark:bg-[#122019] dark:text-[#6fcf97]',
    erro: 'border-[#f0c9b4] bg-[#fdf0e6] text-[#c2510f] dark:border-[#4a2c17] dark:bg-[#2a1a10] dark:text-[#e09a6a]',
    info: 'border-[#dbe7fb] bg-[#f2f7ff] text-[#0b4fd0] dark:border-[#1b2739] dark:bg-[#16233a] dark:text-[#7db0ff]',
  }[aviso.tipo]

  const Icone = aviso.tipo === 'sucesso' ? CheckCircle2 : aviso.tipo === 'erro' ? AlertCircle : Info

  return (
    <div className={cn('anim-descer flex items-center gap-2.5 rounded-lg border px-4 py-2.5', estilo)}>
      <Icone className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 text-[13px]">{aviso.texto}</p>
      <button
        type="button"
        onClick={onFechar}
        className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
        aria-label="Fechar aviso"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export default function PortalDocumentosPage() {
  const { clienteId, vinculo } = usePortal()
  // Permissão explícita do usuário, não mais deduzida do nível: o escritório
  // decide por pessoa quem envia e quem só lê.
  const podeEditar = Boolean(vinculo?.podeEditar)
  const podeExcluir = Boolean(vinculo?.podeExcluir)

  const [pendencias, setPendencias] = useState<Solicitacao[]>([])
  const [enviando, setEnviando] = useState<string | null>(null)
  /**
   * Aviso com tipo.
   *
   * Era texto solto numa faixa azul: "Arquivo enviado" e "Falha ao enviar"
   * saíam idênticos, e a diferença entre deu certo e deu errado ficava só nas
   * palavras. Cor, ícone e permanência agora dizem antes da leitura.
   */
  const [aviso, setAviso] = useState<{ tipo: 'sucesso' | 'erro' | 'info'; texto: string } | null>(null)
  const [criandoPasta, setCriandoPasta] = useState(false)
  const [nomeNovaPasta, setNomeNovaPasta] = useState('')
  /** Arquivo aguardando confirmação de exclusão. */
  const [aExcluir, setAExcluir] = useState<{ id: string; fileName: string } | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [naLixeira, setNaLixeira] = useState(false)
  /** Onde criar pasta e enviar arquivo — vem do explorador. */
  const [atual, setAtual] = useState<{ fonte: Fonte; id: string | null }>({ fonte: 'documentos', id: null })
  // Remonta o explorador depois de enviar ou criar pasta, para a lista refletir
  // o que acabou de acontecer.
  const [versao, setVersao] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  /** Solicitação que o envio vai resolver, quando veio de uma pendência. */
  const alvoRef = useRef<Solicitacao | null>(null)

  const fontes = useFontesDoPortal(clienteId ?? '', { podeEditar, podeExcluir })

  const carregarPendencias = useCallback(async () => {
    if (!clienteId) return
    try {
      const p = await (trpc.portal as any).solicitacoes.pendentes.query({ clienteId })
      setPendencias(p)
    } catch { /* a tela funciona sem a lista de pendências */ }
  }, [clienteId])

  useEffect(() => { carregarPendencias() }, [carregarPendencias, versao])

  const aoMudarPasta = useCallback((fonte: Fonte, id: string | null) => {
    setAtual({ fonte, id })
  }, [])

  async function criarPasta() {
    const nome = nomeNovaPasta.trim()
    if (!nome) return
    try {
      await (trpc.portal as any).arquivos.driveCriarPasta.mutate({
        clienteId, nome, paiId: atual.id,
      })
      setNomeNovaPasta('')
      setCriandoPasta(false)
      setAviso({ tipo: 'sucesso', texto: `Pasta "${nome}" criada.` })
      setVersao(v => v + 1)
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message })
    }
  }

  async function confirmarExclusao() {
    if (!aExcluir) return
    setExcluindo(true)
    try {
      await (trpc.portal as any).arquivos.driveExcluir.mutate({ clienteId, itemId: aExcluir.id })
      setAviso({
        tipo: 'sucesso',
        texto: `"${aExcluir.fileName}" foi para a lixeira. Dá para restaurar por 30 dias.`,
      })
      setAExcluir(null)
      setVersao(v => v + 1)
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message })
    } finally {
      setExcluindo(false)
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

      // O arquivo cai na pasta que está aberta. `atual.id` nulo = raiz da
      // pasta do cliente.
      await (trpc.portal as any).arquivos.driveEnviar.mutate({
        clienteId,
        fileName: file.name,
        fileUrl: url,
        pastaId: atual.id,
        mimeType: file.type || null,
      })

      // A pendência é fechada em chamada separada porque o arquivo agora vive
      // no Drive: não há `ClienteArquivo` para carregar o `solicitacaoId` como
      // antes. Se o fechamento falhar, o arquivo já chegou — o cliente não
      // reenvia, o escritório vê o documento e a pendência fica para baixar na
      // mão, que é o lado certo de falhar.
      if (alvo) {
        await (trpc.portal as any).solicitacoes.marcarAtendida
          .mutate({ clienteId, solicitacaoId: alvo.id })
          .catch(() => undefined)
      }
      setAviso({
        tipo: 'sucesso',
        texto: alvo ? `Pendência "${alvo.titulo}" resolvida.` : `"${file.name}" enviado.`,
      })
      setVersao(v => v + 1)
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message })
    } finally {
      setEnviando(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) enviar(f) }}
      />

      <PortalPageHeader
        titulo="Documentos"
        subtitulo="Guias e relatórios que o escritório publica, e os arquivos que você envia."
        acoes={podeEditar ? (
          <>
            {podeExcluir && (
              <button
                type="button"
                onClick={() => { setNaLixeira(v => !v); setAviso(null) }}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition-colors',
                  naLixeira
                    ? 'border-[#1a6dff] bg-[#eaf1ff] text-[#1a6dff] dark:border-[#1b2739] dark:bg-[#16233a]'
                    : 'border-[#dbe7fb] bg-white text-slate-600 hover:bg-[#f2f7ff] dark:border-[#1b2739] dark:bg-[#0e1726] dark:text-slate-400 dark:hover:bg-[#16233a]',
                )}
              >
                <Trash2 className="h-4 w-4" /> {naLixeira ? 'Voltar aos arquivos' : 'Lixeira'}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setCriandoPasta(true); setNomeNovaPasta('') }}
              className="inline-flex items-center gap-2 rounded-lg border border-[#dbe7fb] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#1a6dff] hover:bg-[#f2f7ff] disabled:opacity-50 dark:border-[#1b2739] dark:bg-[#0e1726] dark:hover:bg-[#16233a]"
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
          </>
        ) : undefined}
      />

      {aviso && <FaixaDeAviso aviso={aviso} onFechar={() => setAviso(null)} />}

      {criandoPasta && (
        <div className="anim-descer flex flex-wrap items-center gap-2 rounded-xl border border-[#e6ebf2] bg-white p-3 dark:border-[#1b2739] dark:bg-[#0e1726]">
          <FolderPlus className="h-4 w-4 shrink-0 text-[#1a6dff]" />
          <input
            autoFocus
            value={nomeNovaPasta}
            onChange={e => setNomeNovaPasta(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') criarPasta()
              if (e.key === 'Escape') setCriandoPasta(false)
            }}
            maxLength={80}
            placeholder="Nome da pasta"
            className="h-9 min-w-0 flex-1 rounded-lg border border-[#dbe7fb] bg-white px-3 text-[13px] text-slate-900 outline-none focus:border-[#1a6dff] dark:border-[#1b2739] dark:bg-[#0b1220] dark:text-slate-100"
          />
          <button
            type="button"
            onClick={criarPasta}
            disabled={!nomeNovaPasta.trim()}
            className="rounded-lg bg-[#1a6dff] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#0b4fd0] disabled:opacity-60"
          >
            Criar
          </button>
          <button
            type="button"
            onClick={() => setCriandoPasta(false)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-[#16233a]"
            aria-label="Cancelar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
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
                      Enviar
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 2. O acervo. */}
      {/* Confirmação inline, no vocabulário do portal — não há sistema de
          modais aqui, e introduzir um só para isto seria desproporcional. O
          texto diz para onde o arquivo vai: "excluir" que some para sempre e
          "excluir" que volta por 30 dias pesam diferente na mão de quem clica. */}
      {aExcluir && (
        <div className="anim-descer flex flex-wrap items-center gap-3 rounded-xl border border-[#f0c9b4] bg-[#fdf0e6] p-3 dark:border-[#4a2c17] dark:bg-[#2a1a10]">
          <AlertCircle className="h-4 w-4 shrink-0 text-[#d97b34]" />
          <p className="min-w-0 flex-1 text-[13px] text-slate-900 dark:text-slate-100">
            Excluir <span className="font-semibold">{aExcluir.fileName}</span>?
            <span className="text-slate-600 dark:text-slate-400">
              {' '}Vai para a lixeira do Google Drive e volta por 30 dias.
            </span>
          </p>
          <button
            type="button"
            onClick={confirmarExclusao}
            disabled={excluindo}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#c2510f] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#a34410] disabled:opacity-60"
          >
            {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Excluir
          </button>
          <button
            type="button"
            onClick={() => setAExcluir(null)}
            disabled={excluindo}
            className="shrink-0 rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
        </div>
      )}

      {naLixeira ? (
        <LixeiraDoPortal
          clienteId={clienteId ?? ''}
          altura="h-[calc(100vh-290px)]"
          onRestaurado={nome => {
            setAviso({ tipo: 'sucesso', texto: `"${nome}" foi restaurado.` })
            // A pasta aberta pode ter recebido o item de volta; recarregar
            // deixa a lista certa quando a pessoa voltar para ela.
            setVersao(v => v + 1)
          }}
          onErro={msg => setAviso({ tipo: 'erro', texto: msg })}
        />
      ) : (
        <Explorador
          fontes={fontes}
          cor={COR_PORTAL}
          altura="h-[calc(100vh-290px)]"
          onPastaAtual={aoMudarPasta}
          recarregar={versao}
          onExcluir={a => { setAviso(null); setAExcluir(a) }}
        />
      )}
    </div>
  )
}
