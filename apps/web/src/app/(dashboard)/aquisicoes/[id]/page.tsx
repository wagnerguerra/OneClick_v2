'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  Save, Plus, Trash2, Loader2, Send, Check, Ban, PackageCheck, ClipboardCheck,
  FileText, Package, MessageSquare, Printer, ShoppingCart, User as UserIcon, Calendar, Truck,
  MoreVertical, Undo2, Receipt, StickyNote, History, AlertTriangle,
} from 'lucide-react'
import {
  Button, Input, Label, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle,
  RichEditor, RichContent,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { SectionCard } from '@/components/section-card'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { STATUS_COMPRA_LABELS } from '@saas/types'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { AnexosCard } from '../_components/compra-tabs'
import { MensagensTab } from '../_components/compra-mensagens'
import { AvaliarModal } from '../_components/avaliar-modal'
import { ReceberModal } from '../_components/receber-modal'
import { BADGE, TEXT } from '@/lib/color-styles'

/**
 * Detalhe do pedido de compra — no padrão de detalhe do sistema
 * (docs/PADRAO_PAGINAS.md §3, referências /orcamentos/[id] e /clientes/[id]):
 * barra da página → hero com os números do pedido → abas → SectionCards com a
 * coluna lateral (resumo + anexos). Refeito em 25/09/2026, junto com o
 * recebimento POR ITEM: cada item pode chegar em partes, em datas diferentes.
 */

const PRIMARY = 'var(--color-primary)'
const brl = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null)

type Aba = 'detalhes' | 'itens' | 'mensagens'

/** Situação do item no recebimento (vem do backend). */
const SITUACAO_ITEM: Record<string, { rotulo: string; cls: string }> = {
  PENDENTE: { rotulo: 'Pendente', cls: BADGE.slate },
  PARCIAL: { rotulo: 'Parcial', cls: BADGE.violet },
  RECEBIDO: { rotulo: 'Recebido', cls: BADGE.emerald },
}

interface Item {
  id: string; descricao: string; unidade: string | null; quantidade: number; valorUnitario: number
  quantidadeRecebida: number; situacaoRecebimento: 'PENDENTE' | 'PARCIAL' | 'RECEBIDO'
}
interface Recebimento {
  id: string; itemId: string; item: string; unidade: string | null; quantidade: number
  dataRecebimento: string; nfNumero: string | null; observacao: string | null
  recebedor: { name: string } | null
}
interface Compra {
  id: string; code: number; status: string; frete: number | null; total: number; createdAt: string
  formaPagamento: string | null; prazoEntrega: string | null; prazoPagamento: string | null; observacoes: string | null
  fornecedor: { id: string; razaoSocial: string; documento?: string | null } | null
  solicitante: { name: string } | null; aprovador: { name: string } | null; recebedor: { name: string } | null
  dataSolicitacao: string | null; dataAprovacao: string | null; dataRecebimento: string | null; dataAvaliacao: string | null
  motivoReprovacao: string | null; nfNumero: string | null; nfValor: number | null; tipoFornecimento: string | null
  melhoria: boolean; melhoriaObs: string | null
  itens: Item[]
  recebimentos: Recebimento[]
  recebimentoLegado: boolean
  _count?: { mensagens: number; anexos: number }
}

