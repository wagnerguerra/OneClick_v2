'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2, Plus, Trash2, Send, Download, Save, Check,
  Users, Package, Table2, ShoppingCart, Split, TrendingDown, AlertTriangle, X,
} from 'lucide-react'
import {
  Button, Input, Label, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle,
  RichEditor, Checkbox,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderBar } from '@/components/page-header-bar'
import { EntityCombobox } from '@/components/ui/entity-combobox'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'
import { masks } from '@/lib/masks'
import { STATUS_COTACAO_LABELS } from '@saas/types'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'
const brl = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const COTACAO_TABS = [
  { key: 'itens', label: 'Itens', icon: Package },
  { key: 'fornecedores', label: 'Fornecedores', icon: Users },
  { key: 'apuracao', label: 'Apuração', icon: Table2 },
] as const

const STATUS_COLORS: Record<string, string> = {
  RASCUNHO: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  ENVIADA: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  APURACAO: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  CONVERTIDA: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  CANCELADA: 'bg-muted text-muted-foreground',
}

interface Preco { cotacaoFornecedorId: string; valorUnitario: number | null; disponivel: boolean; observacoes: string | null }
interface Item {
  id: string; descricao: string; unidade: string | null; quantidade: number; ordem: number
  vencedorId: string | null; precos: Preco[]
}
interface Forn {
  id: string; fornecedorId: string; razaoSocial: string; documento: string; email: string | null; contato: string | null
  enviadoEm: string | null; respondidoEm: string | null; frete: number | null
  prazoEntrega: string | null; prazoPagamento: string | null; formaPagamento: string | null
  validadeProposta: string | null; observacoes: string | null
}
interface CenarioUnico {
  cotacaoFornecedorId: string; razaoSocial: string; itensAtendidos: number; itensNaoAtendidos: string[]
  completo: boolean; subtotal: number; frete: number; total: number
}
interface Cotacao {
  id: string; code: number; status: string; titulo: string | null; observacoes: string | null
  prazoResposta: string | null; solicitanteNome: string | null; createdAt: string
  itens: Item[]; fornecedores: Forn[]
  pedidosGerados: Array<{ id: string; code: number; status: string; fornecedor: string | null }>
  comparativo: {
    atual: {
      itensPremiados: number; itensTotal: number; qtdPedidos: number
      subtotal: number; frete: number; total: number
      porFornecedor: Array<{ cotacaoFornecedorId: string; razaoSocial: string; itens: number; subtotal: number; frete: number; total: number }>
    }
    unicos: CenarioUnico[]
    melhorUnico: CenarioUnico | null
    economiaDividindo: number | null
  }
}
interface FornOpc { id: string; razaoSocial: string; documento: string }

