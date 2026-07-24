'use client'

import { useState, useEffect, useRef } from 'react'
import {
  BarChart3, Building2, Link2, Loader2, ChevronsUpDown, Check,
  Eye, PieChart, Table2, Settings2, BookOpen, type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { Command } from 'cmdk'
import {
  Button, Card, CardHeader, Badge, Label,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { BiVisaoGeral } from './_components/bi-visao-geral'
import { BiMatriz } from './_components/bi-matriz'
import { BiAnalise } from './_components/bi-analise'
import { BiGerenciar } from './_components/bi-gerenciar'

const MODULE_COLOR = 'var(--mod-contabil, #a78bfa)'

interface ClienteOption {
  id: string
  razaoSocial: string
  documento: string
  situacao?: string
}

interface TabItem {
  key: string
  label: string
  icon: LucideIcon
}

const TABS: TabItem[] = [
  { key: 'visao-geral', label: 'Visao Geral', icon: Eye },
  { key: 'matriz', label: 'Matriz de Resultados', icon: Table2 },
  { key: 'analise', label: 'Analise', icon: PieChart },
  { key: 'gerenciar', label: 'Gerenciar Contas', icon: Settings2 },
]

const MESES = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Fev' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Abr' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Ago' },
  { value: 9, label: 'Set' },
  { value: 10, label: 'Out' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dez' },
]

const formatCnpj = (doc: string) =>
  doc.length === 14
    ? `${doc.slice(0,2)}.${doc.slice(2,5)}.${doc.slice(5,8)}/${doc.slice(8,12)}-${doc.slice(12,14)}`
    : doc.length === 11
      ? `${doc.slice(0,3)}.${doc.slice(3,6)}.${doc.slice(6,9)}-${doc.slice(9,11)}`
      : doc

export default function BiFaturamentoPage() {
  // Filtros
  const [clientes, setClientes] = useState<ClienteOption[]>([])
  const [clienteId, setClienteId] = useState('')
  const [comboOpen, setComboOpen] = useState(false)
  const comboRef = useRef<HTMLDivElement>(null)
  const currentYear = new Date().getFullYear()
  const anosDisponiveis = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]
  const [anosSelecionados, setAnosSelecionados] = useState<number[]>([currentYear])
  const ano = anosSelecionados[0] ?? currentYear // Ano principal para abas que aceitam apenas 1

  const toggleAno = (a: number) => {
    setAnosSelecionados(prev => {
      if (prev.includes(a)) {
        const next = prev.filter(x => x !== a)
        return next.length === 0 ? [a] : next // manter ao menos 1
      }
      return [...prev, a].sort((x, y) => y - x) // mais recente primeiro
    })
  }
  const [mesesSelecionados, setMesesSelecionados] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  const [loadingClientes, setLoadingClientes] = useState(true)
  const [generatingLink, setGeneratingLink] = useState(false)

  // Aba ativa
  const [activeTab, setActiveTab] = useState('visao-geral')

  // Fechar combobox ao clicar fora
  useEffect(() => {
    if (!comboOpen) return
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setComboOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [comboOpen])

  // Carregar clientes (apenas situação MENSAL)
  useEffect(() => {
    trpc.cliente.listForSelect.query()
      .then((result) => {
        const all = result as Array<ClienteOption & { situacao?: string }>
        const list = all.filter(c => c.situacao === 'MENSAL')
        setClientes(list)
      })
      .catch(() => setClientes([]))
      .finally(() => setLoadingClientes(false))
  }, [])


  // Toggle mes
  const toggleMes = (mes: number) => {
    setMesesSelecionados(prev => {
      if (prev.includes(mes)) {
        const next = prev.filter(m => m !== mes)
        return next.length === 0 ? [mes] : next
      }
      return [...prev, mes].sort((a, b) => a - b)
    })
  }

  const toggleAllMeses = () => {
    if (mesesSelecionados.length === 12) {
      setMesesSelecionados([new Date().getMonth() + 1])
    } else {
      setMesesSelecionados([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    }
  }

  // Gerar link publico
  async function handleGerarLink() {
    if (!clienteId) return
    setGeneratingLink(true)
    try {
      const result = await trpc.bi.linkPublico.mutate({ clienteId })
      const url = (result as { url: string }).url
      await navigator.clipboard.writeText(url)
      alerts.success('Link copiado!', 'O link publico foi copiado para a area de transferencia.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Nao foi possivel gerar o link.')
    } finally {
      setGeneratingLink(false)
    }
  }

  // Cliente selecionado
  const clienteSelecionado = clientes.find(c => c.id === clienteId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1>Dashboard Financeiro</h1>
            <p className="text-sm text-muted-foreground">
              Analise financeira e indicadores de desempenho
            </p>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Seletor de cliente (combobox com busca) */}
            <div className="w-full sm:w-[420px] space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cliente
              </Label>
              <div className="relative" ref={comboRef}>
                <button
                  type="button"
                  onClick={() => setComboOpen(v => !v)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-xs',
                    'hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    !clienteId && 'text-muted-foreground',
                  )}
                >
                  <span className="truncate">
                    {loadingClientes ? 'Carregando...' : clienteSelecionado ? clienteSelecionado.razaoSocial : 'Selecione um cliente'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>

                {comboOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-popover shadow-lg">
                    <Command className="rounded-lg" shouldFilter={true}>
                      <Command.Input
                        placeholder="Buscar por nome ou CNPJ..."
                        className="w-full border-b border-border bg-transparent px-3 py-2 text-xs outline-none placeholder:text-muted-foreground"
                      />
                      <Command.List className="max-h-[250px] overflow-y-auto p-1">
                        <Command.Empty className="px-3 py-4 text-center text-xs text-muted-foreground">
                          Nenhum cliente encontrado
                        </Command.Empty>
                        {clientes.map(c => (
                          <Command.Item
                            key={c.id}
                            value={`${c.razaoSocial} ${c.documento}`}
                            onSelect={() => {
                              setClienteId(c.id)
                              setComboOpen(false)
                            }}
                            className="group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-violet-500 hover:text-white aria-selected:bg-violet-500 aria-selected:text-white"
                          >
                            <Check className={cn('h-3.5 w-3.5 shrink-0', c.id === clienteId ? 'opacity-100' : 'opacity-0')} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{c.razaoSocial}</p>
                              <p className="font-mono text-[10px] text-muted-foreground group-hover:text-white/80 group-aria-selected:text-white/80">{formatCnpj(c.documento)}</p>
                            </div>
                          </Command.Item>
                        ))}
                      </Command.List>
                    </Command>
                  </div>
                )}
              </div>
            </div>

            {/* Seletor de ano (multi-select) */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Ano
              </Label>
              <div className="flex gap-1">
                {anosDisponiveis.map(a => (
                  <button
                    key={a}
                    onClick={() => toggleAno(a)}
                    className={cn(
                      'rounded px-3 py-1 text-[11px] font-medium transition-all border',
                      anosSelecionados.includes(a)
                        ? 'text-white border-transparent'
                        : 'text-muted-foreground border-border/60 bg-background hover:bg-muted/50',
                    )}
                    style={anosSelecionados.includes(a) ? { backgroundColor: MODULE_COLOR } : undefined}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Meses */}
            <div className="flex-1 space-y-1.5 min-w-[300px]">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Meses
                </Label>
                <button
                  onClick={toggleAllMeses}
                  className="text-[10px] font-medium hover:underline"
                  style={{ color: MODULE_COLOR }}
                >
                  {mesesSelecionados.length === 12 ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {MESES.map(m => (
                  <button
                    key={m.value}
                    onClick={() => toggleMes(m.value)}
                    className={cn(
                      'rounded px-2.5 py-1 text-[11px] font-medium transition-all border',
                      mesesSelecionados.includes(m.value)
                        ? 'text-white border-transparent shadow-sm'
                        : 'text-muted-foreground border-border/60 bg-background hover:bg-muted/50',
                    )}
                    style={mesesSelecionados.includes(m.value) ? { backgroundColor: MODULE_COLOR } : undefined}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Botões */}
            <div className="shrink-0 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                asChild
                className="gap-1.5"
              >
                <Link href="/bi-categorias-balancete">
                  <BookOpen className="h-3.5 w-3.5" />
                  Categorias
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGerarLink}
                disabled={!clienteId || generatingLink}
                className="gap-1.5"
              >
                {generatingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Link para o cliente
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Card com abas verticais (pills) */}
      {!clienteId ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Building2 className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Selecione um cliente</p>
            <p className="text-xs mt-1">Escolha um cliente no filtro acima para visualizar os dados</p>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              {clienteSelecionado?.razaoSocial ?? 'Dashboard Financeiro'}
              <Badge variant="outline" className="text-[10px] ml-2">{anosSelecionados.join(', ')}</Badge>
            </h5>
          </CardHeader>
          <div className="flex min-h-[450px]">
            {/* Pills laterais */}
            <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3">
              <div className="space-y-1">
                {TABS.map(tab => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                        activeTab === tab.key
                          ? 'text-white shadow-sm'
                          : 'text-muted-foreground hover:bg-white hover:text-foreground',
                      )}
                      style={activeTab === tab.key ? { backgroundColor: MODULE_COLOR } : undefined}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Conteudo da aba */}
            <div key={activeTab} className="flex-1 min-w-0" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
              {/* Titulo interno */}
              <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.08)]">
                <h4 className="text-[13px] font-semibold text-foreground">
                  {TABS.find(t => t.key === activeTab)?.label}
                </h4>
              </div>

              {/* Conteudo */}
              <div className="p-3">
                {activeTab === 'visao-geral' && (
                  <BiVisaoGeral clienteId={clienteId} anos={anosSelecionados} meses={mesesSelecionados} />
                )}
                {activeTab === 'matriz' && (
                  <BiMatriz clienteId={clienteId} ano={ano} />
                )}
                {activeTab === 'analise' && (
                  <BiAnalise clienteId={clienteId} ano={ano} meses={mesesSelecionados} />
                )}
                {activeTab === 'gerenciar' && (
                  <BiGerenciar clienteId={clienteId} ano={ano} />
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
