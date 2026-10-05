'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, EyeOff, Send, MessageSquare, Lock, Globe, Building2, User as UserIcon, X, Pencil,
  FileText, Paperclip, Download, Trash2, Upload,
} from 'lucide-react'
import {
  Button, Badge, Checkbox, cn,
  Sheet, SheetContent, SheetTitle, SheetDescription,
  RichEditor, RichContent,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { SURFACE, TEXT } from '@/lib/color-styles'
import { STATUS_LABEL } from './manifestacao-page'
import type { Config } from './tipos'
import { NovaManifestacaoModal } from './nova-manifestacao'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'

/**
 * Texto do fluxo: o que veio do v1 está em HTML (`<p>…</p>`) e aparecia cru;
 * o digitado aqui é texto puro. Cada um no seu formato.
 */
function TextoOuHtml({ texto }: { texto: string }) {
  return /<[a-z][\s\S]*>/i.test(texto)
    ? <div className="text-[13px]"><RichContent html={texto} /></div>
    : <p className="whitespace-pre-wrap text-[13px]">{texto}</p>
}

interface Anexo { id: string; nome: string; arquivoPath: string; mime: string | null; bytes: number | null; criadoEm: string }

function ArquivosDaManifestacao({ arquivos, podeAnexar, onEnviar, onRemover, enviando }: {
  arquivos: Anexo[]
  podeAnexar: boolean
  onEnviar: (files: File[]) => void
  onRemover: (a: Anexo) => void
  enviando: boolean
}) {
  const [arrastando, setArrastando] = useState(false)
  const tam = (b: number | null) => (b == null ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)
  return (
    <div className="space-y-3">
      {podeAnexar && (
        <label
          onDragOver={e => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={e => { e.preventDefault(); setArrastando(false); onEnviar(Array.from(e.dataTransfer.files)) }}
          className={cn('flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center text-[12.5px] text-muted-foreground transition-colors',
            arrastando ? 'border-foreground/40 bg-muted/40' : 'border-border hover:bg-muted/30')}>
          {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {enviando ? 'Enviando…' : 'Arraste arquivos aqui ou clique para escolher'}
          <input type="file" multiple className="hidden" disabled={enviando}
            onChange={e => { onEnviar(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        </label>
      )}
      {arquivos.length === 0 ? (
        <p className="py-6 text-center text-[12px] italic text-muted-foreground">Nenhum arquivo anexado.</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border">
          {arquivos.map(a => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <a href={resolveAssetUrl(a.arquivoPath)} target="_blank" rel="noopener noreferrer"
                  className="block truncate text-[13px] font-medium hover:underline" title={a.nome}>{a.nome}</a>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(a.criadoEm).toLocaleString('pt-BR')}{a.bytes != null ? ` · ${tam(a.bytes)}` : ''}
                </p>
              </div>
              <a href={resolveAssetUrl(a.arquivoPath)} download={a.nome} title="Baixar"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <Download className="h-4 w-4" />
              </a>
              {podeAnexar && (
                <button type="button" onClick={() => onRemover(a)} title="Remover"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const PRIMARY = 'var(--color-primary)'

/**
 * A tratativa de uma manifestação.
 *
 * Painel lateral, como no helpdesk e nos relatórios: o percurso aqui é ler o
 * relato, conversar e responder, e voltar à lista a cada passo quebraria isso.
 */
export function ManifestacaoDetalhe({ config, id, podeTratar, onClose, onMudou }: {
  config: Config
  id: string
  podeTratar: boolean
  onClose: () => void
  onMudou: () => void
}) {
  const api = (trpc as never as Record<string, any>)[config.router]

  const [m, setM] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [resposta, setResposta] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [novaMsg, setNovaMsg] = useState('')
  const [msgInterna, setMsgInterna] = useState(true)
  const [editando, setEditando] = useState(false)
  const [aba, setAba] = useState<'detalhes' | 'conversa' | 'arquivos'>('detalhes')
  const [enviandoArq, setEnviandoArq] = useState(false)

  async function enviarArquivo(files: File[]) {
    if (!files.length) return
    setEnviandoArq(true)
    try {
      for (const file of files) {
        const fd = new FormData(); fd.append('file', file, file.name)
        const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', credentials: 'include', body: fd })
        if (!res.ok) throw new Error(`${file.name}: envio falhou (HTTP ${res.status})`)
        const up = await res.json() as { url: string }
        await api.adicionarArquivo.mutate({ id, nome: file.name, url: up.url, mime: file.type || null, bytes: file.size })
      }
      await carregar(); onMudou()
    } catch (e) {
      await alerts.error('Não foi possível anexar', (e as Error).message)
    } finally {
      setEnviandoArq(false)
    }
  }

  async function removerArquivo(arq: { id: string; nome: string }) {
    const ok = await alerts.confirm({ title: 'Remover o arquivo?', text: arq.nome, icon: 'warning', confirmText: 'Remover' })
    if (!ok) return
    try {
      await api.removerArquivo.mutate({ arquivoId: arq.id })
      await carregar(); onMudou()
    } catch (e) {
      await alerts.error('Não foi possível remover', (e as Error).message)
    }
  }

  // Campos do fluxo da reclamação — um por passo.
  const [textoFluxo, setTextoFluxo] = useState('')
  const [procede, setProcede] = useState<boolean | null>(null)
  const [causa, setCausa] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [retornoFinal, setRetornoFinal] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await api.getById.query({ id })
      setM(r)
      setResposta(r?.resposta ?? '')
    } catch (e) {
      await alerts.error('Não foi possível abrir', (e as Error).message)
      onClose()
    } finally {
      setCarregando(false)
    }
  }, [api, id, onClose])

  useEffect(() => { void carregar() }, [carregar])

  async function responder(encerrar: boolean) {
    const texto = resposta.replace(/<[^>]*>/g, '').trim()
    if (!texto) { await alerts.warning('Resposta', 'Escreva a resposta antes de enviar.'); return }
    setSalvando(true)
    try {
      await api.responder.mutate({ id, resposta, encerrar })
      await carregar()
      onMudou()
    } catch (e) {
      await alerts.error('Não foi possível responder', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function enviarMensagem() {
    if (!novaMsg.trim()) return
    try {
      await api.adicionarMensagem.mutate({ id, texto: novaMsg.trim(), interna: msgInterna })
      setNovaMsg('')
      await carregar()
    } catch (e) {
      await alerts.error('Não foi possível enviar', (e as Error).message)
    }
  }

  async function alternarMural() {
    try {
      await api.publicar.mutate({ id, publica: !m.publica })
      await carregar()
      onMudou()
    } catch (e) {
      await alerts.error('Não foi possível alterar', (e as Error).message)
    }
  }

  const st = m ? (STATUS_LABEL[m.status] ?? { texto: m.status, classe: 'bg-muted' }) : null
  // Inativa não recebe andamento (o servidor também recusa): restaure antes.
  const tratavel = podeTratar && !m?.excluidaEm

  return (
    <>
    {editando && m && (
      <NovaManifestacaoModal
        config={config}
        editar={m}
        onClose={() => setEditando(false)}
        onSalvo={() => { setEditando(false); void carregar(); onMudou(); alerts.toast('Registro atualizado') }}
      />
    )}
    <Sheet open onOpenChange={o => { if (!o && !editando) onClose() }}>
      {/* border-l-0: a borda de 1px do Sheet fica fora da área recortada e a faixa
          não a cobre — sobrava um fio à esquerda do cabeçalho. A sombra separa. */}
      <SheetContent side="right" size="xl" hideClose
        className="flex w-[72vw] max-w-[1040px] flex-col overflow-hidden border-l-0 p-0">
        <SheetTitle className="sr-only">{config.titulo}</SheetTitle>
        <SheetDescription className="sr-only">Detalhe e tratativa do registro.</SheetDescription>

        {/* Faixa em gradiente da primária com texto branco — o mesmo cabeçalho do
            detalhe do dia em /relatorios-ti. */}
        <div className="text-white"
          style={{ background: `linear-gradient(120deg, ${PRIMARY}, color-mix(in srgb, ${PRIMARY} 55%, #6366f1))` }}>
          <div className="flex items-start gap-3 px-6 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] uppercase tracking-[.14em] opacity-80">
                {m?.protocolo ?? '—'}
              </p>
              {/* text-white explícito: o global pinta h1/h2/h3 com o texto do tema. */}
              <h2 className="truncate text-xl font-bold text-white">
                {m?.titulo || config.titulo}
              </h2>
              {m && (
                <p className="flex flex-wrap items-center gap-2 text-[12.5px] opacity-90">
                  {m.anonima ? (
                    <span className="inline-flex items-center gap-1"><EyeOff className="h-3.5 w-3.5" /> Anônima</span>
                  ) : m.origem === 'CLIENTE' ? (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {m.cliente?.razaoSocial ?? m.informanteNome ?? 'Cliente'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <UserIcon className="h-3.5 w-3.5" /> {m.autor?.name ?? '—'}
                    </span>
                  )}
                  <span>·</span>
                  <span>{new Date(m.criadoEm).toLocaleDateString('pt-BR')}</span>
                  {m.area && <><span>·</span><span>{m.area.name}</span></>}
                </p>
              )}
            </div>
            {/* Editar: quem registrou ou quem trata — flag do servidor (podeEditar). */}
            {m?.podeEditar && (
              <Button variant="outline" size="sm" className="gap-1.5 bg-card/70" onClick={() => setEditando(true)}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            )}
            <button type="button" onClick={onClose} aria-label="Fechar"
              className="rounded-md p-1.5 text-white/90 transition-colors hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {carregando || !m ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
          {/* Abas: o detalhe e o fluxo, a conversa e os arquivos — cada um no
              seu lugar, em vez de uma rolagem única que escondia o fluxo. */}
          <div className="flex shrink-0 gap-1 border-b border-border px-6 pt-2">
            {([
              { v: 'detalhes' as const, t: 'Detalhes', Icone: FileText, n: null as number | null },
              { v: 'conversa' as const, t: 'Conversa', Icone: MessageSquare, n: m.mensagens?.length ?? 0 },
              { v: 'arquivos' as const, t: 'Arquivos', Icone: Paperclip, n: m.arquivos?.length ?? 0 },
            ]).map(a => (
              <button key={a.v} type="button" onClick={() => setAba(a.v)}
                className={cn('-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
                  aba === a.v ? 'border-primary-on-surface text-primary-on-surface' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                <a.Icone className="h-3.5 w-3.5" /> {a.t}
                {a.n ? <span className="rounded-full bg-muted px-1.5 text-[10.5px] tabular-nums">{a.n}</span> : null}
              </button>
            ))}
          </div>
          <div key={aba} className="nice-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-4" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
            {aba === 'conversa' && (<>
            {/* Conversa. A nota interna não aparece na consulta por protocolo —
                é o que permite discutir o caso sem expor a discussão. */}
            <div className="space-y-2">
              {m.mensagens?.length > 0 ? m.mensagens.map((msg: any) => (
                <div key={msg.id} className={cn('rounded-lg border px-3 py-2',
                  msg.interna ? 'border-dashed border-border bg-muted/30' : 'border-border')}>
                  <p className="mb-0.5 text-[11px] text-muted-foreground">
                    {msg.interna ? 'Nota interna' : 'Visível a quem registrou'}
                    {' · '}{new Date(msg.criadoEm).toLocaleString('pt-BR')}
                  </p>
                  <TextoOuHtml texto={msg.texto} />
                </div>
              )) : (
                <p className="text-[12px] italic text-muted-foreground">Nada registrado ainda.</p>
              )}

              <div className="space-y-1.5 rounded-lg border border-border p-2.5">
                <textarea value={novaMsg} onChange={e => setNovaMsg(e.target.value)} rows={2}
                  placeholder="Escrever..."
                  className="nice-scrollbar w-full rounded-md px-2.5 py-1.5 text-sm" />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
                    <Checkbox checked={msgInterna} onCheckedChange={v => setMsgInterna(v === true)} />
                    Nota interna
                  </label>
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={enviarMensagem} disabled={!novaMsg.trim()}>
                    <Send className="h-3.5 w-3.5" /> Enviar
                  </Button>
                </div>
              </div>
            </div>

            </>)}

            {aba === 'arquivos' && (
              <ArquivosDaManifestacao
                arquivos={m.arquivos ?? []}
                podeAnexar={!m.excluidaEm}
                onEnviar={enviarArquivo}
                onRemover={removerArquivo}
                enviando={enviandoArq}
              />
            )}

            {aba === 'detalhes' && (<>
            {m.excluidaEm && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-700 dark:text-amber-400">
                <b>Registro inativo</b> — excluído em {new Date(m.excluidaEm).toLocaleString('pt-BR')}
                {m.motivoExclusao ? <> · motivo: {m.motivoExclusao}</> : null}. Restaure pela lista de inativos para voltar a tratá-lo.
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {st && <Badge variant="outline" className={cn('text-[11px]', st.classe)}>{st.texto}</Badge>}
              {config.temMural && (
                <Badge variant="outline" className="text-[11px]">
                  {m.publica ? <><Globe className="mr-1 h-3 w-3" />No mural</> : <><Lock className="mr-1 h-3 w-3" />Privada</>}
                </Badge>
              )}
              {config.temMural && tratavel && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={alternarMural}>
                  {m.publica ? 'Tirar do mural' : 'Publicar no mural'}
                </Button>
              )}
            </div>

            {m.elogiados?.length > 0 && (
              <div className={cn('rounded-lg border px-3 py-2', SURFACE.amber)}>
                <p className={cn('text-[11px] font-semibold uppercase tracking-wide', TEXT.amber)}>
                  Elogiados
                </p>
                <p className={cn('text-[13px]', TEXT.amber)}>
                  {m.elogiados.map((e: { name: string }) => e.name).join(' · ')}
                </p>
              </div>
            )}

            <div className="rounded-lg border border-border p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                O relato
              </p>
              <RichContent html={m.descricao} />
            </div>

            {m.resposta && (
              <div className={cn('rounded-lg border p-4', SURFACE.emerald)}>
                <p className={cn('mb-2 text-[11px] font-semibold uppercase tracking-wide', TEXT.emerald)}>
                  Resposta da Qualidade
                  {m.respondidoEm && ` · ${new Date(m.respondidoEm).toLocaleDateString('pt-BR')}`}
                </p>
                <RichContent html={m.resposta} />
              </div>
            )}

            {/* Botões de ação à ESQUERDA (05/10/2026): à direita ficavam atrás do
                botão flutuante "+" do app. */}
            {/* ── Fluxo da reclamação ──
                Um passo por vez, e só o passo da vez: mostrar os três juntos
                convidaria a pular a apuração e ir direto ao encerramento. */}
            {config.temFluxo && tratavel && m.status === 'AGUARDANDO_RETORNO' && (
              <div className={cn('space-y-2 rounded-lg border p-3', SURFACE.amber)}>
                <p className={cn('text-[13px] font-semibold', TEXT.amber)}>
                  1. Retorno imediato ao cliente
                  {m.prazoRetorno && (
                    <span className="ml-2 font-normal">
                      — prazo {new Date(m.prazoRetorno).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </p>
                <p className={cn('text-[11.5px]', TEXT.amber)}>
                  O que foi dito a quem reclamou agora, antes de apurar.
                </p>
                <textarea value={textoFluxo} onChange={e => setTextoFluxo(e.target.value)} rows={3}
                  className="nice-scrollbar w-full rounded-md px-2.5 py-1.5 text-sm" />
                <div className="flex justify-start">
                  <Button variant="success" size="sm" disabled={salvando || !textoFluxo.trim()}
                    onClick={async () => {
                      setSalvando(true)
                      try {
                        await api.darRetorno.mutate({ id, texto: textoFluxo })
                        setTextoFluxo(''); await carregar(); onMudou()
                      } catch (e) { await alerts.error('Erro', (e as Error).message) }
                      finally { setSalvando(false) }
                    }}>
                    Registrar o retorno
                  </Button>
                </div>
              </div>
            )}

            {config.temFluxo && tratavel && m.status === 'AGUARDANDO_ANALISE' && (
              <div className={cn('space-y-3 rounded-lg border p-3', SURFACE.sky)}>
                <p className={cn('text-[13px] font-semibold', TEXT.sky)}>
                  2. A reclamação procede?
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    { v: true, t: 'Procede', d: 'Segue para a avaliação de eficácia.' },
                    { v: false, t: 'Não procede', d: 'Encerra, com justificativa e retorno final.' },
                  ]).map(o => (
                    // Fundo próprio (bg-card): herdando o azul do quadro, os dois
                    // ficavam apagados e a escolha não se distinguia.
                    <button key={String(o.v)} type="button" onClick={() => setProcede(o.v)}
                      aria-pressed={procede === o.v}
                      className={cn('flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left shadow-sm transition-all',
                        procede === o.v ? 'border-sky-500 ring-2 ring-sky-500/30' : 'border-border hover:border-foreground/30')}>
                      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                        procede === o.v ? 'border-sky-500' : 'border-muted-foreground/40')}>
                        {procede === o.v && <span className="h-2 w-2 rounded-full bg-sky-500" />}
                      </span>
                      <span>
                        <span className="block text-[13px] font-semibold text-foreground">{o.t}</span>
                        <span className="block text-[11.5px] text-muted-foreground">{o.d}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {procede === true && (
                  <div className="space-y-1.5">
                    <p className="text-[12px] font-semibold">Causa</p>
                    <textarea value={causa} onChange={e => setCausa(e.target.value)} rows={3}
                      placeholder="O que levou a isso acontecer."
                      className="nice-scrollbar w-full rounded-md px-2.5 py-1.5 text-sm" />
                  </div>
                )}

                {procede === false && (
                  <>
                    <div className="space-y-1.5">
                      <p className="text-[12px] font-semibold">Justificativa</p>
                      <textarea value={justificativa} onChange={e => setJustificativa(e.target.value)} rows={3}
                        placeholder="Por que a reclamação não procede."
                        className="nice-scrollbar w-full rounded-md px-2.5 py-1.5 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[12px] font-semibold">Retorno final</p>
                      <textarea value={retornoFinal} onChange={e => setRetornoFinal(e.target.value)} rows={3}
                        placeholder="O que foi devolvido a quem reclamou."
                        className="nice-scrollbar w-full rounded-md px-2.5 py-1.5 text-sm" />
                    </div>
                  </>
                )}

                {procede !== null && (
                  <div className="flex justify-start">
                    <Button variant="success" size="sm" disabled={salvando}
                      onClick={async () => {
                        setSalvando(true)
                        try {
                          await api.analisarProcedencia.mutate({
                            id, procede,
                            causaDescricao: causa || null,
                            justificativa: justificativa || null,
                            retornoFinal: retornoFinal || null,
                          })
                          await carregar(); onMudou()
                        } catch (e) { await alerts.error('Erro', (e as Error).message) }
                        finally { setSalvando(false) }
                      }}>
                      {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                      Registrar a análise
                    </Button>
                  </div>
                )}
              </div>
            )}

            {config.temFluxo && tratavel && m.status === 'REGISTRAR_EFICACIA' && (
              <div className={cn('space-y-2 rounded-lg border p-3', SURFACE.indigo)}>
                <p className={cn('text-[13px] font-semibold', TEXT.indigo)}>
                  3. Encerrar
                </p>
                <p className={cn('text-[11.5px]', TEXT.indigo)}>
                  A causa foi tratada. Escreva a posição final entregue a quem reclamou.
                </p>
                <textarea value={retornoFinal} onChange={e => setRetornoFinal(e.target.value)} rows={3}
                  className="nice-scrollbar w-full rounded-md px-2.5 py-1.5 text-sm" />
                <div className="flex justify-start">
                  <Button variant="success" size="sm" disabled={salvando || !retornoFinal.trim()}
                    onClick={async () => {
                      setSalvando(true)
                      try {
                        await api.finalizar.mutate({ id, retornoFinal })
                        await carregar(); onMudou()
                      } catch (e) { await alerts.error('Erro', (e as Error).message) }
                      finally { setSalvando(false) }
                    }}>
                    Finalizar
                  </Button>
                </div>
              </div>
            )}

            {/* O que já foi decidido no fluxo fica à vista, para a auditoria
                ler sem abrir o histórico. */}
            {(m.retornoCliente || m.justificativa || m.retornoFinal) && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                {m.retornoCliente && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Retorno imediato</p>
                    <TextoOuHtml texto={m.retornoCliente} />
                  </div>
                )}
                {m.justificativa && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Justificativa</p>
                    <TextoOuHtml texto={m.justificativa} />
                  </div>
                )}
                {m.retornoFinal && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Retorno final</p>
                    <TextoOuHtml texto={m.retornoFinal} />
                  </div>
                )}
              </div>
            )}

            {!config.temFluxo && tratavel && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-[13px] font-semibold">Responder</p>
                <RichEditor value={resposta} onChange={setResposta}
                  placeholder="A resposta que quem registrou vai ler..." />
                <div className="flex flex-wrap justify-start gap-2">
                  <Button variant="outline" size="sm" onClick={() => responder(false)} disabled={salvando}>
                    Salvar sem encerrar
                  </Button>
                  <Button variant="success" size="sm" className="gap-1.5"
                    onClick={() => responder(true)} disabled={salvando}>
                    {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                    Responder e encerrar
                  </Button>
                </div>
              </div>
            )}
            </>)}
          </div>
          </>
        )}
      </SheetContent>
    </Sheet>
    </>
  )
}
