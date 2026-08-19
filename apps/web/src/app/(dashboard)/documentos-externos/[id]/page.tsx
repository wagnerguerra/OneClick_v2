'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { FileBox, Plus, Loader2, Check, History, Info, ExternalLink } from 'lucide-react'
import {
  Button, Input, Label, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  RichEditor, RichContent,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

interface Versao {
  id: string; revisao: number; dataRegistro: string
  emissor: string | null; local: string | null; link: string | null; observacao: string | null
  registradoPorNome: string | null; responsavelNome: string | null
  criadoEm: string
}
interface Documento {
  id: string; legacyId: number | null; nome: string
  processo: { id: string; nome: string } | null
  versaoAtual: { id: string; revisao: number } | null
  versoes: Versao[]
  criadoEm: string
}
interface Opcao { id: string; nome: string }
interface Usuario { id: string; name: string }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

const hoje = () => new Date().toISOString().slice(0, 10)
const ehUrl = (s: string | null | undefined) => !!s && /^https?:\/\//i.test(s.trim())

export default function DocumentoExternoDetalhePage() {
  const params = useParams<{ id: string }>()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'documentos-externos')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true

  const [d, setD] = useState<Documento | null>(null)
  const [loading, setLoading] = useState(true)
  const [processos, setProcessos] = useState<Opcao[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  // Cabeçalho editável
  const [nome, setNome] = useState('')
  const [processoId, setProcessoId] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Modal de nova revisão
  const [revAberta, setRevAberta] = useState(false)
  const [revData, setRevData] = useState(hoje())
  const [revEmissor, setRevEmissor] = useState('')
  const [revLocal, setRevLocal] = useState('')
  const [revLink, setRevLink] = useState('')
  const [revObs, setRevObs] = useState('')
  const [revResponsavel, setRevResponsavel] = useState('')
  const [publicando, setPublicando] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.documentoExterno as any).getById.query({ id: params.id })
      .then((doc: Documento) => {
        setD(doc)
        setNome(doc.nome)
        setProcessoId(doc.processo?.id ?? '')
      })
      .catch(() => setD(null))
      .finally(() => setLoading(false))
  }, [params.id])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    ;(trpc.documentoExterno as any).listarProcessos.query().then(setProcessos).catch(() => setProcessos([]))
    ;(trpc.documentoExterno as any).listarUsuarios.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  async function salvarCabecalho() {
    setSalvando(true)
    try {
      await (trpc.documentoExterno as any).atualizar.mutate({
        id: d!.id, nome, processoId: processoId || null,
      })
      alerts.success('Salvo', 'Dados do documento atualizados.')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  function abrirNovaRevisao() {
    // Pré-preenche com a vigente: revisão nova quase sempre só atualiza o
    // link/local — como o details.asp do v1 fazia.
    const vigente = d?.versoes.find((v) => v.id === d.versaoAtual?.id)
    setRevEmissor(vigente?.emissor ?? '')
    setRevLocal(vigente?.local ?? '')
    setRevLink(vigente?.link ?? '')
    setRevObs(vigente?.observacao ?? '')
    setRevResponsavel('')
    setRevData(hoje())
    setRevAberta(true)
  }

  async function publicarRevisao() {
    setPublicando(true)
    try {
      await (trpc.documentoExterno as any).novaRevisao.mutate({
        documentoId: d!.id,
        dataRegistro: revData,
        emissor: revEmissor || null,
        local: revLocal || null,
        link: revLink || null,
        observacao: revObs.replace(/<[^>]*>/g, '').trim() ? revObs : null,
        responsavelId: revResponsavel || null,
      })
      alerts.success('Revisão publicada', 'Ela passou a ser a vigente.')
      setRevAberta(false)
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setPublicando(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!d) return <div className="py-12 text-center text-muted-foreground">Documento não encontrado</div>

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <FileBox className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate">{d.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {d.processo?.nome ?? 'Sem processo'} · Revisão {d.versaoAtual?.revisao ?? '—'} · {d.versoes.length} no histórico
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {podeEscrever && (
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={abrirNovaRevisao}>
              <Plus className="h-4 w-4" />Nova revisão
            </Button>
          )}
          <BackButton href="/documentos-externos" label="Voltar" />
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold tabular-nums">Revisão {v.revisao}</span>
                    {ehVigente && <Badge variant="secondary" className="text-[10px]">Vigente</Badge>}
                    <span className="text-[11px] text-muted-foreground">{dataBR(v.dataRegistro)}</span>
                    {v.registradoPorNome && (
                      <span className="text-[11px] text-muted-foreground">· por {v.registradoPorNome}</span>
                    )}
                    {ehUrl(v.link) && (
                      <a href={v.link!.trim()} target="_blank" rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium hover:underline" style={{ color: MODULE_COLOR }}>
                        <ExternalLink className="h-3 w-3" />Abrir no emissor
                      </a>
                    )}
                  </div>

                  <dl className="mt-2 space-y-1.5 text-sm">
                    {v.emissor && (
                      <div>
                        <dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Emissor</dt>
                        <dd>{v.emissor}</dd>
                      </div>
                    )}
                    {v.local && (
                      <div>
                        <dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Local</dt>
                        <dd className="break-all">{v.local}</dd>
                      </div>
                    )}
                    {v.link && !ehUrl(v.link) && (
                      <div>
                        <dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Link</dt>
                        <dd className="break-all">{v.link}</dd>
                      </div>
                    )}
                    {v.observacao && (
                      <div>
                        <dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Observações</dt>
                        <dd><RichContent className="text-sm [&_p]:my-0.5" html={v.observacao} /></dd>
                      </div>
                    )}
                    {v.responsavelNome && (
                      <p className="text-[11px] text-muted-foreground">Responsável: {v.responsavelNome}</p>
                    )}
                  </dl>
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
            {/* Só o cabeçalho se edita. Mudou a norma, publica-se revisão nova. */}
            <div className="space-y-3">
              <div>
                <Label className="text-[13px] font-semibold">Nome</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm mt-1.5" />
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Processo</Label>
                <Select value={processoId || '__none__'} onValueChange={(v) => setProcessoId(v === '__none__' ? '' : v)} disabled={!podeEscrever}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem processo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem processo</SelectItem>
                    {processos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {podeEscrever && (
                <Button variant="success" size="sm" className="w-full" onClick={salvarCabecalho} disabled={salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
                </Button>
              )}
              {d.legacyId != null && (
                <p className="text-[11px] text-muted-foreground pt-1">Nº {d.legacyId} no sistema antigo</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Modal: nova revisão ── */}
      <Dialog open={revAberta} onOpenChange={(o) => { if (!publicando) setRevAberta(o) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Nova revisão</DialogTitle>
            <DialogDescription>
              Os campos vêm preenchidos com a revisão vigente — ajuste o que mudou. A nova revisão passa a valer e a anterior fica no histórico.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4 max-h-[60vh] overflow-y-auto nice-scrollbar">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-4">
                <Label className="text-[13px] font-semibold">Data do registro</Label>
                <Input type="date" value={revData} onChange={(e) => setRevData(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-12 sm:col-span-8">
                <Label className="text-[13px] font-semibold">Emissor</Label>
                <Input value={revEmissor} onChange={(e) => setRevEmissor(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Local</Label>
                <Input value={revLocal} onChange={(e) => setRevLocal(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Link</Label>
                <Input value={revLink} onChange={(e) => setRevLink(e.target.value)} placeholder="https://..." className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Responsável</Label>
                <Select value={revResponsavel || '__none__'} onValueChange={(v) => setRevResponsavel(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem responsável</SelectItem>
                    {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Observações</Label>
                <div className="mt-1.5">
                  <RichEditor value={revObs} onChange={setRevObs} placeholder="O que mudou nesta revisão..." />
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRevAberta(false)} disabled={publicando}>Cancelar</Button>
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={publicarRevisao} disabled={publicando}>
              {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Publicar revisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
