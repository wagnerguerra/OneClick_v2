'use client'

/**
 * PassoEmailsSection — chip inline + dialog com editor de templates de e-mail
 * de um passo do template do serviço.
 *
 * Cada passo do template pode ter N templates de e-mail que são disparados na
 * conclusão da execução (via togglePasso). Templates suportam tags dinâmicas
 * ({{cliente.razaoSocial}}, etc.) e podem exigir confirmação antes de enviar.
 *
 * UX: chip "E-mails (N)" no row do passo, igual ao MateriaisSection, abre um
 * Dialog com lista + editor de cada template. Mantém o row compacto.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'
import {
  Button, Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  Input, Label, Checkbox, cn, RichEditor,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'

/** Type pro editor TipTap exposto via onReady (sem import direto pra evitar
 *  adicionar @tiptap/react como dep do apps/web — só precisamos do .chain). */
type TiptapEditorLike = {
  chain: () => {
    focus: () => {
      insertContent: (content: string) => { run: () => void }
    }
  }
}
import { Mail, Plus, Pencil, Trash2, Loader2, X, Tag, Save, Paperclip, Download, Send } from 'lucide-react'

interface EmailAnexo {
  id: string
  fileName: string
  storageKey: string
  fileSize: number | null
  mimeType: string | null
  createdAt: string
}

interface EmailTemplate {
  id: string
  passoId: string
  nome: string
  assunto: string
  corpo: string
  destinatarios: string[]
  ativo: boolean
  ordem: number
  exigirConfirmacao: boolean
  anexos?: EmailAnexo[]
  createdAt: string
  updatedAt: string
}

interface Props {
  passoId: string
  /** Quando true, esconde os botões de edição. */
  readOnly?: boolean
  density?: 'normal' | 'compact'
  /** Render inline (botão "+" sem rótulo). */
  inline?: boolean
  /** Controle externo do dialog — usado quando o gatilho fica em outro lugar
   *  (ex: item do dropdown do MateriaisSection). Quando `hideTrigger=true`,
   *  o chip próprio não é renderizado e o dialog abre via `open`. */
  controlled?: {
    open: boolean
    onOpenChange: (o: boolean) => void
    hideTrigger?: boolean
  }
  /** Reporta contagem de templates ativos sempre que a lista muda (evita
   *  refetch global da página pelo pai). */
  onCountChange?: (count: number) => void
}

