'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, Loader2, Plus, MoreVertical, Search, Eye,
  CheckCircle2, FileSignature, Clock, X as XIcon, FileX,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, Label,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { CONTRATO_STATUS_LABELS, CONTRATO_STATUS_COLORS, type ContratoStatus } from '@saas/types'
import { ClienteCombobox } from '../orcamentos/_components/cliente-combobox'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

interface Contrato {
  id: string
  numero: number
  status: ContratoStatus
  dataInicio: string | null
  dataFim: string | null
  honorarioMensal: string | number | null
  contratanteRazaoSocial: string | null
  contratanteCnpj: string | null
  createdAt: string
  cliente: { id: string; razaoSocial: string; documento: string | null }
  template: { id: string; nome: string }
  _count?: { assinaturas: number; servicos: number }
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'RASCUNHO', label: 'Rascunho' },
  { value: 'AGUARDANDO_ASSINATURA', label: 'Aguardando' },
  { value: 'ASSINADO', label: 'Assinado' },
  { value: 'VIGENTE', label: 'Vigente' },
  { value: 'ENCERRADO', label: 'Encerrado' },
  { value: 'CANCELADO', label: 'Cancelado' },
]

export default function ContratosPage() {
  const router = useRouter()
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  // Modal Novo Contrato
  const [novoOpen, setNovoOpen] = useState(false)
  const [novoClienteId, setNovoClienteId] = useState('')
  const [novoTemplateId, setNovoTemplateId] = useState('')
  const [novoOrcamentoId, setNovoOrcamentoId] = useState('')
  const [novoServicoIds, setNovoServicoIds] = useState<string[]>([])
  const [novoHonorario, setNovoHonorario] = useState('')
  const [novoDiaVenc, setNovoDiaVenc] = useState('10')
  const [novoDataInicio, setNovoDataInicio] = useState('')
  const [novoFormaPgto, setNovoFormaPgto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [clientesOpts, setClientesOpts] = useState<Array<{ id: string; razaoSocial: string; documento?: string | null }>>([])
  const [templatesOpts, setTemplatesOpts] = useState<Array<{ id: string; nome: string; regimeTributario: string | null }>>([])
  const [servicosOpts, setServicosOpts] = useState<Array<{ id: string; nome: string; categoria: string | null }>>([])
  const [orcamentosCliente, setOrcamentosCliente] = useState<Array<{ id: string; numero: number; status: string; totalGeral: any }>>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const status = filtroStatus === 'todos' ? undefined : filtroStatus
      const data = await (trpc.contrato as any).listContratos.query({ status })
      setContratos(data || [])
    } catch (e) {
      console.warn('[Contratos] erro:', (e as Error).message)
    } finally { setLoading(false) }
  }, [filtroStatus])

  useEffect(() => { fetchData() }, [fetchData])

  async function abrirNovo() {
    setNovoClienteId('')
    setNovoTemplateId('')
    setNovoOrcamentoId('')
    setNovoServicoIds([])
    setNovoHonorario('')
    setNovoDiaVenc('10')
    setNovoDataInicio('')
    setNovoFormaPgto('')
    setNovoOpen(true)
    try {
      const [cls, tpls, srvs] = await Promise.all([
        (trpc.cliente as any).listForSelect.query().catch(() => []),
        (trpc.contrato as any).listTemplates.query().catch(() => []),
        (trpc.servico as any).listServicos.query().catch(() => []),
      ])
      setClientesOpts(cls || [])
      setTemplatesOpts((tpls || []).filter((t: any) => t.ativo))
      // Apenas servicos recorrentes/mensais entram no contrato. Pontuais (extras) sao
      // cobrados por execucao via orcamento, nao via contrato continuo.
      setServicosOpts((srvs || []).filter((s: any) => s.ativo !== false && s.recorrenteMensal === true))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // Quando cliente muda, sugere template + carrega orçamentos do cliente
  useEffect(() => {
    if (!novoClienteId) { setOrcamentosCliente([]); return }
    ;(async () => {
      try {
        const orcs = await (trpc.orcamento as any).list?.query({ clienteId: novoClienteId, status: 'APROVADO' }).catch(() => [])
        setOrcamentosCliente((Array.isArray(orcs) ? orcs : orcs?.data || []).filter((o: any) => o.status === 'APROVADO'))
      } catch { setOrcamentosCliente([]) }
    })()
  }, [novoClienteId])

  async function handleCriar() {
    if (!novoClienteId) return alerts.error('Erro', 'Selecione o cliente')
    if (!novoTemplateId) return alerts.error('Erro', 'Selecione o modelo')
    setSalvando(true)
    try {
      const c = await (trpc.contrato as any).createContrato.mutate({
        clienteId: novoClienteId,
        templateId: novoTemplateId,
        orcamentoId: novoOrcamentoId || null,
        dataInicio: novoDataInicio || null,
        prazoAvisoDias: 30,
        honorarioMensal: novoHonorario ? Number(novoHonorario) : null,
        honorarioFormaPagamento: novoFormaPgto || null,
        diaVencimento: novoDiaVenc ? Number(novoDiaVenc) : null,
        servicoIds: novoServicoIds,
      })
      await alerts.success('Criado', `Contrato #${c.numero} criado em rascunho.`)
      setNovoOpen(false)
      router.push(`/contratos/${c.id}`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSalvando(false) }
  }

  function toggleServico(id: string) {
    setNovoServicoIds(curr => curr.includes(id) ? curr.filter(x => x !== id) : [...curr, id])
  }

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return contratos
    return contratos.filter(c =>
      c.cliente.razaoSocial.toLowerCase().includes(q) ||
      c.cliente.documento?.toLowerCase().includes(q) ||
      String(c.numero).includes(q),
    )
  }, [contratos, busca])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="comercial" icon={FileText} />
          <div>
            <h1>Contratos</h1>
            <p className="text-sm text-muted-foreground">Geração, assinatura e gestão de contratos com cláusulas versionadas</p>
          </div>
        </div>
        <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={abrirNovo}>
          <Plus className="h-4 w-4" /> Novo Contrato
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nº, cliente ou CNPJ..." className="pl-8 h-9 text-sm" />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-9 text-sm w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} contrato{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </Card>

      {/* Lista */}
      {loading ? (
        <Card className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileX className="h-10 w-10 opacity-30 mb-3" />
          <p className="text-sm">Nenhum contrato encontrado</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border/60">
            {filtered.map(c => {
              const cor = CONTRATO_STATUS_COLORS[c.status]
              const honorario = c.honorarioMensal ? Number(c.honorarioMensal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null
              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/contratos/${c.id}`)}
                  className="px-4 py-3 hover:bg-muted/30 cursor-pointer flex items-center gap-3 group"
                >
                  <div className="w-1 h-12 rounded-full shrink-0" style={{ backgroundColor: cor }} />

                  <div className="flex-1 min-w-0 grid grid-cols-12 gap-3 items-center">
                    <div className="col-span-12 sm:col-span-5 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono font-bold text-muted-foreground">#{String(c.numero).padStart(5, '0')}</span>
                        <Badge style={{ backgroundColor: `${cor}22`, color: cor }} className="text-[10px] h-4 px-1.5 border-0">
                          {CONTRATO_STATUS_LABELS[c.status]}
                        </Badge>
                      </div>
                      <p className="text-sm font-semibold truncate">{c.cliente.razaoSocial}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{c.cliente.documento || '—'}</p>
                    </div>

                    <div className="col-span-6 sm:col-span-3 min-w-0 text-xs">
                      <p className="text-muted-foreground">Modelo</p>
                      <p className="font-medium truncate">{c.template.nome}</p>
                    </div>

                    <div className="col-span-6 sm:col-span-2 min-w-0 text-xs">
                      <p className="text-muted-foreground">Honorário</p>
                      <p className="font-medium">{honorario || '—'}</p>
                    </div>

                    <div className="col-span-12 sm:col-span-2 min-w-0 text-xs flex items-center justify-end gap-2">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <FileSignature className="h-3.5 w-3.5" />
                        {c._count?.assinaturas ?? 0}/2
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => router.push(`/contratos/${c.id}`)} className="text-xs gap-2 cursor-pointer">
                            <Eye className="h-3.5 w-3.5" /> Abrir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Modal Novo Contrato */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[88vh] overflow-y-auto">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Novo Contrato</DialogTitle>
            <DialogDescription>Selecione cliente e modelo. As cláusulas serão snapshot no momento da criação.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Cliente *</Label>
              <ClienteCombobox
                clientes={clientesOpts}
                value={novoClienteId}
                onSelect={setNovoClienteId}
                placeholder="Selecione o cliente"
              />
            </div>

            {orcamentosCliente.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Orçamento aprovado (opcional)</Label>
                <Select value={novoOrcamentoId || 'none'} onValueChange={v => setNovoOrcamentoId(v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Vincular a um orçamento" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem vínculo —</SelectItem>
                    {orcamentosCliente.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        Orçamento #{o.numero} — {Number(o.totalGeral || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Modelo de Contrato *</Label>
              <Select value={novoTemplateId} onValueChange={setNovoTemplateId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um modelo" /></SelectTrigger>
                <SelectContent>
                  {templatesOpts.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum modelo cadastrado em /contrato-templates</div>
                  ) : templatesOpts.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.regimeTributario ? `[${t.regimeTributario}] ` : ''}{t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Serviços contratados (mensais)</Label>
              <p className="text-[10px] text-muted-foreground">
                Apenas serviços recorrentes mensais aparecem aqui. Para incluir um serviço, marque-o como <strong>"Recorrente mensal"</strong> em <a href="/servicos" target="_blank" className="underline">/servicos</a>.
              </p>
              <div className="max-h-48 overflow-y-auto rounded-md border divide-y divide-border/60">
                {servicosOpts.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">Nenhum serviço recorrente mensal cadastrado.</p>
                ) : servicosOpts.map(s => (
                  <label key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={novoServicoIds.includes(s.id)}
                      onChange={() => toggleServico(s.id)}
                      className="h-3.5 w-3.5 rounded border-input accent-rose-600"
                    />
                    <span className="text-xs">
                      {s.categoria && <span className="text-muted-foreground">[{s.categoria}] </span>}
                      {s.nome}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-4 space-y-1.5">
                <Label className="text-[13px] font-semibold">Honorário mensal</Label>
                <div className="flex">
                  <span className="inline-flex items-center px-2 h-9 border border-r-0 border-input bg-muted text-xs text-muted-foreground rounded-l-md">R$</span>
                  <Input type="number" step="0.01" value={novoHonorario} onChange={e => setNovoHonorario(e.target.value)} placeholder="0,00" className="h-9 text-sm rounded-l-none" />
                </div>
              </div>
              <div className="col-span-6 sm:col-span-3 space-y-1.5">
                <Label className="text-[13px] font-semibold">Dia vencimento</Label>
                <Input type="number" min={1} max={31} value={novoDiaVenc} onChange={e => setNovoDiaVenc(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-6 sm:col-span-5 space-y-1.5">
                <Label className="text-[13px] font-semibold">Data início</Label>
                <Input type="date" value={novoDataInicio} onChange={e => setNovoDataInicio(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-12 space-y-1.5">
                <Label className="text-[13px] font-semibold">Forma de pagamento</Label>
                <Input value={novoFormaPgto} onChange={e => setNovoFormaPgto(e.target.value)} placeholder="Ex: Boleto bancário, débito automático..." className="h-9 text-sm" />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)} disabled={salvando}>Cancelar</Button>
            <Button size="sm" onClick={handleCriar} disabled={salvando} style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
