'use client'

import { useState, useEffect, useRef } from 'react'
import {
  FileSpreadsheet, Settings2, Upload, Table2, Download, Building2,
  ChevronsUpDown, Check, type LucideIcon,
} from 'lucide-react'
import { Button, Card, CardHeader, Badge, Label, cn } from '@saas/ui'
import { Command } from 'cmdk'
import { trpc } from '@/lib/trpc'
import { FolhaConfigTab } from './_components/folha-config'
import { FolhaImportTab } from './_components/folha-import'
import { FolhaLancamentosTab } from './_components/folha-lancamentos'
import { FolhaExportTab } from './_components/folha-export'

const MODULE_COLOR = '#8b5cf6'

interface ClienteOption { id: string; razaoSocial: string; documento: string }

interface TabItem { key: string; label: string; icon: LucideIcon }

const TABS: TabItem[] = [
  { key: 'config', label: 'Configuração', icon: Settings2 },
  { key: 'import', label: 'Importação', icon: Upload },
  { key: 'lancamentos', label: 'Lançamentos', icon: Table2 },
  { key: 'export', label: 'Exportação', icon: Download },
]

export default function FolhaPagamentoPage() {
  const [clientes, setClientes] = useState<ClienteOption[]>([])
  const [clienteId, setClienteId] = useState('')
  const [comboOpen, setComboOpen] = useState(false)
  const comboRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState('config')

  // Fechar combobox ao clicar fora
  useEffect(() => {
    if (!comboOpen) return
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setComboOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [comboOpen])

  // Carregar clientes
  useEffect(() => {
    trpc.cliente.listForSelect.query()
      .then((result) => {
        const all = result as Array<ClienteOption & { situacao?: string }>
        setClientes(all.filter(c => c.situacao === 'MENSAL'))
      })
      .catch(() => setClientes([]))
  }, [])

  const clienteSelecionado = clientes.find(c => c.id === clienteId)

  const formatCnpj = (doc: string) =>
    doc.length === 14
      ? doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
      : doc

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, #6d28d9)` }}>
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h1>Importação de Folha</h1>
            <p className="text-sm text-muted-foreground">Importação, contabilização e exportação de lançamentos</p>
          </div>
        </div>
      </div>

      {/* Seletor de cliente */}
      <Card>
        <div className="px-5 py-4">
          <div className="flex items-end gap-4">
            <div className="w-full sm:w-[420px] space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cliente</Label>
              <div className="relative" ref={comboRef}>
                <button type="button" onClick={() => setComboOpen(v => !v)} className={cn('flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-xs', 'hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2', !clienteId && 'text-muted-foreground')}>
                  <span className="truncate">{clienteSelecionado ? clienteSelecionado.razaoSocial : 'Selecione um cliente'}</span>
                  <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
                {comboOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-popover shadow-lg">
                    <Command className="rounded-lg" shouldFilter={true}>
                      <Command.Input placeholder="Buscar por nome ou CNPJ..." className="w-full border-b border-border bg-transparent px-3 py-2 text-xs outline-none placeholder:text-muted-foreground" />
                      <Command.List className="max-h-[250px] overflow-y-auto p-1">
                        <Command.Empty className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhum cliente encontrado</Command.Empty>
                        {clientes.map(c => (
                          <Command.Item key={c.id} value={`${c.razaoSocial} ${c.documento}`} onSelect={() => { setClienteId(c.id); setComboOpen(false) }} className="group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-violet-500 hover:text-white aria-selected:bg-violet-500 aria-selected:text-white">
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
          </div>
        </div>
      </Card>

      {/* Conteúdo com abas */}
      {!clienteId ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Building2 className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Selecione um cliente</p>
            <p className="text-xs mt-1">Escolha um cliente para acessar a contabilização de folha</p>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              {clienteSelecionado?.razaoSocial ?? 'Importação de Folha'}
            </h5>
          </CardHeader>
          <div className="flex min-h-[500px]">
            {/* Pills laterais */}
            <div className="w-[170px] shrink-0 border-r border-[rgba(0,0,0,0.08)] bg-[#f8f9fa] p-3">
              <div className="space-y-1">
                {TABS.map(tab => {
                  const Icon = tab.icon
                  return (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={cn('w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2', activeTab === tab.key ? 'text-white shadow-sm' : 'text-muted-foreground hover:bg-white hover:text-foreground')} style={activeTab === tab.key ? { backgroundColor: MODULE_COLOR } : undefined}>
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Conteúdo da aba */}
            <div key={activeTab} className="flex-1 min-w-0" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
              <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.08)]">
                <h4 className="text-[13px] font-semibold text-foreground">{TABS.find(t => t.key === activeTab)?.label}</h4>
              </div>
              <div className="p-3">
                {activeTab === 'config' && <FolhaConfigTab clienteId={clienteId} />}
                {activeTab === 'import' && <FolhaImportTab clienteId={clienteId} />}
                {activeTab === 'lancamentos' && <FolhaLancamentosTab clienteId={clienteId} />}
                {activeTab === 'export' && <FolhaExportTab clienteId={clienteId} />}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
