'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  FileText, Plus, Loader2, Download, Upload, Check, Ban, Send, X, History, Info,
} from 'lucide-react'
import {
  Button, Input, Label, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  RichEditor, RichContent,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { UserMultiPicker } from '@/components/user-multi-picker'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { DOCUMENTO_SITUACAO_LABEL } from '@saas/types'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { SITUACAO_COLORS } from '../page'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

interface Elaborador { id: string; usuarioId: string | null; nome: string | null }
interface Versao {
  id: string; revisao: number; situacao: string; dataVersao: string
  arquivoPath: string; arquivoNome: string | null; bytes: number | null
  alteracao: string | null; justificativa: string | null
  registradoPorId: string | null; aprovadoPorId: string | null; aprovadoEm: string | null
  criadoEm: string
  elaboradores: Elaborador[]
}
interface Log { id: string; evento: string; detalhe: string | null; criadoEm: string }
interface Documento {
  id: string; legacyId: number | null; nome: string
  tipo: { id: string; nome: string } | null
  processo: { id: string; nome: string } | null
  versaoAtual: { id: string; revisao: number } | null
  versoes: Versao[]
  logs: Log[]
  criadoEm: string
}
interface Opcao { id: string; nome: string }
interface Usuario { id: string; name: string; email: string | null; image: string | null }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
const dataHoraBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

/** Os eventos são gravados como código; o rótulo humano mora aqui. */
const EVENTO_LABEL: Record<string, string> = {
  DOCUMENTO_CRIADO: 'Documento cadastrado',
  DOCUMENTO_EDITADO: 'Dados do documento alterados',
  REVISAO_PUBLICADA: 'Revisão publicada',
  REVISAO_ENVIADA_APROVACAO: 'Enviada para aprovação',
  REVISAO_APROVADA: 'Revisão aprovada',
  REVISAO_REJEITADA: 'Revisão rejeitada',
  REVISAO_CANCELADA: 'Revisão cancelada',
}

const hoje = () => new Date().toISOString().slice(0, 10)

export default function DocumentoInternoDetalhePage() {
  const params = useParams<{ id: string }>()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const subs = (permissions.find((p) => p.moduleSlug === 'documentos-internos')?.subPermissions ?? {}) as Record<string, boolean>
  const podeGerenciar = isMaster || isEmpresaMaster || subs.gerenciar === true
  const podeAprovar = isMaster || isEmpresaMaster || subs.aprovar === true

  const [d, setD] = useState<Documento | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [tipos, setTipos] = useState<Opcao[]>([])
  const [processos, setProcessos] = useState<Opcao[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  // Cabeçalho editável
  const [nome, setNome] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [processoId, setProcessoId] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Modal de nova revisão
  const [revAberta, setRevAberta] = useState(false)
  const [revData, setRevData] = useState(hoje())
  const [revAlteracao, setRevAlteracao] = useState('')
  const [revJustificativa, setRevJustificativa] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [revElaboradores, setRevElaboradores] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Modal de rejeição (motivo é obrigatório)
  const [rejeitando, setRejeitando] = useState<Versao | null>(null)
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.documentoInterno as any).getById.query({ id: params.id })
      .then((doc: Documento) => {
        setD(doc)
        setNome(doc.nome)
        setTipoId(doc.tipo?.id ?? '')
        setProcessoId(doc.processo?.id ?? '')
      })
      .catch(() => setD(null))
      .finally(() => setLoading(false))
  }, [params.id])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    ;(trpc.documentoInterno as any).listarTipos.query({}).then(setTipos).catch(() => setTipos([]))
    ;(trpc.documentoInterno as any).listarProcessos.query({}).then(setProcessos).catch(() => setProcessos([]))
    ;(trpc.documentoInterno as any).listarUsuarios.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setActing(true)
    try { await fn(); alerts.success('Pronto', msg); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setActing(false) }
  }

  async function salvarCabecalho() {
    setSalvando(true)
    try {
      await (trpc.documentoInterno as any).atualizar.mutate({
        id: d!.id, nome, tipoId: tipoId || null, processoId: processoId || null,
      })
      alerts.success('Salvo', 'Dados do documento atualizados.')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function publicarRevisao() {
    if (!arquivo) { alerts.error('Falta o arquivo', 'Escolha o arquivo da nova revisão.'); return }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('file', arquivo, arquivo.name)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error(`Upload falhou (HTTP ${res.status})`)
      const { url } = await res.json() as { url: string }

      await (trpc.documentoInterno as any).novaRevisao.mutate({
        documentoId: d!.id,
        dataVersao: revData,
        arquivoPath: url,
        arquivoNome: arquivo.name,
        mime: arquivo.type || undefined,
        bytes: arquivo.size,
        alteracao: revAlteracao || undefined,
        justificativa: revJustificativa || undefined,
        elaboradores: revElaboradores.map((id) => ({ usuarioId: id })),
      })
      alerts.success('Revisão publicada', 'A anterior passou a Substituída.')
      setRevAberta(false); setArquivo(null); setRevAlteracao(''); setRevJustificativa('')
      setRevData(hoje()); setRevElaboradores([])
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviando(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!d) return <div className="py-12 text-center text-muted-foreground">Documento não encontrado</div>

  const vigente = d.versoes.find((v) => v.id === d.versaoAtual?.id) ?? null

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <FileText className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="truncate">{d.nome}</h1>
              {vigente && (
                <Badge variant="outline" className={cn('text-[11px]', SITUACAO_COLORS[vigente.situacao])}>
                  {DOCUMENTO_SITUACAO_LABEL[vigente.situacao as keyof typeof DOCUMENTO_SITUACAO_LABEL] ?? vigente.situacao}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {d.tipo?.nome ?? 'Sem tipo'} · Revisão {d.versaoAtual?.revisao ?? '—'} · {d.versoes.length} no histórico
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 flex-wrap justify-end">
          {vigente && (
            <Button variant="outline" size="sm" asChild>
              <a href={`${getApiUrl()}${vigente.arquivoPath}`} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" />Baixar vigente
              </a>
            </Button>
          )}
          {podeGerenciar && (
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={() => setRevAberta(true)}>
              <Plus className="h-4 w-4" />Nova revisão
            </Button>
          )}
          <BackButton href="/documentos-internos" label="Voltar" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* ── Histórico de revisões ── */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
            <History className="h-4 w-4" style={{ color: MODULE_COLOR }} />
            <h4 className="text-[13px] font-semibold text-foreground">Histórico de revisões</h4>
          </div>

          <div className="space-y-3">
            {d.versoes.map((v) => {
              const ehVigente = v.id === d.versaoAtual?.id
              return (
                <div key={v.id} className={cn(
                  'rounded-lg border p-3 transition-colors',
                  ehVigente ? 'border-amber-300/70 bg-amber-50/40 dark:border-amber-700/50 dark:bg-amber-950/10' : 'border-border bg-muted/20',
                )}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold tabular-nums">Revisão {v.revisao}</span>
                      <Badge variant="outline" className={cn('text-[10px]', SITUACAO_COLORS[v.situacao])}>
                        {DOCUMENTO_SITUACAO_LABEL[v.situacao as keyof typeof DOCUMENTO_SITUACAO_LABEL] ?? v.situacao}
                      </Badge>
                      {ehVigente && <Badge variant="secondary" className="text-[10px]">Vigente</Badge>}
                      <span className="text-[11px] text-muted-foreground">{dataBR(v.dataVersao)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 sm:shrink-0">
                      <Button variant="soft" size="icon-sm" asChild title="Baixar esta revisão">
                        <a href={`${getApiUrl()}${v.arquivoPath}`} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                      {podeGerenciar && (v.situacao === 'NOVO' || v.situacao === 'REJEITADO') && (
                        <Button variant="outline" size="xs" disabled={acting}
                          onClick={() => acao(() => (trpc.documentoInterno as any).enviarParaAprovacao.mutate({ versaoId: v.id }), 'Enviada para aprovação.')}>
                          <Send className="h-3.5 w-3.5" />Enviar
                        </Button>
                      )}
                      {podeAprovar && v.situacao === 'EM_APROVACAO' && (<>
                        <Button variant="success" size="xs" disabled={acting}
                          onClick={() => acao(() => (trpc.documentoInterno as any).aprovar.mutate({ versaoId: v.id, aprovar: true }), 'Revisão aprovada.')}>
                          <Check className="h-3.5 w-3.5" />Aprovar
                        </Button>
                        <Button variant="destructive" size="xs" disabled={acting} onClick={() => { setMotivo(''); setRejeitando(v) }}>
                          <Ban className="h-3.5 w-3.5" />Rejeitar
                        </Button>
                      </>)}
                    </div>
                  </div>

                  <p className="mt-1.5 text-[11px] text-muted-foreground truncate" title={v.arquivoNome ?? ''}>
                    {v.arquivoNome ?? 'arquivo'}
                  </p>

                  {v.alteracao && (
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">O que mudou</p>
                      <RichContent className="text-sm [&_p]:my-1" html={v.alteracao} />
                    </div>
                  )}
                  {v.justificativa && (
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Justificativa</p>
                      <RichContent className="text-sm [&_p]:my-1" html={v.justificativa} />
                    </div>
                  )}

                  {v.elaboradores.length > 0 && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Elaborado por: {v.elaboradores.map((e) => e.nome ?? usuarios.find((u) => u.id === e.usuarioId)?.name ?? 'colaborador').join(', ')}
                    </p>
                  )}
                  {/* Quem aprovou e quando — o dado que o v1 nunca gravou. */}
                  {v.aprovadoEm && (
                    <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                      Aprovada em {dataHoraBR(v.aprovadoEm)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </Card>

        {/* ── Coluna lateral ── */}
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-sm font-semibold">Dados do documento</h4>
            </div>
            {/* Só o cabeçalho se edita. O conteúdo de uma revisão nunca muda:
                mudou o documento, publica-se uma revisão nova. */}
            <div className="space-y-3">
              <div>
                <Label className="text-[13px] font-semibold">Nome</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!podeGerenciar} className="h-9 text-sm mt-1.5" />
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Tipo</Label>
                <Select value={tipoId || '__none__'} onValueChange={(v) => setTipoId(v === '__none__' ? '' : v)} disabled={!podeGerenciar}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem tipo</SelectItem>
                    {tipos.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Processo</Label>
                <Select value={processoId || '__none__'} onValueChange={(v) => setProcessoId(v === '__none__' ? '' : v)} disabled={!podeGerenciar}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem processo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem processo</SelectItem>
                    {processos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {podeGerenciar && (
                <Button variant="success" size="sm" className="w-full" onClick={salvarCabecalho} disabled={salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
                </Button>
              )}
              {d.legacyId != null && (
                <p className="text-[11px] text-muted-foreground pt-1">
                  Nº {d.legacyId} no sistema antigo
                </p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h4 className="text-sm font-semibold mb-3">Atividades</h4>
            {d.logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem registros.</p>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto nice-scrollbar">
                {d.logs.map((l) => (
                  <div key={l.id} className="text-xs border-l-2 border-border pl-2.5 py-0.5">
                    <p className="font-medium">{EVENTO_LABEL[l.evento] ?? l.evento}</p>
                    {l.detalhe && <p className="text-muted-foreground">{l.detalhe}</p>}
                    <p className="text-[10px] text-muted-foreground">{dataHoraBR(l.criadoEm)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Modal: nova revisão ── */}
      <Dialog open={revAberta} onOpenChange={(o) => { if (!enviando) setRevAberta(o) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Upload} color="emerald">
            <DialogTitle>Nova revisão</DialogTitle>
            <DialogDescription>
              A revisão entra como vigente e a anterior passa a &ldquo;Substituída&rdquo;. O conteúdo de uma revisão publicada não se edita.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-4">
                <Label className="text-[13px] font-semibold">Data da versão</Label>
                <Input type="date" value={revData} onChange={(e) => setRevData(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-12 sm:col-span-8">
                <Label className="text-[13px] font-semibold">Arquivo</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-4 w-4" />Escolher
                  </Button>
                  <span className="text-xs text-muted-foreground truncate">{arquivo?.name ?? 'Nenhum arquivo escolhido'}</span>
                  <input ref={fileRef} type="file" className="hidden"
                    onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); e.target.value = '' }} />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Elaboradores</Label>
              <div className="mt-1.5">
                <UserMultiPicker users={usuarios} value={revElaboradores} onChange={setRevElaboradores}
                  placeholder="Quem elaborou esta revisão" accentClass="bg-amber-500 border-amber-500" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Vínculo por pessoa, e não texto solto — é o que permite responder depois
                &ldquo;que documentos o fulano elaborou&rdquo;.
              </p>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">O que mudou</Label>
              <div className="mt-1.5"><RichEditor value={revAlteracao} onChange={setRevAlteracao} placeholder="Descreva a alteração..." /></div>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Justificativa</Label>
              <div className="mt-1.5"><RichEditor value={revJustificativa} onChange={setRevJustificativa} placeholder="Por que a revisão foi feita..." /></div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRevAberta(false)} disabled={enviando}>Cancelar</Button>
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={publicarRevisao} disabled={enviando || !arquivo}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Publicar revisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: rejeitar ── */}
      <Dialog open={!!rejeitando} onOpenChange={(o) => { if (!o) setRejeitando(null) }}>
        <DialogContent>
          <DialogHeaderIcon icon={Ban} color="rose">
            <DialogTitle>Rejeitar a revisão {rejeitando?.revisao}</DialogTitle>
            <DialogDescription>
              O motivo fica no histórico — sem ele, quem elaborou não sabe o que corrigir.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <Label className="text-[13px] font-semibold">Motivo</Label>
            <div className="mt-1.5">
              <RichEditor value={motivo} onChange={setMotivo} placeholder="O que precisa ser corrigido..." />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejeitando(null)}><X className="h-4 w-4" />Cancelar</Button>
            <Button variant="destructive" size="sm" disabled={acting || !motivo.replace(/<[^>]*>/g, '').trim()}
              onClick={() => {
                const v = rejeitando!
                setRejeitando(null)
                acao(() => (trpc.documentoInterno as any).aprovar.mutate({ versaoId: v.id, aprovar: false, observacao: motivo }), 'Revisão rejeitada.')
              }}>
              <Ban className="h-4 w-4" />Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