// Tags suportadas no assunto/corpo — exibidas como chips clicáveis no editor.
// Manter SINCRONIZADO com o dict do `resolveTagsTexto` em servico.service.ts.
const SUPPORTED_TAGS: Array<{ grupo: string; tag: string; label: string }> = [
  // Cliente
  { grupo: 'Cliente',     tag: '{{cliente.razaoSocial}}',        label: 'Razão social' },
  { grupo: 'Cliente',     tag: '{{cliente.nomeFantasia}}',       label: 'Nome fantasia' },
  { grupo: 'Cliente',     tag: '{{cliente.documento}}',          label: 'Documento (CNPJ/CPF)' },
  { grupo: 'Cliente',     tag: '{{cliente.email}}',              label: 'E-mail' },
  { grupo: 'Cliente',     tag: '{{cliente.telefone}}',           label: 'Telefone' },
  { grupo: 'Cliente',     tag: '{{cliente.inscricaoEstadual}}',  label: 'Inscrição Estadual' },
  { grupo: 'Cliente',     tag: '{{cliente.inscricaoMunicipal}}', label: 'Inscrição Municipal' },
  { grupo: 'Cliente',     tag: '{{cliente.regime}}',             label: 'Regime contábil' },
  { grupo: 'Cliente',     tag: '{{cliente.tributacao}}',         label: 'Tributação' },
  { grupo: 'Cliente',     tag: '{{cliente.dataEntrada}}',        label: 'Data de entrada' },
  { grupo: 'Cliente',     tag: '{{cliente.dataEntradaExtenso}}', label: 'Data de entrada (por extenso)' },
  { grupo: 'Cliente',     tag: '{{cliente.nire}}',               label: 'NIRE' },
  { grupo: 'Cliente',     tag: '{{cliente.endereco}}',           label: 'Endereço completo' },
  { grupo: 'Cliente',     tag: '{{cliente.cidade}}',             label: 'Cidade' },
  { grupo: 'Cliente',     tag: '{{cliente.uf}}',                 label: 'UF' },
  { grupo: 'Cliente',     tag: '{{cliente.cep}}',                label: 'CEP' },
  { grupo: 'Cliente',     tag: '{{cliente.areasContratadas}}',   label: 'Áreas contratadas' },
  // Responsável
  { grupo: 'Responsável', tag: '{{responsavel.name}}',           label: 'Nome completo' },
  { grupo: 'Responsável', tag: '{{responsavel.firstName}}',      label: 'Primeiro nome' },
  { grupo: 'Responsável', tag: '{{responsavel.email}}',          label: 'E-mail' },
  // Empresa
  { grupo: 'Empresa',     tag: '{{empresa.razaoSocial}}',        label: 'Razão social' },
  { grupo: 'Empresa',     tag: '{{empresa.nomeFantasia}}',       label: 'Nome fantasia' },
  { grupo: 'Empresa',     tag: '{{empresa.documento}}',          label: 'Documento (CNPJ)' },
  { grupo: 'Empresa',     tag: '{{empresa.email}}',              label: 'E-mail' },
  { grupo: 'Empresa',     tag: '{{empresa.telefone}}',           label: 'Telefone' },
  // Serviço
  { grupo: 'Serviço',     tag: '{{servico.nome}}',               label: 'Nome do serviço' },
  { grupo: 'Serviço',     tag: '{{etapa.nome}}',                 label: 'Nome da etapa' },
  { grupo: 'Serviço',     tag: '{{passo.nome}}',                 label: 'Nome do passo' },
  // Data (sempre disponível — gerada no envio)
  { grupo: 'Data',        tag: '{{data.hoje}}',                  label: 'Hoje (DD/MM/AAAA)' },
  { grupo: 'Data',        tag: '{{data.hojeExtenso}}',           label: 'Hoje (por extenso)' },
  { grupo: 'Data',        tag: '{{data.dia}}',                   label: 'Dia' },
  { grupo: 'Data',        tag: '{{data.mes}}',                   label: 'Mês (por extenso)' },
  { grupo: 'Data',        tag: '{{data.mesNum}}',                label: 'Mês (número)' },
  { grupo: 'Data',        tag: '{{data.ano}}',                   label: 'Ano' },
  { grupo: 'Data',        tag: '{{data.diaSemana}}',             label: 'Dia da semana' },
]

export function PassoEmailsSection({ passoId, readOnly, density = 'normal', inline = false, controlled, onCountChange }: Props) {
  const [openInternal, setOpenInternal] = useState(false)
  const open = controlled?.open ?? openInternal
  const setOpen = controlled?.onOpenChange ?? setOpenInternal
  const hideTrigger = controlled?.hideTrigger === true
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(false)
  // Só dispara onCountChange depois do 1º fetch real (evita zerar o count
  // inicial vindo do backend via _count.emailTemplates em getServico).
  const [hasLoaded, setHasLoaded] = useState(false)
  const compact = density === 'compact'

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (trpc.servico as any).listPassoEmailTemplates.query({ passoId }) as EmailTemplate[]
      setTemplates(data)
      setHasLoaded(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [passoId])

  // Só fetcha quando o dialog abre — a contagem inicial pra o indicador já vem
  // do `_count.emailTemplates` via getServico, então não precisamos carregar a
  // lista em todo mount. Carregar no mount provocava HTTP 431 (Request Header
  // Too Large) em serviços com muitos passos: o tRPC batching agrupava N
  // chamadas numa URL gigante (> ~8KB) que o servidor rejeitava.
  useEffect(() => { if (open) void fetchTemplates() }, [open, fetchTemplates])

  const count = templates.length
  // Mantém o callback numa ref pra não entrar nas deps do effect — se o pai
  // re-renderiza, a função muda de identidade mas a ref aponta sempre pra
  // versão mais recente. Sem isso, o effect entra em loop infinito.
  const onCountChangeRef = useRef(onCountChange)
  useEffect(() => { onCountChangeRef.current = onCountChange }, [onCountChange])
  useEffect(() => {
    if (!hasLoaded) return
    onCountChangeRef.current?.(templates.filter(t => t.ativo).length)
  }, [templates, hasLoaded])

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border font-medium transition-colors shrink-0',
            compact ? 'h-6 px-1.5 text-[10px]' : 'h-7 px-2 text-[11px]',
            count > 0
              ? 'bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-800 dark:text-indigo-300'
              : 'border-dashed border-muted-foreground/30 text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-muted-foreground/50',
          )}
          title="E-mails de conclusão do passo"
        >
          <Mail className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          {inline && count === 0 ? null : (
            <span>{count > 0 ? `E-mails · ${count}` : 'E-mails'}</span>
          )}
        </button>
      )}

      {open && (
        <EmailTemplatesDialog
          passoId={passoId}
          templates={templates}
          loading={loading}
          readOnly={readOnly}
          onClose={() => setOpen(false)}
          onRefetch={fetchTemplates}
        />
      )}
    </>
  )
}

