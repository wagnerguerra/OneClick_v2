'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, ThumbsUp, MessageSquare, Lightbulb, CircleCheck, CircleDashed } from 'lucide-react'
import { getApiUrl } from '@/lib/api-url'

interface Consulta {
  protocolo: string
  tipo: string
  status: string
  titulo: string | null
  descricao: string
  criadoEm: string
  resposta: string | null
  respondidoEm: string | null
  retornoCliente: string | null
  retornoFinal: string | null
  justificativa: string | null
  procede: boolean | null
  encerradoEm: string | null
  mensagens: Array<{ id: string; texto: string; criadoEm: string }>
}

const TIPO_META: Record<string, { rotulo: string; Icon: typeof ThumbsUp; cor: string }> = {
  ELOGIO: { rotulo: 'Elogio', Icon: ThumbsUp, cor: 'text-emerald-600 dark:text-emerald-400' },
  RECLAMACAO: { rotulo: 'Reclamação', Icon: MessageSquare, cor: 'text-rose-600 dark:text-rose-400' },
  SUGESTAO: { rotulo: 'Sugestão', Icon: Lightbulb, cor: 'text-amber-600 dark:text-amber-400' },
}

const STATUS_LABEL: Record<string, string> = {
  RECEBIDA: 'Recebida — em triagem',
  RESPONDIDA: 'Respondida',
  ENCERRADA: 'Encerrada',
  AGUARDANDO_RETORNO: 'Recebida — aguardando primeiro retorno',
  AGUARDANDO_ANALISE: 'Em análise',
  REGISTRAR_EFICACIA: 'Em tratamento',
  FINALIZADA: 'Finalizada',
  NAO_PROCEDENTE: 'Analisada — não procedente',
}

const ENCERRADOS = new Set(['ENCERRADA', 'FINALIZADA', 'NAO_PROCEDENTE', 'RESPONDIDA'])

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

/** HTML confiável? Não — sanitiza no braço: só texto dos <p>. */
function paraTexto(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .split(/\n+/).map((l) => l.trim()).filter(Boolean)
}

/**
 * Acompanhamento público pelo protocolo — mostra a tratativa sem exigir
 * identificação (o protocolo É a credencial). Nada de autor ou notas
 * internas: o backend já entrega o payload redigido.
 */
export default function AcompanharManifestacaoPage() {
  const params = useParams<{ protocolo: string }>()
  const protocolo = decodeURIComponent(params.protocolo ?? '').toUpperCase()
  const [dados, setDados] = useState<Consulta | null>(null)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${getApiUrl()}/api/manifestacao-publica/${encodeURIComponent(protocolo)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.message || 'Protocolo não encontrado.')
        setDados(data)
      })
      .catch((e) => setErro((e as Error).message))
      .finally(() => setLoading(false))
  }, [protocolo])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (erro || !dados) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 text-center">
        <p className="text-lg font-semibold">Protocolo não encontrado</p>
        <p className="text-sm text-muted-foreground mt-2">{erro}</p>
        <Link href="/manifestacao" className="mt-6 text-sm font-semibold text-sky-600 hover:underline">Voltar ao início</Link>
      </div>
    )
  }

  const meta = TIPO_META[dados.tipo] ?? TIPO_META.ELOGIO!
  const encerrada = ENCERRADOS.has(dados.status)

  const blocos: Array<{ titulo: string; html: string; data?: string | null }> = []
  if (dados.retornoCliente) blocos.push({ titulo: 'Primeiro retorno', html: dados.retornoCliente })
  if (dados.justificativa) blocos.push({ titulo: 'Justificativa', html: dados.justificativa })
  if (dados.retornoFinal) blocos.push({ titulo: 'Posição final', html: dados.retornoFinal, data: dados.encerradoEm })
  if (dados.resposta) blocos.push({ titulo: 'Resposta', html: dados.resposta, data: dados.respondidoEm })

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Link href="/manifestacao" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3.5 w-3.5" />Voltar
      </Link>

      <div className="flex items-center gap-3">
        <meta.Icon className={`h-6 w-6 ${meta.cor}`} />
        <div>
          <h1 className="text-lg font-bold tracking-widest tabular-nums">{dados.protocolo}</h1>
          <p className="text-xs text-muted-foreground">{meta.rotulo} · registrado em {dataBR(dados.criadoEm)}</p>
        </div>
      </div>

      {/* Situação */}
      <div className={`mt-5 flex items-center gap-2 rounded-lg border p-3 ${encerrada
        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
        : 'border-sky-200 bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/20'}`}>
        {encerrada
          ? <CircleCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          : <CircleDashed className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />}
        <span className="text-sm font-semibold">{STATUS_LABEL[dados.status] ?? dados.status}</span>
        {dados.tipo === 'RECLAMACAO' && dados.procede === false && (
          <span className="ml-auto text-[11px] text-muted-foreground">não procedente</span>
        )}
      </div>

      {/* O que foi registrado */}
      <div className="mt-5 rounded-lg border border-border bg-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Sua manifestação</p>
        {dados.titulo && <p className="text-sm font-semibold mb-1">{dados.titulo}</p>}
        <div className="space-y-1.5">
          {paraTexto(dados.descricao).map((l, i) => <p key={i} className="text-sm">{l}</p>)}
        </div>
      </div>

      {/* Tratativa */}
      {blocos.length > 0 && (
        <div className="mt-5 space-y-3">
          {blocos.map((b) => (
            <div key={b.titulo} className="rounded-lg border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {b.titulo}{b.data ? ` · ${dataBR(b.data)}` : ''}
              </p>
              <div className="space-y-1.5">
                {paraTexto(b.html).map((l, i) => <p key={i} className="text-sm">{l}</p>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mensagens públicas da tratativa */}
      {dados.mensagens.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Atualizações</p>
          {dados.mensagens.map((m) => (
            <div key={m.id} className="rounded-lg border border-border bg-card p-3">
              <div className="space-y-1">
                {paraTexto(m.texto).map((l, i) => <p key={i} className="text-sm">{l}</p>)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">{dataBR(m.criadoEm)}</p>
            </div>
          ))}
        </div>
      )}

      {blocos.length === 0 && dados.mensagens.length === 0 && !encerrada && (
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Ainda sem atualizações — volte a consultar em alguns dias.
        </p>
      )}
    </div>
  )
}