export default function PedidoDetalhePage() {
  const params = useParams<{ id: string }>()
  const { profile } = useCurrentUserProfile()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  // Aprovar/reprovar é da alçada de quem tem a marca de aprovador (Configurações
  // do módulo, ou a sub-permissão no cadastro do usuário — é a mesma coisa).
  const subsAquisicoes = (permissions.find((p) => p.moduleSlug === 'aquisicoes')?.subPermissions ?? {}) as Record<string, boolean>
  const podeAprovar = isMaster || isEmpresaMaster || subsAquisicoes.aprovar_pedidos === true
  const [c, setC] = useState<Compra | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState(false)
  const [reprovarOpen, setReprovarOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [avaliarOpen, setAvaliarOpen] = useState(false)
  // Recebimento com DANFE cria anexo: a versão força o card de anexos a recarregar.
  const [anexosVersao, setAnexosVersao] = useState(0)
  const [receberOpen, setReceberOpen] = useState(false)
  const [receberItem, setReceberItem] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('detalhes')

  // campos editáveis
  const [forma, setForma] = useState(''); const [pEnt, setPEnt] = useState(''); const [pPag, setPPag] = useState('')
  const [frete, setFrete] = useState(''); const [obs, setObs] = useState('')

  const carregar = useCallback((silencioso = false) => {
    if (!silencioso) setLoading(true)
    ;(trpc.compra as any).getById.query({ id: params.id }).then((d: Compra) => {
      setC(d)
      setForma(d.formaPagamento ?? ''); setPEnt(d.prazoEntrega ?? ''); setPPag(d.prazoPagamento ?? '')
      setFrete(d.frete != null ? String(d.frete).replace('.', ',') : ''); setObs(d.observacoes ?? '')
    }).catch(() => setC(null)).finally(() => setLoading(false))
  }, [params.id])
  useEffect(() => { carregar() }, [carregar])

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!c) return <div className="py-12 text-center text-muted-foreground">Pedido não encontrado</div>

  const editavel = c.status === 'NOVO' || c.status === 'REPROVADO'
  const recebendo = c.status === 'APROVADO' || c.status === 'RECEBIDO_PARCIAL'
  const podeEstornar = c.status === 'RECEBIDO_PARCIAL' || c.status === 'RECEBIDO'
  const freteNum = Number(frete.replace(/\./g, '').replace(',', '.')) || 0
  const subtotal = c.itens.reduce((t, i) => t + i.quantidade * (i.valorUnitario ?? 0), 0)
  const itensCompletos = c.itens.filter(i => i.situacaoRecebimento === 'RECEBIDO').length
  const qtdPedida = c.itens.reduce((t, i) => t + i.quantidade, 0)
  const qtdRecebida = c.itens.reduce((t, i) => t + Math.min(i.quantidadeRecebida, i.quantidade), 0)
  const pctRecebido = qtdPedida > 0 ? Math.round((qtdRecebida / qtdPedida) * 100) : 0

  async function salvar() {
    setSaving(true)
    try {
      await (trpc.compra as any).update.mutate({ id: c!.id, data: { formaPagamento: forma, prazoEntrega: pEnt, prazoPagamento: pPag, frete: freteNum, observacoes: obs } })
      alerts.success('Salvo', 'Alterações gravadas.'); carregar(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setSaving(false) }
  }

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setActing(true)
    try { await fn(); alerts.success('Pronto', msg); carregar(true) }
    catch (e) { alerts.error('Erro', (e as Error).message) } finally { setActing(false) }
  }

  async function addItem() {
    await acao(() => (trpc.compra as any).addItem.mutate({ compraId: c!.id, descricao: 'Novo item', quantidade: 1, valorUnitario: 0 }), 'Item adicionado.')
  }
  async function saveItem(it: Item) {
    await (trpc.compra as any).updateItem.mutate({ id: it.id, descricao: it.descricao, unidade: it.unidade || undefined, quantidade: it.quantidade, valorUnitario: it.valorUnitario })
  }
  function patchItem(id: string, patch: Partial<Item>) { setC((prev) => prev ? { ...prev, itens: prev.itens.map((i) => i.id === id ? { ...i, ...patch } : i) } : prev) }
  async function removeItem(id: string) {
    const ok = await alerts.confirm({ title: 'Remover item?', text: 'O item sai do pedido.', confirmText: 'Remover', icon: 'warning' })
    if (ok) await acao(() => (trpc.compra as any).removeItem.mutate({ id }), 'Item removido.')
  }
  function abrirRecebimento(itemId: string | null) { setReceberItem(itemId); setReceberOpen(true) }
  async function estornar(r: Recebimento) {
    const ok = await alerts.confirm({
      title: 'Estornar recebimento?',
      text: `${r.quantidade} × "${r.item}" (${dataBr(r.dataRecebimento)}) volta a ficar pendente.`,
      confirmText: 'Estornar', icon: 'warning',
    })
    if (ok) await acao(() => (trpc.compra as any).estornarRecebimento.mutate({ id: r.id }), 'Recebimento estornado.')
  }

  const abaBtn = (v: Aba, Icon: typeof FileText, rotulo: string, contador?: number) => (
    <button type="button" onClick={() => setAba(v)}
      className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
        aba === v ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
      <Icon className="h-4 w-4 shrink-0" />{rotulo}
      {!!contador && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{contador}</Badge>}
    </button>
  )

  return (
    <div>
      {/* Topo — PADRAO_PAGINAS §3.1 */}
      <PageHeaderBar className="mb-0 sm:mb-0" actions={<>
          {editavel && aba === 'detalhes' && <Button variant="success" size="sm" onClick={salvar} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar</Button>}
          {editavel && <Button size="sm" disabled={acting} onClick={() => acao(() => (trpc.compra as any).enviar.mutate({ id: c.id }), 'Enviado para aprovação.')}><Send className="h-4 w-4" />Enviar p/ aprovação</Button>}
          {c.status === 'AGUARDANDO_APROVACAO' && podeAprovar && <>
            <Button variant="success" size="sm" disabled={acting} onClick={() => acao(() => (trpc.compra as any).aprovar.mutate({ id: c.id }), 'Pedido aprovado.')}><Check className="h-4 w-4" />Aprovar</Button>
            <Button variant="destructive" size="sm" disabled={acting} onClick={() => { setMotivo(''); setReprovarOpen(true) }}><Ban className="h-4 w-4" />Reprovar</Button>
          </>}
          {recebendo && <Button size="sm" disabled={acting} onClick={() => abrirRecebimento(null)}><PackageCheck className="h-4 w-4" />Registrar recebimento</Button>}
          {(c.status === 'RECEBIDO' || c.status === 'AVALIADO') && <Button variant="success" size="sm" onClick={() => setAvaliarOpen(true)}><ClipboardCheck className="h-4 w-4" />{c.status === 'AVALIADO' ? 'Rever avaliação' : 'Avaliar'}</Button>}
          {/* Link de navegação, e não fetch+blob: o Content-Disposition da rota
              entrega o arquivo sem esbarrar no bloqueio de download por JS. */}
          <Button variant="outline" size="sm" asChild>
            <a href={`${getApiUrl()}/api/compra/${c.id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Printer className="h-4 w-4" />Imprimir
            </a>
          </Button>
          <BackButton href="/aquisicoes" label="Voltar" />
      </>}>
        <h1 className="truncate">Pedido #{c.code}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <Link href="/aquisicoes" className="transition-colors hover:text-foreground">Aquisições</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Pedido #{c.code}</span>
        </p>
      </PageHeaderBar>

      {/* ═══ Hero — PADRAO_PAGINAS §3.2 ═══ */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, var(--color-primary) 100%)` }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/25" />

          <div className="relative z-10 px-5 pb-5 pt-24 text-white sm:px-6 sm:pt-28">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4 min-w-0">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-card shadow-lg ring-4 ring-white/50">
                  <ShoppingCart className="h-10 w-10 text-primary-on-surface" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xl font-bold tracking-tight text-white drop-shadow">{c.fornecedor?.razaoSocial ?? 'Fornecedor não informado'}</p>
                    <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-white ring-1 ring-white/25 backdrop-blur">
                      {STATUS_COMPRA_LABELS[c.status] ?? c.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/85">
                    <span className="inline-flex items-center gap-1"><UserIcon className="h-3.5 w-3.5" />{c.solicitante?.name ?? 'Sem solicitante'}</span>
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Criado em {dataBr(c.createdAt)}</span>
                    {c.prazoEntrega && <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" />Entrega: {c.prazoEntrega}</span>}
                  </div>
                </div>
              </div>

              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-lg font-bold tracking-tight text-white drop-shadow tabular-nums">{brl(c.total)}</p>
                  <p className="text-xs text-white/75">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold tracking-tight text-white drop-shadow tabular-nums">{c.itens.length}</p>
                  <p className="text-xs text-white/75">{c.itens.length === 1 ? 'Item' : 'Itens'}</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold tracking-tight text-white drop-shadow tabular-nums">{pctRecebido}%</p>
                  <p className="text-xs text-white/75">Recebido</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-3">
          <div className="nice-scrollbar flex gap-1.5 overflow-x-auto py-2">
            {abaBtn('detalhes', FileText, 'Detalhes')}
            {abaBtn('itens', Package, 'Itens e recebimento', c.itens.length)}
            {abaBtn('mensagens', MessageSquare, 'Mensagens', c._count?.mensagens)}
          </div>
        </div>
      </div>

      {c.status === 'REPROVADO' && c.motivoReprovacao && (
        <div className={cn('mt-6 flex items-start gap-2 rounded-lg border p-3 text-sm', BADGE.rose)}>
          <Ban className="h-4 w-4 mt-0.5 shrink-0" /><span><strong>Reprovado:</strong> {c.motivoReprovacao}</span>
        </div>
      )}

      {/* ═══ Conteúdo — PADRAO_PAGINAS §3.3 ═══ */}
      <div key={aba} className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_20rem]" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
        <div className="min-w-0 space-y-6">
          {aba === 'detalhes' && (<>
            <SectionCard title="Dados do pedido" description="Pagamento, prazos e frete." icon={<FileText className="h-4 w-4" />}>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-6 space-y-1.5"><Label className="text-[13px] font-semibold">Forma de pagamento</Label><Input className="h-9 text-sm" value={forma} onChange={(e) => setForma(e.target.value)} disabled={!editavel} /></div>
                <div className="col-span-6 md:col-span-3 space-y-1.5"><Label className="text-[13px] font-semibold">Prazo de entrega</Label><Input className="h-9 text-sm" value={pEnt} onChange={(e) => setPEnt(e.target.value)} disabled={!editavel} /></div>
                <div className="col-span-6 md:col-span-3 space-y-1.5"><Label className="text-[13px] font-semibold">Prazo de pagamento</Label><Input className="h-9 text-sm" value={pPag} onChange={(e) => setPPag(e.target.value)} disabled={!editavel} /></div>
                <div className="col-span-6 md:col-span-3 space-y-1.5"><Label className="text-[13px] font-semibold">Frete (R$)</Label><Input className="h-9 text-sm" value={frete} onChange={(e) => setFrete(e.target.value)} disabled={!editavel} placeholder="0,00" /></div>
              </div>
            </SectionCard>

            <SectionCard title="Observações" description="Detalhamento do pedido para o fornecedor e para quem aprova." icon={<StickyNote className="h-4 w-4" />}>
              {editavel ? <RichEditor value={obs} onChange={setObs} placeholder="Detalhamento..." />
                : <RichContent className="text-sm" html={c.observacoes || '<p>Sem observações.</p>'} />}
            </SectionCard>
          </>)}

          {aba === 'itens' && (<>
            <SectionCard
              title="Itens do pedido"
              description={editavel ? 'Itens editáveis até o envio para aprovação.' : 'Quanto de cada item já chegou.'}
              icon={<Package className="h-4 w-4" />}
              bodyClassName="p-0"
              actions={editavel
                ? <Button type="button" variant="outline" size="xs" onClick={addItem} disabled={acting}><Plus className="h-3.5 w-3.5" />Adicionar item</Button>
                : recebendo
                  ? <Button type="button" size="xs" onClick={() => abrirRecebimento(null)}><PackageCheck className="h-3.5 w-3.5" />Registrar recebimento</Button>
                  : undefined}
            >
              {c.itens.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sem itens.</p> : (
                <div className="overflow-x-auto nice-scrollbar">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs min-w-[220px]">Descrição</TableHead>
                        <TableHead className="text-xs w-[90px]">Unid.</TableHead>
                        <TableHead className="text-xs text-center w-[90px]">Qtd.</TableHead>
                        <TableHead className="text-xs text-right w-[120px]">Valor unit.</TableHead>
                        <TableHead className="text-xs text-right w-[110px]">Total</TableHead>
                        <TableHead className="text-xs min-w-[160px]">Recebimento</TableHead>
                        <TableHead className="text-xs text-right w-[56px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {c.itens.map((it) => {
                        const sit = SITUACAO_ITEM[it.situacaoRecebimento] ?? SITUACAO_ITEM.PENDENTE!
                        const pct = it.quantidade > 0 ? Math.min(100, Math.round((it.quantidadeRecebida / it.quantidade) * 100)) : 0
                        const falta = it.quantidade - it.quantidadeRecebida
                        return (
                          <TableRow key={it.id}>
                            <TableCell className="text-xs">
                              {editavel
                                ? <Input className="h-8 text-sm" value={it.descricao} onChange={(e) => patchItem(it.id, { descricao: e.target.value })} onBlur={() => saveItem(it)} />
                                : <span className="font-medium">{it.descricao}</span>}
                            </TableCell>
                            <TableCell className="text-xs">
                              {editavel
                                ? <Input className="h-8 text-sm" placeholder="Unid." value={it.unidade ?? ''} onChange={(e) => patchItem(it.id, { unidade: e.target.value })} onBlur={() => saveItem(it)} />
                                : (it.unidade || '—')}
                            </TableCell>
                            <TableCell className="text-xs text-center tabular-nums">
                              {editavel
                                ? <Input className="h-8 text-sm text-center" type="number" min={1} value={it.quantidade} onChange={(e) => patchItem(it.id, { quantidade: Number(e.target.value) || 1 })} onBlur={() => saveItem(it)} />
                                : it.quantidade}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums">
                              {editavel
                                ? <Input className="h-8 text-sm text-right" type="number" min={0} step="0.01" value={it.valorUnitario} onChange={(e) => patchItem(it.id, { valorUnitario: Number(e.target.value) || 0 })} onBlur={() => saveItem(it)} />
                                : brl(it.valorUnitario)}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-medium">{brl(it.quantidade * it.valorUnitario)}</TableCell>
                            <TableCell className="text-xs">
                              {editavel || c.status === 'AGUARDANDO_APROVACAO' ? <span className="text-muted-foreground">—</span> : (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="tabular-nums">{it.quantidadeRecebida} de {it.quantidade}</span>
                                    <span className={cn('rounded-full border px-1.5 py-px text-[10px] font-medium', sit.cls)}>{sit.rotulo}</span>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                                    <div className="h-full rounded transition-all" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#10b981' : '#8b5cf6' }} />
                                  </div>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {(editavel || (recebendo && falta > 0)) && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon-sm" title="Ações"><MoreVertical className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {recebendo && falta > 0 && (
                                      <DropdownMenuItem onClick={() => abrirRecebimento(it.id)}><PackageCheck className="h-4 w-4" />Receber este item</DropdownMenuItem>
                                    )}
                                    {editavel && (
                                      <DropdownMenuItem onClick={() => removeItem(it.id)} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" />Remover item</DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-border px-5 py-3 text-sm">
                <span className="text-muted-foreground">Itens: <strong className="tabular-nums text-foreground">{brl(subtotal)}</strong></span>
                <span className="text-muted-foreground">Frete: <strong className="tabular-nums text-foreground">{brl(c.frete ?? 0)}</strong></span>
                <span className="text-muted-foreground">Total: <strong className="tabular-nums text-primary-on-surface">{brl(c.total)}</strong></span>
              </div>
            </SectionCard>

            {!editavel && c.status !== 'AGUARDANDO_APROVACAO' && (
              <SectionCard title="Recebimentos" description="Cada entrega: o que chegou, quando, com qual nota e quem conferiu." icon={<History className="h-4 w-4" />} bodyClassName="p-0">
                {c.recebimentoLegado ? (
                  <p className="flex items-start gap-2 px-5 py-4 text-xs text-muted-foreground">
                    <AlertTriangle className={cn('h-4 w-4 shrink-0', TEXT.amber)} />
                    Pedido recebido antes do recebimento por item: foi registrado por inteiro
                    {c.dataRecebimento ? ` em ${dataBr(c.dataRecebimento)}` : ''}{c.recebedor ? `, por ${c.recebedor.name}` : ''}.
                  </p>
                ) : c.recebimentos.length === 0 ? (
                  <p className="px-5 py-6 text-center text-sm text-muted-foreground">Nenhuma entrega registrada ainda.</p>
                ) : (
                  <div className="overflow-x-auto nice-scrollbar">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-[100px]">Data</TableHead>
                          <TableHead className="text-xs min-w-[200px]">Item</TableHead>
                          <TableHead className="text-xs text-center w-[80px]">Qtd.</TableHead>
                          <TableHead className="text-xs w-[110px]">NF</TableHead>
                          <TableHead className="text-xs">Recebido por</TableHead>
                          <TableHead className="text-xs text-right w-[56px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {c.recebimentos.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs tabular-nums">{dataBr(r.dataRecebimento)}</TableCell>
                            <TableCell className="text-xs">
                              <span className="font-medium">{r.item}</span>
                              {r.observacao && <span className="text-muted-foreground"> · {r.observacao}</span>}
                            </TableCell>
                            <TableCell className="text-xs text-center tabular-nums">{r.quantidade} {r.unidade ?? ''}</TableCell>
                            <TableCell className="text-xs">{r.nfNumero || '—'}</TableCell>
                            <TableCell className="text-xs">{r.recebedor?.name ?? '—'}</TableCell>
                            <TableCell className="text-right">
                              {podeEstornar && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon-sm" title="Ações"><MoreVertical className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => estornar(r)} className="text-destructive focus:text-destructive"><Undo2 className="h-4 w-4" />Estornar recebimento</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </SectionCard>
            )}
          </>)}

          {aba === 'mensagens' && (
            <SectionCard title="Mensagens" description="Conversa sobre o pedido entre solicitante, aprovador e compras." icon={<MessageSquare className="h-4 w-4" />}>
              <MensagensTab compraId={c.id} currentUserId={profile?.id} />
            </SectionCard>
          )}
        </div>

        {/* ═══ Coluna lateral ═══ */}
        <div className="space-y-6">
          <SectionCard title="Resumo" icon={<Receipt className="h-4 w-4" />}>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Itens</dt><dd className="tabular-nums">{brl(subtotal)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Frete</dt><dd className="tabular-nums">{brl(c.frete ?? 0)}</dd></div>
              <div className="flex justify-between gap-2 border-t border-border pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums text-primary-on-surface">{brl(c.total)}</dd></div>
            </dl>
            {c.itens.length > 0 && !editavel && c.status !== 'AGUARDANDO_APROVACAO' && (
              <div className="mt-4 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Recebimento</span>
                  <span className="tabular-nums">{itensCompletos} de {c.itens.length} itens completos</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div className="h-full rounded transition-all" style={{ width: `${pctRecebido}%`, backgroundColor: pctRecebido >= 100 ? '#10b981' : '#8b5cf6' }} />
                </div>
              </div>
            )}
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Andamento</p>
              <ol className="space-y-2 text-xs">
                {([
                  ['Solicitado', c.dataSolicitacao, c.solicitante?.name],
                  ['Aprovado', c.dataAprovacao, c.aprovador?.name],
                  ['Recebido', c.dataRecebimento, c.recebedor?.name],
                  ['Avaliado', c.dataAvaliacao, null],
                ] as Array<[string, string | null, string | null | undefined]>).map(([rotulo, quando, quem]) => (
                  <li key={rotulo} className="flex items-start gap-2">
                    <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', quando ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                    <span className={cn('flex-1', !quando && 'text-muted-foreground')}>
                      {rotulo}{quando ? ` em ${dataBr(quando)}` : ''}
                      {quando && quem && <span className="block text-muted-foreground">{quem}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </SectionCard>
          <AnexosCard key={anexosVersao} compraId={c.id} />
        </div>
      </div>

      {/* Reprovar modal */}
      <Dialog open={reprovarOpen} onOpenChange={setReprovarOpen}>
        <DialogContent>
          <DialogHeaderIcon icon={Ban} color="rose"><DialogTitle>Reprovar pedido #{c.code}</DialogTitle></DialogHeaderIcon>
          <DialogBody>
            <Label className="text-[13px] font-semibold">Motivo da reprovação *</Label>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="mt-1.5 w-full rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" placeholder="Descreva o motivo..." />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReprovarOpen(false)}>Cancelar</Button>
            <Button variant="destructive" size="sm" disabled={acting || motivo.trim().length < 3} onClick={async () => { await acao(() => (trpc.compra as any).reprovar.mutate({ id: c.id, motivo: motivo.trim() }), 'Pedido reprovado.'); setReprovarOpen(false) }}>Reprovar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceberModal
        open={receberOpen}
        compraId={c.id}
        codigo={c.code}
        itens={c.itens}
        itemInicial={receberItem}
        onClose={() => setReceberOpen(false)}
        onDone={() => { setReceberOpen(false); setAnexosVersao((v) => v + 1); carregar(true) }}
      />

      {avaliarOpen && <AvaliarModal compra={c} totalPedido={Number(c.total) || undefined} onClose={() => setAvaliarOpen(false)} onDone={() => { setAvaliarOpen(false); carregar(true) }} />}
    </div>
  )
}
