'use client'

/**
 * MateriaisSection — chips de materiais de apoio + botão de adicionar.
 *
 * Renderiza materiais (NOTA, LINK, ARQUIVO) anexados a uma Etapa ou Passo do
 * template. Cada chip é clicável: NOTA expande inline com o texto, LINK abre
 * em nova aba, ARQUIVO faz download. O botão "+" abre um menu com as 3 opções,
 * cada qual abrindo o dialog correspondente.
 *
 * Mutations rodam via tRPC e o componente avisa o pai via onChange pra ele
 * re-fetchar o servico (ou aplicar a alteração local).
 */
import { useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'
import {
  Button, Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  Input, Label, Badge, cn,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import {
  StickyNote, Link as LinkIcon, Paperclip, Plus, Pencil, Trash2, Loader2,
  ExternalLink, Download, X,
} from 'lucide-react'

export type MaterialTipo = 'NOTA' | 'LINK' | 'ARQUIVO'

export interface Material {
  id: string
  tipo: MaterialTipo
  titulo: string
  conteudo: string
  fileName?: string | null
  fileSize?: number | null
  mimeType?: string | null
  ordem: number
}

const TIPO_META: Record<MaterialTipo, { icon: typeof StickyNote; label: string; cls: string }> = {
  NOTA:    { icon: StickyNote, label: 'Nota',    cls: 'bg-amber-50  border-amber-300  text-amber-700  hover:bg-amber-100  dark:bg-amber-950/30  dark:border-amber-800  dark:text-amber-300' },
  LINK:    { icon: LinkIcon,   label: 'Link',    cls: 'bg-sky-50    border-sky-300    text-sky-700    hover:bg-sky-100    dark:bg-sky-950/30    dark:border-sky-800    dark:text-sky-300' },
  ARQUIVO: { icon: Paperclip,  label: 'Arquivo', cls: 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300' },
}

function fmtBytes(n?: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

interface Props {
  /** Materiais já carregados pelo pai (via getServico include). */
  materiais: Material[]
  /** Container: exatamente um dos dois. */
  etapaId?: string
  passoId?: string
  /** Quando true, esconde os botões de edição (somente leitura). */
  readOnly?: boolean
  /** Após qualquer mutation bem-sucedida, pai re-fetcha o serviço. */
  onChange: () => void
  /** Densidade visual — passo usa 'compact' (chips menores). */
  density?: 'normal' | 'compact'
  /** Quando true, é renderizado inline (sem mt e sem flex-wrap). Usado pra
   *  caber alinhado com inputs em uma única linha. O botão "+ Material"
   *  fica só com o ícone (sem rótulo) pra economizar espaço. */
  inline?: boolean
  /** Itens extras pra somar no dropdown "+", abaixo de Nota/Link/Arquivo.
   *  Usado, por ex., pra incluir a opção "E-mail" que abre um dialog gerenciado
   *  externamente. Cada item: { icon, label, color, onSelect }. */
  extraDropdownItems?: Array<{
    key: string
    icon: typeof StickyNote
    label: string
    /** Classe de cor pro ícone (ex: 'text-indigo-600'). */
    iconClassName?: string
    onSelect: () => void
  }>
  /** Indicadores visuais (mini-chips só com ícone + contagem) renderizados antes
   *  do "+". Usados pra mostrar que o passo tem N e-mails de conclusão / N lembretes
   *  configurados — esses recursos abrem dialog próprio, então não viram materiais
   *  no array, mas precisam de visibilidade no row. Clique abre o dialog associado. */
  extraIndicators?: Array<{
    key: string
    icon: typeof StickyNote
    count: number
    /** Tooltip exibido no hover. */
    label: string
    /** Classes de cor pro chip (texto + borda + bg) — ex: 'bg-indigo-50 border-indigo-200 text-indigo-700'. */
    chipClassName: string
    onSelect: () => void
  }>
  /** Quando true, esconde os chips inline de cada material — o pai renderiza
   *  os chips agregados (por tipo) num lugar próprio. Botão "+" e diálogos
   *  internos continuam funcionando normalmente. */
  hideChips?: boolean
  /** Quando setado, abre o `MateriaisListDialog` filtrado por esse tipo, que
   *  lista todos os materiais daquele tipo + edit/delete/add. Usado pelo pai
   *  pra exibir o dialog quando o usuário clica no chip agregado externo. */
  openListTipo?: MaterialTipo | null
  /** Callback pra fechar o list dialog (geralmente seta openListTipo=null). */
  onCloseList?: () => void
}

export function MateriaisSection({ materiais, etapaId, passoId, readOnly, onChange, density = 'normal', inline = false, extraDropdownItems, extraIndicators, hideChips = false, openListTipo, onCloseList }: Props) {
  const [editing, setEditing] = useState<Material | null>(null)
  const [creating, setCreating] = useState<MaterialTipo | null>(null)
  const [previewing, setPreviewing] = useState<Material | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const compact = density === 'compact'

  // ── Ações dos chips ──
  const onClickChip = (m: Material) => {
    if (m.tipo === 'LINK') {
      // Abre em nova aba (defensive: bloqueia javascript: schemes)
      const safe = /^(https?:|mailto:)/i.test(m.conteudo) ? m.conteudo : `https://${m.conteudo}`
      window.open(safe, '_blank', 'noopener,noreferrer')
      return
    }
    if (m.tipo === 'ARQUIVO') {
      // Conteúdo guarda a URL completa (vinda do POST /api/upload)
      window.open(m.conteudo, '_blank', 'noopener,noreferrer')
      return
    }
    // NOTA → preview inline
    setPreviewing(m)
  }

  async function handleDelete(id: string) {
    const ok = await alerts.confirm({
      title: 'Remover material',
      text: 'O material será excluído deste fluxo.',
      confirmText: 'Remover',
    })
    if (!ok) return
    setDeletingId(id)
    try {
      await (trpc.servico as any).deleteMaterial.mutate({ id })
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className={cn('flex items-center gap-1.5 shrink-0', inline ? 'flex-nowrap' : 'flex-wrap', !inline && (compact ? 'mt-1' : 'mt-2'))}>
      {!hideChips && materiais.map(m => {
        const meta = TIPO_META[m.tipo]
        const Icon = meta.icon
        return (
          <div key={m.id} className="group relative inline-flex">
            <button
              type="button"
              onClick={() => onClickChip(m)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border font-medium transition-colors',
                compact ? 'h-6 px-1.5 text-[10px]' : 'h-7 px-2 text-[11px]',
                meta.cls,
                deletingId === m.id && 'opacity-40',
              )}
              title={m.tipo === 'NOTA' ? m.conteudo : `${meta.label} · ${m.titulo}`}
            >
              <Icon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
              <span className="max-w-[180px] truncate">{m.titulo}</span>
              {m.tipo === 'ARQUIVO' && m.fileSize ? (
                <span className="text-[9px] opacity-70 tabular-nums">{fmtBytes(m.fileSize)}</span>
              ) : null}
              {m.tipo === 'LINK'    && <ExternalLink className="h-2.5 w-2.5 opacity-50" />}
              {m.tipo === 'ARQUIVO' && <Download className="h-2.5 w-2.5 opacity-50" />}
            </button>
            {!readOnly && (
              <div className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditing(m) }}
                  className="h-4 w-4 inline-flex items-center justify-center rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/80"
                  title="Editar"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(m.id) }}
                  className="h-4 w-4 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/80"
                  title="Remover"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Indicadores extras (e-mails, lembretes) — renderizados apenas quando
          count > 0. Clique abre o dialog gerenciado pelo pai. */}
      {extraIndicators?.filter(i => i.count > 0).map(i => {
        const IndIcon = i.icon
        return (
          <button
            key={i.key}
            type="button"
            onClick={i.onSelect}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border font-medium transition-colors shrink-0 tabular-nums',
              compact ? 'h-6 px-1.5 text-[10px]' : 'h-7 px-2 text-[11px]',
              i.chipClassName,
            )}
            title={`${i.label} · ${i.count}`}
          >
            <IndIcon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
            <span>{i.count}</span>
          </button>
        )
      })}

      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1 rounded-md border border-dashed border-muted-foreground/30 text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-muted-foreground/50 transition-colors shrink-0',
                inline
                  ? 'h-8 w-8 justify-center'
                  : (compact ? 'h-6 px-1.5 text-[10px]' : 'h-7 px-2 text-[11px]'),
              )}
              title="Adicionar material de apoio"
            >
              <Plus className={inline ? 'h-3.5 w-3.5' : (compact ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
              {!inline && <span>Material</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="border border-foreground/15 shadow-lg ring-1 ring-foreground/5"
          >
            {/* `focus:[&_svg]:text-white` força o ícone a virar branco quando o
                item está em hover/focus (Radix muda o texto via data-state).
                Aplicado em cada item porque cada um carrega sua cor própria. */}
            <DropdownMenuItem onClick={() => setCreating('NOTA')} className="focus:[&_svg]:text-white">
              <StickyNote className="h-3.5 w-3.5 mr-2 text-amber-600" /> Nota / Instrução
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCreating('LINK')} className="focus:[&_svg]:text-white">
              <LinkIcon className="h-3.5 w-3.5 mr-2 text-sky-600" /> Link externo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCreating('ARQUIVO')} className="focus:[&_svg]:text-white">
              <Paperclip className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Arquivo
            </DropdownMenuItem>
            {extraDropdownItems?.map(item => {
              const ItemIcon = item.icon
              return (
                <DropdownMenuItem key={item.key} onClick={item.onSelect} className="focus:[&_svg]:text-white">
                  <ItemIcon className={cn('h-3.5 w-3.5 mr-2', item.iconClassName ?? 'text-foreground/60')} />
                  {item.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Dialog: listar materiais de um tipo (chamado externamente via openListTipo).
          Mostra todos os materiais daquele tipo + permite editar, excluir e adicionar.
          Reaproveita o MaterialDialog interno pros caminhos de criar/editar. */}
      {openListTipo && (
        <MateriaisListDialog
          tipo={openListTipo}
          materiais={materiais.filter(m => m.tipo === openListTipo)}
          readOnly={readOnly}
          deletingId={deletingId}
          onAdd={() => setCreating(openListTipo)}
          onEdit={(m) => setEditing(m)}
          onPreview={(m) => setPreviewing(m)}
          onDelete={(id) => handleDelete(id)}
          onClose={() => onCloseList?.()}
        />
      )}

      {/* Dialog: criar */}
      {creating && (
        <MaterialDialog
          mode="create"
          tipo={creating}
          etapaId={etapaId}
          passoId={passoId}
          onClose={() => setCreating(null)}
          onSaved={() => { setCreating(null); onChange() }}
        />
      )}

      {/* Dialog: editar */}
      {editing && (
        <MaterialDialog
          mode="edit"
          tipo={editing.tipo}
          etapaId={etapaId}
          passoId={passoId}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChange() }}
        />
      )}

      {/* Preview de NOTA (read-only) */}
      {previewing && (
        <Dialog open onOpenChange={(o) => !o && setPreviewing(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeaderIcon icon={StickyNote} color="amber">
              <DialogTitle>{previewing.titulo}</DialogTitle>
            </DialogHeaderIcon>
            <DialogBody>
              <div className="whitespace-pre-wrap text-sm bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-300 dark:border-amber-700 p-3 rounded">
                {previewing.conteudo}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditing(previewing); setPreviewing(null) }}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
              </Button>
              <Button onClick={() => setPreviewing(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ── Dialog de criar / editar ──────────────────────────────────────────

interface DialogProps {
  mode: 'create' | 'edit'
  tipo: MaterialTipo
  etapaId?: string
  passoId?: string
  initial?: Material
  onClose: () => void
  onSaved: () => void
}

/**
 * Dialog que lista materiais de UM tipo (Nota / Link / Arquivo) com ações
 * de editar, excluir e adicionar. Aberto quando o usuário clica no chip
 * agregado do tipo no input group do passo. Reusa o MaterialDialog interno
 * via callbacks `onAdd`/`onEdit` (que o caller controla).
 */
function MateriaisListDialog({ tipo, materiais, readOnly, deletingId, onAdd, onEdit, onPreview, onDelete, onClose }: {
  tipo: MaterialTipo
  materiais: Material[]
  readOnly?: boolean
  deletingId: string | null
  onAdd: () => void
  onEdit: (m: Material) => void
  onPreview: (m: Material) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const meta = TIPO_META[tipo]
  const Icon = meta.icon
  const titulo = tipo === 'NOTA' ? 'Notas / Instruções' : tipo === 'LINK' ? 'Links externos' : 'Arquivos anexados'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[88vh] overflow-y-auto">
        <DialogHeaderIcon icon={Icon} color={tipo === 'NOTA' ? 'amber' : tipo === 'LINK' ? 'sky' : 'emerald'}>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Materiais de apoio deste passo do tipo &quot;{meta.label}&quot;.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-2">
          {materiais.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm italic">
              Nenhum item cadastrado.
            </div>
          ) : (
            materiais.map(m => (
              <div key={m.id} className="rounded-md border bg-card p-3 flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => tipo === 'NOTA' ? onPreview(m) : tipo === 'LINK' ? window.open(m.conteudo, '_blank') : window.open(getApiUrl(m.conteudo), '_blank')}
                  className="flex-1 min-w-0 text-left"
                  title={tipo === 'NOTA' ? m.conteudo : `${meta.label}: ${m.titulo}`}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-[13px] font-semibold text-foreground truncate">{m.titulo}</h4>
                    {tipo === 'ARQUIVO' && m.fileSize ? (
                      <span className="text-[10px] text-muted-foreground tabular-nums">{fmtBytes(m.fileSize)}</span>
                    ) : null}
                  </div>
                  {tipo === 'LINK' && (
                    <p className="text-[11px] text-sky-700 dark:text-sky-300 mt-0.5 truncate font-mono">{m.conteudo}</p>
                  )}
                  {tipo === 'NOTA' && m.conteudo && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{m.conteudo}</p>
                  )}
                </button>
                {!readOnly && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(m)} className="h-7 px-2 gap-1 text-[11px]">
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => onDelete(m.id)}
                      disabled={deletingId === m.id}
                      className="h-7 px-2 gap-1 text-[11px] text-rose-600 hover:text-rose-700"
                    >
                      {deletingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={onAdd} className="w-full gap-1.5 border-dashed">
              <Plus className="h-3.5 w-3.5" /> Adicionar {meta.label.toLowerCase()}
            </Button>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MaterialDialog({ mode, tipo, etapaId, passoId, initial, onClose, onSaved }: DialogProps) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? '')
  const [conteudo, setConteudo] = useState(initial?.conteudo ?? '')
  const [fileName, setFileName] = useState<string | null>(initial?.fileName ?? null)
  const [fileSize, setFileSize] = useState<number | null>(initial?.fileSize ?? null)
  const [mimeType, setMimeType] = useState<string | null>(initial?.mimeType ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const meta = TIPO_META[tipo]
  const Icon = meta.icon

  const onUpload = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${getApiUrl()}/api/upload`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Falha no upload' }))
        throw new Error(err.message ?? 'Falha no upload')
      }
      const data = await res.json() as { url: string; filename: string }
      setConteudo(data.url)
      setFileName(file.name)
      setFileSize(file.size)
      setMimeType(file.type || null)
      if (!titulo) setTitulo(file.name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      alerts.error('Upload', (e as Error).message)
    } finally {
      setUploading(false)
    }
  }, [titulo])

  async function handleSave() {
    if (!titulo.trim()) { alerts.error('Validação', 'Informe um título.'); return }
    if (!conteudo.trim()) {
      const msg = tipo === 'ARQUIVO' ? 'Envie um arquivo.' : tipo === 'LINK' ? 'Informe a URL.' : 'Escreva a nota.'
      alerts.error('Validação', msg); return
    }
    setSaving(true)
    try {
      if (mode === 'edit' && initial) {
        await (trpc.servico as any).updateMaterial.mutate({
          id: initial.id,
          titulo: titulo.trim(),
          conteudo: conteudo.trim(),
          fileName, fileSize, mimeType,
        })
      } else {
        await (trpc.servico as any).createMaterial.mutate({
          etapaId: etapaId || null,
          passoId: passoId || null,
          tipo,
          titulo: titulo.trim(),
          conteudo: conteudo.trim(),
          fileName, fileSize, mimeType,
        })
      }
      onSaved()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeaderIcon icon={Icon} color={tipo === 'NOTA' ? 'amber' : tipo === 'LINK' ? 'sky' : 'emerald'}>
          <DialogTitle>{mode === 'edit' ? 'Editar' : 'Novo'} · {meta.label}</DialogTitle>
          <DialogDescription>
            {tipo === 'NOTA'    && 'Instrução, dica ou observação que vai aparecer junto deste item.'}
            {tipo === 'LINK'    && 'URL externa (documentação, vídeo, manual).'}
            {tipo === 'ARQUIVO' && 'PDF, planilha, modelo, exemplo — qualquer arquivo até 20MB.'}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Título *</Label>
            <Input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder={tipo === 'NOTA' ? 'Ex: Atenção — exigências da Junta' : tipo === 'LINK' ? 'Ex: Tutorial REDESIM' : 'Ex: Modelo de procuração'}
              className="h-9 text-sm"
              autoFocus
            />
          </div>

          {tipo === 'NOTA' && (
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Texto *</Label>
              <textarea
                value={conteudo}
                onChange={e => setConteudo(e.target.value)}
                rows={8}
                placeholder="Escreva instruções, dicas ou observações. Quebras de linha são preservadas."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}

          {tipo === 'LINK' && (
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">URL *</Label>
              <Input
                value={conteudo}
                onChange={e => setConteudo(e.target.value)}
                placeholder="https://..."
                type="url"
                className="h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Se faltar `https://`, prefixamos automaticamente ao abrir.
              </p>
            </div>
          )}

          {tipo === 'ARQUIVO' && (
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Arquivo *</Label>
              {conteudo ? (
                <div className="flex items-center gap-2 rounded-md border border-input bg-muted/30 p-2.5 text-sm">
                  <Paperclip className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{fileName || 'arquivo'}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtBytes(fileSize)} · <a href={conteudo} target="_blank" rel="noreferrer" className="underline hover:text-foreground">abrir</a></p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setConteudo(''); setFileName(null); setFileSize(null); setMimeType(null) }}
                    className="text-muted-foreground hover:text-destructive"
                    title="Trocar arquivo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-input p-6 cursor-pointer hover:bg-muted/30 transition-colors">
                  {uploading ? (
                    <><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Enviando...</span></>
                  ) : (
                    <>
                      <Paperclip className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs font-medium">Clique para enviar arquivo</span>
                      <span className="text-[10px] text-muted-foreground">Até 20MB · sem .exe/.bat/.cmd/.sh/.msi/.dll</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) void onUpload(f) }}
                  />
                </label>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Salvando...</> : (mode === 'edit' ? 'Salvar' : 'Adicionar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
