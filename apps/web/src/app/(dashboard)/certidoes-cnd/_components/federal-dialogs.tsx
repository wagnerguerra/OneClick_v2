'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarClock, CheckCircle2, Loader2, Play, Users, XCircle } from 'lucide-react'
import {
  Button, Badge, Checkbox, Input, Switch, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { limparCnpj } from '@/lib/masks'
import { MODULE_COLOR, LoteItemIcon, formatDoc, toggleSet } from '../_lib/ui'
import { carregarClientesMensais } from '../_lib/api'
import type { ClienteOpcao } from './dialogs'

// ============================================================
// Lote federal (SERPRO) — escolhe os clientes, roda em segundo plano
// ============================================================

interface ProgressoFederal { running: boolean; total: number; atual: number; sucesso: number; falhas: number; pulados: number; item: string; erros: string[] }

export function FederalLoteDialog({ open, onOpenChange, onConcluido }: { open: boolean; onOpenChange: (o: boolean) => void; onConcluido: () => void }) {
  const [clientes, setClientes] = useState<ClienteOpcao[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [forcar, setForcar] = useState(false)
  const [prog, setProg] = useState<ProgressoFederal | null>(null)
  const [iniciando, setIniciando] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const parar = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  function acompanhar() {
    parar()
    pollRef.current = setInterval(async () => {
      try {
        const p = await trpc.cnd.progressoLote.query() as ProgressoFederal
        setProg(p)
        if (!p.running) {
          parar()
          alerts.success('Consulta em lote concluída', `${p.sucesso} sucesso, ${p.falhas} falha(s), ${p.pulados} já válida(s)`)
          onConcluido()
        }
      } catch { /* próximo ciclo */ }
    }, 3000)
  }

  useEffect(() => {
    if (!open) { parar(); return }
    setBusca(''); setForcar(false); setProg(null)
    carregarClientesMensais().then(l => { setClientes(l); setSel(new Set(l.map(c => c.id))) }).catch(() => setClientes([]))
    // Lote já rodando (aberto por outra pessoa ou antes de recarregar): acompanha.
    trpc.cnd.progressoLote.query().then(p => { const pf = p as ProgressoFederal; if (pf.running) { setProg(pf); acompanhar() } }).catch(() => {})
    return parar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function iniciar() {
    const docs = clientes.filter(c => sel.has(c.id)).map(c => limparCnpj(c.documento))
    if (docs.length === 0) { alerts.error('Atenção', 'Selecione ao menos um cliente'); return }
    setIniciando(true)
    try {
      await trpc.cnd.consultarLote.mutate({ documentos: docs, forcarNova: forcar })
      setProg({ running: true, total: docs.length, atual: 0, sucesso: 0, falhas: 0, pulados: 0, item: 'Iniciando...', erros: [] })
      acompanhar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setIniciando(false) }
  }

  const rodando = !!prog?.running
  const t = busca.trim().toLowerCase()
  const lista = clientes.filter(c => !t || c.razaoSocial.toLowerCase().includes(t) || limparCnpj(c.documento).includes(limparCnpj(busca)))
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && rodando) return; onOpenChange(o) }}>
      <DialogContent className="max-w-[560px]">
        <DialogHeaderIcon icon={Users} color="sky">
          <DialogTitle>CND Federal — Lote</DialogTitle>
          <DialogDescription>Consulta a CND de vários clientes mensais (SERPRO)</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          {!prog ? (<>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[10px]">{sel.size} selecionado(s)</Badge>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSel(new Set(clientes.map(c => c.id)))}>Todos</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSel(new Set())}>Nenhum</Button>
              </div>
            </div>
            <Input placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} className="h-8 text-xs" />
            <div className="nice-scrollbar max-h-[250px] overflow-y-auto rounded-lg border">
              {lista.map(c => (
                <label key={c.id} className={cn('flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-xs last:border-b-0 hover:bg-muted/30', sel.has(c.id) && 'bg-muted/40')}>
                  <Checkbox checked={sel.has(c.id)} onCheckedChange={v => setSel(prev => toggleSet(prev, c.id, !!v))} />
                  <span className="min-w-0 flex-1 truncate">{c.razaoSocial}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatDoc(c.documento)}</span>
                </label>
              ))}
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs">
              <Checkbox checked={forcar} onCheckedChange={v => setForcar(!!v)} className="mt-0.5" />
              <span>
                <span className="font-medium text-foreground">Forçar nova emissão</span>
                <span className="block text-muted-foreground">Sem isso, cliente com CND ainda válida é pulado (cada consulta SERPRO é cobrada).</span>
              </span>
            </label>
          </>) : (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{prog.running ? 'Consultando' : 'Concluído'}</span>
                  <span className="font-medium tabular-nums">{prog.atual} / {prog.total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${prog.total ? (prog.atual / prog.total) * 100 : 0}%`, backgroundColor: MODULE_COLOR }} />
                </div>
              </div>
              {prog.running && prog.item && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 shrink-0 animate-spin" /><span className="truncate">{prog.item}</span></div>}
              <div className="grid grid-cols-3 gap-2">
                {([{ v: prog.sucesso, l: 'Sucesso', c: TEXT.emerald }, { v: prog.falhas, l: 'Falhas', c: TEXT.red }, { v: prog.pulados, l: 'Já válidas', c: TEXT.sky }]).map(k => (
                  <div key={k.l} className="rounded-lg border bg-muted/30 p-2 text-center"><p className={cn('text-lg font-bold tabular-nums', k.c)}>{k.v}</p><p className="text-[10px] text-muted-foreground">{k.l}</p></div>
                ))}
              </div>
              {prog.erros.length > 0 && (
                <div className="nice-scrollbar max-h-[150px] divide-y overflow-y-auto rounded-lg border">
                  {prog.erros.map((erro, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                      <XCircle className={cn('h-3 w-3 shrink-0', TEXT.red)} /><span className="truncate">{erro}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={rodando} onClick={() => onOpenChange(false)}>Fechar</Button>
          {!prog && (
            <Button size="sm" className="gap-1.5" disabled={iniciando || sel.size === 0} onClick={iniciar}>
              {iniciando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Consultar ({sel.size})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Agendamento automático (só MASTER salva/executa — o backend recusa os demais)
// ============================================================

const DIAS_SEMANA = [
  { key: '1', label: 'Seg' }, { key: '2', label: 'Ter' }, { key: '3', label: 'Qua' },
  { key: '4', label: 'Qui' }, { key: '5', label: 'Sex' }, { key: '6', label: 'Sáb' }, { key: '0', label: 'Dom' },
]
const HORAS = Array.from({ length: 24 }, (_, i) => i)

function parseCron(cron: string) {
  const parts = cron.split(' ')
  if (parts.length < 5) return { dias: ['1'], horas: [7] }
  const horasStr = parts[1] || '7'
  const diasStr = parts[4] || '*'
  return {
    horas: horasStr === '*' ? [7] : horasStr.split(',').map(Number),
    dias: diasStr === '*' ? ['1', '2', '3', '4', '5', '6', '0'] : diasStr.split(','),
  }
}
const buildCron = (dias: string[], horas: number[]) => `0 ${[...horas].sort((a, b) => a - b).join(',')} * * ${dias.length === 7 ? '*' : dias.join(',')}`

interface ScheduleConfig { enabled: boolean; cron: string; delayMs?: number; clienteIds?: string[] }
interface ScheduleProgress { current: number; total: number; currentCliente: string; status: string; items: Array<{ razaoSocial: string; status: string; erro?: string }> }

export function AgendamentoDialog({ open, onOpenChange, onConcluido }: { open: boolean; onOpenChange: (o: boolean) => void; onConcluido: () => void }) {
  const [cfg, setCfg] = useState<ScheduleConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [prog, setProg] = useState<ScheduleProgress | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const parar = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  async function carregar() {
    const s = await trpc.cnd.schedule.get.query() as { config: ScheduleConfig }
    setCfg(s.config)
  }

  useEffect(() => {
    if (!open) { parar(); return }
    setLoading(true)
    carregar().catch(e => alerts.error('Erro', (e as Error).message)).finally(() => setLoading(false))
    return parar
  }, [open])

  async function salvar() {
    if (!cfg) return
    setSaving(true)
    try {
      await trpc.cnd.schedule.update.mutate({ enabled: cfg.enabled, cron: cfg.cron, delayMs: cfg.delayMs, clienteIds: cfg.clienteIds })
      alerts.success('Agendamento salvo')
      await carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSaving(false) }
  }

  async function executarAgora() {
    try {
      const r = await trpc.cnd.schedule.runNow.mutate() as { message: string }
      alerts.success('Execução', r.message)
      setProg({ current: 0, total: 0, currentCliente: 'Iniciando...', status: 'running', items: [] })
      parar()
      pollRef.current = setInterval(async () => {
        try {
          const p = await trpc.cnd.schedule.progress.query() as ScheduleProgress
          setProg(p)
          if (p?.status === 'idle') { parar(); await carregar(); onConcluido() }
        } catch { /* próximo ciclo */ }
      }, 2000)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const parsed = cfg ? parseCron(cfg.cron) : null
  const pill = (ativo: boolean) => cn('rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-all', ativo ? 'text-white shadow-sm' : 'border-border/60 text-muted-foreground hover:border-foreground/30')
  const pillStyle = (ativo: boolean) => ativo ? { backgroundColor: MODULE_COLOR, borderColor: MODULE_COLOR } : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[620px]">
        <DialogHeaderIcon icon={CalendarClock} color="violet">
          <DialogTitle>Agendamento automático — CND Federal</DialogTitle>
          <DialogDescription>Configure a consulta automática de certidões</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody>
          {loading || !cfg || !parsed ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando...</div>
          ) : (
            <div className="space-y-5">
              <label className="flex items-center gap-2.5 text-sm font-medium">
                <Switch checked={cfg.enabled} onCheckedChange={v => setCfg({ ...cfg, enabled: v })} />
                Agendamento {cfg.enabled ? 'ativado' : 'desativado'}
              </label>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold">Dias da semana</label>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS_SEMANA.map(d => {
                    const ativo = parsed.dias.includes(d.key)
                    return (
                      <button key={d.key} type="button" className={pill(ativo)} style={pillStyle(ativo)} onClick={() => {
                        const dias = ativo ? parsed.dias.filter(x => x !== d.key) : [...parsed.dias, d.key]
                        if (dias.length) setCfg({ ...cfg, cron: buildCron(dias, parsed.horas) })
                      }}>{d.label}</button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold">Horários</label>
                <div className="flex flex-wrap gap-1">
                  {HORAS.map(h => {
                    const ativo = parsed.horas.includes(h)
                    return (
                      <button key={h} type="button" className={cn(pill(ativo), 'min-w-[40px] px-2 py-1 font-mono')} style={pillStyle(ativo)} onClick={() => {
                        const horas = ativo ? parsed.horas.filter(x => x !== h) : [...parsed.horas, h]
                        if (horas.length) setCfg({ ...cfg, cron: buildCron(parsed.dias, horas) })
                      }}>{String(h).padStart(2, '0')}h</button>
                    )
                  })}
                </div>
              </div>
              {prog?.status === 'running' && (
                <div className="overflow-hidden rounded-lg border">
                  <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="font-medium">Processando {prog.current}/{prog.total}</span>
                  </div>
                  <div className="h-1.5 bg-muted"><div className="h-full transition-all duration-500" style={{ width: `${prog.total > 0 ? (prog.current / prog.total) * 100 : 0}%`, backgroundColor: MODULE_COLOR }} /></div>
                  <div className="nice-scrollbar max-h-[200px] divide-y overflow-y-auto">
                    {prog.items.map((item, i) => (
                      <div key={i} className={cn('flex items-center gap-2 px-3 py-1.5 text-[11px]', item.status === 'processando' && 'bg-muted/40 font-medium')}>
                        <LoteItemIcon status={item.status} />
                        <span className="min-w-0 flex-1 truncate">{item.razaoSocial}</span>
                        {item.erro && <span className={cn('max-w-[150px] truncate text-[10px]', TEXT.red)}>{item.erro}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={executarAgora} disabled={prog?.status === 'running'} className="gap-1.5"><Play className="h-3.5 w-3.5" />Executar agora</Button>
          <Button size="sm" onClick={salvar} disabled={saving || !cfg} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
