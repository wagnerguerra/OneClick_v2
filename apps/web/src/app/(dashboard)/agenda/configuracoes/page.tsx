'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Calendar, Plus, Edit2, Trash2, MoreVertical, Loader2, Settings, DoorOpen,
} from 'lucide-react'
import {
  Button, Input, Label, Card, CardHeader,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

type ConflitoModo = 'DESLIGADO' | 'AVISAR' | 'BLOQUEAR'

interface AgendaConfig {
  id: string
  conflitoParticipante: ConflitoModo
  conflitoSala: ConflitoModo
}

interface AgendaSala {
  id: string
  nome: string
  capacidade: number | null
  equipamentos: string | null
  ativo: boolean
}

const MODOS: { value: ConflitoModo; label: string; description: string }[] = [
  { value: 'DESLIGADO', label: 'Desligado', description: 'Não verifica conflitos' },
  { value: 'AVISAR',    label: 'Avisar',    description: 'Mostra aviso mas deixa salvar' },
  { value: 'BLOQUEAR',  label: 'Bloquear',  description: 'Impede salvar quando há conflito' },
]

export default function AgendaConfiguracoesPage() {
  const router = useRouter()
  const { isMaster, permissions, loading: permsLoading } = useUserPermissions()
  const subPerms = useMemo(() => {
    const p = permissions.find(x => x.moduleSlug === 'agenda')
    return (p?.subPermissions ?? {}) as Record<string, boolean>
  }, [permissions])
  const canAccess = isMaster || subPerms.manage_config === true

  // Redirect se não tem permissão (depois de carregar)
  useEffect(() => {
    if (!permsLoading && !canAccess) {
      alerts.error('Sem permissão', 'Você não tem permissão para acessar essa configuração.')
      router.replace('/agenda')
    }
  }, [permsLoading, canAccess, router])

  // ================== Estado ==================
  const [activeTab, setActiveTab] = useState<'regras' | 'salas'>('regras')
  const [config, setConfig] = useState<AgendaConfig | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)

  const [salas, setSalas] = useState<AgendaSala[]>([])
  const [loadingSalas, setLoadingSalas] = useState(true)
  const [salaModalOpen, setSalaModalOpen] = useState(false)
  const [salaForm, setSalaForm] = useState<{ id: string | null; nome: string; capacidade: string; equipamentos: string; ativo: boolean }>({
    id: null, nome: '', capacidade: '', equipamentos: '', ativo: true,
  })
  const [savingSala, setSavingSala] = useState(false)

  // ================== Carregamento ==================
  async function loadConfig() {
    try {
      const c = await trpc.agenda.config.get.query() as AgendaConfig
      setConfig(c)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function loadSalas() {
    setLoadingSalas(true)
    try {
      const list = await trpc.agenda.sala.list.query({ incluirInativas: true }) as AgendaSala[]
      setSalas(list)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setLoadingSalas(false) }
  }

  useEffect(() => {
    if (!canAccess) return
    loadConfig()
    loadSalas()
  }, [canAccess])

  // ================== Ações: Config ==================
  async function updateConfigField(field: 'conflitoParticipante' | 'conflitoSala', value: ConflitoModo) {
    if (!config) return
    const prev = { ...config }
    setConfig({ ...config, [field]: value })
    setSavingConfig(true)
    try {
      const updated = await trpc.agenda.config.update.mutate({ [field]: value } as never) as AgendaConfig
      setConfig(updated)
    } catch (e) {
      setConfig(prev) // rollback
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSavingConfig(false)
    }
  }

  // ================== Ações: Salas ==================
  function openSalaNew() {
    setSalaForm({ id: null, nome: '', capacidade: '', equipamentos: '', ativo: true })
    setSalaModalOpen(true)
  }
  function openSalaEdit(s: AgendaSala) {
    setSalaForm({
      id: s.id,
      nome: s.nome,
      capacidade: s.capacidade?.toString() ?? '',
      equipamentos: s.equipamentos ?? '',
      ativo: s.ativo,
    })
    setSalaModalOpen(true)
  }
  async function saveSala() {
    if (!salaForm.nome.trim()) { alerts.error('Nome obrigatório', 'Informe o nome da sala.'); return }
    setSavingSala(true)
    try {
      const payload = {
        nome: salaForm.nome.trim(),
        capacidade: salaForm.capacidade ? Number(salaForm.capacidade) : null,
        equipamentos: salaForm.equipamentos.trim() || null,
        ativo: salaForm.ativo,
      }
      if (salaForm.id) {
        await trpc.agenda.sala.update.mutate({ id: salaForm.id, data: payload })
        alerts.success('Sala atualizada', '')
      } else {
        await trpc.agenda.sala.create.mutate(payload)
        alerts.success('Sala criada', '')
      }
      setSalaModalOpen(false)
      await loadSalas()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSavingSala(false) }
  }
  async function deleteSala(s: AgendaSala) {
    const ok = await alerts.confirm({
      title: 'Desativar sala?',
      text: `A sala "${s.nome}" será desativada — eventos antigos continuam apontando pra ela. Use editar pra reativar depois.`,
      confirmText: 'Desativar', icon: 'warning',
    })
    if (!ok) return
    try {
      await trpc.agenda.sala.delete.mutate({ id: s.id })
      alerts.success('Sala desativada', '')
      await loadSalas()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  if (permsLoading || !canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="administrativo" icon={Settings} />
          <div>
            <h1>Configurações da agenda</h1>
            <p className="text-sm text-muted-foreground">Regras de conflito e cadastro de salas</p>
          </div>
        </div>
        <Button
          variant="outline" size="icon"
          onClick={() => router.push('/agenda')}
          title="Voltar pra Agenda"
          className="h-9 w-9"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* ============================================================
          Card com pills laterais — padrão da casa (CLAUDE.md → "Sub-abas")
      ============================================================ */}
      <Card>
        <CardHeader>
          <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" /> Preferências da agenda
          </h5>
        </CardHeader>
        <div className="flex min-h-[450px]">
          {/* Pills laterais */}
          <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
            <div className="space-y-1">
              {([
                { key: 'regras', label: 'Regras de conflito', icon: Calendar },
                { key: 'salas',  label: 'Salas',              icon: DoorOpen },
              ] as const).map(tab => {
                const Icon = tab.icon
                const active = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                      active
                        ? 'text-white shadow-sm'
                        : 'text-muted-foreground hover:bg-white hover:text-foreground',
                    )}
                    style={active ? { backgroundColor: 'var(--mod-administrativo, #38bdf8)' } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Conteúdo */}
          <div key={activeTab} className="flex-1 p-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>

            {/* ---- SUB-TAB: REGRAS DE CONFLITO ---- */}
            {activeTab === 'regras' && (
              <div className="-m-5">
                <div className="px-5 py-3 border-b border-border">
                  <h4 className="text-[13px] font-semibold text-foreground">Como tratar conflitos</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Antes de salvar um evento, o sistema verifica se há sobreposição de horário com outros eventos
                    onde os mesmos participantes ou a mesma sala estão envolvidos.
                  </p>
                </div>
                <div className="p-5">
                  {!config ? (
                    <div className="py-6 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-12 gap-3">
                      {/* Participante */}
                      <div className="col-span-12 md:col-span-6 space-y-1.5 rounded-lg border border-border bg-muted/40 p-4">
                        <Label className="text-[13px] font-semibold">Conflito de participantes</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Quando um participante já está em outro evento no mesmo horário.
                        </p>
                        <Select
                          value={config.conflitoParticipante}
                          onValueChange={(v) => updateConfigField('conflitoParticipante', v as ConflitoModo)}
                          disabled={savingConfig}
                        >
                          <SelectTrigger className="h-9 text-sm mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MODOS.map(m => (
                              <SelectItem key={m.value} value={m.value}>
                                <span className="font-medium">{m.label}</span>
                                <span className="text-muted-foreground ml-2 text-xs">— {m.description}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Sala */}
                      <div className="col-span-12 md:col-span-6 space-y-1.5 rounded-lg border border-border bg-muted/40 p-4">
                        <Label className="text-[13px] font-semibold">Conflito de sala</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Quando a mesma sala já está reservada em outro evento no mesmo horário.
                        </p>
                        <Select
                          value={config.conflitoSala}
                          onValueChange={(v) => updateConfigField('conflitoSala', v as ConflitoModo)}
                          disabled={savingConfig}
                        >
                          <SelectTrigger className="h-9 text-sm mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MODOS.map(m => (
                              <SelectItem key={m.value} value={m.value}>
                                <span className="font-medium">{m.label}</span>
                                <span className="text-muted-foreground ml-2 text-xs">— {m.description}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ---- SUB-TAB: SALAS ---- */}
            {activeTab === 'salas' && (
              <div className="-m-5">
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <h4 className="text-[13px] font-semibold text-foreground">Salas cadastradas</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{salas.length} sala(s) cadastrada(s)</p>
                  </div>
                  <Button size="sm" onClick={openSalaNew} className="gap-1.5 bg-sky-500 hover:bg-sky-600 text-white">
                    <Plus className="h-3.5 w-3.5" />Nova sala
                  </Button>
                </div>

                {loadingSalas ? (
                  <div className="py-10 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : salas.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Nenhuma sala cadastrada.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-[11px] text-muted-foreground uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">Nome</th>
                        <th className="px-4 py-2 text-left font-semibold">Capacidade</th>
                        <th className="px-4 py-2 text-left font-semibold">Equipamentos</th>
                        <th className="px-4 py-2 text-left font-semibold">Status</th>
                        <th className="px-4 py-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {salas.map(s => (
                        <tr key={s.id} className="border-t border-border hover:bg-muted/20">
                          <td className="px-4 py-2.5 font-medium">{s.nome}</td>
                          <td className="px-4 py-2.5">{s.capacidade ?? '—'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground max-w-xs truncate">{s.equipamentos ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${s.ativo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                              {s.ativo ? 'Ativa' : 'Inativa'}
                            </span>
                          </td>
                          <td className="px-2 py-2.5">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => openSalaEdit(s)} className="text-xs gap-2 cursor-pointer">
                                  <Edit2 className="h-3.5 w-3.5" />Editar
                                </DropdownMenuItem>
                                {s.ativo && (
                                  <DropdownMenuItem onClick={() => deleteSala(s)} className="text-xs gap-2 cursor-pointer text-rose-600 dark:text-rose-400">
                                    <Trash2 className="h-3.5 w-3.5" />Desativar
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

          </div>
        </div>
      </Card>

      {/* ============================== Modal Sala ============================== */}
      <Dialog open={salaModalOpen} onOpenChange={setSalaModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={salaForm.id ? Edit2 : Plus} color={salaForm.id ? 'sky' : 'emerald'}>
            <DialogTitle>{salaForm.id ? 'Editar sala' : 'Nova sala'}</DialogTitle>
            <DialogDescription>
              {salaForm.id ? 'Atualize os dados da sala.' : 'Cadastre uma sala que poderá ser reservada em eventos.'}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Nome *</Label>
              <Input
                className="h-9 text-sm"
                value={salaForm.nome}
                onChange={(e) => setSalaForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Sala de reuniões 1"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Capacidade</Label>
                <Input
                  type="number"
                  className="h-9 text-sm"
                  value={salaForm.capacidade}
                  onChange={(e) => setSalaForm(f => ({ ...f, capacidade: e.target.value }))}
                  placeholder="Ex: 8"
                  min={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Status</Label>
                <Select
                  value={salaForm.ativo ? 'ativa' : 'inativa'}
                  onValueChange={(v) => setSalaForm(f => ({ ...f, ativo: v === 'ativa' }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="inativa">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Equipamentos</Label>
              <Input
                className="h-9 text-sm"
                value={salaForm.equipamentos}
                onChange={(e) => setSalaForm(f => ({ ...f, equipamentos: e.target.value }))}
                placeholder="Ex: TV, projetor, sistema de áudio"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSalaModalOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveSala} disabled={savingSala} className="bg-sky-500 hover:bg-sky-600 text-white gap-1.5">
              {savingSala && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
