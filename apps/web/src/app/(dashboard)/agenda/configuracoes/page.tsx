'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Calendar, Plus, Edit2, Trash2, MoreVertical, Loader2, Settings, DoorOpen,
  Mail, Send, X, ChevronDown, Search, RefreshCw, Check, FileText, Eye, Upload, GripVertical,
} from 'lucide-react'
import {
  Button, Input, Label, Card, CardHeader, Badge, RichEditor,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Checkbox,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const EMOJI_OPCOES =['📅', '💼', '🏢', '🌟', '📌', '📞', '🤝', '💻', '🎓', '🛠️', '⚖️', '🏛️', '🏖️', '🎉', '📋', '🔔', '🚀', '👥', '💰', '📈', '🩺', '🍽️']

type GrupoModelo = { uid: string; nome: string; cor: string; icone: string; incluiParticulares: boolean; tiposIds: string[] }

// ── Builder do card de evento: catálogo de elementos (ordem + visibilidade). ──
type CardEl = { key: string; visivel: boolean }
const CARD_EL_LABELS: Record<string, { label: string; hint: string }> = {
  titulo:        { label: 'Título', hint: 'Nome do evento' },
  categoria:     { label: 'Categoria', hint: 'Pill colorida do tipo' },
  modalidade:    { label: 'Modalidade', hint: 'Presencial / Online / Híbrido' },
  local:         { label: 'Local', hint: 'Sala ou local informado' },
  data:          { label: 'Data', hint: 'dd/mm/aaaa do evento' },
  link:          { label: 'Link', hint: 'Link da reunião/online' },
  participantes: { label: 'Participantes', hint: 'Chips com os nomes' },
  criador:       { label: 'Agendado por', hint: 'Quem criou o evento' },
  contato:       { label: 'Contato', hint: 'Contato informado no evento' },
  descricao:     { label: 'Descrição', hint: 'Texto/observações do evento' },
}
const DEFAULT_CARD_ELS: CardEl[] = [
  { key: 'titulo', visivel: true }, { key: 'categoria', visivel: true }, { key: 'modalidade', visivel: true },
  { key: 'local', visivel: true }, { key: 'link', visivel: true }, { key: 'participantes', visivel: true },
  { key: 'criador', visivel: true }, { key: 'data', visivel: false }, { key: 'contato', visivel: false },
  { key: 'descricao', visivel: false },
]

// Linha arrastável de um elemento do card (dnd-kit).
function SortableCardElRow({ el, onToggle }: { el: CardEl; onToggle: (v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: el.key })
  const meta = CARD_EL_LABELS[el.key] || { label: el.key, hint: '' }
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 10 : undefined }
  return (
    <div ref={setNodeRef} style={style} className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5', el.visivel ? 'border-border bg-card' : 'border-dashed border-border bg-muted/30')}>
      <button type="button" {...attributes} {...listeners} className="h-7 w-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:bg-muted cursor-grab active:cursor-grabbing touch-none" title="Arrastar para reordenar"><GripVertical className="h-4 w-4" /></button>
      <div className="flex-1 min-w-0">
        <p className={cn('text-[13px] font-medium leading-tight', !el.visivel && 'text-muted-foreground')}>{meta.label}</p>
        <p className="text-[11px] text-muted-foreground leading-tight truncate">{meta.hint}</p>
      </div>
      <Checkbox checked={el.visivel} onCheckedChange={v => onToggle(!!v)} title={el.visivel ? 'Visível' : 'Oculto'} />
    </div>
  )
}

