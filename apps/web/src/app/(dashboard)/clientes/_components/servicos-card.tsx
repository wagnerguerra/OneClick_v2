'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Briefcase, Save, Loader2, MoreVertical, Settings, CalendarOff,
  Plus, Trash2, Copy, ChevronDown,
} from 'lucide-react'
import {
  Button, Input, Label, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Checkbox,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter,
  DialogTitle, DialogDescription, DialogClose,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { toDateInputValue } from '@/lib/date'
import { useSession } from '@/lib/auth-client'
import { useClientesPerms } from './use-clientes-perms'

// ============================================================
// Types
// ============================================================

interface AreaRow {
  areaId: string
  areaNome: string
  areaLeaderId: string | null
  contratado: boolean
  responsavelId: string | null
  substitutoId: string | null
  responsavelNome: string | null
  substitutoNome: string | null
  dataEncerramento: string | null
  observacoes: string | null
  complexidadePeso: number
  clienteAreaContratadaId: string | null
}

interface UserOption { id: string; name: string; areaId: string | null }

interface Parametro {
  id?: string
  tipo: string
  nome: string
  descricao?: string
  valor: number
}

// ============================================================
// Main Component
// ============================================================

export function ServicosCard({ clienteId }: { clienteId: string }) {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id
  const isMaster = (session?.user as any)?.role === 'master' || (session?.user as any)?.isMaster
  const { canManageServices } = useClientesPerms()

  const [rows, setRows] = useState<AreaRow[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Dialogs
  const [paramDialog, setParamDialog] = useState<{ open: boolean; row?: AreaRow }>({ open: false })
  const [encerrDialog, setEncerrDialog] = useState<{ open: boolean; index?: number }>({ open: false })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (trpc.cliente as any).servicosListar.query({ clienteId })
      setRows(result.areas)
      setUsers(result.usuarios)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [clienteId])

  useEffect(() => { fetchData() }, [fetchData])

  function updateRow(index: number, patch: Partial<AreaRow>) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await (trpc.cliente as any).servicosSalvar.mutate({
        clienteId,
        items: rows.map(r => ({
          areaId: r.areaId,
          contratado: r.contratado,
          responsavelId: r.responsavelId,
          substitutoId: r.substitutoId,
          dataEncerramento: r.dataEncerramento,
          observacoes: r.observacoes,
        })),
      })
      await alerts.success('Salvo', 'Servicos atualizados com sucesso.')
      setDirty(false)
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Nao foi possivel salvar os servicos.')
    } finally { setSaving(false) }
  }

  function getUsersForArea(areaId: string) {
    return users.filter(u => !u.areaId || u.areaId === areaId)
  }

  function openParametros(row: AreaRow) {
    if (!row.contratado) {
      alerts.error('Area nao contratada', 'Marque a area como contratada antes de gerenciar parametros.')
      return
    }
    if (!row.clienteAreaContratadaId) {
      alerts.error('Salve primeiro', 'Salve os servicos antes de gerenciar parametros.')
      return
    }
    setParamDialog({ open: true, row })
  }

  function openEncerramento(index: number) {
    const row = rows[index]
    if (!row?.contratado) {
      alerts.error('Area nao contratada', 'Marque a area como contratada antes de definir encerramento.')
      return
    }
    setEncerrDialog({ open: true, index })
  }

  if (loading) {
    return (
      <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando servicos...
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Nenhuma area cadastrada para esta empresa.</p>
        <p className="text-xs mt-1">Cadastre areas no modulo de Areas primeiro.</p>
      </Card>
    )
  }

  return (
    <>
      <Card>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-5 py-3">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-emerald-600" /> Servicos Contratados
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">Gerencie as areas contratadas, responsaveis e parametros.</p>
          </div>
          {canManageServices && (
            <Button variant="success" size="sm" onClick={handleSave} disabled={saving || !dirty} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[220px]">Area contratada</TableHead>
                <TableHead>Responsavel</TableHead>
                <TableHead>Substituto(a)</TableHead>
                <TableHead className="w-[60px] text-center">Peso</TableHead>
                <TableHead className="w-[80px] text-center">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const areaUsers = getUsersForArea(row.areaId)
                const hasEncerramento = !!row.dataEncerramento
                const canChangeResp = isMaster || currentUserId === row.areaLeaderId

                return (
                  <TableRow
                    key={row.areaId}
                    className={cn(
                      'transition-opacity',
                      !row.contratado && 'opacity-45',
                    )}
                  >
                    {/* Area + checkbox */}
                    <TableCell>
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <Checkbox
                          checked={row.contratado}
                          onCheckedChange={(v) => updateRow(i, { contratado: !!v })}
                        />
                        <span className="text-sm font-medium">{row.areaNome}</span>
                        {hasEncerramento && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-medium">
                            <CalendarOff className="h-2.5 w-2.5" /> Encerrado
                          </span>
                        )}
                      </label>
                    </TableCell>

                    {/* Responsavel */}
                    <TableCell>
                      <Select
                        value={row.responsavelId || '__none__'}
                        onValueChange={(v) => updateRow(i, { responsavelId: v === '__none__' ? null : v })}
                        disabled={!row.contratado || !canChangeResp}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          {areaUsers.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                          {row.responsavelId && !areaUsers.find(u => u.id === row.responsavelId) && (
                            <SelectItem value={row.responsavelId}>
                              {row.responsavelNome || row.responsavelId} (fora da area)
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Substituto */}
                    <TableCell>
                      <Select
                        value={row.substitutoId || '__none__'}
                        onValueChange={(v) => updateRow(i, { substitutoId: v === '__none__' ? null : v })}
                        disabled={!row.contratado || !canChangeResp}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          {areaUsers.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                          {row.substitutoId && !areaUsers.find(u => u.id === row.substitutoId) && (
                            <SelectItem value={row.substitutoId}>
                              {row.substitutoNome || row.substitutoId} (fora da area)
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Complexidade */}
                    <TableCell className="text-center">
                      {row.complexidadePeso > 0 ? (
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          row.complexidadePeso <= 2 ? 'bg-emerald-100 text-emerald-700' :
                          row.complexidadePeso <= 3.5 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700',
                        )}>
                          {row.complexidadePeso.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">--</span>
                      )}
                    </TableCell>

                    {/* Acoes */}
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" disabled={!row.contratado}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => openParametros(row)}>
                            <Settings className="h-4 w-4" /> Gerenciar Parametros
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEncerramento(i)}>
                            <CalendarOff className="h-4 w-4" /> Rotina de Encerramento
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {/* Footer info */}
        <div className="border-t border-border/60 bg-muted/20 px-5 py-2.5">
          <p className="text-[11px] text-muted-foreground">
            {rows.filter(r => r.contratado).length} de {rows.length} areas contratadas
            {dirty && <span className="ml-2 text-amber-600 font-medium">Alteracoes nao salvas</span>}
          </p>
        </div>
      </Card>

      {/* Dialogs */}
      {paramDialog.open && paramDialog.row && (
        <ParametrosDialog
          open={paramDialog.open}
          onClose={() => setParamDialog({ open: false })}
          clienteAreaContratadaId={paramDialog.row.clienteAreaContratadaId!}
          areaNome={paramDialog.row.areaNome}
          clienteId={clienteId}
        />
      )}

      {encerrDialog.open && encerrDialog.index !== undefined && (
        <EncerramentoDialog
          open={encerrDialog.open}
          onClose={() => setEncerrDialog({ open: false })}
          row={rows[encerrDialog.index]!}
          onSave={(data) => {
            updateRow(encerrDialog.index!, data)
            setEncerrDialog({ open: false })
          }}
        />
      )}
    </>
  )
}

// ============================================================
// Dialog: Gerenciar Parametros
// ============================================================

function ParametrosDialog({ open, onClose, clienteAreaContratadaId, areaNome, clienteId }: {
  open: boolean
  onClose: () => void
  clienteAreaContratadaId: string
  areaNome: string
  clienteId: string
}) {
  const [params, setParams] = useState<Parametro[]>([])
  const [media, setMedia] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newTipo, setNewTipo] = useState('Geral')

  // Copiar estrutura
  const [copiarOpen, setCopiarOpen] = useState(false)
  const [copiarClientes, setCopiarClientes] = useState<Array<{ id: string; razaoSocial: string }>>([])
  const [copiarSelected, setCopiarSelected] = useState('')
  const [copiarLoading, setCopiarLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    ;(trpc.cliente as any).servicosGetParametros.query({ clienteAreaContratadaId })
      .then((r: any) => { setParams(r.parametros); setMedia(r.media) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, clienteAreaContratadaId])

  function addParam() {
    setParams(prev => [...prev, { tipo: newTipo, nome: '', valor: 0 }])
  }

  function updateParam(index: number, patch: Partial<Parametro>) {
    setParams(prev => prev.map((p, i) => i === index ? { ...p, ...patch } : p))
  }

  function removeParam(index: number) {
    setParams(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    const valid = params.filter(p => p.nome.trim())
    if (valid.length === 0 && params.length > 0) {
      alerts.error('Erro', 'Preencha o nome de todos os parametros.')
      return
    }
    setSaving(true)
    try {
      await (trpc.cliente as any).servicosSaveParametros.mutate({
        clienteAreaContratadaId,
        params: valid.map(p => ({ tipo: p.tipo, nome: p.nome, descricao: p.descricao || '', valor: p.valor })),
      })
      await alerts.success('Salvo', 'Parametros atualizados.')
      onClose()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSaving(false) }
  }

  async function openCopiarEstrutura() {
    setCopiarLoading(true)
    setCopiarOpen(true)
    try {
      const result = await (trpc.cliente as any).servicosClientesParaCopiar.query({ clienteId })
      setCopiarClientes(result)
    } catch { /* silent */ }
    finally { setCopiarLoading(false) }
  }

  async function confirmarCopia() {
    if (!copiarSelected) return
    const ok = await alerts.confirm({
      title: 'Copiar estrutura',
      text: 'Isso substituira todos os parametros atuais desta area. Deseja continuar?',
      confirmText: 'Copiar',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.cliente as any).servicosCopiarEstrutura.mutate({
        fromClienteId: copiarSelected,
        toClienteAreaContratadaId: clienteAreaContratadaId,
      })
      // Reload
      const r = await (trpc.cliente as any).servicosGetParametros.query({ clienteAreaContratadaId })
      setParams(r.parametros)
      setMedia(r.media)
      setCopiarOpen(false)
      await alerts.success('Copiado', 'Estrutura copiada com sucesso.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  const calcMedia = params.length > 0
    ? Math.round((params.reduce((s, p) => s + p.valor, 0) / params.length) * 10) / 10
    : 0

  const tipos = [...new Set(params.map(p => p.tipo).filter(Boolean))]
  if (!tipos.includes('Geral')) tipos.push('Geral')

  const VALOR_LABELS: Record<number, string> = {
    0: 'Irrelevante', 0.5: 'Muito Baixa', 1: 'Baixa', 1.5: 'Baixa-Media',
    2: 'Media-Baixa', 2.5: 'Media', 3: 'Media-Alta', 3.5: 'Alta-Media',
    4: 'Alta', 4.5: 'Muito Alta', 5: 'Muito Importante',
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[700px]">
        <DialogHeaderIcon icon={Settings} color="violet">
          <DialogTitle>Parametros — {areaNome}</DialogTitle>
          <DialogDescription>
            Media geral: <span className="font-semibold text-emerald-600">{calcMedia}</span> | {params.length} parametro(s)
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Params by tipo */}
              {tipos.sort().map(tipo => {
                const tipoParams = params.map((p, i) => ({ ...p, _index: i })).filter(p => p.tipo === tipo)
                if (tipoParams.length === 0) return null
                return (
                  <div key={tipo}>
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                      <ChevronDown className="h-3 w-3" /> {tipo}
                    </div>
                    <div className="space-y-1.5">
                      {tipoParams.map(p => (
                        <div key={p._index} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center rounded-md border border-border/50 bg-card px-3 py-2">
                          <div className="space-y-1">
                            <Input
                              value={p.nome}
                              onChange={e => updateParam(p._index, { nome: e.target.value })}
                              placeholder="Nome do parametro"
                              className="h-7 text-xs border-0 p-0 focus-visible:ring-0 shadow-none"
                            />
                            <Input
                              value={p.descricao || ''}
                              onChange={e => updateParam(p._index, { descricao: e.target.value })}
                              placeholder="Descricao (opcional)"
                              className="h-6 text-[10px] text-muted-foreground border-0 p-0 focus-visible:ring-0 shadow-none"
                            />
                          </div>
                          <div className="text-center">
                            <input
                              type="range"
                              min={0} max={5} step={0.5}
                              value={p.valor}
                              onChange={e => updateParam(p._index, { valor: parseFloat(e.target.value) })}
                              className="w-full h-1.5 accent-emerald-600"
                            />
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {p.valor} — {VALOR_LABELS[p.valor] || ''}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon-sm" onClick={() => removeParam(p._index)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Add param */}
              <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                <Select value={newTipo} onValueChange={setNewTipo}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tipos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={addParam} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Adicionar parametro
                </Button>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={openCopiarEstrutura} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Copiar de outro cliente
                </Button>
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="success" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Parametros
          </Button>
          <DialogClose asChild>
            <Button variant="outline" size="sm">Cancelar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>

      {/* Copiar estrutura sub-dialog */}
      {copiarOpen && (
        <Dialog open={copiarOpen} onOpenChange={(o) => { if (!o) setCopiarOpen(false) }}>
          <DialogContent className="max-w-md">
            <DialogHeaderIcon icon={Copy} color="sky">
              <DialogTitle>Copiar estrutura de parametros</DialogTitle>
              <DialogDescription>Selecione o cliente de origem. Os parametros atuais serao substituidos.</DialogDescription>
            </DialogHeaderIcon>
            <DialogBody>
              {copiarLoading ? (
                <div className="py-4 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
              ) : copiarClientes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum cliente com parametros encontrado.</p>
              ) : (
                <Select value={copiarSelected || '__none__'} onValueChange={(v) => setCopiarSelected(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione...</SelectItem>
                    {copiarClientes.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.razaoSocial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="success" size="sm" onClick={confirmarCopia} disabled={!copiarSelected}>Copiar</Button>
              <Button variant="outline" size="sm" onClick={() => setCopiarOpen(false)}>Cancelar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  )
}

// ============================================================
// Dialog: Rotina de Encerramento
// ============================================================

function EncerramentoDialog({ open, onClose, row, onSave }: {
  open: boolean
  onClose: () => void
  row: AreaRow
  onSave: (data: { dataEncerramento: string | null; observacoes: string | null }) => void
}) {
  const [data, setData] = useState(toDateInputValue(row.dataEncerramento))
  const [obs, setObs] = useState(row.observacoes || '')

  function handleSave() {
    onSave({
      dataEncerramento: data || null,
      observacoes: obs.trim() || null,
    })
  }

  function handleClear() {
    onSave({ dataEncerramento: null, observacoes: null })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeaderIcon icon={CalendarOff} color="amber">
          <DialogTitle>Rotina de Encerramento — {row.areaNome}</DialogTitle>
          <DialogDescription>Defina a data e observacoes do encerramento desta area.</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Data de Encerramento</Label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Observacoes</Label>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              maxLength={1000}
              rows={4}
              className="w-full rounded-md border bg-card px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Motivo do encerramento, detalhes..."
            />
            <p className="text-[10px] text-muted-foreground text-right">{obs.length}/1000</p>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="success" size="sm" onClick={handleSave} className="gap-1.5">
            <Save className="h-4 w-4" /> Salvar
          </Button>
          {(row.dataEncerramento || row.observacoes) && (
            <Button variant="soft-destructive" size="sm" onClick={handleClear}>Limpar encerramento</Button>
          )}
          <DialogClose asChild>
            <Button variant="outline" size="sm">Cancelar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
