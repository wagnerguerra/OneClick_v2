'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Loader2, Plus, Pencil, MessageSquare, Paperclip, FileText, Send, Trash2,
  Clock, ArrowRight, Flag, Calendar, AlertCircle, Download, X, Image as ImageIcon,
} from 'lucide-react'
import {
  Button, Input, Label,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { AnexosDropzone, type AnexoStaged } from '../../../helpdesk/_components/anexos-dropzone'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  TAREFA_STATUS_LABELS, TAREFA_PRIORIDADE_LABELS,
  type TarefaStatus, type TarefaPrioridade,
} from '@saas/types'

interface AnexoLido {
  id: string
  nome: string
  url: string
  mimeType: string | null
  tamanho: number
  uploadedById: string | null
  createdAt: string | Date
}

interface EventoLido {
  id: string
  tipo: string
  autorId: string | null
  comentario: string | null
  campoAntes: string | null
  campoDepois: string | null
  createdAt: string | Date
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  projetoId: string
  projetoCor: string
  tarefaId: string | null              // null = nova
  onSaved: () => void
}

export function TarefaDetalheModal({ open, onOpenChange, projetoId, projetoCor, tarefaId, onSaved }: Props) {
  const isEdit = !!tarefaId
  const [activeTab, setActiveTab] = useState<'detalhes' | 'atividade' | 'anexos'>('detalhes')

  // Form
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [status, setStatus] = useState<TarefaStatus>('BACKLOG')
  const [prioridade, setPrioridade] = useState<TarefaPrioridade>('MEDIA')
  const [prazo, setPrazo] = useState('')
  const [estimativa, setEstimativa] = useState('')

  // Detalhe carregado
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [eventos, setEventos] = useState<EventoLido[]>([])
  const [anexos, setAnexos] = useState<AnexoLido[]>([])

  // Comentário + anexos staged
  const [comentario, setComentario] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [anexosStaged, setAnexosStaged] = useState<AnexoStaged[]>([])
  const lastSavedAnexosRef = useRef<string[]>([])

  // Reset quando abre/fecha
  useEffect(() => {
    if (!open) return
    setActiveTab('detalhes')
    setAnexosStaged([])
    lastSavedAnexosRef.current = []
    setComentario('')
    if (!tarefaId) {
      setTitulo('')
      setDescricao('')
      setStatus('BACKLOG')
      setPrioridade('MEDIA')
      setPrazo('')
      setEstimativa('')
      setEventos([])
      setAnexos([])
    } else {
      fetchTarefa()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tarefaId])

  const fetchTarefa = useCallback(async () => {
    if (!tarefaId) return
    setLoading(true)
    try {
      const t = await trpc.projetos.getTarefa.query({ id: tarefaId }) as unknown as {
        titulo: string
        descricao: string | null
        status: TarefaStatus
        prioridade: TarefaPrioridade
        prazo: string | Date | null
        estimativa: number | null
        anexos: AnexoLido[]
        eventos: EventoLido[]
      }
      setTitulo(t.titulo)
      setDescricao(t.descricao ?? '')
      setStatus(t.status)
      setPrioridade(t.prioridade)
      setPrazo(t.prazo ? new Date(t.prazo).toISOString().slice(0, 10) : '')
      setEstimativa(t.estimativa?.toString() ?? '')
      setAnexos(t.anexos)
      setEventos(t.eventos)
    } catch (e) {
      alerts.error('Erro ao carregar tarefa: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tarefaId])

  async function handleSave() {
    if (!titulo.trim()) {
      alerts.error('Informe o título da tarefa')
      return
    }
    setSaving(true)
    try {
      const data = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        status,
        prioridade,
        prazo: prazo || null,
        estimativa: estimativa ? Number(estimativa) : null,
      }
      let savedId = tarefaId
      if (tarefaId) {
        await trpc.projetos.updateTarefa.mutate({ id: tarefaId, data })
      } else {
        const created = await trpc.projetos.createTarefa.mutate({ projetoId, ...data }) as { id: string }
        savedId = created.id
      }

      // Anexa arquivos staged que ficaram prontos
      const novos = anexosStaged.filter((a) => a.status === 'ready' && !lastSavedAnexosRef.current.includes(a.id))
      for (const a of novos) {
        try {
          await trpc.projetos.addAnexo.mutate({
            tarefaId: savedId!,
            nome: a.fileName,
            url: a.fileUrl,
            mimeType: a.mimeType,
            tamanho: a.tamanho,
          })
          lastSavedAnexosRef.current.push(a.id)
        } catch (e) {
          console.warn('[Projetos] addAnexo falhou:', (e as Error).message)
        }
      }

      alerts.success(tarefaId ? 'Tarefa atualizada' : 'Tarefa criada')
      onSaved()
      onOpenChange(false)
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddComentario() {
    if (!comentario.trim() || !tarefaId) return
    setSendingComment(true)
    try {
      await trpc.projetos.addComentario.mutate({ tarefaId, texto: comentario.trim() })
      setComentario('')
      fetchTarefa()
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    } finally {
      setSendingComment(false)
    }
  }

  async function handleRemoveAnexo(anexoId: string) {
    const ok = await alerts.confirm({
      title: 'Remover anexo?',
      text: 'O arquivo será excluído da tarefa.',
      confirmText: 'Remover',
    })
    if (!ok) return
    try {
      await trpc.projetos.removerAnexo.mutate({ id: anexoId })
      fetchTarefa()
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeaderIcon icon={isEdit ? Pencil : Plus} color={isEdit ? 'sky' : 'emerald'}>
          <DialogTitle>{isEdit ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize dados, registre andamentos e gerencie anexos.'
              : 'Crie uma tarefa. Atividade e anexos ficam disponíveis após salvar.'}
          </DialogDescription>
        </DialogHeaderIcon>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="px-1">
          <TabsList className="mx-6 mt-2">
            <TabsTrigger value="detalhes" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Detalhes
            </TabsTrigger>
            <TabsTrigger value="atividade" disabled={!isEdit} className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Atividade
              {eventos.length > 0 && <span className="text-[10px] text-muted-foreground">({eventos.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="anexos" className="gap-1.5">
              <Paperclip className="h-3.5 w-3.5" /> Anexos
              {(anexos.length + anexosStaged.filter((a) => a.status === 'ready').length) > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  ({anexos.length + anexosStaged.filter((a) => a.status === 'ready').length})
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Tab: Detalhes */}
          <TabsContent value="detalhes">
            <DialogBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="t-titulo" className="text-[13px] font-semibold">Título *</Label>
                <Input
                  id="t-titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="h-9 text-sm"
                  placeholder="Ex: Implementar tela de configurações"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-descricao" className="text-[13px] font-semibold">Descrição</Label>
                <textarea
                  id="t-descricao"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="w-full min-h-[120px] rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Detalhes da tarefa..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as TarefaStatus)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TAREFA_STATUS_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Prioridade</Label>
                  <Select value={prioridade} onValueChange={(v) => setPrioridade(v as TarefaPrioridade)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TAREFA_PRIORIDADE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-prazo" className="text-[13px] font-semibold">Prazo</Label>
                  <Input id="t-prazo" type="date" value={prazo}
                    onChange={(e) => setPrazo(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-est" className="text-[13px] font-semibold">Estimativa (pts)</Label>
                  <Input id="t-est" type="number" min={0} value={estimativa}
                    onChange={(e) => setEstimativa(e.target.value)} className="h-9 text-sm"
                    placeholder="1, 2, 3, 5, 8..." />
                </div>
              </div>
            </DialogBody>
          </TabsContent>

          {/* Tab: Atividade */}
          <TabsContent value="atividade">
            <DialogBody className="space-y-4 max-h-[500px] overflow-y-auto">
              {/* Composer */}
              <div className="flex gap-2 items-start sticky top-0 bg-card pt-1 pb-3 border-b border-border z-10">
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  className="flex-1 min-h-[60px] rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Registre um andamento..."
                />
                <Button
                  onClick={handleAddComentario}
                  disabled={sendingComment || !comentario.trim()}
                  size="sm"
                  className="h-9"
                  style={{ background: projetoCor }}
                >
                  {sendingComment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-1" /> Registrar</>}
                </Button>
              </div>

              {/* Timeline */}
              {loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
                </div>
              ) : eventos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                  <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
                  Nenhuma atividade ainda
                </div>
              ) : (
                <div className="space-y-2.5">
                  {eventos.map((ev) => (
                    <EventoItem key={ev.id} evento={ev} cor={projetoCor} />
                  ))}
                </div>
              )}
            </DialogBody>
          </TabsContent>

          {/* Tab: Anexos */}
          <TabsContent value="anexos">
            <DialogBody className="space-y-4">
              <AnexosDropzone value={anexosStaged} onChange={setAnexosStaged} />

              {/* Anexos já salvos */}
              {isEdit && anexos.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Anexos salvos
                  </div>
                  <div className="space-y-2">
                    {anexos.map((a) => (
                      <AnexoSalvoItem key={a.id} anexo={a} onRemove={() => handleRemoveAnexo(a.id)} />
                    ))}
                  </div>
                </div>
              )}

              {!isEdit && (
                <div className="text-[11px] text-muted-foreground bg-muted/40 px-3 py-2 rounded-md">
                  💡 Anexos novos serão gravados ao clicar em "Criar tarefa".
                </div>
              )}
            </DialogBody>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} style={{ background: projetoCor }}>
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Salvando...</>
            ) : isEdit ? 'Atualizar' : 'Criar tarefa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Item da timeline ──────────────────────────────────────────

function EventoItem({ evento, cor }: { evento: EventoLido; cor: string }) {
  const dt = new Date(evento.createdAt)
  const dtTexto = dt.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  if (evento.tipo === 'comentario') {
    return (
      <div className="flex gap-3 items-start">
        <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in srgb, ${cor} 20%, transparent)`, color: cor }}>
          <MessageSquare className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 bg-muted/40 rounded-md px-3 py-2">
          <div className="text-[11px] text-muted-foreground mb-1">{dtTexto}</div>
          <div className="text-[13px] text-foreground whitespace-pre-wrap">{evento.comentario}</div>
        </div>
      </div>
    )
  }

  // Eventos de sistema (mudança de campo)
  const meta = describeChangeEvent(evento)
  return (
    <div className="flex gap-3 items-center text-[12px] text-muted-foreground py-1">
      <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 bg-muted/60">
        {meta.icon}
      </div>
      <span className="flex-1">
        {meta.text}
        {evento.campoAntes && evento.campoDepois && (
          <span className="ml-2 inline-flex items-center gap-1 text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-muted/80 font-mono text-foreground">{evento.campoAntes}</span>
            <ArrowRight className="h-3 w-3" />
            <span className="px-1.5 py-0.5 rounded bg-muted/80 font-mono text-foreground">{evento.campoDepois}</span>
          </span>
        )}
      </span>
      <span className="text-[10px]">{dtTexto}</span>
    </div>
  )
}

function describeChangeEvent(ev: EventoLido): { icon: React.ReactNode; text: string } {
  switch (ev.tipo) {
    case 'criou': return { icon: <Plus className="h-3 w-3" />, text: 'Tarefa criada' }
    case 'status': return { icon: <Clock className="h-3 w-3" />, text: 'Status alterado' }
    case 'prioridade': return { icon: <Flag className="h-3 w-3" />, text: 'Prioridade alterada' }
    case 'prazo': return { icon: <Calendar className="h-3 w-3" />, text: 'Prazo alterado' }
    case 'responsavel': return { icon: <AlertCircle className="h-3 w-3" />, text: 'Responsável alterado' }
    case 'anexo': return { icon: <Paperclip className="h-3 w-3" />, text: `Anexou: ${ev.campoDepois ?? 'arquivo'}` }
    default: return { icon: <Clock className="h-3 w-3" />, text: ev.tipo }
  }
}

// ─── Item de anexo salvo ───────────────────────────────────────

function AnexoSalvoItem({ anexo, onRemove }: { anexo: AnexoLido; onRemove: () => void }) {
  const isImg = anexo.mimeType?.startsWith('image/') ?? false
  const tamanhoTxt = fmtBytes(anexo.tamanho)

  return (
    <div className="flex items-center gap-3 bg-muted/40 rounded-md px-3 py-2 group">
      <div className="h-8 w-8 rounded flex items-center justify-center bg-background border border-border shrink-0">
        {isImg ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-foreground truncate">{anexo.nome}</div>
        <div className="text-[11px] text-muted-foreground">{tamanhoTxt}</div>
      </div>
      <a
        href={anexo.url}
        download={anexo.nome}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1.5 rounded hover:bg-muted text-muted-foreground"
        title="Baixar"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
      <button
        onClick={onRemove}
        className="p-1.5 rounded hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remover"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