// ── Dialog com lista + editor inline ──────────────────────────────────────

interface DialogProps {
  passoId: string
  templates: EmailTemplate[]
  loading: boolean
  readOnly?: boolean
  onClose: () => void
  onRefetch: () => Promise<void>
}

function EmailTemplatesDialog({ passoId, templates, loading, readOnly, onClose, onRefetch }: DialogProps) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[1360px] max-h-[88vh] overflow-y-auto">
        <DialogHeaderIcon icon={Mail} color="indigo">
          <DialogTitle>E-mails de conclusão do passo</DialogTitle>
          <DialogDescription>
            Modelos disparados quando este passo for marcado como concluído na execução. Use tags como{' '}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{'{{cliente.razaoSocial}}'}</code>{' '}
            para personalizar o conteúdo.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          {loading && templates.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              {templates.length === 0 && editingId !== 'new' && (
                <div className="text-center py-8 text-muted-foreground text-sm italic">
                  Nenhum modelo de e-mail cadastrado para este passo.
                </div>
              )}

              {templates.map(t => (
                editingId === t.id ? (
                  <TemplateEditor
                    key={t.id}
                    mode="edit"
                    passoId={passoId}
                    initial={t}
                    onCancel={() => setEditingId(null)}
                    onSaved={async () => { setEditingId(null); await onRefetch() }}
                    onDeleted={async () => { setEditingId(null); await onRefetch() }}
                  />
                ) : (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    readOnly={readOnly}
                    onEdit={() => setEditingId(t.id)}
                  />
                )
              ))}

              {editingId === 'new' && (
                <TemplateEditor
                  mode="create"
                  passoId={passoId}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => { setEditingId(null); await onRefetch() }}
                />
              )}

              {!readOnly && editingId !== 'new' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingId('new')}
                  className="w-full gap-1.5 border-dashed"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar e-mail
                </Button>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Row resumido (modo leitura) ──────────────────────────────────────