export default function CotacaoDetalhePage() {
  const params = useParams<{ id: string }>()
  const [c, setC] = useState<Cotacao | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('itens')
  const [acting, setActing] = useState(false)

  // cabeçalho editável
  const [titulo, setTitulo] = useState('')
  const [prazo, setPrazo] = useState('')
  const [obs, setObs] = useState('')
  const [dirty, setDirty] = useState(false)

  const [enviarOpen, setEnviarOpen] = useState(false)

  const carregar = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    ;(trpc.compra as any).getCotacao.query({ id: params.id }).then((d: Cotacao) => {
      setC(d)
      setTitulo(d.titulo ?? '')
      setPrazo(d.prazoResposta ? String(d.prazoResposta).slice(0, 10) : '')
      setObs(d.observacoes ?? '')
      setDirty(false)
    }).catch(() => setC(null)).finally(() => setLoading(false))
  }, [params.id])
  useEffect(() => { carregar() }, [carregar])

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!c) return <div className="py-12 text-center text-muted-foreground">Cotação não encontrada</div>

  const convertida = c.status === 'CONVERTIDA'

  async function salvarCabecalho() {
    setActing(true)
    try {
      await (trpc.compra as any).updateCotacao.mutate({ id: c!.id, titulo, prazoResposta: prazo, observacoes: obs })
      alerts.success('Salvo', 'Cotação atualizada.')
      carregar(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setActing(false) }
  }

  async function acao(fn: () => Promise<unknown>, msg?: string) {
    setActing(true)
    try {
      await fn()
      if (msg) alerts.success('Pronto', msg)
      carregar(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setActing(false) }
  }

  async function gerarPedidos() {
    const comp = c!.comparativo.atual
    const faltam = comp.itensTotal - comp.itensPremiados
    const ok = await alerts.confirm({
      title: `Gerar ${comp.qtdPedidos} pedido(s) de compra?`,
      text: faltam > 0
        ? `${faltam} item(ns) sem fornecedor premiado ficarão de fora. Total dos pedidos: ${brl(comp.total)}.`
        : `Total dos pedidos: ${brl(comp.total)}.`,
      icon: faltam > 0 ? 'warning' : 'question',
      confirmText: 'Gerar pedidos',
    })
    if (!ok) return
    setActing(true)
    try {
      const res = await (trpc.compra as any).gerarPedidosCotacao.mutate({ cotacaoId: c!.id })
      await alerts.success('Pedidos gerados', `${res.pedidos.length} pedido(s) criado(s) como rascunho. Revise e envie para aprovação.`)
      carregar(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setActing(false) }
  }

  return (
    <div className="space-y-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          {dirty && (
            <Button variant="success" size="sm" onClick={salvarCabecalho} disabled={acting}>
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
            </Button>
          )}
          {!convertida && c.fornecedores.length > 0 && c.itens.length > 0 && (
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white"
              disabled={acting} onClick={() => setEnviarOpen(true)}>
              <Send className="h-4 w-4" />Enviar aos fornecedores
            </Button>
          )}
          {!convertida && c.comparativo.atual.itensPremiados > 0 && (
            <Button variant="success" size="sm" disabled={acting} onClick={gerarPedidos}>
              <ShoppingCart className="h-4 w-4" />Gerar {c.comparativo.atual.qtdPedidos} pedido(s)
            </Button>
          )}
          <BackButton href="/aquisicoes/cotacoes" label="Voltar" />
      </>}>
        <h1 className="truncate">Cotação #{c.code}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Aquisições</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Cotações</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge className={cn('text-[11px]', STATUS_COLORS[c.status])}>{STATUS_COTACAO_LABELS[c.status] ?? c.status}</Badge>
          <span>
            {c.titulo || 'sem título'}
            {c.solicitanteNome ? ` · ${c.solicitanteNome}` : ''}
          </span>
        </div>
      </PageHeaderBar>

      {convertida && (
        <Card className="border-emerald-300 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/20">
          <div className="flex flex-wrap items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="text-emerald-800 dark:text-emerald-400">Cotação convertida. Pedidos gerados:</span>
            {c.pedidosGerados.map((p) => (
              <Link key={p.id} href={`/aquisicoes/${p.id}`}
                className="inline-flex items-center gap-1 rounded bg-card px-2 py-0.5 text-[12px] font-medium hover:bg-muted">
                <ShoppingCart className="h-3 w-3" />#{p.code} · {p.fornecedor ?? '—'}
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex min-h-[500px]">
          <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
            <div className="space-y-1">
              {COTACAO_TABS.map((t) => {
                const Icon = t.icon
                const conta = t.key === 'itens' ? c.itens.length : t.key === 'fornecedores' ? c.fornecedores.length : null
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                      activeTab === t.key ? 'text-white shadow-sm' : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
                    )}
                    style={activeTab === t.key ? { backgroundColor: MODULE_COLOR } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">{t.label}</span>
                    {conta != null && conta > 0 && <span className="text-[10px] tabular-nums opacity-70">{conta}</span>}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <div>
                <Label className="text-[11px]">Título</Label>
                <Input value={titulo} onChange={(e) => { setTitulo(e.target.value); setDirty(true) }}
                  disabled={convertida} placeholder="Ex.: Expediente" className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[11px]">Responder até</Label>
                <Input type="date" value={prazo} onChange={(e) => { setPrazo(e.target.value); setDirty(true) }}
                  disabled={convertida} className="mt-1 h-8 text-xs" />
              </div>
            </div>
          </div>

          <div key={activeTab} className="flex-1 min-w-0 p-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
            {activeTab === 'itens' && (
              <ItensTab cotacao={c} bloqueado={convertida} acting={acting} onChange={() => carregar(true)}
                obs={obs} setObs={(v) => { setObs(v); setDirty(true) }} acao={acao} />
            )}
            {activeTab === 'fornecedores' && (
              <FornecedoresTab cotacao={c} bloqueado={convertida} acting={acting} acao={acao} />
            )}
            {activeTab === 'apuracao' && (
              <ApuracaoTab cotacao={c} bloqueado={convertida} acao={acao} onChange={() => carregar(true)} />
            )}
          </div>
        </div>
      </Card>

      {enviarOpen && (
        <EnviarModal cotacao={c} onClose={() => setEnviarOpen(false)} onDone={() => { setEnviarOpen(false); carregar(true) }} />
      )}
    </div>
  )
}

// ── Itens ──────────────────────────────────────────────────────
function ItensTab({ cotacao, bloqueado, acting, onChange, obs, setObs, acao }: {
  cotacao: Cotacao; bloqueado: boolean; acting: boolean; onChange: () => void
  obs: string; setObs: (v: string) => void
  acao: (fn: () => Promise<unknown>, msg?: string) => Promise<void>
}) {
  const [novo, setNovo] = useState({ descricao: '', unidade: '', quantidade: 1 })
  const [dividir, setDividir] = useState<Item | null>(null)

  async function adicionar() {
    if (novo.descricao.trim().length < 2) return
    await acao(() => (trpc.compra as any).addCotacaoItem.mutate({
      cotacaoId: cotacao.id, descricao: novo.descricao.trim(), unidade: novo.unidade || undefined, quantidade: novo.quantidade,
    }))
    setNovo({ descricao: '', unidade: '', quantidade: 1 })
  }

  return (
    <>
      <div className="-mx-5 px-5 pb-2.5 mb-4 border-b border-border">
        <h4 className="text-[13px] font-semibold text-foreground">Lista de itens</h4>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        A lista é a mesma para todos os fornecedores — sem preço e sem fornecedor. Eles entram na aba
        <strong className="text-foreground"> Apuração</strong>, quando as propostas voltarem.
      </p>

      {!bloqueado && (
        <div className="mb-4 grid grid-cols-12 items-end gap-2">
          <div className="col-span-12 md:col-span-6">
            <Label className="text-[11px]">Descrição</Label>
            <Input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
              placeholder="Ex.: Papel A4 75g — resma 500 folhas" className="mt-1 h-9" />
          </div>
          <div className="col-span-4 md:col-span-2">
            <Label className="text-[11px]">Unidade</Label>
            <Input value={novo.unidade} onChange={(e) => setNovo({ ...novo, unidade: e.target.value })}
              placeholder="resma" className="mt-1 h-9" />
          </div>
          <div className="col-span-4 md:col-span-2">
            <Label className="text-[11px]">Qtd.</Label>
            <Input type="number" min={1} value={novo.quantidade}
              onChange={(e) => setNovo({ ...novo, quantidade: Number(e.target.value) || 1 })} className="mt-1 h-9" />
          </div>
          <div className="col-span-4 md:col-span-2">
            <Button type="button" variant="success" size="sm" className="w-full" disabled={acting || novo.descricao.trim().length < 2} onClick={adicionar}>
              <Plus className="h-4 w-4" />Adicionar
            </Button>
          </div>
        </div>
      )}

      {cotacao.itens.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum item na lista ainda.</p>
      ) : (
        <div className="divide-y divide-border/60 rounded-lg border border-border">
          {cotacao.itens.map((i, idx) => (
            <div key={i.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
              <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">{idx + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{i.descricao}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {i.quantidade}{i.unidade ? ` ${i.unidade}` : ''}
                </p>
              </div>
              {!bloqueado && (
                <>
                  {i.quantidade > 1 && (
                    <Button type="button" variant="outline" size="icon-sm" title="Repartir a quantidade entre fornecedores"
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => setDividir(i)}>
                      <Split className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button type="button" variant="soft-destructive" size="icon-sm" className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={() => acao(() => (trpc.compra as any).removeCotacaoItem.mutate({ id: i.id }))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5">
        <Label className="text-[11px]">Observações (vão no pedido de cotação enviado)</Label>
        <div className="mt-1.5">
          {bloqueado
            ? <p className="text-sm text-muted-foreground">{obs || 'Sem observações.'}</p>
            : <RichEditor value={obs} onChange={setObs} placeholder="Ex.: entrega no escritório, aos cuidados do setor administrativo..." />}
        </div>
      </div>

      {dividir && (
        <DividirModal item={dividir} onClose={() => setDividir(null)}
          onDone={() => { setDividir(null); onChange() }} />
      )}
    </>
  )
}

function DividirModal({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: () => void }) {
  const [qtd, setQtd] = useState(Math.floor(item.quantidade / 2))
  const [saving, setSaving] = useState(false)
  const invalido = qtd < 1 || qtd >= item.quantidade

  async function dividir() {
    setSaving(true)
    try {
      await (trpc.compra as any).dividirCotacaoItem.mutate({ id: item.id, quantidadeNova: qtd })
      onDone()
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeaderIcon icon={Split} color="violet"><DialogTitle>Repartir “{item.descricao}”</DialogTitle></DialogHeaderIcon>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A premiação é por item, então repartir a quantidade entre dois fornecedores se faz
            quebrando a linha em duas. Os preços já lançados são copiados para a nova linha.
          </p>
          <div>
            <Label>Separar quantas unidades numa nova linha?</Label>
            <Input type="number" min={1} max={item.quantidade - 1} value={qtd}
              onChange={(e) => setQtd(Number(e.target.value) || 0)} className="mt-1.5 h-9" />
            <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
              Fica: <strong className="text-foreground">{item.quantidade - qtd}</strong> na linha atual
              {' + '}<strong className="text-foreground">{qtd}</strong> na nova
              {invalido && <span className="text-destructive"> — informe entre 1 e {item.quantidade - 1}</span>}
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="success" size="sm" disabled={saving || invalido} onClick={dividir}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Split className="h-4 w-4" />}Repartir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Fornecedores convidados ────────────────────────────────────
function FornecedoresTab({ cotacao, bloqueado, acting, acao }: {
  cotacao: Cotacao; bloqueado: boolean; acting: boolean
  acao: (fn: () => Promise<unknown>, msg?: string) => Promise<void>
}) {
  const [opcoes, setOpcoes] = useState<FornOpc[]>([])
  const [escolhido, setEscolhido] = useState('')

  useEffect(() => {
    ;(trpc.compra as any).fornecedoresSelect.query()
      .then((d: FornOpc[]) => setOpcoes(d || [])).catch(() => setOpcoes([]))
  }, [])

  const jaNaCotacao = new Set(cotacao.fornecedores.map((f) => f.fornecedorId))
  const disponiveis = useMemo(
    () => opcoes.filter((o) => !jaNaCotacao.has(o.id))
      .map((o) => ({ id: o.id, label: o.razaoSocial, sublabel: o.documento ? masks.cpfCnpj(o.documento) : null })),
    [opcoes, cotacao.fornecedores],
  )

  async function convidar() {
    if (!escolhido) return
    await acao(() => (trpc.compra as any).addCotacaoFornecedor.mutate({ cotacaoId: cotacao.id, fornecedorId: escolhido }))
    setEscolhido('')
  }

  return (
    <>
      <div className="-mx-5 px-5 pb-2.5 mb-4 border-b border-border">
        <h4 className="text-[13px] font-semibold text-foreground">Fornecedores convidados</h4>
      </div>

      {!bloqueado && (
        <div className="mb-4 flex items-end gap-2">
          <div className="flex-1 max-w-md">
            <Label className="text-[11px]">Convidar fornecedor</Label>
            <div className="mt-1">
              <EntityCombobox items={disponiveis} value={escolhido} onSelect={setEscolhido}
                placeholder="Selecione o fornecedor" searchPlaceholder="Buscar por nome ou CNPJ/CPF..."
                emptyText="Nenhum fornecedor disponível" />
            </div>
          </div>
          <Button type="button" variant="success" size="sm" disabled={acting || !escolhido} onClick={convidar}>
            <Plus className="h-4 w-4" />Convidar
          </Button>
        </div>
      )}

      {cotacao.fornecedores.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum fornecedor convidado. Convide ao menos dois para valer a comparação.
        </p>
      ) : (
        <div className="space-y-3">
          {cotacao.fornecedores.map((f) => (
            <FornecedorCard key={f.id} f={f} bloqueado={bloqueado} cotacaoId={cotacao.id} acao={acao} />
          ))}
        </div>
      )}
    </>
  )
}

function FornecedorCard({ f, bloqueado, cotacaoId, acao }: {
  f: Forn; bloqueado: boolean; cotacaoId: string
  acao: (fn: () => Promise<unknown>, msg?: string) => Promise<void>
}) {
  const [frete, setFrete] = useState(f.frete != null ? String(f.frete).replace('.', ',') : '')
  const [pEnt, setPEnt] = useState(f.prazoEntrega ?? '')
  const [pPag, setPPag] = useState(f.prazoPagamento ?? '')
  const [forma, setForma] = useState(f.formaPagamento ?? '')
  const [validade, setValidade] = useState(f.validadeProposta ?? '')
  const [dirty, setDirty] = useState(false)

  async function salvar(extra?: { respondido?: boolean }) {
    await acao(() => (trpc.compra as any).updateCotacaoFornecedor.mutate({
      id: f.id,
      frete: frete ? Number(frete.replace(/\./g, '').replace(',', '.')) : null,
      prazoEntrega: pEnt, prazoPagamento: pPag, formaPagamento: forma, validadeProposta: validade,
      ...(extra ?? {}),
    }))
    setDirty(false)
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{f.razaoSocial}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {masks.cpfCnpj(f.documento)}
            {f.email ? ` · ${f.email}` : ' · sem e-mail cadastrado'}
          </p>
        </div>
        {f.enviadoEm && <Badge variant="secondary" className="text-[10px]">enviado {new Date(f.enviadoEm).toLocaleDateString('pt-BR')}</Badge>}
        {f.respondidoEm
          ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px] dark:bg-emerald-950/40 dark:text-emerald-400">respondeu</Badge>
          : <Badge variant="outline" className="text-[10px]">sem resposta</Badge>}
        {!bloqueado && (
          <Button variant="soft-destructive" size="icon-sm" title="Remover da cotação"
            onClick={() => acao(() => (trpc.compra as any).removeCotacaoFornecedor.mutate({ id: f.id }))}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6 md:col-span-2">
          <Label className="text-[11px]">Frete (R$)</Label>
          <Input value={frete} onChange={(e) => { setFrete(e.target.value); setDirty(true) }} disabled={bloqueado}
            placeholder="0,00" className="mt-1 h-8 text-xs" />
        </div>
        <div className="col-span-6 md:col-span-2">
          <Label className="text-[11px]">Prazo entrega</Label>
          <Input value={pEnt} onChange={(e) => { setPEnt(e.target.value); setDirty(true) }} disabled={bloqueado}
            placeholder="5 dias" className="mt-1 h-8 text-xs" />
        </div>
        <div className="col-span-6 md:col-span-3">
          <Label className="text-[11px]">Prazo pagamento</Label>
          <Input value={pPag} onChange={(e) => { setPPag(e.target.value); setDirty(true) }} disabled={bloqueado}
            placeholder="30 dias" className="mt-1 h-8 text-xs" />
        </div>
        <div className="col-span-6 md:col-span-3">
          <Label className="text-[11px]">Forma pagamento</Label>
          <Input value={forma} onChange={(e) => { setForma(e.target.value); setDirty(true) }} disabled={bloqueado}
            placeholder="Boleto / PIX" className="mt-1 h-8 text-xs" />
        </div>
        <div className="col-span-6 md:col-span-2">
          <Label className="text-[11px]">Validade</Label>
          <Input value={validade} onChange={(e) => { setValidade(e.target.value); setDirty(true) }} disabled={bloqueado}
            placeholder="15 dias" className="mt-1 h-8 text-xs" />
        </div>
      </div>

      {!bloqueado && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {dirty && (
            <Button variant="success" size="xs" onClick={() => salvar()}><Save className="h-3.5 w-3.5" />Salvar condições</Button>
          )}
          <Button variant="outline" size="xs" asChild>
            <a href={`${getApiUrl()}/api/cotacao/${cotacaoId}/pdf?fornecedor=${f.id}`} target="_blank" rel="noopener noreferrer">
              <Download className="h-3.5 w-3.5" />PDF deste fornecedor
            </a>
          </Button>
          <Button variant={f.respondidoEm ? 'outline' : 'soft'} size="xs"
            onClick={() => salvar({ respondido: !f.respondidoEm })}>
            {f.respondidoEm ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {f.respondidoEm ? 'Desmarcar resposta' : 'Marcar como respondida'}
          </Button>
        </div>
      )}
    </Card>
  )
}

// ── Apuração: a matriz + o comparativo ─────────────────────────
function ApuracaoTab({ cotacao, bloqueado, acao, onChange }: {
  cotacao: Cotacao; bloqueado: boolean
  acao: (fn: () => Promise<unknown>, msg?: string) => Promise<void>
  onChange: () => void
}) {
  const { itens, fornecedores, comparativo } = cotacao

  if (!itens.length || !fornecedores.length) {
    return (
      <>
        <div className="-mx-5 px-5 pb-2.5 mb-4 border-b border-border">
          <h4 className="text-[13px] font-semibold text-foreground">Apuração</h4>
        </div>
        <p className="py-8 text-center text-sm text-muted-foreground">
          A matriz aparece quando houver ao menos um item e um fornecedor convidado.
        </p>
      </>
    )
  }

  const precoDe = (item: Item, fornId: string) => item.precos.find((p) => p.cotacaoFornecedorId === fornId)
  const menorDoItem = (item: Item) => {
    const validos = item.precos.filter((p) => p.disponivel && p.valorUnitario != null)
    return validos.length ? Math.min(...validos.map((p) => p.valorUnitario as number)) : null
  }

  return (
    <>
      <div className="-mx-5 px-5 pb-2.5 mb-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-foreground">Apuração — quem ganha cada item</h4>
        {!bloqueado && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="xs"
              onClick={() => acao(
                () => (trpc.compra as any).premiarCotacaoLote.mutate({ cotacaoId: cotacao.id, modo: 'MENOR_PRECO' }),
                'Premiado no menor preço de cada item.',
              )}>
              <TrendingDown className="h-3.5 w-3.5" />Premiar menor preço
            </Button>
          </div>
        )}
      </div>

      <ComparativoPainel cotacao={cotacao} bloqueado={bloqueado} acao={acao} />

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40">
              <th className="sticky left-0 z-10 min-w-[220px] border border-border bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">
                Item
              </th>
              <th className="w-[70px] border border-border px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider">Qtd.</th>
              {fornecedores.map((f) => (
                <th key={f.id} className="min-w-[150px] border border-border px-2 py-2 text-left text-xs font-semibold">
                  <span className="block truncate" title={f.razaoSocial}>{f.razaoSocial}</span>
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    {f.respondidoEm ? 'respondeu' : 'aguardando'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const menor = menorDoItem(i)
              return (
                <tr key={i.id} className="hover:bg-muted/20">
                  <td className="sticky left-0 z-10 border border-border bg-card px-3 py-2">
                    <span className="block truncate" title={i.descricao}>{i.descricao}</span>
                    {i.unidade && <span className="text-[11px] text-muted-foreground">{i.unidade}</span>}
                  </td>
                  <td className="border border-border px-2 py-2 text-right tabular-nums">{i.quantidade}</td>
                  {fornecedores.map((f) => {
                    const p = precoDe(i, f.id)
                    const venceu = i.vencedorId === f.id
                    const ehMenor = p?.disponivel && p.valorUnitario != null && menor != null && p.valorUnitario === menor
                    return (
                      <td key={f.id}
                        className={cn(
                          'border border-border px-2 py-1.5 align-middle',
                          venceu && 'bg-emerald-50 dark:bg-emerald-950/30',
                        )}>
                        <CelulaPreco
                          item={i} forn={f} preco={p} venceu={!!venceu} ehMenor={!!ehMenor}
                          bloqueado={bloqueado} onChange={onChange}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/20">
              <td className="sticky left-0 z-10 border border-border bg-muted/20 px-3 py-2 text-right text-xs font-semibold">
                Se tudo neste fornecedor
              </td>
              <td className="border border-border" />
              {fornecedores.map((f) => {
                const u = comparativo.unicos.find((x) => x.cotacaoFornecedorId === f.id)
                return (
                  <td key={f.id} className="border border-border px-2 py-2">
                    {u ? (
                      <>
                        <span className="block text-sm font-semibold tabular-nums">{brl(u.total)}</span>
                        <span className="block text-[10px] text-muted-foreground tabular-nums">
                          itens {brl(u.subtotal)} + frete {brl(u.frete)}
                        </span>
                        {!u.completo && (
                          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-500">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            não atende {u.itensNaoAtendidos.length}
                          </span>
                        )}
                      </>
                    ) : '—'}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Clique no preço para lançar o valor. O selo <strong className="text-foreground">✓</strong> premia o item naquele
        fornecedor — pode ser um fornecedor diferente por linha, e cada um vira um pedido separado.
      </p>
    </>
  )
}

function CelulaPreco({ item, forn, preco, venceu, ehMenor, bloqueado, onChange }: {
  item: Item; forn: Forn; preco: Preco | undefined; venceu: boolean; ehMenor: boolean
  bloqueado: boolean; onChange: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(preco?.valorUnitario != null ? String(preco.valorUnitario).replace('.', ',') : '')
  const [salvando, setSalvando] = useState(false)

  const indisponivel = preco && !preco.disponivel

  async function salvar() {
    setSalvando(true)
    try {
      const num = valor.trim() ? Number(valor.replace(/\./g, '').replace(',', '.')) : null
      await (trpc.compra as any).setCotacaoPreco.mutate({
        cotacaoItemId: item.id, cotacaoFornecedorId: forn.id,
        valorUnitario: num, disponivel: true,
      })
      setEditando(false)
      onChange()
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setSalvando(false) }
  }

  async function marcarIndisponivel() {
    setSalvando(true)
    try {
      await (trpc.compra as any).setCotacaoPreco.mutate({
        cotacaoItemId: item.id, cotacaoFornecedorId: forn.id, disponivel: !!indisponivel,
      })
      onChange()
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setSalvando(false) }
  }

  async function premiar() {
    try {
      await (trpc.compra as any).premiarCotacaoItem.mutate({
        cotacaoItemId: item.id, cotacaoFornecedorId: venceu ? null : forn.id,
      })
      onChange()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  if (editando && !bloqueado) {
    return (
      <div className="flex items-center gap-1">
        <Input value={valor} onChange={(e) => setValor(e.target.value)} autoFocus placeholder="0,00"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); salvar() } if (e.key === 'Escape') setEditando(false) }}
          className="h-7 text-xs" />
        <Button size="icon-xs" variant="success" disabled={salvando} onClick={salvar}>
          {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={bloqueado}
        onClick={() => !bloqueado && setEditando(true)}
        className={cn(
          'min-w-0 flex-1 rounded px-1 py-0.5 text-left text-sm tabular-nums',
          !bloqueado && 'hover:bg-muted',
          indisponivel && 'text-muted-foreground line-through',
          ehMenor && !indisponivel && 'font-semibold text-emerald-700 dark:text-emerald-400',
        )}
        title={indisponivel ? 'Fornecedor não atende este item' : 'Lançar o preço unitário'}
      >
        {indisponivel ? 'não atende'
          : preco?.valorUnitario != null ? brl(preco.valorUnitario)
          : <span className="text-muted-foreground">—</span>}
      </button>

      {!bloqueado && (
        <>
          <button
            type="button"
            onClick={premiar}
            disabled={indisponivel || preco?.valorUnitario == null}
            title={venceu ? 'Remover a premiação' : 'Premiar este fornecedor no item'}
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] transition-colors disabled:opacity-30',
              venceu ? 'border-transparent bg-emerald-500 text-white' : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={marcarIndisponivel}
            title={indisponivel ? 'Voltar a atender' : 'Marcar como não atendido'}
            className="shrink-0 text-muted-foreground/60 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  )
}

/** O painel que evita a armadilha do frete: dividir × concentrar, lado a lado. */
function ComparativoPainel({ cotacao, bloqueado, acao }: {
  cotacao: Cotacao; bloqueado: boolean
  acao: (fn: () => Promise<unknown>, msg?: string) => Promise<void>
}) {
  const { atual, melhorUnico, economiaDividindo } = cotacao.comparativo
  const completo = atual.itensPremiados === atual.itensTotal && atual.itensTotal > 0

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Split className="h-4 w-4 shrink-0" style={{ color: MODULE_COLOR }} />
          <h5 className="text-[13px] font-semibold">Premiação atual</h5>
          <Badge variant="secondary" className="ml-auto text-[10px] tabular-nums">
            {atual.itensPremiados}/{atual.itensTotal} itens
          </Badge>
        </div>
        <p className="text-2xl font-bold tabular-nums" style={{ color: MODULE_COLOR }}>{brl(atual.total)}</p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          itens {brl(atual.subtotal)} + frete {brl(atual.frete)}
          {atual.qtdPedidos > 0 && ` · ${atual.qtdPedidos} pedido(s)`}
        </p>
        {atual.porFornecedor.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-border pt-2">
            {atual.porFornecedor.map((f) => (
              <div key={f.cotacaoFornecedorId} className="flex items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate">{f.razaoSocial}</span>
                <span className="text-muted-foreground tabular-nums">{f.itens} it.</span>
                <span className="font-medium tabular-nums">{brl(f.total)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h5 className="text-[13px] font-semibold">Melhor fornecedor único</h5>
        </div>
        {melhorUnico ? (
          <>
            <p className="text-2xl font-bold tabular-nums">{brl(melhorUnico.total)}</p>
            <p className="text-[11px] text-muted-foreground">
              {melhorUnico.razaoSocial} · 1 pedido, 1 frete
            </p>
            {completo && economiaDividindo != null && (
              <p className={cn(
                'mt-3 rounded border px-2 py-1.5 text-xs',
                economiaDividindo > 0
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400'
                  : economiaDividindo < 0
                    ? 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400'
                    : 'border-border bg-muted/40 text-muted-foreground',
              )}>
                {economiaDividindo > 0
                  ? <>Dividir economiza <strong className="tabular-nums">{brl(economiaDividindo)}</strong> — vale {atual.qtdPedidos} pedidos e {atual.qtdPedidos} entregas?</>
                  : economiaDividindo < 0
                    ? <>Concentrar em {melhorUnico.razaoSocial} sai <strong className="tabular-nums">{brl(Math.abs(economiaDividindo))}</strong> mais barato — o frete come a economia.</>
                    : 'Os dois cenários empatam.'}
              </p>
            )}
            {!bloqueado && (
              <Button variant="outline" size="xs" className="mt-3"
                onClick={() => acao(
                  () => (trpc.compra as any).premiarCotacaoLote.mutate({
                    cotacaoId: cotacao.id, modo: 'FORNECEDOR_UNICO', cotacaoFornecedorId: melhorUnico.cotacaoFornecedorId,
                  }),
                  `Tudo premiado em ${melhorUnico.razaoSocial}.`,
                )}>
                <Check className="h-3.5 w-3.5" />Concentrar tudo neste
              </Button>
            )}
          </>
        ) : (
          <p className="py-2 text-xs text-muted-foreground">
            Nenhum fornecedor cotou a lista inteira ainda — sem base para comparar com o cenário dividido.
          </p>
        )}
      </Card>
    </div>
  )
}

// ── Envio aos fornecedores ─────────────────────────────────────
function EnviarModal({ cotacao, onClose, onDone }: { cotacao: Cotacao; onClose: () => void; onDone: () => void }) {
  const comEmail = cotacao.fornecedores.filter((f) => f.email)
  const semEmail = cotacao.fornecedores.filter((f) => !f.email)
  const [sel, setSel] = useState<string[]>(comEmail.filter((f) => !f.enviadoEm).map((f) => f.id))
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    setEnviando(true)
    try {
      const res = await (trpc.compra as any).enviarCotacao.mutate({ cotacaoId: cotacao.id, cotacaoFornecedorIds: sel })
      await alerts.success(
        'Enviado',
        `${res.enviados} e-mail(s) enviado(s) com o PDF em anexo.`
        + (res.semEmail?.length ? ` Sem e-mail cadastrado: ${res.semEmail.join(', ')}.` : ''),
      )
      onDone()
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setEnviando(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeaderIcon icon={Send} color="sky"><DialogTitle>Enviar a cotação #{cotacao.code}</DialogTitle></DialogHeaderIcon>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cada fornecedor recebe um e-mail com o <strong className="text-foreground">PDF do pedido de cotação</strong>,
            com a lista de itens e as colunas de preço em branco para preencher.
          </p>

          {comEmail.length === 0 ? (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
              Nenhum fornecedor convidado tem e-mail cadastrado. Cadastre o e-mail no fornecedor ou baixe o PDF e envie por fora.
            </p>
          ) : (
            <div className="divide-y divide-border/60 rounded-lg border border-border">
              {comEmail.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/30">
                  <Checkbox checked={sel.includes(f.id)}
                    onCheckedChange={(v) => setSel((prev) => v ? [...prev, f.id] : prev.filter((x) => x !== f.id))} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{f.razaoSocial}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{f.email}</p>
                  </div>
                  {f.enviadoEm && <Badge variant="secondary" className="text-[10px]">já enviado</Badge>}
                </label>
              ))}
            </div>
          )}

          {semEmail.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Sem e-mail cadastrado (não recebem): {semEmail.map((f) => f.razaoSocial).join(', ')}.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white"
            disabled={enviando || sel.length === 0} onClick={enviar}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar {sel.length > 0 ? `(${sel.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
