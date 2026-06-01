'use client'

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Button, Input, Label, Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Checkbox, RichEditor, Badge, cn,
} from '@saas/ui'
import { Plus, Edit2, Loader2, X, Bell, Mail, CheckSquare } from 'lucide-react'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

type LembreteForm = { canal: 'POPUP' | 'EMAIL'; minutosAntes: number }

interface TarefaExistente {
  id: string
  titulo: string
  descricao: string | null
  prazo: string                                  // ISO
  horaPrazo: string | null
  prioridade: 'BAIXA' | 'NORMAL' | 'ALTA'
  lembretes?: Array<{ canal: 'POPUP' | 'EMAIL'; minutosAntes: number }>
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tarefa?: TarefaExistente | null              // null/undefined = criar; preenchido = editar
  onSaved: () => void
}

function formatarMinutosAntes(min: number): string {
  if (min < 60) return `${min} min antes`
  if (min < 1440) return `${Math.round(min / 60)} h antes`
  return `${Math.round(min / 1440)} dia(s) antes`
}

const PRESETS_LEMBRETE: Array<{ value: string; label: string }> = [
  { value: '5', label: '5 minutos antes' },
  { value: '15', label: '15 minutos antes' },
  { value: '30', label: '30 minutos antes' },
  { value: '60', label: '1 hora antes' },
  { value: '120', label: '2 horas antes' },
  { value: '1440', label: '1 dia antes' },
  { value: '2880', label: '2 dias antes' },
]

export function TarefaModal({ open, onOpenChange, tarefa, onSaved }: Props) {
  const isEdit = !!tarefa
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    prazo: new Date().toISOString().slice(0, 10),
    horaPrazo: '' as string,
    prioridade: 'NORMAL' as 'BAIXA' | 'NORMAL' | 'ALTA',
  })
  const [lembretes, setLembretes] = useState<LembreteForm[]>([])
  const [novoLembreteAntes, setNovoLembreteAntes] = useState('30')
  const [novoLembreteCanal, setNovoLembreteCanal] = useState<'POPUP' | 'EMAIL'>('POPUP')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (tarefa) {
      setForm({
        titulo: tarefa.titulo,
        descricao: tarefa.descricao ?? '',
        prazo: tarefa.prazo.slice(0, 10),
        horaPrazo: tarefa.horaPrazo ?? '',
        prioridade: tarefa.prioridade,
      })
      setLembretes(tarefa.lembretes?.map(l => ({ canal: l.canal, minutosAntes: l.minutosAntes })) ?? [])
    } else {
      setForm({
        titulo: '',
        descricao: '',
        prazo: new Date().toISOString().slice(0, 10),
        horaPrazo: '',
        prioridade: 'NORMAL',
      })
      setLembretes([])
    }
  }, [open, tarefa])

  async function handleSave() {
    if (!form.titulo.trim()) {
      alerts.error('Erro', 'Título é obrigatório.')
      return
    }
    setSaving(true)
    try {
      let tarefaId: string
      const payload = {
        titulo: form.titulo.trim(),
        descricao: form.descricao || undefined,
        prazo: form.prazo,
        horaPrazo: form.horaPrazo || null,
        prioridade: form.prioridade,
      }
      if (isEdit && tarefa) {
        await (trpc.agenda.tarefa as any).update.mutate({ id: tarefa.id, data: payload })
        tarefaId = tarefa.id
      } else {
        const criada = await (trpc.agenda.tarefa as any).create.mutate(payload) as { id: string }
        tarefaId = criada.id
      }
      // Sync lembretes (mesmo que vazio — apaga todos)
      await (trpc.agenda.tarefa.lembrete as any).save.mutate({ tarefaId, lembretes })
        .catch((e: Error) => console.error('[Tarefa] save lembretes:', e.message))
      alerts.success(isEdit ? 'Tarefa atualizada' : 'Tarefa criada', '')
      onOpenChange(false)
      onSaved()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeaderIcon icon={isEdit ? Edit2 : Plus} color={isEdit ? 'sky' : 'emerald'}>
          <DialogTitle>{isEdit ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Atualize os dados da tarefa.' : 'Crie uma tarefa simples com prazo. Sem participantes, sem conflito de horário.'}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          {/* Título */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Título *</Label>
            <Input
              className="h-9 text-sm"
              value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder="O que precisa ser feito?"
              autoFocus
            />
          </div>

          {/* Prazo + Hora + Prioridade */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-5 space-y-1.5">
              <Label className="text-[13px] font-semibold">Prazo *</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={form.prazo}
                onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))}
              />
            </div>
            <div className="col-span-3 space-y-1.5">
              <Label className="text-[13px] font-semibold">Hora <span className="text-[10px] font-normal text-muted-foreground">(opcional)</span></Label>
              <Input
                type="time"
                className="h-9 text-sm"
                value={form.horaPrazo}
                onChange={e => setForm(f => ({ ...f, horaPrazo: e.target.value }))}
              />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label className="text-[13px] font-semibold">Prioridade</Label>
              <Select value={form.prioridade} onValueChange={v => setForm(f => ({ ...f, prioridade: v as 'BAIXA' | 'NORMAL' | 'ALTA' }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAIXA">Baixa</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Descrição</Label>
            <RichEditor
              value={form.descricao}
              onChange={html => setForm(f => ({ ...f, descricao: html }))}
              placeholder="Detalhes da tarefa (opcional)..."
              className="min-h-[80px]"
            />
          </div>

          {/* Lembretes */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
              Lembretes
              <span className="text-[10px] font-normal text-muted-foreground ml-auto">{lembretes.length}/10</span>
            </Label>
            {lembretes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {lembretes.map((l, idx) => (
                  <span key={idx} className={cn(
                    'flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full',
                    l.canal === 'EMAIL'
                      ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                      : 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400',
                  )}>
                    {l.canal === 'EMAIL' ? <Mail className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
                    {formatarMinutosAntes(l.minutosAntes)}
                    <button
                      type="button"
                      onClick={() => setLembretes(arr => arr.filter((_, i) => i !== idx))}
                      className="hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Select value={novoLembreteAntes} onValueChange={setNovoLembreteAntes}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESETS_LEMBRETE.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={novoLembreteCanal} onValueChange={v => setNovoLembreteCanal(v as 'POPUP' | 'EMAIL')}>
                <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POPUP">Notificação</SelectItem>
                  <SelectItem value="EMAIL">E-mail</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={lembretes.length >= 10}
                onClick={() => {
                  const min = parseInt(novoLembreteAntes, 10)
                  if (!Number.isFinite(min) || min < 1) return
                  if (lembretes.some(l => l.canal === novoLembreteCanal && l.minutosAntes === min)) return
                  setLembretes(arr => [...arr, { canal: novoLembreteCanal, minutosAntes: min }])
                }}
              >
                <Plus className="h-3 w-3 mr-1" />Adicionar
              </Button>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
            {isEdit ? 'Salvar' : 'Criar tarefa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
