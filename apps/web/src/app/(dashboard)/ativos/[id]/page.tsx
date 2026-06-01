'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2, Save, Trash2, Database, Coins, Wrench, Shield,
  History, FileText, Paperclip, Pencil, X, Plus, Download, Upload,
  AlertCircle, Printer, QrCode,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Button, Input, Card, cn, Label, Badge,
  Tabs, TabsContent, SlidingTabsList, TabsTrigger,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'
import {
  ATIVO_STATUS, ATIVO_STATUS_META, ATIVO_MOVIMENTACAO_TIPO_LABEL,
  ATIVO_MANUTENCAO_TIPO, ATIVO_ANEXO_TIPO,
  calcularValorDepreciado, type AtivoStatus, type AtivoManutencaoTipo, type AtivoAnexoTipo,
} from '@saas/types'

const MODULE_COLOR = 'var(--mod-ti, #22d3ee)'

const STATUS_CHIP_CLS: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800',
  amber:   'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  slate:   'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300 dark:border-slate-800',
  sky:     'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800',
  rose:    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800',
}

function fmtBRL(v: number | string | null | undefined): string {
  if (v == null) return '—'
  const n = typeof v === 'string' ? Number(v) : v
  if (isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '—'
  const d = typeof v === 'string' ? new Date(v) : v
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}
function toDateInput(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = typeof v === 'string' ? new Date(v) : v
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

interface TipoOpt { id: string; nome: string; cor: string | null; icone: string | null }
interface CategoriaOpt { id: string; nome: string; depreciacaoMeses: number | null }
interface UserOpt { id: string; name: string; image: string | null; areaName?: string | null }
interface AreaOpt { id: string; name: string }
interface ClienteOpt { id: string; razaoSocial: string; nomeFantasia: string | null }
interface FornecedorOpt { id: string; razaoSocial: string }

export default function AtivoDetalhePage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ativo, setAtivo] = useState<any | null>(null)

  // Opções pra Selects
  const [tipos, setTipos] = useState<TipoOpt[]>([])
  const [categorias, setCategorias] = useState<CategoriaOpt[]>([])
  const [users, setUsers] = useState<UserOpt[]>([])
  const [areas, setAreas] = useState<AreaOpt[]>([])
  const [clientes, setClientes] = useState<ClienteOpt[]>([])
  const [fornecedores, setFornecedores] = useState<FornecedorOpt[]>([])

  // Form state
  const [tag, setTag] = useState('')
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [fabricante, setFabricante] = useState('')
  const [modelo, setModelo] = useState('')
  const [serial, setSerial] = useState('')
  const [patrimonio, setPatrimonio] = useState('')
  const [fornecedorId, setFornecedorId] = useState<string>('')
  const [notaFiscal, setNotaFiscal] = useState('')
  const [dataAquisicao, setDataAquisicao] = useState('')
  const [valorAquisicao, setValorAquisicao] = useState('')
  const [garantiaInicio, setGarantiaInicio] = useState('')
  const [garantiaFim, setGarantiaFim] = useState('')
  const [status, setStatus] = useState<AtivoStatus>('ESTOQUE')
  const [localizacao, setLocalizacao] = useState('')
  const [responsavelId, setResponsavelId] = useState<string>('')
  const [areaId, setAreaId] = useState<string>('')
  const [clienteId, setClienteId] = useState<string>('')
  const [observacoes, setObservacoes] = useState('')
  const [activeTab, setActiveTab] = useState('identificacao')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const a = await (trpc.ativo as any).getById.query({ id })
      if (!a) { alerts.error('Erro', 'Ativo não encontrado'); return }
      setAtivo(a)
      setTag(a.tag); setNome(a.nome); setDescricao(a.descricao ?? '')
      setTipoId(a.tipoId); setCategoriaId(a.categoriaId)
      setFabricante(a.fabricante ?? ''); setModelo(a.modelo ?? ''); setSerial(a.serial ?? ''); setPatrimonio(a.patrimonio ?? '')
      setFornecedorId(a.fornecedorId ?? ''); setNotaFiscal(a.notaFiscal ?? '')
      setDataAquisicao(toDateInput(a.dataAquisicao)); setValorAquisicao(a.valorAquisicao ? String(a.valorAquisicao) : '')
      setGarantiaInicio(toDateInput(a.garantiaInicio)); setGarantiaFim(toDateInput(a.garantiaFim))
      setStatus(a.status); setLocalizacao(a.localizacao ?? '')
      setResponsavelId(a.responsavelId ?? ''); setAreaId(a.areaId ?? ''); setClienteId(a.clienteId ?? '')
      setObservacoes(a.observacoes ?? '')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void carregar() }, [carregar])

  // Carrega opções (uma vez)
  useEffect(() => {
    (async () => {
      try {
        const [t, u, ar, cl, fo] = await Promise.all([
          (trpc.ativo as any).listTipos.query() as Promise<TipoOpt[]>,
          (trpc.user as any).listForSelect.query().catch(() => []),
          (trpc.area as any).listForSelect.query().catch(() => []),
          (trpc.cliente as any).listForSelect?.query?.().catch(() => []) ?? Promise.resolve([]),
          (trpc.fornecedor as any).listForSelect?.query?.().catch(() => []) ?? Promise.resolve([]),
        ])
        setTipos(t); setUsers(u || []); setAreas(ar || []); setClientes(cl || []); setFornecedores(fo || [])
      } catch { /* silent */ }
    })()
  }, [])

  // Categorias dependem do tipo
  useEffect(() => {
    if (!tipoId) { setCategorias([]); return }
    (async () => {
      try {
        const cats = await (trpc.ativo as any).listCategorias.query({ tipoId }) as CategoriaOpt[]
        setCategorias(cats)
      } catch { setCategorias([]) }
    })()
  }, [tipoId])

  async function handleSave() {
    if (!nome.trim()) { alerts.error('Erro', 'Nome é obrigatório'); return }
    setSaving(true)
    try {
      await (trpc.ativo as any).update.mutate({
        id,
        data: {
          tag: tag.trim() || undefined,
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          tipoId, categoriaId,
          fabricante: fabricante.trim() || null,
          modelo: modelo.trim() || null,
          serial: serial.trim() || null,
          patrimonio: patrimonio.trim() || null,
          fornecedorId: fornecedorId || null,
          notaFiscal: notaFiscal.trim() || null,
          dataAquisicao: dataAquisicao ? new Date(dataAquisicao) : null,
          valorAquisicao: valorAquisicao ? Number(valorAquisicao.replace(',', '.')) : null,
          garantiaInicio: garantiaInicio ? new Date(garantiaInicio) : null,
          garantiaFim: garantiaFim ? new Date(garantiaFim) : null,
          status,
          localizacao: localizacao.trim() || null,
          responsavelId: responsavelId || null,
          areaId: areaId || null,
          clienteId: clienteId || null,
          observacoes: observacoes.trim() || null,
        },
      })
      await alerts.success('Salvo', 'Ativo atualizado.')
      void carregar()
    } catch (e) {
      alerts.error('Erro ao salvar', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const ok = await alerts.confirm({
      title: 'Baixar ativo',
      text: `O ativo ${tag} será baixado (descartado). Histórico mantido.`,
      confirmText: 'Baixar',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.ativo as any).delete.mutate({ id })
      await alerts.success('Baixado', 'Ativo descartado com sucesso.')
      router.push('/ativos')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando ativo...
      </div>
    )
  }
  if (!ativo) return <div className="py-20 text-center text-muted-foreground">Ativo não encontrado.</div>

  const meta = ATIVO_STATUS_META[status]
  const cat = categorias.find(c => c.id === categoriaId) ?? ativo.categoria
  const valorDeprec = calcularValorDepreciado(
    valorAquisicao ? Number(valorAquisicao.replace(',', '.')) : null,
    dataAquisicao,
    cat?.depreciacaoMeses ?? null,
  )
  const tcoManutencao = (ativo.manutencoes ?? []).reduce((sum: number, m: any) =>
    sum + (Number(m.custoMaoObra ?? 0) + Number(m.custoPecas ?? 0)), 0)
  const tcoTotal = (valorAquisicao ? Number(valorAquisicao.replace(',', '.')) : 0) + tcoManutencao
  const garantiaVencendo = ativo.garantiaFim && new Date(ativo.garantiaFim).getTime() - Date.now() < 30 * 24 * 3600 * 1000
    && new Date(ativo.garantiaFim).getTime() > Date.now()
  const garantiaVencida = ativo.garantiaFim && new Date(ativo.garantiaFim).getTime() < Date.now()

  return (
    <div className="space-y-0 pb-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">

      {/* Wrapper bleed-edge cobrindo Header + Tabs — padrão dos demais módulos de detalhe.
          Cor TI cyan (rgb 34, 211, 238) com alpha .18 no fundo. */}
      <div className="relative -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 overflow-hidden group/cover"
           style={{ backgroundColor: 'rgba(34, 211, 238, .18)' }}>

        <div className="relative z-10 px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4 min-w-0">
              <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-white dark:bg-gray-800 overflow-hidden shadow-lg" style={{ boxShadow: 'inset 0 0 0 3px #d4d4d4' }}>
                <Database className="h-10 w-10" style={{ color: MODULE_COLOR }} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold uppercase truncate">{nome || 'Sem nome'}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  <span className="font-mono">{ativo.tag}</span>
                  {ativo.fabricante && <>&nbsp;&nbsp;|&nbsp;&nbsp;{ativo.fabricante}{ativo.modelo ? ` · ${ativo.modelo}` : ''}</>}
                  {ativo.serial && <>&nbsp;&nbsp;|&nbsp;&nbsp;Serial: {ativo.serial}</>}
                </p>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase border', STATUS_CHIP_CLS[meta.cor])}>
                    {meta.label}
                  </span>
                  {garantiaVencendo && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 text-xs font-medium uppercase border border-amber-200 dark:border-amber-800">
                      Garantia vencendo
                    </span>
                  )}
                  {garantiaVencida && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 px-3 py-1 text-xs font-medium uppercase border border-rose-200 dark:border-rose-800">
                      Sem garantia
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href={`/ativos/etiquetas?ids=${id}`} target="_blank">
                <Button size="sm" variant="outline" className="gap-1.5" title="Imprimir etiqueta com QR Code">
                  <Printer className="h-3.5 w-3.5" /> Etiqueta
                </Button>
              </Link>
              <Link href={`/ativos/${id}/termo`} target="_blank">
                <Button size="sm" variant="outline" className="gap-1.5" title="Gerar termo de responsabilidade">
                  <FileText className="h-3.5 w-3.5" /> Termo
                </Button>
              </Link>
              <Button size="sm" variant="outline" onClick={handleDelete} className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950/30">
                <Trash2 className="h-3.5 w-3.5" /> Baixar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 text-white" style={{ backgroundColor: MODULE_COLOR }}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </Button>
              <BackButton href="/ativos" />
            </div>
          </div>
        </div>

        {/* Tabs principais (pills com slide) — padrão das demais páginas de detalhe.
            Classes !-prefixadas vencem as regras globais de [role="tablist"]. */}
        <div className="relative z-10 px-4 sm:px-6 pb-2 overflow-x-auto flex justify-center">
          <SlidingTabsList activeValue={activeTab} className="min-w-max !shadow-sm !border !border-b !border-white/80 dark:!border-white/25 gap-1.5 !p-1 !bg-white/40 dark:!bg-black/30 !rounded-full backdrop-blur-sm w-fit">
            <TabsTrigger value="identificacao" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-cyan-400 gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Identificação
            </TabsTrigger>
            <TabsTrigger value="aquisicao" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-cyan-400 gap-1.5">
              <Coins className="h-3.5 w-3.5" /> Aquisição
            </TabsTrigger>
            <TabsTrigger value="atribuicao" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-cyan-400 gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Atribuição
            </TabsTrigger>
            <TabsTrigger value="manutencoes" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-cyan-400 gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Manutenções
              {(ativo.manutencoes?.length ?? 0) > 0 && <Badge variant="secondary" className="text-[10px] ml-1 h-4 px-1.5">{ativo.manutencoes.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="anexos" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-cyan-400 gap-1.5">
              <Paperclip className="h-3.5 w-3.5" /> Anexos
              {(ativo.anexos?.length ?? 0) > 0 && <Badge variant="secondary" className="text-[10px] ml-1 h-4 px-1.5">{ativo.anexos.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="tickets" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-cyan-400 gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Tickets
            </TabsTrigger>
            <TabsTrigger value="historico" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-cyan-400 gap-1.5">
              <History className="h-3.5 w-3.5" /> Histórico
            </TabsTrigger>
          </SlidingTabsList>
        </div>
      </div>
      {/* /wrapper bleed-edge */}

      {/* KPIs do ativo — fora do wrapper, espaçados normalmente */}
      <Card className="p-3 mt-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiAtivo icon={Coins} label="Valor de aquisição" value={fmtBRL(valorAquisicao ? Number(valorAquisicao.replace(',', '.')) : null)} />
          <KpiAtivo icon={Coins} label="Valor depreciado" value={valorDeprec !== null ? fmtBRL(valorDeprec) : '—'} hint={cat?.depreciacaoMeses ? `Vida útil: ${cat.depreciacaoMeses} meses` : 'Sem depreciação'} />
          <KpiAtivo icon={Wrench} label="Custo manutenções" value={fmtBRL(tcoManutencao)} hint={`${(ativo.manutencoes ?? []).length} registros`} />
          <KpiAtivo icon={Shield} label="TCO acumulado" value={fmtBRL(tcoTotal)} hint="Aquisição + manutenções" />
        </div>
      </Card>

        <TabsContent value="identificacao" className="mt-4">
          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-2 space-y-1.5">
                <Label className="text-[13px] font-semibold">Tag</Label>
                <Input value={tag} onChange={e => setTag(e.target.value)} className="h-9 text-sm font-mono" />
              </div>
              <div className="col-span-12 sm:col-span-10 space-y-1.5">
                <Label className="text-[13px] font-semibold">Nome *</Label>
                <Input value={nome} onChange={e => setNome(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Tipo *</Label>
                <Select value={tipoId} onValueChange={setTipoId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Categoria *</Label>
                <Select value={categoriaId} onValueChange={setCategoriaId} disabled={!tipoId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-4 space-y-1.5">
                <Label className="text-[13px] font-semibold">Fabricante</Label>
                <Input value={fabricante} onChange={e => setFabricante(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-12 sm:col-span-4 space-y-1.5">
                <Label className="text-[13px] font-semibold">Modelo</Label>
                <Input value={modelo} onChange={e => setModelo(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-12 sm:col-span-4 space-y-1.5">
                <Label className="text-[13px] font-semibold">Nº de série</Label>
                <Input value={serial} onChange={e => setSerial(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Patrimônio contábil</Label>
                <Input value={patrimonio} onChange={e => setPatrimonio(e.target.value)} className="h-9 text-sm" placeholder="Nº patrimônio fiscal" />
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Localização</Label>
                <Input value={localizacao} onChange={e => setLocalizacao(e.target.value)} className="h-9 text-sm" placeholder="Sala TI, Filial Vitória..." />
              </div>
              <div className="col-span-12 space-y-1.5">
                <Label className="text-[13px] font-semibold">Descrição</Label>
                <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="col-span-12 space-y-1.5">
                <Label className="text-[13px] font-semibold">Observações</Label>
                <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="aquisicao" className="mt-4">
          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Fornecedor</Label>
                <Select value={fornecedorId || '__none__'} onValueChange={v => setFornecedorId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem fornecedor —</SelectItem>
                    {fornecedores.map(f => <SelectItem key={f.id} value={f.id}>{f.razaoSocial}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Nota fiscal</Label>
                <Input value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Data de aquisição</Label>
                <Input type="date" value={dataAquisicao} onChange={e => setDataAquisicao(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Valor de aquisição (R$)</Label>
                <Input type="text" inputMode="decimal" value={valorAquisicao} onChange={e => setValorAquisicao(e.target.value)} className="h-9 text-sm tabular-nums" placeholder="0,00" />
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Garantia — Início</Label>
                <Input type="date" value={garantiaInicio} onChange={e => setGarantiaInicio(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Garantia — Fim</Label>
                <Input type="date" value={garantiaFim} onChange={e => setGarantiaFim(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="atribuicao" className="mt-4">
          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Status</Label>
                <Select value={status} onValueChange={v => setStatus(v as AtivoStatus)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ATIVO_STATUS.map(s => <SelectItem key={s} value={s}>{ATIVO_STATUS_META[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Responsável (usuário)</Label>
                <Select value={responsavelId || '__none__'} onValueChange={v => setResponsavelId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem responsável —</SelectItem>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}{u.areaName ? ` · ${u.areaName}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Área</Label>
                <Select value={areaId || '__none__'} onValueChange={v => setAreaId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem área —</SelectItem>
                    {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Cliente (em caso de empréstimo)</Label>
                <Select value={clienteId || '__none__'} onValueChange={v => setClienteId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem empréstimo —</SelectItem>
                    {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia ?? c.razaoSocial}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Definir cliente automaticamente registra o status como EMPRESTADO no histórico.
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="manutencoes" className="mt-4">
          <ManutencoesTab
            ativoId={id}
            manutencoes={ativo.manutencoes ?? []}
            fornecedores={fornecedores}
            users={users}
            onChanged={carregar}
          />
        </TabsContent>

        <TabsContent value="anexos" className="mt-4">
          <AnexosTab
            ativoId={id}
            anexos={ativo.anexos ?? []}
            onChanged={carregar}
          />
        </TabsContent>

        <TabsContent value="tickets" className="mt-4">
          <Card className="p-4">
            <h4 className="text-[13px] font-semibold mb-3">Tickets de Helpdesk vinculados</h4>
            {(ativo.helpdeskTickets ?? []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm italic">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Nenhum ticket relacionado a este ativo.
              </div>
            ) : (
              <div className="space-y-1.5">
                {ativo.helpdeskTickets.map((t: any) => (
                  <Link
                    key={t.id}
                    href={`/helpdesk/${t.id}`}
                    className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 hover:bg-muted/40 transition-colors"
                  >
                    <span className="font-mono text-[11px] text-sky-700 dark:text-sky-300 font-semibold shrink-0">
                      #HLP{String(t.numero).padStart(4, '0')}
                    </span>
                    <span className="flex-1 text-[12px] truncate">{t.titulo}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{fmtDate(t.createdAt)}</span>
                    <span className={cn(
                      'inline-flex px-1.5 py-0 rounded-full text-[9px] font-semibold border shrink-0',
                      t.status === 'CONCLUIDO' ? STATUS_CHIP_CLS.emerald
                        : t.status === 'RESOLVIDO' ? STATUS_CHIP_CLS.sky
                          : t.status === 'EM_ANDAMENTO' ? STATUS_CHIP_CLS.amber
                            : STATUS_CHIP_CLS.slate,
                    )}>{t.status.replace('_', ' ')}</span>
                  </Link>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-3">
              Tickets aparecem aqui quando o campo &quot;Ativo&quot; é preenchido em /helpdesk.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Card className="p-4">
            <div className="space-y-2.5">
              {(ativo.movimentacoes ?? []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm italic">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Nenhuma movimentação registrada ainda.
                </div>
              ) : ativo.movimentacoes.map((m: any) => (
                <div key={m.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                  <div className="h-7 w-7 rounded-full bg-sky-100 dark:bg-sky-950/30 flex items-center justify-center shrink-0 mt-0.5">
                    <History className="h-3.5 w-3.5 text-sky-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-semibold">
                        {ATIVO_MOVIMENTACAO_TIPO_LABEL[m.tipo as keyof typeof ATIVO_MOVIMENTACAO_TIPO_LABEL] ?? m.tipo}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {fmtDate(m.createdAt)} · {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {m.registradoPor && (
                        <span className="text-[10px] text-muted-foreground">por {m.registradoPor.name}</span>
                      )}
                    </div>
                    {m.statusAnterior && m.statusNovo && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Status: <span className="font-medium">{ATIVO_STATUS_META[m.statusAnterior as AtivoStatus]?.label}</span>
                        {' → '}
                        <span className="font-medium">{ATIVO_STATUS_META[m.statusNovo as AtivoStatus]?.label}</span>
                      </p>
                    )}
                    {m.motivo && <p className="text-[11px] text-muted-foreground mt-0.5 italic">{m.motivo}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Tab: Manutenções ──────────────────────────────────────────────────

const MANUTENCAO_TIPO_META: Record<AtivoManutencaoTipo, { label: string; cor: string }> = {
  PREVENTIVA: { label: 'Preventiva', cor: 'emerald' },
  CORRETIVA:  { label: 'Corretiva',  cor: 'rose' },
  UPGRADE:    { label: 'Upgrade',    cor: 'sky' },
}

function ManutencoesTab({ ativoId, manutencoes, fornecedores, users, onChanged }: {
  ativoId: string
  manutencoes: any[]
  fornecedores: FornecedorOpt[]
  users: UserOpt[]
  onChanged: () => void | Promise<void>
}) {
  const [editing, setEditing] = useState<any | 'new' | null>(null)
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[13px] font-semibold">Histórico de manutenções</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Custos somam ao TCO no header. Registre preventivas, corretivas ou upgrades.
          </p>
        </div>
        {!editing && (
          <Button size="sm" onClick={() => setEditing('new')} className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white">
            <Plus className="h-3.5 w-3.5" /> Nova manutenção
          </Button>
        )}
      </div>

      {editing && (
        <ManutencaoEditor
          ativoId={ativoId}
          initial={editing === 'new' ? undefined : editing}
          fornecedores={fornecedores}
          users={users}
          onCancel={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await onChanged() }}
        />
      )}

      {manutencoes.length === 0 && !editing ? (
        <div className="text-center py-8 text-muted-foreground text-sm italic">
          <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
          Nenhuma manutenção registrada.
        </div>
      ) : manutencoes.map(m => {
        if (editing && editing !== 'new' && editing.id === m.id) return null
        const meta = MANUTENCAO_TIPO_META[m.tipo as AtivoManutencaoTipo]
        const custo = Number(m.custoMaoObra ?? 0) + Number(m.custoPecas ?? 0)
        return (
          <div key={m.id} className="rounded-md border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border', STATUS_CHIP_CLS[meta.cor])}>
                    {meta.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDate(m.dataInicio)} → {fmtDate(m.dataFim)}
                  </span>
                  {m.fornecedor && (
                    <span className="text-[10px] text-muted-foreground">por {m.fornecedor.razaoSocial}</span>
                  )}
                </div>
                <p className="text-[12px] text-foreground mt-1">{m.descricao}</p>
                {m.proximaPreventiva && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">
                    📅 Próxima preventiva: {fmtDate(m.proximaPreventiva)}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[13px] font-bold tabular-nums">{fmtBRL(custo)}</div>
                {m.custoMaoObra != null && (
                  <div className="text-[10px] text-muted-foreground tabular-nums">MO: {fmtBRL(Number(m.custoMaoObra))}</div>
                )}
                {m.custoPecas != null && (
                  <div className="text-[10px] text-muted-foreground tabular-nums">Peças: {fmtBRL(Number(m.custoPecas))}</div>
                )}
                <div className="flex gap-1 mt-1.5">
                  <Button variant="ghost" size="icon-xs" onClick={() => setEditing(m)} title="Editar">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon-xs" className="text-rose-600 hover:text-rose-700" title="Excluir"
                    onClick={async () => {
                      const ok = await alerts.confirm({ title: 'Excluir manutenção', text: 'Esta ação não pode ser desfeita.', confirmText: 'Excluir' })
                      if (!ok) return
                      try {
                        await (trpc.ativo as any).deleteManutencao.mutate({ id: m.id })
                        await onChanged()
                      } catch (e) { alerts.error('Erro', (e as Error).message) }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </Card>
  )
}

function ManutencaoEditor({ ativoId, initial, fornecedores, users, onCancel, onSaved }: {
  ativoId: string
  initial?: any
  fornecedores: FornecedorOpt[]
  users: UserOpt[]
  onCancel: () => void
  onSaved: () => void | Promise<void>
}) {
  const [tipo, setTipo] = useState<AtivoManutencaoTipo>(initial?.tipo ?? 'CORRETIVA')
  const [descricao, setDescricao] = useState(initial?.descricao ?? '')
  const [fornecedorId, setFornecedorId] = useState<string>(initial?.fornecedorId ?? '')
  const [custoMaoObra, setCustoMaoObra] = useState(initial?.custoMaoObra ? String(initial.custoMaoObra) : '')
  const [custoPecas, setCustoPecas] = useState(initial?.custoPecas ? String(initial.custoPecas) : '')
  const [dataInicio, setDataInicio] = useState(toDateInput(initial?.dataInicio))
  const [dataFim, setDataFim] = useState(toDateInput(initial?.dataFim))
  const [proximaPreventiva, setProximaPreventiva] = useState(toDateInput(initial?.proximaPreventiva))
  const [responsavelId, setResponsavelId] = useState<string>(initial?.responsavelId ?? '')
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!descricao.trim()) { alerts.error('Erro', 'Descrição é obrigatória'); return }
    setSaving(true)
    try {
      const payload = {
        tipo, descricao: descricao.trim(),
        fornecedorId: fornecedorId || null,
        custoMaoObra: custoMaoObra ? Number(custoMaoObra.replace(',', '.')) : null,
        custoPecas:   custoPecas   ? Number(custoPecas.replace(',', '.'))   : null,
        dataInicio: dataInicio ? new Date(dataInicio) : null,
        dataFim:    dataFim    ? new Date(dataFim)    : null,
        proximaPreventiva: proximaPreventiva ? new Date(proximaPreventiva) : null,
        responsavelId: responsavelId || null,
        observacoes: observacoes.trim() || null,
      }
      if (initial?.id) {
        await (trpc.ativo as any).updateManutencao.mutate({ id: initial.id, data: payload })
      } else {
        await (trpc.ativo as any).createManutencao.mutate({ ativoId, ...payload })
      }
      await onSaved()
    } catch (e) { alerts.error('Erro ao salvar', (e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded-md border-2 border-sky-300 bg-sky-50/40 dark:bg-sky-950/10 dark:border-sky-900 p-3 space-y-3">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 sm:col-span-4 space-y-1.5">
          <Label className="text-[13px] font-semibold">Tipo *</Label>
          <Select value={tipo} onValueChange={v => setTipo(v as AtivoManutencaoTipo)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ATIVO_MANUTENCAO_TIPO.map(t => <SelectItem key={t} value={t}>{MANUTENCAO_TIPO_META[t].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-12 sm:col-span-8 space-y-1.5">
          <Label className="text-[13px] font-semibold">Fornecedor</Label>
          <Select value={fornecedorId || '__none__'} onValueChange={v => setFornecedorId(v === '__none__' ? '' : v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Sem fornecedor —</SelectItem>
              {fornecedores.map(f => <SelectItem key={f.id} value={f.id}>{f.razaoSocial}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-12 space-y-1.5">
          <Label className="text-[13px] font-semibold">Descrição *</Label>
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2}
            placeholder="Detalhes do serviço executado..."
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm resize-y" />
        </div>
        <div className="col-span-12 sm:col-span-3 space-y-1.5">
          <Label className="text-[13px] font-semibold">Início</Label>
          <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="col-span-12 sm:col-span-3 space-y-1.5">
          <Label className="text-[13px] font-semibold">Conclusão</Label>
          <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="col-span-12 sm:col-span-3 space-y-1.5">
          <Label className="text-[13px] font-semibold">Mão de obra (R$)</Label>
          <Input type="text" inputMode="decimal" value={custoMaoObra} onChange={e => setCustoMaoObra(e.target.value)} className="h-9 text-sm tabular-nums" placeholder="0,00" />
        </div>
        <div className="col-span-12 sm:col-span-3 space-y-1.5">
          <Label className="text-[13px] font-semibold">Peças (R$)</Label>
          <Input type="text" inputMode="decimal" value={custoPecas} onChange={e => setCustoPecas(e.target.value)} className="h-9 text-sm tabular-nums" placeholder="0,00" />
        </div>
        <div className="col-span-12 sm:col-span-6 space-y-1.5">
          <Label className="text-[13px] font-semibold">Próxima preventiva</Label>
          <Input type="date" value={proximaPreventiva} onChange={e => setProximaPreventiva(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="col-span-12 sm:col-span-6 space-y-1.5">
          <Label className="text-[13px] font-semibold">Responsável interno</Label>
          <Select value={responsavelId || '__none__'} onValueChange={v => setResponsavelId(v === '__none__' ? '' : v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Sem responsável —</SelectItem>
              {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-12 space-y-1.5">
          <Label className="text-[13px] font-semibold">Observações</Label>
          <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm resize-y" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          <X className="h-3 w-3 mr-1" /> Cancelar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-sky-600 hover:bg-sky-700 gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </div>
  )
}

// ── Tab: Anexos ───────────────────────────────────────────────────────

const ANEXO_TIPO_META: Record<AtivoAnexoTipo, { label: string; cor: string }> = {
  NOTA_FISCAL: { label: 'Nota Fiscal', cor: 'emerald' },
  CONTRATO:    { label: 'Contrato',    cor: 'sky' },
  FOTO:        { label: 'Foto',        cor: 'amber' },
  MANUAL:      { label: 'Manual',      cor: 'slate' },
  OUTRO:       { label: 'Outro',       cor: 'slate' },
}

function fmtBytes(n?: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function AnexosTab({ ativoId, anexos, onChanged }: {
  ativoId: string
  anexos: any[]
  onChanged: () => void | Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const [tipoUpload, setTipoUpload] = useState<AtivoAnexoTipo>('NOTA_FISCAL')

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', body: fd, credentials: 'include' })
      if (!res.ok) throw new Error(`Falha no upload (HTTP ${res.status})`)
      const { filename } = await res.json() as { filename: string }
      await (trpc.ativo as any).createAnexo.mutate({
        ativoId,
        tipo: tipoUpload,
        fileName: file.name,
        storageKey: filename,
        fileSize: file.size,
        mimeType: file.type || null,
      })
      await onChanged()
    } catch (e) {
      alerts.error('Erro no upload', (e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="text-[13px] font-semibold">Anexos do ativo</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            NF de aquisição, contratos de garantia, fotos, manuais. Limite 20MB por arquivo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={tipoUpload} onValueChange={v => setTipoUpload(v as AtivoAnexoTipo)}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ATIVO_ANEXO_TIPO.map(t => <SelectItem key={t} value={t}>{ANEXO_TIPO_META[t].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Label htmlFor="anexo-file" className="cursor-pointer">
            <span className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white transition-colors',
              uploading && 'opacity-60 pointer-events-none',
            )}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Enviar arquivo
            </span>
          </Label>
          <input
            id="anexo-file"
            type="file"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void handleUpload(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {anexos.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm italic">
          <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-30" />
          Nenhum anexo. Envie NFs, fotos, contratos e manuais aqui.
        </div>
      ) : (
        <div className="space-y-1.5">
          {anexos.map((a: any) => {
            const meta = ANEXO_TIPO_META[a.tipo as AtivoAnexoTipo]
            return (
              <div key={a.id} className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
                <Paperclip className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                <span className={cn('inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-semibold border shrink-0', STATUS_CHIP_CLS[meta.cor])}>
                  {meta.label}
                </span>
                <span className="flex-1 min-w-0 text-[12px] truncate" title={a.fileName}>{a.fileName}</span>
                {a.fileSize ? <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{fmtBytes(a.fileSize)}</span> : null}
                <a
                  href={`${getApiUrl()}/api/upload/${a.storageKey}`}
                  target="_blank" rel="noopener noreferrer" download={a.fileName}
                  className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                  title="Baixar"
                >
                  <Download className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await alerts.confirm({ title: 'Remover anexo', text: a.fileName, confirmText: 'Remover' })
                    if (!ok) return
                    try {
                      await (trpc.ativo as any).deleteAnexo.mutate({ id: a.id })
                      await onChanged()
                    } catch (e) { alerts.error('Erro', (e as Error).message) }
                  }}
                  className="inline-flex items-center justify-center h-6 w-6 rounded text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 shrink-0"
                  title="Remover"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function KpiAtivo({ icon: Icon, label, value, hint }: {
  icon: typeof Database
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300 flex items-center justify-center">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">{label}</p>
          <p className="text-sm font-bold leading-none tabular-nums truncate">{value}</p>
        </div>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}
