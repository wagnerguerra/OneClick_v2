'use client'

import { useState, useEffect } from 'react'
import { Shield, Loader2, Users, ExternalLink, Plus, Trash2, Eye, EyeOff, CalendarClock, Check } from 'lucide-react'
import {
  Button, Input, Label, Card,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import type { UseFormRegister } from 'react-hook-form'
import type { CreateClienteInput } from '@saas/types'

// ============================================================
// POP: Registros Gerais (usa campos do form principal)
// ============================================================

interface LegalizacaoCardProps {
  register: UseFormRegister<CreateClienteInput>
  clienteId?: string
}

interface Socio {
  id: string
  nomeCompleto: string
  cpf: string
  tipoSocio: string
  participacao: number | null
}

const TIPO_SOCIO_LABELS: Record<string, string> = {
  SOCIO_ADMINISTRADOR: 'Socio Administrador',
  SOCIO_DIRETOR: 'Socio Diretor',
  REPRESENTANTE_LEGAL: 'Representante Legal',
  SOCIO_QUOTISTA: 'Socio Quotista',
  TITULAR: 'Titular',
}

const LINKS_RAPIDOS = [
  { label: 'RedeSim', url: 'https://www.gov.br/empresas-e-negocios/pt-br/redesim' },
  { label: 'JUCEES', url: 'https://www.jucees.es.gov.br' },
  { label: 'Corpo de Bombeiros ES', url: 'https://cb.es.gov.br' },
  { label: 'Agencia Virtual SEFAZ', url: 'https://agenciavirtual.sefaz.es.gov.br' },
]

interface Acesso { id: string; portal: string; usuario: string | null; senha: string | null; observacoes: string | null }
interface Vencimento { id: string; descricao: string; data_vencimento: string; alerta_dias: number; observacoes: string | null; concluido: boolean }

export function LegalizacaoCard({ register, clienteId }: LegalizacaoCardProps) {
  const [activeTab, setActiveTab] = useState('pop')
  const [socios, setSocios] = useState<Socio[]>([])
  const [sociosLoading, setSociosLoading] = useState(false)
  const [acessos, setAcessos] = useState<Acesso[]>([])
  const [acessosLoading, setAcessosLoading] = useState(false)
  const [vencimentos, setVencimentos] = useState<Vencimento[]>([])
  const [vencimentosLoading, setVencimentosLoading] = useState(false)
  const [senhaVisivel, setSenhaVisivel] = useState<Set<string>>(new Set())
  const [andamentos, setAndamentos] = useState<Array<{ id: string; descricao: string; tipo: string; status: string; data_inicio: string | null; data_conclusao: string | null; observacoes: string | null; usuario_nome: string | null; created_at: string }>>([])
  const [andamentosLoading, setAndamentosLoading] = useState(false)
  const [cnaes, setCnaes] = useState<Array<{ id: string; codigo: string; descricao: string; principal: boolean }>>([])
  const [cnaesLoading, setCnaesLoading] = useState(false)

  // Lazy load socios
  useEffect(() => {
    if (activeTab === 'socios' && clienteId && socios.length === 0) {
      setSociosLoading(true)
      ;(trpc.socio as any).listByCliente.query({ clienteId })
        .then((data: unknown) => setSocios(data as Socio[]))
        .catch(() => {})
        .finally(() => setSociosLoading(false))
    }
  }, [activeTab, clienteId, socios.length])

  // Lazy load acessos
  useEffect(() => {
    if (activeTab === 'acessos' && clienteId && acessos.length === 0) {
      setAcessosLoading(true)
      ;(trpc.cliente as any).listAcessos.query({ clienteId })
        .then((data: Acesso[]) => setAcessos(data))
        .catch(() => {})
        .finally(() => setAcessosLoading(false))
    }
  }, [activeTab, clienteId, acessos.length])

  // Lazy load vencimentos
  useEffect(() => {
    if (activeTab === 'vencimentos' && clienteId && vencimentos.length === 0) {
      setVencimentosLoading(true)
      ;(trpc.cliente as any).listVencimentos.query({ clienteId })
        .then((data: Vencimento[]) => setVencimentos(data))
        .catch(() => {})
        .finally(() => setVencimentosLoading(false))
    }
  }, [activeTab, clienteId, vencimentos.length])

  // Lazy load andamentos
  useEffect(() => {
    if (activeTab === 'andamentos' && clienteId && andamentos.length === 0) {
      setAndamentosLoading(true)
      ;(trpc.cliente as any).listAndamentos.query({ clienteId })
        .then((data: typeof andamentos) => setAndamentos(data))
        .catch(() => {})
        .finally(() => setAndamentosLoading(false))
    }
  }, [activeTab, clienteId, andamentos.length])

  // Lazy load cnaes
  useEffect(() => {
    if (activeTab === 'cnaes' && clienteId && cnaes.length === 0) {
      setCnaesLoading(true)
      ;(trpc.cliente as any).listCnaes.query({ clienteId })
        .then((data: typeof cnaes) => setCnaes(data))
        .catch(() => {})
        .finally(() => setCnaesLoading(false))
    }
  }, [activeTab, clienteId, cnaes.length])

  async function addAcesso() {
    if (!clienteId) return
    const portal = prompt('Nome do portal:')
    if (!portal) return
    try {
      await (trpc.cliente as any).addAcesso.mutate({ clienteId, portal })
      setAcessos([])
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function removeAcesso(id: string) {
    const ok = await alerts.confirmDelete('este acesso')
    if (!ok) return
    try {
      await (trpc.cliente as any).removeAcesso.mutate({ id })
      setAcessos(prev => prev.filter(a => a.id !== id))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function addVencimento() {
    if (!clienteId) return
    const descricao = prompt('Descricao do vencimento:')
    if (!descricao) return
    const dataVencimento = prompt('Data (AAAA-MM-DD):')
    if (!dataVencimento) return
    try {
      await (trpc.cliente as any).addVencimento.mutate({ clienteId, descricao, dataVencimento })
      setVencimentos([])
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function toggleVencimento(id: string) {
    try {
      await (trpc.cliente as any).toggleVencimento.mutate({ id })
      setVencimentos(prev => prev.map(v => v.id === id ? { ...v, concluido: !v.concluido } : v))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function removeVencimento(id: string) {
    const ok = await alerts.confirmDelete('este vencimento')
    if (!ok) return
    try {
      await (trpc.cliente as any).removeVencimento.mutate({ id })
      setVencimentos(prev => prev.filter(v => v.id !== id))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function addAndamento() {
    if (!clienteId) return
    const descricao = prompt('Descricao do andamento:')
    if (!descricao) return
    try {
      await (trpc.cliente as any).addAndamento.mutate({ clienteId, descricao })
      setAndamentos([])
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function updateAndamentoStatus(id: string, status: string) {
    try {
      await (trpc.cliente as any).updateAndamentoStatus.mutate({ id, status })
      setAndamentos(prev => prev.map(a => a.id === id ? { ...a, status, data_conclusao: status === 'concluido' ? new Date().toISOString() : null } : a))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function removeAndamento(id: string) {
    const ok = await alerts.confirmDelete('este andamento')
    if (!ok) return
    try {
      await (trpc.cliente as any).removeAndamento.mutate({ id })
      setAndamentos(prev => prev.filter(a => a.id !== id))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function addCnae() {
    if (!clienteId) return
    const codigo = prompt('Codigo CNAE (ex: 6202-3/00):')
    if (!codigo) return
    const descricao = prompt('Descricao:') || ''
    try {
      await (trpc.cliente as any).addCnae.mutate({ clienteId, codigo, descricao })
      setCnaes([])
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function removeCnae(id: string) {
    const ok = await alerts.confirmDelete('este CNAE')
    if (!ok) return
    try {
      await (trpc.cliente as any).removeCnae.mutate({ id })
      setCnaes(prev => prev.filter(c => c.id !== id))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const pills = [
    { id: 'pop', label: 'Registros Gerais' },
    { id: 'socios', label: 'Socios' },
    { id: 'acessos', label: 'Acessos' },
    { id: 'vencimentos', label: 'Vencimentos' },
    { id: 'andamentos', label: 'Andamentos' },
    { id: 'cnaes', label: 'CNAEs' },
    { id: 'links', label: 'Links Rapidos' },
  ]

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-[rgba(0,0,0,0.08)] px-5 py-3">
        <Shield className="h-4 w-4 text-emerald-600" />
        <h5 className="text-[13px] font-semibold">Legalizacao</h5>
      </div>
      <div className="flex min-h-[400px]">
        {/* Pills laterais */}
        <div className="w-[160px] shrink-0 border-r bg-[#f8f9fa] dark:bg-muted/20 p-3 space-y-1">
          {pills.map(pill => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setActiveTab(pill.id)}
              className={cn(
                'flex items-center gap-2 w-full rounded-md px-3 py-2 text-[11px] font-medium transition-colors text-left',
                activeTab === pill.id
                  ? 'text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60',
              )}
              style={activeTab === pill.id ? { backgroundColor: '#10b981' } : undefined}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Conteudo */}
        <div key={activeTab} className="flex-1" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
          {/* POP: Registros Gerais */}
          {activeTab === 'pop' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">POP: Registros Gerais</h4>
                </div>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Inscricao Estadual</Label>
                  <Input placeholder="IE" {...register('inscricaoEstadual')} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Inscricao Municipal</Label>
                  <Input placeholder="IM" {...register('inscricaoMunicipal')} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>CNAE Principal</Label>
                  <Input placeholder="0000-0/00" {...register('cnaePrincipal' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>NIRE</Label>
                  <Input placeholder="NIRE" {...register('nire' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>RG Edificacao</Label>
                  <Input placeholder="RG Edificacao" {...register('rgEdificacao' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Codigo Simples</Label>
                  <Input placeholder="Codigo Simples Nacional" {...register('codigoSimples' as any)} />
                </div>

                {/* Separador Bombeiros */}
                <div className="col-span-12 -mx-5 border-t border-[rgba(0,0,0,0.08)] mt-2" />
                <div className="col-span-12 -mx-5 px-5 py-2">
                  <h4 className="text-[13px] font-semibold text-foreground">Corpo de Bombeiros</h4>
                </div>

                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Tipo / Ocupacao</Label>
                  <Input placeholder="Tipo de ocupacao" {...register('bombeirosOcupacao' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Metragem</Label>
                  <Input placeholder="m²" {...register('bombeirosMetragem' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Rota</Label>
                  <Input placeholder="Rota" {...register('bombeirosRota' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Projeto</Label>
                  <Input placeholder="N° Projeto" {...register('bombeirosProjeto' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Capacidade</Label>
                  <Input placeholder="Capacidade" {...register('bombeirosCapacidade' as any)} />
                </div>
              </div>
            </>
          )}

          {/* Socios */}
          {activeTab === 'socios' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">Socios vinculados</h4>
                </div>
              </div>
              <div className="p-5">
                {sociosLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando socios...
                  </div>
                ) : socios.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhum socio vinculado a este cliente.</p>
                    <p className="text-xs mt-1">Vincule socios no modulo de Socios.</p>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30 text-xs text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">Nome</th>
                          <th className="text-left px-3 py-2 font-medium">CPF</th>
                          <th className="text-left px-3 py-2 font-medium">Tipo</th>
                          <th className="text-right px-3 py-2 font-medium">Participacao</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {socios.map(s => (
                          <tr key={s.id} className="hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium">{s.nomeCompleto}</td>
                            <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{s.cpf}</td>
                            <td className="px-3 py-2 text-muted-foreground">{TIPO_SOCIO_LABELS[s.tipoSocio] || s.tipoSocio}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {s.participacao != null ? `${Number(s.participacao).toFixed(2)}%` : '--'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Acessos */}
          {activeTab === 'acessos' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-foreground">Acessos a Portais</h4>
                  {clienteId && <Button type="button" variant="outline" size="sm" onClick={addAcesso} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Adicionar</Button>}
                </div>
              </div>
              <div className="p-5">
                {acessosLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...</div>
                ) : acessos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum acesso cadastrado.</p>
                ) : (
                  <div className="space-y-2">
                    {acessos.map(a => (
                      <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3 bg-card">
                        <div className="flex-1 min-w-0 grid grid-cols-3 gap-2 text-sm">
                          <div><span className="text-[10px] text-muted-foreground block">Portal</span><span className="font-medium">{a.portal}</span></div>
                          <div><span className="text-[10px] text-muted-foreground block">Usuario</span><span className="font-mono text-xs">{a.usuario || '--'}</span></div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Senha</span>
                            <span className="font-mono text-xs">
                              {senhaVisivel.has(a.id) ? (a.senha || '--') : (a.senha ? '••••••' : '--')}
                            </span>
                            {a.senha && (
                              <button type="button" className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => setSenhaVisivel(prev => { const n = new Set(prev); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n })}>
                                {senhaVisivel.has(a.id) ? <EyeOff className="h-3 w-3 inline" /> : <Eye className="h-3 w-3 inline" />}
                              </button>
                            )}
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeAcesso(a.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Vencimentos */}
          {activeTab === 'vencimentos' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-foreground">Vencimentos e Prazos</h4>
                  {clienteId && <Button type="button" variant="outline" size="sm" onClick={addVencimento} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Adicionar</Button>}
                </div>
              </div>
              <div className="p-5">
                {vencimentosLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...</div>
                ) : vencimentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum vencimento cadastrado.</p>
                ) : (
                  <div className="space-y-2">
                    {vencimentos.map(v => {
                      const dt = new Date(v.data_vencimento)
                      const hoje = new Date()
                      const diffDays = Math.ceil((dt.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
                      const vencido = diffDays < 0 && !v.concluido
                      const proximo = diffDays >= 0 && diffDays <= v.alerta_dias && !v.concluido
                      return (
                        <div key={v.id} className={cn(
                          'flex items-center gap-3 rounded-lg border p-3',
                          v.concluido && 'opacity-50 bg-muted/20',
                          vencido && 'border-red-300 bg-red-50/50 dark:bg-red-950/10',
                          proximo && !vencido && 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/10',
                        )}>
                          <button type="button" onClick={() => toggleVencimento(v.id)} className={cn('shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center', v.concluido ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/40')}>
                            {v.concluido && <Check className="h-3 w-3 text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-sm font-medium', v.concluido && 'line-through')}>{v.descricao}</p>
                            {v.observacoes && <p className="text-[10px] text-muted-foreground mt-0.5">{v.observacoes}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="flex items-center gap-1 text-xs">
                              <CalendarClock className="h-3 w-3" />
                              <span className={cn(vencido && 'text-red-600 font-medium', proximo && !vencido && 'text-amber-600 font-medium')}>
                                {dt.toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            {!v.concluido && diffDays >= 0 && <p className="text-[10px] text-muted-foreground">{diffDays} dia{diffDays !== 1 ? 's' : ''}</p>}
                            {vencido && <p className="text-[10px] text-red-600 font-medium">Vencido</p>}
                          </div>
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeVencimento(v.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Andamentos */}
          {activeTab === 'andamentos' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-foreground">Andamentos</h4>
                  {clienteId && <Button type="button" variant="outline" size="sm" onClick={addAndamento} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Adicionar</Button>}
                </div>
              </div>
              <div className="p-5">
                {andamentosLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...</div>
                ) : andamentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum andamento registrado.</p>
                ) : (
                  <div className="space-y-2">
                    {andamentos.map(a => {
                      const STATUS_COLORS: Record<string, string> = { pendente: 'bg-amber-100 text-amber-700', em_andamento: 'bg-sky-100 text-sky-700', concluido: 'bg-emerald-100 text-emerald-700', cancelado: 'bg-red-100 text-red-700' }
                      const STATUS_LABELS: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluido', cancelado: 'Cancelado' }
                      return (
                        <div key={a.id} className={cn('flex items-start gap-3 rounded-lg border p-3 bg-card', a.status === 'concluido' && 'opacity-50')}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{a.descricao}</p>
                            {a.observacoes && <p className="text-[10px] text-muted-foreground mt-0.5">{a.observacoes}</p>}
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_COLORS[a.status] || 'bg-muted text-muted-foreground')}>
                                {STATUS_LABELS[a.status] || a.status}
                              </span>
                              {a.usuario_nome && <span className="text-[10px] text-muted-foreground">{a.usuario_nome}</span>}
                              {a.data_inicio && <span className="text-[10px] text-muted-foreground">Inicio: {new Date(a.data_inicio).toLocaleDateString('pt-BR')}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {a.status === 'pendente' && <Button type="button" variant="soft" size="sm" className="h-7 text-[10px]" onClick={() => updateAndamentoStatus(a.id, 'em_andamento')}>Iniciar</Button>}
                            {a.status === 'em_andamento' && <Button type="button" variant="success" size="sm" className="h-7 text-[10px]" onClick={() => updateAndamentoStatus(a.id, 'concluido')}>Concluir</Button>}
                            <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeAndamento(a.id)} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* CNAEs */}
          {activeTab === 'cnaes' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-foreground">CNAEs</h4>
                  {clienteId && <Button type="button" variant="outline" size="sm" onClick={addCnae} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Adicionar</Button>}
                </div>
              </div>
              <div className="p-5">
                {cnaesLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...</div>
                ) : cnaes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum CNAE cadastrado.</p>
                ) : (
                  <div className="space-y-1.5">
                    {cnaes.map(c => (
                      <div key={c.id} className="flex items-center gap-3 rounded-lg border p-3 bg-card">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">{c.codigo}</span>
                            {c.principal && <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 text-[9px] font-medium">Principal</span>}
                          </div>
                          {c.descricao && <p className="text-xs text-muted-foreground mt-0.5">{c.descricao}</p>}
                        </div>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeCnae(c.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Links Rapidos */}
          {activeTab === 'links' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">Links Rapidos</h4>
                </div>
              </div>
              <div className="p-5 grid grid-cols-2 gap-2">
                {LINKS_RAPIDOS.map(link => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/40 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4 text-emerald-600 shrink-0" />
                    {link.label}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