// Card de grupo arrastável (dnd-kit sortable) — usado no editor do modelo de e-mail.
function SortableGrupoCard({ grupo, tiposModelo, tiposEmOutrosGrupos, onPatch, onRemove }: {
  grupo: GrupoModelo
  tiposModelo: Array<{ id: string; nome: string; cor: string }>
  tiposEmOutrosGrupos: string[]
  onPatch: (patch: Partial<GrupoModelo>) => void
  onRemove: () => void
}) {
  // Cada tipo pertence a no máximo um grupo: os usados por OUTROS grupos saem da lista.
  const disponiveis = tiposModelo.filter(t => !tiposEmOutrosGrupos.includes(t.id))
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: grupo.uid })
  const [emojiOpen, setEmojiOpen] = useState(false)
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 10 : undefined }
  return (
    <div ref={setNodeRef} style={style} className="rounded-md border border-border bg-card p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" {...attributes} {...listeners} className="h-8 w-6 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:bg-muted cursor-grab active:cursor-grabbing touch-none" title="Arrastar para reordenar"><GripVertical className="h-4 w-4" /></button>
        <DropdownMenu open={emojiOpen} onOpenChange={setEmojiOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="h-8 w-10 shrink-0 flex items-center justify-center rounded-md border border-border text-lg hover:bg-muted" title="Trocar ícone">{grupo.icone || '📅'}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-2">
            <div className="grid grid-cols-6 gap-1">
              {EMOJI_OPCOES.map(em => (
                <button key={em} type="button" onClick={() => { onPatch({ icone: em }); setEmojiOpen(false) }}
                  className={cn('h-8 w-8 flex items-center justify-center rounded text-lg hover:bg-muted', grupo.icone === em && 'bg-muted ring-1 ring-ring')}>{em}</button>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <Input className="h-8 text-sm flex-1" value={grupo.nome} onChange={e => onPatch({ nome: e.target.value })} />
        <Input type="color" className="h-8 w-10 p-1 shrink-0" value={grupo.cor} onChange={e => onPatch({ cor: e.target.value })} title="Cor do grupo" />
        <button type="button" onClick={onRemove} className="h-8 w-8 shrink-0 flex items-center justify-center rounded text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">Tipos de evento deste grupo:</p>
        <div className="flex flex-wrap gap-1">
          {disponiveis.map(t => {
            const on = grupo.tiposIds.includes(t.id)
            return (
              <button key={t.id} type="button"
                onClick={() => onPatch({ tiposIds: on ? grupo.tiposIds.filter(id => id !== t.id) : [...grupo.tiposIds, t.id] })}
                className={cn(
                  'inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                  on
                    ? 'bg-foreground/10 dark:bg-foreground/15 border-foreground/20 text-foreground font-medium'
                    : 'bg-transparent border-border text-muted-foreground hover:bg-muted/60',
                )}>
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.cor }} />
                {t.nome}
              </button>
            )
          })}
          {tiposModelo.length === 0 && <span className="text-[10px] text-muted-foreground italic">Nenhum tipo cadastrado.</span>}
          {tiposModelo.length > 0 && disponiveis.length === 0 && <span className="text-[10px] text-muted-foreground italic">Todos os tipos já estão em outros grupos.</span>}
        </div>
      </div>
    </div>
  )
}

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

interface DisparoConfig {
  id: string
  ativo: boolean
  horario: string             // HH:MM
  diasSemana: number[]        // 0=dom..6=sab
  enviarParaTodos: boolean
  destinatariosIds: string[]
}

interface UsuarioMini {
  id: string
  name: string
}

const DIAS_SEMANA = [
  { num: 1, label: 'Seg' },
  { num: 2, label: 'Ter' },
  { num: 3, label: 'Qua' },
  { num: 4, label: 'Qui' },
  { num: 5, label: 'Sex' },
  { num: 6, label: 'Sáb' },
  { num: 0, label: 'Dom' },
]

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
  const [activeTab, setActiveTab] = useState<'regras' | 'salas' | 'disparo' | 'modelo'>('regras')
  const [config, setConfig] = useState<AgendaConfig | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)

  const [salas, setSalas] = useState<AgendaSala[]>([])
  const [loadingSalas, setLoadingSalas] = useState(true)
  const [salaModalOpen, setSalaModalOpen] = useState(false)
  const [salaForm, setSalaForm] = useState<{ id: string | null; nome: string; capacidade: string; equipamentos: string; ativo: boolean }>({
    id: null, nome: '', capacidade: '', equipamentos: '', ativo: true,
  })
  const [savingSala, setSavingSala] = useState(false)

  // === Disparo automático ===
  const [disparo, setDisparo] = useState<DisparoConfig | null>(null)
  const [savingDisparo, setSavingDisparo] = useState(false)
  const [usuarios, setUsuarios] = useState<UsuarioMini[]>([])
  const [enviandoTeste, setEnviandoTeste] = useState(false)
  const [testeDestId, setTesteDestId] = useState<string>('')

  // === Histórico de disparos ===
  interface DisparoLog {
    id: string
    disparadoEm: string
    dataReferencia: string
    modo: 'auto' | 'teste' | 'reenvio'
    enviados: number
    falhas: number
    destinatarios: string[]
    erros: Array<{ userId: string; motivo: string }> | null
    triggeredBy: string | null
    triggeredByUser: { id: string; name: string | null } | null
  }
  const [logs, setLogs] = useState<DisparoLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [reenviandoId, setReenviandoId] = useState<string | null>(null)
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

  // ── Modelo de e-mail configurável ──
  type EmailTpl = {
    id: string; ativo: boolean; assunto: string; accent: string; larguraMax: number; logoUrl: string
    headerHtml: string; introHtml: string; footerHtml: string; eventoLinhaHtml: string; semEventosHtml: string
    cardModo: 'builder' | 'html'; cardElementos: string
    mostrarOutros: boolean; nomeGrupoOutros: string; nomeGrupoParticulares: string; corParticulares: string
  }
  type EmailGrp = GrupoModelo
  const [tpl, setTpl] = useState<EmailTpl | null>(null)
  const [cardEls, setCardEls] = useState<CardEl[]>(DEFAULT_CARD_ELS)
  const [grupos, setGrupos] = useState<EmailGrp[]>([])
  const [tiposModelo, setTiposModelo] = useState<Array<{ id: string; nome: string; cor: string }>>([])
  const [loadingTpl, setLoadingTpl] = useState(false)
  const [savingTpl, setSavingTpl] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [enviandoTesteModelo, setEnviandoTesteModelo] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const setTplField = (k: keyof EmailTpl, v: unknown) => setTpl(t => (t ? { ...t, [k]: v } as EmailTpl : t))
  const [loadingCardHtml, setLoadingCardHtml] = useState(false)
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  function onDragEndGrupos(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setGrupos(gs => {
      const from = gs.findIndex(g => g.uid === active.id)
      const to = gs.findIndex(g => g.uid === over.id)
      return from < 0 || to < 0 ? gs : arrayMove(gs, from, to)
    })
  }
  function onDragEndCardEls(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setCardEls(els => {
      const from = els.findIndex(x => x.key === active.id)
      const to = els.findIndex(x => x.key === over.id)
      return from < 0 || to < 0 ? els : arrayMove(els, from, to)
    })
  }
  // Mescla o catálogo atual com o salvo (preserva ordem salva, garante chaves novas no fim).
  function mergeCardEls(saved: CardEl[]): CardEl[] {
    const known = new Set(DEFAULT_CARD_ELS.map(d => d.key))
    const out = saved.filter(s => known.has(s.key))
    const have = new Set(out.map(s => s.key))
    for (const d of DEFAULT_CARD_ELS) if (!have.has(d.key)) out.push({ ...d })
    return out
  }
  async function restaurarHtmlPadrao() {
    setLoadingCardHtml(true)
    try { const r = await (trpc.agenda as any).modeloEmail.cardHtmlPadrao.query(); setTplField('eventoLinhaHtml', r.html) }
    catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setLoadingCardHtml(false) }
  }
  const [loadingHeaderHtml, setLoadingHeaderHtml] = useState(false)
  async function restaurarCabecalhoPadrao() {
    setLoadingHeaderHtml(true)
    try { const r = await (trpc.agenda as any).modeloEmail.cabecalhoPadrao.query(); setTplField('headerHtml', r.html) }
    catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setLoadingHeaderHtml(false) }
  }
  async function onUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', body: fd, credentials: 'include' })
      if (!res.ok) throw new Error('Falha no upload da imagem')
      const { url } = await res.json()
      setTplField('logoUrl', url)
    } catch (err) { alerts.error('Erro', (err as Error).message) }
    finally { setUploadingLogo(false); e.target.value = '' }
  }

  async function carregarModelo() {
    setLoadingTpl(true)
    try {
      const [r, tps] = await Promise.all([
        (trpc.agenda as any).modeloEmail.get.query(),
        (trpc.agenda as any).listTipos.query().catch(() => []),
      ])
      setTpl(r.template)
      // Elementos do card (ordem/visibilidade) — mescla com o catálogo atual.
      try {
        const parsed = JSON.parse(r.template?.cardElementos || '[]')
        setCardEls(Array.isArray(parsed) && parsed.length ? mergeCardEls(parsed) : DEFAULT_CARD_ELS)
      } catch { setCardEls(DEFAULT_CARD_ELS) }
      setGrupos((r.grupos || []).map((g: Partial<EmailGrp>) => ({ icone: '', incluiParticulares: false, tiposIds: [], nome: '', cor: '#38bdf8', ...g, uid: crypto.randomUUID() }))); setTiposModelo(tps || [])
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setLoadingTpl(false) }
  }
  async function atualizarPreview() {
    setLoadingPreview(true)
    // Prévia AO VIVO: manda o estado atual do editor (inclui logo/textos/grupos/card ainda não salvos).
    // A logo vai ABSOLUTA pro iframe da prévia conseguir carregar (no srcDoc não há base URL).
    const tplPreview = tpl ? { ...tpl, cardElementos: JSON.stringify(cardEls), logoUrl: tpl.logoUrl ? resolveAssetUrl(tpl.logoUrl) : '' } : undefined
    try { const r = await (trpc.agenda as any).modeloEmail.preview.query({ template: tplPreview, grupos }); setPreviewHtml(r.html) }
    catch { setPreviewHtml('<p style="padding:16px;font-family:sans-serif;color:#ef4444">Falha ao gerar prévia.</p>') }
    finally { setLoadingPreview(false) }
  }
  async function salvarModelo(opts?: { silent?: boolean }) {
    if (!tpl) return
    setSavingTpl(true)
    try {
      await (trpc.agenda as any).modeloEmail.save.mutate({ ...tpl, cardElementos: JSON.stringify(cardEls) })
      await (trpc.agenda as any).modeloEmail.saveGrupos.mutate({ grupos })
      await atualizarPreview()
      if (!opts?.silent) alerts.success('Salvo', 'Modelo de e-mail atualizado.')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSavingTpl(false) }
  }
  async function enviarTesteModelo() {
    setEnviandoTesteModelo(true)
    try { await salvarModelo({ silent: true }); await (trpc.agenda as any).modeloEmail.enviarTeste.mutate(); alerts.success('Enviado', 'E-mail de teste enviado pra você.') }
    catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviandoTesteModelo(false) }
  }
  useEffect(() => {
    if (activeTab === 'modelo' && !tpl && !loadingTpl) { carregarModelo() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])
  // Prévia ao vivo com debounce ao editar (logo, textos, cores, grupos…)
  useEffect(() => {
    if (activeTab !== 'modelo' || !tpl) return
    const t = setTimeout(() => { atualizarPreview() }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tpl, grupos, cardEls])

  // Combobox filtrável de destinatários
  const [destSearchOpen, setDestSearchOpen] = useState(false)
  const [destSearchQuery, setDestSearchQuery] = useState('')
  const destSearchRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!destSearchOpen) return
    function onClickOutside(e: MouseEvent) {
      if (destSearchRef.current && !destSearchRef.current.contains(e.target as Node)) {
        setDestSearchOpen(false); setDestSearchQuery('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [destSearchOpen])

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
  async function loadDisparo() {
    try {
      const d = await trpc.agenda.disparo.get.query() as DisparoConfig
      setDisparo(d)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function loadUsuarios() {
    try {
      const r = await trpc.agenda.listUsuarios.query()
      setUsuarios(r as UsuarioMini[])
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function loadLogs() {
    setLoadingLogs(true)
    try {
      const r = await (trpc.agenda.disparo as any).listLogs.query({ limit: 30 })
      setLogs(r as DisparoLog[])
    } catch { /* silencia se ainda não tem permissão/endpoint */ }
    finally { setLoadingLogs(false) }
  }
  async function handleReenviar(log: DisparoLog) {
    const dataFmt = (() => {
      const d = new Date(log.dataReferencia)
      return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
    })()
    const ok = await alerts.confirm({
      title: 'Reenviar disparo?',
      text: `Vai disparar a "Agenda do dia ${dataFmt}" pra TODOS os destinatários da configuração atual. Continuar?`,
      confirmText: 'Reenviar',
      icon: 'question',
    })
    if (!ok) return
    setReenviandoId(log.id)
    try {
      const r = await (trpc.agenda.disparo as any).reenviar.mutate({ logId: log.id }) as { enviados: number; falhas: number }
      alerts.success('Reenviado', `${r.enviados} enviado(s)${r.falhas ? `, ${r.falhas} falha(s)` : ''}.`)
      loadLogs()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setReenviandoId(null)
    }
  }

  useEffect(() => {
    if (!canAccess) return
    loadConfig()
    loadSalas()
    loadDisparo()
    loadUsuarios()
    loadLogs()
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

  // ================== Ações: Disparo automático ==================
  async function updateDisparo(patch: Partial<DisparoConfig>) {
    if (!disparo) return
    const prev = disparo
    setDisparo({ ...disparo, ...patch })
    setSavingDisparo(true)
    try {
      const upd = await trpc.agenda.disparo.update.mutate(patch as never) as DisparoConfig
      setDisparo(upd)
    } catch (e) {
      setDisparo(prev) // rollback
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSavingDisparo(false)
    }
  }
  function toggleDia(dia: number) {
    if (!disparo) return
    const novos = disparo.diasSemana.includes(dia)
      ? disparo.diasSemana.filter(d => d !== dia)
      : [...disparo.diasSemana, dia].sort((a, b) => a - b)
    updateDisparo({ diasSemana: novos })
  }
  function toggleDestinatario(uid: string) {
    if (!disparo) return
    const novos = disparo.destinatariosIds.includes(uid)
      ? disparo.destinatariosIds.filter(x => x !== uid)
      : [...disparo.destinatariosIds, uid]
    updateDisparo({ destinatariosIds: novos })
  }
  async function enviarTeste() {
    if (!testeDestId) { alerts.error('Erro', 'Selecione um destinatário pro teste.'); return }
    setEnviandoTeste(true)
    try {
      await trpc.agenda.disparo.enviarTeste.mutate({ destinatarioId: testeDestId })
      alerts.success('Teste enviado', 'Verifique a caixa de entrada do destinatário.')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviandoTeste(false) }
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
                { key: 'regras',  label: 'Regras de conflito', icon: Calendar },
                { key: 'salas',   label: 'Salas',              icon: DoorOpen },
                { key: 'disparo', label: 'Disparo automático', icon: Mail },
                { key: 'modelo',  label: 'Modelo de e-mail',   icon: FileText },
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

            {/* ---- SUB-TAB: DISPARO AUTOMÁTICO ---- */}
            {activeTab === 'disparo' && (
              <div className="-m-5">
                <div className="px-5 py-3 border-b border-border">
                  <h4 className="text-[13px] font-semibold text-foreground">Disparo automático da agenda do dia</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Envia um email diário pros destinatários selecionados, listando os eventos do dia.
                    Eventos particulares aparecem apenas no email do próprio criador.
                  </p>
                </div>
                <div className="p-5 space-y-5">
                  {!disparo ? (
                    <div className="py-6 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      {/* Toggle ativo + horário + dias */}
                      <div className="grid grid-cols-12 gap-3">
                        {/* Toggle ativo */}
                        <div className="col-span-12 md:col-span-4 rounded-lg border border-border bg-muted/40 p-4 flex items-center gap-3">
                          <Checkbox
                            checked={disparo.ativo}
                            onCheckedChange={(v) => updateDisparo({ ativo: !!v })}
                            disabled={savingDisparo}
                            className="h-5 w-5"
                          />
                          <div>
                            <Label className="text-[13px] font-semibold cursor-pointer" onClick={() => updateDisparo({ ativo: !disparo.ativo })}>
                              {disparo.ativo ? 'Ativo' : 'Inativo'}
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                              {disparo.ativo ? 'Envia automaticamente no horário configurado' : 'Não envia automaticamente'}
                            </p>
                          </div>
                        </div>

                        {/* Horário */}
                        <div className="col-span-12 md:col-span-4 space-y-1.5 rounded-lg border border-border bg-muted/40 p-4">
                          <Label className="text-[13px] font-semibold">Horário do disparo</Label>
                          <p className="text-[11px] text-muted-foreground">Hora do dia em que o email é enviado.</p>
                          <Input
                            type="time"
                            className="h-9 text-sm mt-1"
                            value={disparo.horario}
                            onChange={(e) => updateDisparo({ horario: e.target.value })}
                            disabled={savingDisparo}
                          />
                        </div>

                        {/* Dias da semana */}
                        <div className="col-span-12 md:col-span-4 space-y-1.5 rounded-lg border border-border bg-muted/40 p-4">
                          <Label className="text-[13px] font-semibold">Dias da semana</Label>
                          <p className="text-[11px] text-muted-foreground">Em quais dias disparar.</p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {DIAS_SEMANA.map(d => {
                              const ativo = disparo.diasSemana.includes(d.num)
                              return (
                                <button
                                  key={d.num}
                                  type="button"
                                  onClick={() => toggleDia(d.num)}
                                  disabled={savingDisparo}
                                  className={cn(
                                    'h-8 px-2.5 text-[11px] font-medium rounded-md border transition-colors',
                                    ativo
                                      ? 'bg-sky-500 text-white border-sky-500 hover:bg-sky-600'
                                      : 'bg-background border-border text-muted-foreground hover:bg-muted',
                                  )}
                                >
                                  {d.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Destinatários */}
                      <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <Label className="text-[13px] font-semibold">
                            Destinatários {!disparo.enviarParaTodos && `(${disparo.destinatariosIds.length})`}
                          </Label>
                          <label className="flex items-center gap-2 cursor-pointer text-xs">
                            <Checkbox
                              checked={disparo.enviarParaTodos}
                              onCheckedChange={(v) => updateDisparo({ enviarParaTodos: !!v })}
                              disabled={savingDisparo}
                            />
                            <span className="font-medium">Enviar para todos os colaboradores ativos</span>
                          </label>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {disparo.enviarParaTodos
                            ? 'O email vai pra todos os usuários ativos da empresa. A lista manual abaixo é ignorada.'
                            : 'Usuários que vão receber o email da agenda do dia.'}
                        </p>
                        {disparo.enviarParaTodos ? (
                          <div className="rounded border border-dashed border-border bg-background/40 p-3 mt-2 text-[11px] text-muted-foreground italic text-center">
                            Modo "todos colaboradores" ativo — destinatários são resolvidos no momento do disparo
                          </div>
                        ) : (
                          <>
                        {disparo.destinatariosIds.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {disparo.destinatariosIds.map(id => {
                              const u = usuarios.find(x => x.id === id)
                              if (!u) return null
                              return (
                                <span key={id} className="flex items-center gap-1 text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 px-2.5 py-1 rounded-full">
                                  {u.name}
                                  <button type="button" onClick={() => toggleDestinatario(id)} className="hover:text-rose-500">
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              )
                            })}
                          </div>
                        )}
                        {/* Combobox pra adicionar destinatário */}
                        <div ref={destSearchRef} className="relative max-w-md mt-2">
                          <button
                            type="button"
                            onClick={() => setDestSearchOpen(o => !o)}
                            className={cn(
                              'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm',
                              'focus:outline-none focus:ring-1 focus:ring-ring',
                            )}
                          >
                            <span className="text-muted-foreground flex items-center gap-2">
                              <Search className="h-3.5 w-3.5" />
                              Adicionar destinatário…
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          {destSearchOpen && (
                            <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                              <div className="p-1.5 border-b bg-popover sticky top-0">
                                <Input
                                  autoFocus
                                  value={destSearchQuery}
                                  onChange={e => setDestSearchQuery(e.target.value)}
                                  placeholder="Buscar usuário..."
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div className="max-h-56 overflow-y-auto py-1">
                                {(() => {
                                  const disp = usuarios.filter(u => !disparo.destinatariosIds.includes(u.id))
                                  const filtered = destSearchQuery.trim()
                                    ? disp.filter(u => u.name.toLowerCase().includes(destSearchQuery.toLowerCase()))
                                    : disp
                                  if (filtered.length === 0) {
                                    return (
                                      <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                                        {usuarios.length === disparo.destinatariosIds.length
                                          ? 'Todos já foram adicionados'
                                          : 'Nenhum usuário encontrado'}
                                      </p>
                                    )
                                  }
                                  return filtered.map(u => (
                                    <button
                                      key={u.id}
                                      type="button"
                                      onClick={() => {
                                        toggleDestinatario(u.id)
                                        setDestSearchOpen(false)
                                        setDestSearchQuery('')
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
                                    >
                                      <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                        <span className="text-[9px] font-bold text-muted-foreground">
                                          {(u.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                        </span>
                                      </span>
                                      <span className="truncate">{u.name}</span>
                                    </button>
                                  ))
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                          </>
                        )}
                      </div>

                      {/* Enviar teste */}
                      <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-4">
                        <Label className="text-[13px] font-semibold">Enviar email de teste agora</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Dispara o email da agenda de hoje pra um destinatário específico (não precisa estar na lista).
                        </p>
                        <div className="flex gap-2 mt-1">
                          <Select value={testeDestId} onValueChange={setTesteDestId}>
                            <SelectTrigger className="h-9 text-sm flex-1 max-w-md">
                              <SelectValue placeholder="Escolha um usuário…" />
                            </SelectTrigger>
                            <SelectContent>
                              {usuarios.map(u => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={enviarTeste}
                            disabled={enviandoTeste || !testeDestId}
                            className="gap-1.5 bg-sky-500 hover:bg-sky-600 text-white"
                          >
                            {enviandoTeste ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            Enviar teste
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Histórico de disparos */}
                <div>
                  <div className="px-5 py-3 border-b border-t border-border flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                        Histórico de disparos
                        {logs.length > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{logs.length}</Badge>}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cada execução do disparo (automático, teste ou reenvio) fica registrada aqui.
                        Útil pra confirmar envio e reagir a falhas.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={loadLogs}
                      disabled={loadingLogs}
                      className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      title="Recarregar"
                    >
                      {loadingLogs ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Atualizar
                    </button>
                  </div>
                  <div className="p-5 space-y-3">
                  {loadingLogs && logs.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline" /> Carregando…
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="rounded border border-dashed border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
                      Nenhum disparo registrado ainda. O scheduler grava aqui automaticamente.
                    </div>
                  ) : (
                    <div className="rounded border border-border overflow-hidden divide-y">
                      {logs.map(log => {
                        const dataDisp = new Date(log.disparadoEm)
                        const dataRef = new Date(log.dataReferencia)
                        const dataRefFmt = `${String(dataRef.getUTCDate()).padStart(2, '0')}/${String(dataRef.getUTCMonth() + 1).padStart(2, '0')}/${dataRef.getUTCFullYear()}`
                        const dataDispFmt = dataDisp.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                        const modoColor = log.modo === 'auto' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
                          : log.modo === 'teste' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
                        const modoLabel = log.modo === 'auto' ? 'Automático' : log.modo === 'teste' ? 'Teste' : 'Reenvio'
                        const expanded = expandedLogId === log.id
                        return (
                          <div key={log.id} className="px-3 py-2 text-xs hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="font-medium">Dia <strong>{dataRefFmt}</strong></span>
                              </div>
                              <span className={cn('inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', modoColor)}>
                                {modoLabel}
                              </span>
                              <span className="text-muted-foreground">disparado em {dataDispFmt}</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1">
                                <Check className="h-3 w-3" /> {log.enviados}
                              </span>
                              {log.falhas > 0 && (
                                <span className="text-rose-600 dark:text-rose-400 font-semibold inline-flex items-center gap-1">
                                  <X className="h-3 w-3" /> {log.falhas}
                                </span>
                              )}
                              {log.triggeredByUser && (
                                <span className="text-muted-foreground text-[10px]">por {log.triggeredByUser.name}</span>
                              )}
                              <div className="ml-auto flex items-center gap-1">
                                {(log.falhas > 0 || log.destinatarios.length > 0) && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedLogId(expanded ? null : log.id)}
                                    className="px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                                  >
                                    {expanded ? 'Ocultar' : 'Detalhes'}
                                  </button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleReenviar(log)}
                                  disabled={reenviandoId === log.id}
                                  className="h-6 px-2 text-[10px] gap-1"
                                >
                                  {reenviandoId === log.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                  Reenviar
                                </Button>
                              </div>
                            </div>
                            {expanded && (
                              <div className="mt-2 pl-5 space-y-2 border-l-2 border-border/60">
                                {log.destinatarios.length > 0 && (
                                  <div className="text-[11px]">
                                    <div className="text-muted-foreground font-semibold mb-1">{log.destinatarios.length} destinatário(s) com sucesso:</div>
                                    <div className="flex flex-wrap gap-1">
                                      {log.destinatarios.map(uid => {
                                        const u = usuarios.find(x => x.id === uid)
                                        return (
                                          <span key={uid} className="inline-flex text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                                            {u?.name ?? uid.slice(0, 8)}
                                          </span>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                                {log.erros && log.erros.length > 0 && (
                                  <div className="text-[11px]">
                                    <div className="text-rose-600 dark:text-rose-400 font-semibold mb-1">{log.erros.length} falha(s):</div>
                                    <div className="space-y-1">
                                      {log.erros.map((er, idx) => {
                                        const u = usuarios.find(x => x.id === er.userId)
                                        return (
                                          <div key={idx} className="flex items-start gap-2 text-[10px]">
                                            <span className="font-medium">{u?.name ?? er.userId.slice(0, 8)}:</span>
                                            <span className="text-muted-foreground">{er.motivo}</span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  </div>
                </div>
              </div>
            )}

            {/* ---- SUB-TAB: MODELO DE E-MAIL ---- */}
            {activeTab === 'modelo' && !tpl && (
              <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            )}
            {activeTab === 'modelo' && tpl && (
              <div className="space-y-5">
                {/* Aviso paralelo + toggle ativo */}
                <label className={cn('flex items-start gap-3 rounded-md border p-3 cursor-pointer', tpl.ativo ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20' : 'border-amber-300 bg-amber-50 dark:bg-amber-900/20')}>
                  <Checkbox checked={tpl.ativo} onCheckedChange={v => setTplField('ativo', !!v)} className="mt-0.5" />
                  <div className="text-xs">
                    <p className="font-semibold">Usar este modelo no disparo automático</p>
                    <p className="text-muted-foreground">{tpl.ativo ? 'Ativo: o disparo diário usa este modelo.' : 'Desativado: o disparo diário segue enviando o e-mail padrão atual. Ative só quando estiver satisfeito.'}</p>
                  </div>
                </label>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Editor */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-1.5"><Label className="text-[13px] font-semibold">Assunto</Label><Input className="h-9 text-sm" value={tpl.assunto} onChange={e => setTplField('assunto', e.target.value)} /></div>
                      <div className="space-y-1.5"><Label className="text-[13px] font-semibold">Cor de destaque</Label><Input type="color" className="h-9 w-full p-1" value={tpl.accent} onChange={e => setTplField('accent', e.target.value)} /></div>
                    </div>

                    {/* Largura máxima do e-mail */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[13px] font-semibold">Largura do e-mail</Label>
                        <span className="text-xs font-mono text-muted-foreground">{tpl.larguraMax}px</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input type="range" min={440} max={1000} step={20} value={tpl.larguraMax}
                          onChange={e => setTplField('larguraMax', Number(e.target.value))}
                          className="flex-1 accent-[var(--mod-administrativo,#38bdf8)] cursor-pointer" />
                        <Input type="number" min={440} max={1000} step={20} value={tpl.larguraMax}
                          onChange={e => setTplField('larguraMax', Math.min(1000, Math.max(440, Number(e.target.value) || 600)))}
                          className="h-9 w-24 text-sm" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">Largura máxima do corpo (440–1000px). Em telas menores o e-mail se adapta automaticamente.</p>
                    </div>

                    {/* Logomarca do topo */}
                    <div className="space-y-1.5">
                      <Label className="text-[13px] font-semibold">Logomarca do topo</Label>
                      <div className="flex items-center gap-3 flex-wrap">
                        {tpl.logoUrl ? (
                          <>
                            <img src={resolveAssetUrl(tpl.logoUrl)} alt="logomarca" className="h-12 max-w-[180px] object-contain rounded border border-border bg-white p-1" />
                            <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs cursor-pointer hover:bg-muted/40">
                              <input type="file" accept="image/*" className="hidden" onChange={onUploadLogo} />
                              {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Trocar
                            </label>
                            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setTplField('logoUrl', '')}>Remover</Button>
                          </>
                        ) : (
                          <label className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-dashed border-border text-xs text-muted-foreground cursor-pointer hover:bg-muted/40">
                            <input type="file" accept="image/*" className="hidden" onChange={onUploadLogo} />
                            {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar logomarca
                          </label>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">Exibida centralizada no topo do e-mail, antes do cabeçalho.</p>
                    </div>

                    <div className="rounded-md border border-border bg-muted/30 p-2.5">
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Variáveis do cabeçalho / rodapé (clique para copiar)</p>
                      <div className="flex flex-wrap gap-1">
                        {['{{usuario.name}}', '{{nomePrimeiro}}', '{{saudacao}}', '{{dataDisplay}}', '{{diaSemana}}', '{{diaNum}}', '{{mesAbrev}}', '{{anoNum}}', '{{totalEventos}}', '{{assetBg}}', '{{accent}}'].map(v => (
                          <button key={v} type="button" onClick={() => { navigator.clipboard?.writeText(v); alerts.success('Copiado', v) }} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-card border border-border hover:bg-muted">{v}</button>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">Os eventos são exibidos em blocos, agrupados pelos grupos abaixo. O layout de cada card é configurável em "Card do evento".</p>
                    </div>

                    {/* Cabeçalho (hero) — HTML estrutural (gradiente + tile de data). */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[13px] font-semibold">Cabeçalho <span className="text-[11px] font-normal text-muted-foreground">(HTML)</span></Label>
                        <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={restaurarCabecalhoPadrao} disabled={loadingHeaderHtml}>{loadingHeaderHtml ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Restaurar padrão</Button>
                      </div>
                      <textarea
                        value={tpl.headerHtml}
                        onChange={e => setTplField('headerHtml', e.target.value)}
                        rows={12}
                        placeholder="HTML do cabeçalho — use as variáveis acima ({{saudacao}}, {{nomePrimeiro}}, {{diaNum}}…)"
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-y focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>

                    {/* Rodapé / sem eventos — RichEditor (prosa simples) */}
                    {([['footerHtml', 'Rodapé'], ['semEventosHtml', 'Mensagem quando não há eventos']] as const).map(([k, label]) => (
                      <div key={k} className="space-y-1.5">
                        <Label className="text-[13px] font-semibold">{label}</Label>
                        <RichEditor value={(tpl as Record<string, string>)[k] ?? ''} onChange={v => setTplField(k as keyof EmailTpl, v)} placeholder="Use a barra de formatação ou o modo HTML (&lt;/&gt;)…" />
                      </div>
                    ))}

                    {/* Card do evento — builder estruturado ou HTML livre */}
                    <div className="space-y-2 border-t border-border pt-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Label className="text-[13px] font-semibold">Card do evento</Label>
                        <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
                          <button type="button" onClick={() => setTplField('cardModo', 'builder')}
                            className={cn('px-2.5 py-1 rounded transition-colors', tpl.cardModo !== 'html' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50')}>Builder</button>
                          <button type="button" onClick={() => { if (tpl.cardModo !== 'html' && !(tpl.eventoLinhaHtml || '').trim()) restaurarHtmlPadrao(); setTplField('cardModo', 'html') }}
                            className={cn('px-2.5 py-1 rounded transition-colors inline-flex items-center gap-1', tpl.cardModo === 'html' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50')}><FileText className="h-3 w-3" /> HTML</button>
                        </div>
                      </div>

                      {tpl.cardModo !== 'html' ? (
                        <>
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] text-muted-foreground">Arraste pela alça <GripVertical className="h-3 w-3 inline -mt-0.5" /> para reordenar; ligue/desligue cada elemento.</p>
                            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setCardEls(DEFAULT_CARD_ELS)}><RefreshCw className="h-3 w-3" /> Restaurar padrão</Button>
                          </div>
                          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onDragEndCardEls}>
                            <SortableContext items={cardEls.map(x => x.key)} strategy={verticalListSortingStrategy}>
                              <div className="space-y-1.5">
                                {cardEls.map((el, idx) => (
                                  <SortableCardElRow key={el.key} el={el}
                                    onToggle={v => setCardEls(els => els.map((x, i) => i === idx ? { ...x, visivel: v } : x))} />
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                          <p className="text-[11px] text-muted-foreground">O horário fica sempre na coluna lateral colorida. Elementos vizinhos curtos (categoria, modalidade, local, data) fluem na mesma linha.</p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] text-muted-foreground">HTML livre do card (controle total). Use as variáveis abaixo.</p>
                            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={restaurarHtmlPadrao} disabled={loadingCardHtml}>{loadingCardHtml ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Restaurar HTML padrão</Button>
                          </div>
                          <div className="rounded-md border border-border bg-muted/30 p-2.5">
                            <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Variáveis do card (clique para copiar)</p>
                            <div className="flex flex-wrap gap-1">
                              {['{{evento.titulo}}', '{{evento.horario}}', '{{evento.horaInicio}}', '{{evento.horaFim}}', '{{evento.data}}', '{{evento.tipoNome}}', '{{evento.tipoCor}}', '{{evento.modalidade}}', '{{evento.local}}', '{{evento.contato}}', '{{evento.link}}', '{{evento.criador}}', '{{evento.descricao}}', '{{evento.participantes}}', '{{evento.pillCategoria}}', '{{evento.participantesHtml}}', '{{evento.linkHtml}}', '{{evento.criadorHtml}}'].map(v => (
                                <button key={v} type="button" onClick={() => { navigator.clipboard?.writeText(v); alerts.success('Copiado', v) }} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-card border border-border hover:bg-muted">{v}</button>
                              ))}
                            </div>
                          </div>
                          <textarea
                            value={tpl.eventoLinhaHtml}
                            onChange={e => setTplField('eventoLinhaHtml', e.target.value)}
                            rows={14}
                            placeholder="HTML do card — ex.: <table>…{{evento.titulo}}…</table>"
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-y focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        </>
                      )}
                    </div>

                    {/* Grupos por tipo */}
                    <div className="space-y-2 border-t border-border pt-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-[13px] font-semibold">Grupos (por tipo de evento)</Label>
                        <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setGrupos(g => [...g, { uid: crypto.randomUUID(), nome: 'Novo grupo', cor: tpl.accent, icone: '📅', incluiParticulares: false, tiposIds: [] }])}><Plus className="h-3.5 w-3.5" /> Grupo</Button>
                      </div>
                      {grupos.length === 0 && <p className="text-xs text-muted-foreground italic">Sem grupos personalizados — todos os eventos caem no grupo catch-all "{tpl.nomeGrupoOutros || 'Outros'}".</p>}
                      {grupos.length > 1 && <p className="text-[11px] text-muted-foreground">Arraste pela alça <GripVertical className="h-3 w-3 inline -mt-0.5" /> para reordenar — a ordem aqui é a ordem no e-mail.</p>}
                      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onDragEndGrupos}>
                        <SortableContext items={grupos.map(g => g.uid)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-2">
                            {grupos.map((g, idx) => (
                              <SortableGrupoCard
                                key={g.uid}
                                grupo={g}
                                tiposModelo={tiposModelo}
                                tiposEmOutrosGrupos={grupos.filter((_, i) => i !== idx).flatMap(x => x.tiposIds)}
                                onPatch={patch => setGrupos(gs => gs.map((x, i) => i === idx ? { ...x, ...patch } : x))}
                                onRemove={() => setGrupos(gs => gs.filter((_, i) => i !== idx))}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                      <div className="rounded-md border border-dashed border-border p-2.5 space-y-2">
                        <label className="flex items-center gap-2 text-xs cursor-pointer"><Checkbox checked={tpl.mostrarOutros} onCheckedChange={v => setTplField('mostrarOutros', !!v)} /> Mostrar um grupo catch-all com os eventos de tipos não atribuídos a nenhum grupo acima</label>
                        {tpl.mostrarOutros && (
                          <div className="space-y-1"><Label className="text-[11px]">Nome do grupo catch-all</Label><Input className="h-8 text-xs" value={tpl.nomeGrupoOutros} onChange={e => setTplField('nomeGrupoOutros', e.target.value)} placeholder="Outros" /></div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button onClick={() => salvarModelo()} disabled={savingTpl} style={{ backgroundColor: 'var(--mod-administrativo, #38bdf8)' }} className="text-white gap-1.5">{savingTpl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar</Button>
                      <Button variant="outline" onClick={enviarTesteModelo} disabled={enviandoTesteModelo} className="gap-1.5">{enviandoTesteModelo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar teste pra mim</Button>
                    </div>
                  </div>

                  {/* Prévia */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[13px] font-semibold flex items-center gap-1.5"><Eye className="h-4 w-4" /> Prévia</Label>
                      <Button variant="ghost" size="sm" onClick={atualizarPreview} disabled={loadingPreview} className="gap-1"><RefreshCw className={cn('h-3.5 w-3.5', loadingPreview && 'animate-spin')} /> Atualizar</Button>
                    </div>
                    <div className="rounded-md border border-border overflow-hidden bg-white" style={{ height: '640px' }}>
                      <iframe title="Prévia do e-mail" srcDoc={previewHtml} className="w-full h-full border-0" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Prévia com os eventos de hoje (os seus, respeitando privacidade). Salvar atualiza a prévia.</p>
                  </div>
                </div>
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
