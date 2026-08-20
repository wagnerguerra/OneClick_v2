'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  FolderInput, Loader2, Pencil, Trash2, Flag, Route, Inbox, Archive,
  ArrowRightLeft, PackageCheck, Undo2, Send, FileCheck2, ScanSearch, Save,
} from 'lucide-react'
import {
  Button, Input, Label, Badge, Card, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { ClienteCombobox } from '../../orcamentos/_components/cliente-combobox'
import { COLETA_TIPO_LABEL, COLETA_SITUACAO_LABEL, COLETA_PRIORIDADE_LABEL } from '@saas/types'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { SITUACAO_BADGE, TIPO_BADGE } from '../_components/badges'

const MODULE_COLOR = 'var(--mod-administrativo, #38bdf8)'

/**
 * Os botões de ação do trâmite — quais aparecem vem PRONTO do backend
 * (`transicoesDisponiveis`, cruzando situação × papel do usuário). Aqui só
 * mora o rótulo e o ícone de cada um.
 */
const TRANSICAO_UI: Record<string, { label: string; icon: typeof Route; variant: 'success' | 'default' | 'outline' }> = {
  CONFIRMAR_ROTA: { label: 'Confirmar rota', icon: Route, variant: 'success' },
  RECEBER_RECEPCAO: { label: 'Receber na Recepção', icon: Inbox, variant: 'success' },
  ENTREGAR_ARQUIVO: { label: 'Entregar ao Arquivo', icon: Archive, variant: 'success' },
  PROTOCOLO_ENTREGUE: { label: 'Protocolo entregue ao Arquivo', icon: FileCheck2, variant: 'outline' },
  TRIAGEM: { label: 'Iniciar triagem', icon: ScanSearch, variant: 'success' },
  ENTREGAR_SETOR: { label: 'Entregar ao setor', icon: ArrowRightLeft, variant: 'success' },
  DEVOLVER_ARQUIVO: { label: 'Devolver ao arquivo', icon: Undo2, variant: 'outline' },
  DISPONIBILIZAR_RETIRADA: { label: 'Disponibilizar retirada', icon: PackageCheck, variant: 'outline' },
  ARQUIVAR_PROTOCOLO: { label: 'Arquivar protocolo', icon: Archive, variant: 'outline' },
  SOLICITAR_ENTREGA_CLIENTE: { label: 'Solicitar entrega ao cliente', icon: Send, variant: 'outline' },
}

interface Log {
  id: string
  situacao: string | null
  evento: string
  usuarioNomeResolvido: string | null
  criadoEm: string
}
interface Detalhe {
  id: string
  legacyId: number | null
  tipo: string
  situacao: string
  competencia: string | null
  prioridade: number
  contato: string | null
  descricao: string | null
  ativo: boolean
  motivoExclusao: string | null
  registradoEm: string
  clienteId: string | null
  cliente: { id: string; razaoSocial: string } | null
  clienteNome: string | null
  solicitanteNomeResolvido: string | null
  categoria: { id: string; nome: string } | null
  transicoesDisponiveis: string[]
  logs: Log[]
}
interface Categoria { id: string; nome: string }
interface ClienteOpt { id: string; razaoSocial: string; documento: string | null }

const dataHoraBR = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function ColetaDetalhePage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params.id)

  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [agindo, setAgindo] = useState<string | null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [clientes, setClientes] = useState<ClienteOpt[]>([])

  // Modal editar
  const [editAberta, setEditAberta] = useState(false)
  const [eCliente, setECliente] = useState('')
  const [eContato, setEContato] = useState('')
  const [eCategoria, setECategoria] = useState('')
  const [eCompetencia, setECompetencia] = useState('')
  const [ePrioridade, setEPrioridade] = useState('2')
  const [eDescricao, setEDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Modal excluir
  const [delAberta, setDelAberta] = useState(false)
  const [delMotivo, setDelMotivo] = useState('')
  const [excluindo, setExcluindo] = useState(false)

  const fetchDetalhe = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    try {
      const d = await (trpc as any).coleta.getById.query({ id })
      setDetalhe(d)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      router.push('/coleta-documentos')
    } finally { setLoading(false) }
  }, [id, router])
  useEffect(() => { fetchDetalhe() }, [fetchDetalhe])

  useEffect(() => {
    ;(trpc as any).coleta.listarCategorias.query({}).then(setCategorias).catch(() => setCategorias([]))
    ;(trpc as any).coleta.listarClientes.query().then(setClientes).catch(() => setClientes([]))
  }, [])

  async function transitar(t: string) {
    setAgindo(t)
    try {
      await (trpc as any).coleta.transitar.mutate({ id, transicao: t })
      await fetchDetalhe(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setAgindo(null) }
  }

  function abrirEdicao() {
    if (!detalhe) return
    setECliente(detalhe.clienteId ?? '')
    setEContato(detalhe.contato ?? '')
    setECategoria(detalhe.categoria?.id ?? '')
    setECompetencia(detalhe.competencia ?? '')
    setEPrioridade(String(detalhe.prioridade || 2))
    setEDescricao(detalhe.descricao ?? '')
    setEditAberta(true)
  }

  async function salvarEdicao() {
    setSalvando(true)
    try {
      await (trpc as any).coleta.atualizar.mutate({
        id,
        clienteId: eCliente || null,
        contato: eContato || null,
        categoriaId: eCategoria || null,
        competencia: eCompetencia || null,
        prioridade: Number(ePrioridade),
        descricao: eDescricao || null,
      })
      alerts.success('Salvo', '')
      setEditAberta(false)
      fetchDetalhe(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function excluir() {
    if (delMotivo.trim().length < 3) { alerts.error('Falta o motivo', 'Informe o motivo da exclusão.'); return }
    setExcluindo(true)
    try {
      await (trpc as any).coleta.excluir.mutate({ id, motivo: delMotivo.trim() })
      alerts.success('Excluído', '')
      router.push('/coleta-documentos')
    } catch (e) { alerts.error('Erro', (e as Error).message); setExcluindo(false) }
  }

  if (loading || !detalhe) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  const clienteLabel = detalhe.cliente?.razaoSocial ?? detalhe.clienteNome ?? detalhe.contato ?? 'Sem cliente'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <FolderInput className="h-6 w-6" />
          </div>
          <div>
            <h1 className="flex items-center gap-2">
              {clienteLabel}
              {detalhe.prioridade === 3 && <Flag className="h-4 w-4 text-rose-500" aria-label="Prioridade alta" />}
            </h1>
            <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant="outline" className={cn('text-[10px]', TIPO_BADGE[detalhe.tipo])}>{COLETA_TIPO_LABEL[detalhe.tipo] ?? detalhe.tipo}</Badge>
              <Badge variant="outline" className={cn('text-[10px]', SITUACAO_BADGE[detalhe.situacao])}>{COLETA_SITUACAO_LABEL[detalhe.situacao] ?? detalhe.situacao}</Badge>
              <span>Registrado em {dataHoraBR(detalhe.registradoEm)}</span>
              {detalhe.legacyId && <span className="text-[11px]">· OneClick v1 #{detalhe.legacyId}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="soft-info" size="sm" onClick={abrirEdicao}><Pencil className="h-4 w-4" />Editar</Button>
          <Button variant="soft-destructive" size="sm" onClick={() => { setDelMotivo(''); setDelAberta(true) }}>
            <Trash2 className="h-4 w-4" />Excluir
          </Button>
          <BackButton href="/coleta-documentos" label="Voltar" />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* ── Coluna principal: dados + ações do trâmite ── */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <Card className="p-5">
            <h2 className="text-[13px] font-semibold text-foreground border-b border-border pb-2 -mx-5 px-5 mb-4">Dados do registro</h2>
            <dl className="grid grid-cols-12 gap-x-4 gap-y-3 text-sm">
              <div className="col-span-6 sm:col-span-4">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cliente</dt>
                <dd className="mt-0.5">{detalhe.cliente?.razaoSocial ?? detalhe.clienteNome ?? '—'}</dd>
              </div>
              <div className="col-span-6 sm:col-span-4">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contato</dt>
                <dd className="mt-0.5">{detalhe.contato ?? '—'}</dd>
              </div>
              <div className="col-span-6 sm:col-span-4">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Categoria</dt>
                <dd className="mt-0.5">{detalhe.categoria?.nome ?? '—'}</dd>
              </div>
              <div className="col-span-6 sm:col-span-4">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Competência</dt>
                <dd className="mt-0.5 tabular-nums">{detalhe.competencia ?? '—'}</dd>
              </div>
              <div className="col-span-6 sm:col-span-4">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Solicitante</dt>
                <dd className="mt-0.5">{detalhe.solicitanteNomeResolvido ?? '—'}</dd>
              </div>
              <div className="col-span-6 sm:col-span-4">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Prioridade</dt>
                <dd className="mt-0.5">{COLETA_PRIORIDADE_LABEL[detalhe.prioridade] ?? '—'}</dd>
              </div>
              {detalhe.descricao && (
                <div className="col-span-12">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Descrição</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap">{detalhe.descricao}</dd>
                </div>
              )}
            </dl>
          </Card>

          {detalhe.transicoesDisponiveis.length > 0 && (
            <Card className="p-5">
              <h2 className="text-[13px] font-semibold text-foreground border-b border-border pb-2 -mx-5 px-5 mb-4">Ações do trâmite</h2>
              <div className="flex flex-wrap gap-2">
                {detalhe.transicoesDisponiveis.map((t) => {
                  const ui = TRANSICAO_UI[t]
                  if (!ui) return null
                  const Icon = ui.icon
                  return (
                    <Button key={t} variant={ui.variant} size="sm" disabled={!!agindo} onClick={() => transitar(t)}>
                      {agindo === t ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                      {ui.label}
                    </Button>
                  )
                })}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                As ações mostradas dependem da situação atual e do seu papel (Recepção/Rota ou Arquivo).
              </p>
            </Card>
          )}
        </div>

        {/* ── Sidebar: trilha do trâmite ── */}
        <div className="col-span-12 lg:col-span-4">
          <Card className="p-5">
            <h2 className="text-[13px] font-semibold text-foreground border-b border-border pb-2 -mx-5 px-5 mb-4">Trilha do trâmite</h2>
            <div className="max-h-[520px] overflow-y-auto nice-scrollbar -mr-2 pr-2">
              {detalhe.logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-4 ml-1">
                  {detalhe.logs.map((l) => (
                    <li key={l.id} className="relative">
                      <span className="absolute -left-[21.5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background"
                        style={{ background: MODULE_COLOR }} />
                      <p className="text-sm font-medium leading-snug">{l.evento}</p>
                      {l.situacao && (
                        <Badge variant="outline" className={cn('mt-1 text-[10px]', SITUACAO_BADGE[l.situacao])}>
                          {COLETA_SITUACAO_LABEL[l.situacao] ?? l.situacao}
                        </Badge>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {l.usuarioNomeResolvido ?? 'Sistema'} · {dataHoraBR(l.criadoEm)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Modal: editar ── */}
      <Dialog open={editAberta} onOpenChange={(o) => { if (!salvando) setEditAberta(o) }}>
        <DialogContent className="max-w-xl">
          <DialogHeaderIcon icon={Pencil} color="sky">
            <DialogTitle>Editar registro</DialogTitle>
            <DialogDescription>Tipo e situação mudam pelas ações do trâmite, não aqui.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Cliente</Label>
                <div className="mt-1.5">
                  <ClienteCombobox clientes={clientes} value={eCliente} onSelect={setECliente} placeholder="Busque por razão social ou CNPJ" />
                </div>
              </div>
              <div className="col-span-12 sm:col-span-7">
                <Label className="text-[13px] font-semibold">Contato</Label>
                <Input value={eContato} onChange={(e) => setEContato(e.target.value)} className="h-9 text-sm mt-1.5" maxLength={160} />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Label className="text-[13px] font-semibold">Competência</Label>
                <Input value={eCompetencia}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setECompetencia(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
                  }}
                  className="h-9 text-sm mt-1.5" placeholder="MM/AAAA" />
              </div>
              <div className="col-span-6 sm:col-span-2">
                <Label className="text-[13px] font-semibold">Prioridade</Label>
                <Select value={ePrioridade} onValueChange={setEPrioridade}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{COLETA_PRIORIDADE_LABEL[n]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <Label className="text-[13px] font-semibold">Categoria</Label>
                <Select value={eCategoria || '__none__'} onValueChange={(v) => setECategoria(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Descrição</Label>
                <Input value={eDescricao} onChange={(e) => setEDescricao(e.target.value)} className="h-9 text-sm mt-1.5" maxLength={500} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditAberta(false)} disabled={salvando}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarEdicao} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: excluir (soft, com motivo — como o v1) ── */}
      <Dialog open={delAberta} onOpenChange={(o) => { if (!excluindo) setDelAberta(o) }}>
        <DialogContent className="max-w-md">
          <DialogHeaderIcon icon={Trash2} color="rose">
            <DialogTitle>Excluir registro</DialogTitle>
            <DialogDescription>O registro sai da listagem, mas a trilha fica preservada.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <Label className="text-[13px] font-semibold">Motivo <span className="text-rose-500">*</span></Label>
            <Input value={delMotivo} onChange={(e) => setDelMotivo(e.target.value)} className="h-9 text-sm mt-1.5" maxLength={300} placeholder="Por que este registro está sendo excluído?" />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDelAberta(false)} disabled={excluindo}>Cancelar</Button>
            <Button variant="destructive" size="sm" onClick={excluir} disabled={excluindo || delMotivo.trim().length < 3}>
              {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