function TemplateRow({ template, readOnly, onEdit }: {
  template: EmailTemplate
  readOnly?: boolean
  onEdit: () => void
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[13px] font-semibold text-foreground truncate">{template.nome}</h4>
            {template.exigirConfirmacao && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                Exige confirmação
              </span>
            )}
            {!template.ativo && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-semibold bg-muted text-muted-foreground border">
                Inativo
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            <span className="font-medium">Assunto:</span> {template.assunto}
          </p>
          {template.destinatarios.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              Para: {template.destinatarios.join(', ')}
            </p>
          )}
        </div>
        {!readOnly && (
          <Button variant="ghost" size="sm" onClick={onEdit} className="gap-1 h-7 px-2 text-[11px] shrink-0">
            <Pencil className="h-3 w-3" /> Editar
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Editor inline (criar/editar) ──────────────────────────────────────

interface EditorProps {
  mode: 'create' | 'edit'
  passoId: string
  initial?: EmailTemplate
  onCancel: () => void
  onSaved: () => void | Promise<void>
  onDeleted?: () => void | Promise<void>
}

function TemplateEditor({ mode, passoId, initial, onCancel, onSaved, onDeleted }: EditorProps) {
  const [nome, setNome] = useState(initial?.nome ?? '')
  const [assunto, setAssunto] = useState(initial?.assunto ?? '')
  const [corpo, setCorpo] = useState(initial?.corpo ?? '')
  const [destinatarios, setDestinatarios] = useState<string[]>(initial?.destinatarios ?? [])
  const [exigirConfirmacao, setExigirConfirmacao] = useState(initial?.exigirConfirmacao ?? false)
  const [ativo, setAtivo] = useState(initial?.ativo ?? true)
  const [destinatarioDraft, setDestinatarioDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [testando, setTestando] = useState(false)
  /** Diálogo de envio de teste — pede o destinatário e dispara backend. */
  const [testOpen, setTestOpen] = useState(false)
  const [testEmail, setTestEmail] = useState('')

  const assuntoRef = useRef<HTMLInputElement>(null)
  // Ref pra instância do editor TipTap — usada por insertTagAtCursor pra inserir
  // tag dinâmica no cursor atual. Setada via onReady do RichEditor.
  const corpoEditorRef = useRef<TiptapEditorLike | null>(null)
  const lastFocusedRef = useRef<'corpo' | 'assunto'>('corpo')

  function insertTagAtCursor(tag: string) {
    // Insere a tag no campo focado mais recentemente (corpo por default)
    const target = lastFocusedRef.current === 'assunto' ? 'assunto' : 'corpo'
    if (target === 'corpo') {
      // RichEditor — usa comando TipTap pra inserir no cursor atual.
      // Fallback: append no fim do HTML se editor não está pronto.
      const editor = corpoEditorRef.current
      if (!editor) { setCorpo(c => c + tag); return }
      editor.chain().focus().insertContent(tag).run()
    } else {
      const el = assuntoRef.current
      if (!el) { setAssunto(a => a + tag); return }
      const start = el.selectionStart ?? assunto.length
      const end = el.selectionEnd ?? assunto.length
      const next = assunto.slice(0, start) + tag + assunto.slice(end)
      setAssunto(next)
      requestAnimationFrame(() => {
        el.focus()
        const pos = start + tag.length
        el.setSelectionRange(pos, pos)
      })
    }
  }

  function commitDestinatarioDraft() {
    const raw = destinatarioDraft.trim().replace(/[,;]+$/, '')
    if (!raw) { setDestinatarioDraft(''); return }
    // Validação básica de e-mail
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      alerts.error('E-mail inválido', `"${raw}" não é um e-mail válido.`)
      return
    }
    if (destinatarios.includes(raw)) { setDestinatarioDraft(''); return }
    setDestinatarios([...destinatarios, raw])
    setDestinatarioDraft('')
  }

  function removeDestinatario(i: number) {
    setDestinatarios(destinatarios.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    if (!nome.trim()) { alerts.error('Validação', 'Informe um nome para o modelo.'); return }
    if (!assunto.trim()) { alerts.error('Validação', 'Informe o assunto.'); return }
    if (!corpo.trim()) { alerts.error('Validação', 'Escreva o corpo do e-mail.'); return }
    setSaving(true)
    try {
      if (mode === 'edit' && initial) {
        await (trpc.servico as any).updatePassoEmailTemplate.mutate({
          id: initial.id,
          data: {
            nome: nome.trim(),
            assunto: assunto.trim(),
            corpo: corpo.trim(),
            destinatarios,
            exigirConfirmacao,
            ativo,
          },
        })
      } else {
        await (trpc.servico as any).createPassoEmailTemplate.mutate({
          passoId,
          nome: nome.trim(),
          assunto: assunto.trim(),
          corpo: corpo.trim(),
          destinatarios,
          exigirConfirmacao,
          ativo,
          ordem: 0,
        })
      }
      await onSaved()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /** Envia o template como e-mail de teste pro endereço informado.
   *  Usa dados de exemplo nas tags ({{cliente.razaoSocial}} = "Cliente Exemplo Ltda" etc). */
  async function handleEnviarTeste() {
    if (!initial) return
    const dest = testEmail.trim()
    if (!dest || !/@/.test(dest)) {
      alerts.error('E-mail inválido', 'Informe um e-mail válido pra receber o teste.')
      return
    }
    setTestando(true)
    try {
      await (trpc.servico as any).enviarEmailTesteTemplate.mutate({
        templateId: initial.id,
        destinatarios: [dest],
      })
      setTestOpen(false)
      setTestEmail('')
      await alerts.success('Enviado!', `E-mail de teste enviado para ${dest}.`)
    } catch (e) {
      alerts.error('Falha no envio', (e as Error).message)
    } finally {
      setTestando(false)
    }
  }

  async function handleDelete() {
    if (!initial) return
    const ok = await alerts.confirm({
      title: 'Excluir modelo de e-mail',
      text: `O modelo "${initial.nome}" será removido permanentemente.`,
      confirmText: 'Excluir',
      icon: 'warning',
    })
    if (!ok) return
    setDeleting(true)
    try {
      await (trpc.servico as any).deletePassoEmailTemplate.mutate({ id: initial.id })
      await onDeleted?.()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-md border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/10 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-indigo-600" />
        <h4 className="text-[13px] font-semibold text-foreground">
          {mode === 'edit' ? 'Editar modelo' : 'Novo modelo de e-mail'}
        </h4>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold">Nome do modelo *</Label>
        <Input
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder="Ex: Aviso ao cliente — documentação enviada"
          className="h-9 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold">Assunto *</Label>
        <Input
          ref={assuntoRef}
          value={assunto}
          onChange={e => setAssunto(e.target.value)}
          onFocus={() => { lastFocusedRef.current = 'assunto' }}
          placeholder="Ex: {{servico.nome}} — etapa concluída"
          className="h-9 text-sm font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold">Corpo do e-mail *</Label>
        {/* RichEditor (TipTap) — salva HTML. Suporta negrito/itálico/listas/links/imagens.
            Imagens são enviadas via POST /api/upload e inseridas como <img src="/api/upload/...">.
            O resolveTagsTexto do backend substitui {{...}} no HTML antes do envio. */}
        <div onFocus={() => { lastFocusedRef.current = 'corpo' }}>
          <RichEditor
            value={corpo}
            onChange={(html) => setCorpo(html)}
            onReady={(editor) => { corpoEditorRef.current = editor as unknown as TiptapEditorLike }}
            placeholder='Olá {{cliente.razaoSocial}}, ...'
          />
        </div>
        {/* Chips de tags clicáveis — agrupados por categoria (Cliente / Responsável /
            Empresa / Serviço / Data) pra facilitar localização. */}
        <div className="space-y-2 pt-2 rounded-md border bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            <Tag className="h-3 w-3" />
            Variáveis disponíveis — clique pra inserir no cursor
          </div>
          {(() => {
            const grupos = new Map<string, typeof SUPPORTED_TAGS>()
            for (const t of SUPPORTED_TAGS) {
              if (!grupos.has(t.grupo)) grupos.set(t.grupo, [])
              grupos.get(t.grupo)!.push(t)
            }
            return Array.from(grupos.entries()).map(([grupo, tags]) => (
              <div key={grupo} className="space-y-1">
                <div className="text-[10px] font-semibold text-muted-foreground">{grupo}</div>
                <div className="flex flex-wrap gap-1">
                  {tags.map(({ tag, label }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertTagAtCursor(tag)}
                      title={`${label} · ${tag}`}
                      className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-indigo-950/30 text-[10px] font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))
          })()}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold">Destinatários padrão</Label>
        <div
          className="flex flex-wrap gap-1.5 items-center min-h-[36px] px-2 py-1 border border-input rounded-md bg-background text-sm focus-within:ring-1 focus-within:ring-ring cursor-text"
          onClick={(e) => {
            const input = (e.currentTarget.querySelector('input') as HTMLInputElement | null)
            input?.focus()
          }}
        >
          {destinatarios.map((email, i) => (
            <span
              key={`${email}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 pl-2.5 pr-1 py-0.5 text-xs font-medium"
            >
              {email}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeDestinatario(i) }}
                className="rounded-full hover:bg-rose-200 dark:hover:bg-rose-900/50 p-0.5"
                title="Remover"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            type="email"
            value={destinatarioDraft}
            onChange={e => setDestinatarioDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') {
                if (destinatarioDraft.trim()) {
                  e.preventDefault()
                  commitDestinatarioDraft()
                }
              } else if (e.key === 'Backspace' && !destinatarioDraft && destinatarios.length > 0) {
                e.preventDefault()
                removeDestinatario(destinatarios.length - 1)
              }
            }}
            onBlur={() => { if (destinatarioDraft.trim()) commitDestinatarioDraft() }}
            placeholder={destinatarios.length === 0 ? 'Digite um e-mail e Enter' : ''}
            className="flex-1 min-w-[140px] border-none bg-transparent outline-none shadow-none p-0 py-1 h-auto rounded-none focus:border-none focus:shadow-none focus:outline-none text-sm"
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Destinatários adicionais podem ser informados na hora do envio.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={exigirConfirmacao}
            onCheckedChange={(v) => setExigirConfirmacao(!!v)}
          />
          <span className="text-[13px]">Exigir confirmação antes de enviar</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={ativo}
            onCheckedChange={(v) => setAtivo(!!v)}
          />
          <span className="text-[13px]">Modelo ativo (será considerado na conclusão do passo)</span>
        </label>
      </div>

      {/* Anexos — só disponíveis em modo edit (precisa do templateId).
          Após criar o template, basta editar pra anexar arquivos. */}
      {mode === 'edit' && initial && (
        <AnexosEditor templateId={initial.id} initialAnexos={initial.anexos ?? []} />
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          {mode === 'edit' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Excluir
            </Button>
          )}
          {mode === 'edit' && initial && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTestOpen(true)}
              disabled={saving || deleting || testando}
              className="gap-1.5"
              title="Enviar este modelo como e-mail de teste com dados de exemplo"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar teste
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving || deleting}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || deleting} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {mode === 'edit' ? 'Salvar' : 'Adicionar'}
          </Button>
        </div>
      </div>

      {/* Dialog: envio de teste — pede e-mail destinatário e dispara backend. */}
      {testOpen && (
        <Dialog open onOpenChange={(o) => !o && !testando && setTestOpen(false)}>
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeaderIcon icon={Send} color="indigo">
              <DialogTitle>Enviar e-mail de teste</DialogTitle>
              <DialogDescription>
                O template será renderizado com <strong>dados de exemplo</strong> (cliente, responsável, datas, etc.)
                e enviado pro e-mail informado. Anexos do template também são incluídos.
              </DialogDescription>
            </DialogHeaderIcon>
            <DialogBody className="space-y-2">
              <Label className="text-[13px] font-semibold">E-mail do destinatário *</Label>
              <Input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !testando) void handleEnviarTeste() }}
                placeholder="seu.email@exemplo.com"
                autoFocus
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                O assunto vem precedido de <code className="bg-muted px-1 rounded">[TESTE]</code> e o corpo tem um banner
                explicando que é um envio de demonstração.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTestOpen(false)} disabled={testando}>
                Cancelar
              </Button>
              <Button onClick={handleEnviarTeste} disabled={testando || !testEmail.trim()} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700">
                {testando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function fmtBytes(n?: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Editor de anexos do template de e-mail. Lista os anexos atuais + botão de
 * upload. Upload vai pra POST /api/upload (multer) e o resultado é vinculado
 * ao template via tRPC. Cada anexo pode ser baixado (Download) ou removido.
 */
function AnexosEditor({ templateId, initialAnexos }: {
  templateId: string
  initialAnexos: EmailAnexo[]
}) {
  const [anexos, setAnexos] = useState<EmailAnexo[]>(initialAnexos)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', body: fd, credentials: 'include' })
      if (!res.ok) throw new Error(`Falha no upload (HTTP ${res.status})`)
      const { url, filename } = await res.json() as { url: string; filename: string }
      // url = '/api/upload/<filename>'. Persistimos só o storageKey (filename).
      const novo = await (trpc.servico as any).addEmailTemplateAnexo.mutate({
        templateId,
        fileName: file.name,
        storageKey: filename,
        fileSize: file.size,
        mimeType: file.type || null,
      }) as EmailAnexo
      // Pequeno hack: backend não retorna createdAt no shape aqui? — vou esperar
      // que retorne. Caso não venha, usar timestamp atual.
      setAnexos(prev => [...prev, { ...novo, createdAt: novo.createdAt ?? new Date().toISOString() }])
      void url // var não usada
    } catch (e) {
      alerts.error('Erro no upload', (e as Error).message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este anexo do modelo?')) return
    setDeletingId(id)
    try {
      await (trpc.servico as any).deleteEmailTemplateAnexo.mutate({ id })
      setAnexos(prev => prev.filter(a => a.id !== id))
    } catch (e) {
      alerts.error('Erro ao remover', (e as Error).message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[12px] font-semibold flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5 text-emerald-600" />
          Anexos do e-mail
          {anexos.length > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums font-normal">
              · {anexos.length}
            </span>
          )}
        </Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="h-7 px-2 gap-1 text-[11px]"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Adicionar anexo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void handleUpload(f)
          }}
        />
      </div>
      {anexos.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">Nenhum anexo. Os arquivos adicionados aqui são enviados junto com o e-mail.</p>
      ) : (
        <div className="space-y-1">
          {anexos.map(a => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
              <Paperclip className="h-3 w-3 text-emerald-600 shrink-0" />
              <span className="flex-1 min-w-0 text-[12px] truncate" title={a.fileName}>{a.fileName}</span>
              {a.fileSize ? (
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{fmtBytes(a.fileSize)}</span>
              ) : null}
              <a
                href={`${getApiUrl()}/api/upload/${a.storageKey}`}
                target="_blank"
                rel="noopener noreferrer"
                download={a.fileName}
                className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                title="Baixar"
              >
                <Download className="h-3 w-3" />
              </a>
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                disabled={deletingId === a.id}
                className="inline-flex items-center justify-center h-6 w-6 rounded text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 shrink-0"
                title="Remover"
              >
                {deletingId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
