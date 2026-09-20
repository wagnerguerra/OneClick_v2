'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Loader2, X, ChevronDown, Paperclip,
  Bug, Lightbulb, HelpCircle, ClipboardList,
  AlertTriangle, Zap, AlertCircle, Snowflake, RotateCcw,
} from 'lucide-react'
import {
  Input, Label, RichEditor, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { BADGE } from '@/lib/color-styles'
import { alerts } from '@/lib/alerts'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { AnexosDropzone, type AnexoStaged } from './anexos-dropzone'
import {
  HELPDESK_PRIORIDADE, HELPDESK_PRIORIDADE_LABELS, HELPDESK_PRIORIDADE_COLORS,
  type HelpdeskPrioridade, type HelpdeskTipo,
} from '@saas/types'

/**
 * #HLP0330 — formulário de novo ticket COMPARTILHADO entre a modal completa
 * (NovoTicketModal) e o balão do FAB (FloatingFeedbackButton). Antes eram duas
 * implementações divergentes (o balão não tinha título, categoria, todos os
 * tipos, nem prioridade); agora os dois montam os MESMOS campos e a MESMA
 * submissão via `useTicketForm` + `TicketFormFields`. Cada container só cuida da
 * moldura (Dialog vs popover) e do que fazer no sucesso.
 */

// Chips de tipo — MESMA config nos dois lugares. Ordem/labels/ícones definidos
// com o usuário: Erro, Sugestão, Dúvida, Requisição (o enum guarda os valores
// canônicos INCIDENTE/MELHORIA/DUVIDA/REQUISICAO).
const TIPO_CHIPS: Array<{ valor: HelpdeskTipo; label: string; icon: typeof Bug; cor: string }> = [
  { valor: 'INCIDENTE',  label: 'Erro',       icon: Bug,           cor: '#dc2626' },
  { valor: 'MELHORIA',   label: 'Sugestão',   icon: Lightbulb,     cor: '#f59e0b' },
  { valor: 'DUVIDA',     label: 'Dúvida',     icon: HelpCircle,    cor: '#3b82f6' },
  { valor: 'REQUISICAO', label: 'Requisição', icon: ClipboardList, cor: '#8b5cf6' },
]

const PRIORIDADE_ICON: Record<HelpdeskPrioridade, typeof Snowflake> = {
  BAIXA: Snowflake, MEDIA: AlertCircle, ALTA: AlertTriangle, URGENTE: Zap,
}

/**
 * Serviço interno da TI que classifica o chamado. Substituiu a categoria: dele
 * saem a área (roteamento), o SLA e o checklist executável.
 *
 * `temChecklist` vem marcado porque a maioria dos serviços internos ainda não
 * tem etapas cadastradas — o seletor mostra todos e sinaliza quais não
 * entregam roteiro, em vez de esconder e deixar o chamado sem classificação.
 */
export interface ServicoChamado {
  id: string
  nome: string
  area: { id: string; name: string } | null
  slaHoras: number | null
  temChecklist: boolean
  etapas: number
  tipos: string[]
}

export interface TicketCriado { id: string; numero: number; hash: string }

/**
 * #HLP0384 — rascunho do novo ticket.
 *
 * Relato do usuario: "o ticket apaga quando voce troca de pagina... nao e como
 * no e-mail que voce consegue ter um rascunho". A modal fecha no clique fora e
 * na navegacao, e o que estava digitado ia junto — inclusive quando a pessoa so
 * saiu para BUSCAR o dado que faltava no proprio ticket.
 *
 * Mesmo mecanismo da "Nova Oportunidade" do CRM: o que foi digitado fica no
 * navegador enquanto o formulario esta aberto, e volta na proxima abertura.
 * Como o formulario e compartilhado, a modal e o balao do FAB ganham juntos.
 *
 * Uma chave so, sem id de usuario — igual ao CRM. O rascunho vive no navegador
 * da pessoa e some ao criar o ticket ou ao descartar.
 */
const RASCUNHO_KEY = 'helpdesk:novo-ticket:rascunho'

interface RascunhoTicket {
  titulo: string
  descricao: string
  tipo: HelpdeskTipo | null
  prioridade: HelpdeskPrioridade
  /** Rascunho antigo guardava `categoriaId`; some sozinho, o campo só fica vazio. */
  servicoId: string | null
  anexos: AnexoStaged[]
}

/** Texto do editor sem marcacao — o RichEditor entrega "<p></p>" vazio. */
function textoPuro(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
}

/** Vale a pena guardar? Tipo sozinho nao conta: e um clique, nao digitacao. */
export function rascunhoTemConteudo(r: Partial<RascunhoTicket>): boolean {
  return !!(r.titulo?.trim() || textoPuro(r.descricao ?? '') || (r.anexos?.length ?? 0) > 0)
}

/**
 * Anexos que podem ir para o rascunho.
 *
 * So os de upload CONCLUIDO: 'uploading' e 'error' nao tem `fileUrl` valido, e
 * voltariam como card quebrado. O `previewUrl` cai fora porque e um ObjectURL —
 * vale so enquanto a aba viver, e a graca do rascunho e justamente sobreviver a
 * ela; guardado, viraria uma imagem quebrada na proxima abertura.
 */
export function anexosPersistiveis(anexos: AnexoStaged[]): AnexoStaged[] {
  return anexos
    .filter(a => a.status === 'ready' && !!a.fileUrl)
    .map(a => ({ ...a, previewUrl: undefined }))
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Estado + lógica do formulário de novo ticket. As especificidades do FAB entram
 * por opção, sem ramificar a lógica:
 *  - `pageUrl`: anexa um rodapé "📍 Página: <link>" (HYPERLINK) à descrição.
 *  - `tags`: tags extras no create (ex.: 'fab-feedback').
 * O `active` liga a carga de serviços e reseta os campos ao desativar (fechar).
 * No sucesso, chama `onCreated(ticket)` — quem monta decide o que fazer (a modal
 * avisa+fecha; o balão mostra a tela de sucesso).
 */
export function useTicketForm(opts: {
  active: boolean
  onCreated?: (t: TicketCriado) => void
  pageUrl?: string
  tags?: string[]
  /** Override da visibilidade de prioridade; senão decide pelo perfil. */
  permitePrioridade?: boolean
  /**
   * Título opcional: se em branco, gera automaticamente a partir do tipo + início
   * da descrição (comportamento do balão original restaurado). Usado pelo FAB; o
   * modal deixa `false` (título obrigatório).
   */
  autoTitulo?: boolean
}) {
  const { active, onCreated, pageUrl, tags, permitePrioridade, autoTitulo } = opts
  const { profile } = useCurrentUserProfile()
  // Quem pode atuar como agente classifica prioridade ao abrir; demais ficam sem
  // o campo (default MEDIA gravado no backend, a TI classifica na triagem).
  const mostrarPrioridade = permitePrioridade ?? (
    !!profile && (
      profile.isMaster
      || (profile as { isEmpresaMaster?: boolean }).isEmpresaMaster === true
      || profile.role === 'DIRETOR'
      || profile.role === 'COORDENADOR'
      || profile.role === 'GESTOR'
      || (profile as { profile?: string }).profile === 'SUPERVISOR'
      || (profile as { profile?: string }).profile === 'GERENTE'
      || (profile as { profile?: string }).profile === 'ADMIN'
    )
  )

  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  // Sem tipo default — obriga a escolha explícita (os chips deixam claro).
  const [tipo, setTipo] = useState<HelpdeskTipo | null>(null)
  const [prioridade, setPrioridade] = useState<HelpdeskPrioridade>('MEDIA')
  const [servicoId, setServicoId] = useState<string | null>(null)
  const [servicos, setServicos] = useState<ServicoChamado[]>([])
  const [anexos, setAnexos] = useState<AnexoStaged[]>([])
  const [loadingCats, setLoadingCats] = useState(false)
  const [salvando, setSalvando] = useState(false)
  /** Reabrimos com o que a pessoa tinha digitado? Vira aviso na tela. */
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false)
  /**
   * Contador de restauracoes — vira `key` do RichEditor, forcando a remontagem.
   *
   * Relatado no proprio #HLP0384: o aviso "recuperamos o que voce escreveu"
   * aparecia sobre uma descricao EM BRANCO — pior do que nao ter rascunho,
   * porque promete um texto que nao esta la.
   *
   * O estado recebe o texto; quem nao o exibe e o editor. Ele nasce com
   * `content: value` na montagem e depois so aceita valor externo passando por
   * varias guardas (eco do proprio onChange, campo em foco, comparacao de
   * HTML) — guardas que existem para o auto-save de outras telas nao reverter o
   * que esta sendo digitado, e que nao dao para relaxar sem risco em toda a
   * aplicacao. Conferido em `ticket-form-editor.test.tsx`: sem a remontagem, o
   * `.ProseMirror` fica vazio mesmo com o estado preenchido.
   *
   * Remontar resolve na raiz e so aqui: o editor e criado ja com o conteudo.
   */
  const [restauracaoSeq, setRestauracaoSeq] = useState(0)
  /**
   * Trava a gravacao logo apos criar o ticket.
   *
   * Sem ela havia uma corrida: o ticket e criado, apagamos a chave, mas o
   * formulario continua montado com o texto por mais um render — e o efeito de
   * gravacao reescrevia o rascunho que acabara de ser publicado. Na abertura
   * seguinte o ticket ja enviado reaparecia como rascunho.
   */
  const suprimirGravacao = useRef(false)
  /**
   * Pula o PRIMEIRO disparo da gravação depois de abrir.
   *
   * No commit em que `active` vira `true` os dois efeitos rodam, e o de
   * restauração apenas AGENDA os `setState` — a gravação ainda enxerga o
   * formulário vazio do render anterior. Sem este pulo ela apaga a chave e só
   * a reescreve no render seguinte, a partir do que a restauração já leu.
   *
   * Não chega a perder o rascunho (a leitura acontece antes), mas abre uma
   * janela de um frame em que a chave não existe, e faz a corretude depender
   * de a restauração estar declarada ANTES daqui. Estava declarada DEPOIS na
   * primeira versão, e aí o rascunho realmente nunca voltava — três testes de
   * `ticket-form-rascunho.test.tsx` cobrem esse arranjo.
   */
  const puloDeAbertura = useRef(false)

  const limparRascunho = useCallback(() => {
    try { if (typeof window !== 'undefined') localStorage.removeItem(RASCUNHO_KEY) } catch { /* privado/quota */ }
  }, [])

  // Restaura ao abrir. Declarado ANTES da gravação por clareza de leitura — a
  // corretude quem garante é o `puloDeAbertura`.
  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    suprimirGravacao.current = false
    puloDeAbertura.current = true
    let restaurado = false
    try {
      const raw = localStorage.getItem(RASCUNHO_KEY)
      if (raw) {
        const d = JSON.parse(raw) as Partial<RascunhoTicket>
        if (rascunhoTemConteudo(d)) {
          setTitulo(d.titulo ?? '')
          setDescricao(d.descricao ?? '')
          setTipo(d.tipo ?? null)
          setPrioridade(d.prioridade ?? 'MEDIA')
          setServicoId(d.servicoId ?? null)
          setAnexos(d.anexos ?? [])
          restaurado = true
        }
      }
    } catch { /* rascunho corrompido — ignora e abre limpo */ }
    setRascunhoRestaurado(restaurado)
    // Mesmo lote do setDescricao: no render seguinte a `key` muda e o editor
    // remonta ja com o texto.
    if (restaurado) setRestauracaoSeq(n => n + 1)
  }, [active])

  // Grava enquanto o formulario esta aberto e ha o que guardar.
  useEffect(() => {
    if (!active || typeof window === 'undefined' || suprimirGravacao.current) return
    if (puloDeAbertura.current) { puloDeAbertura.current = false; return }
    const rascunho: RascunhoTicket = {
      titulo, descricao, tipo, prioridade, servicoId,
      anexos: anexosPersistiveis(anexos),
    }
    try {
      if (rascunhoTemConteudo(rascunho)) localStorage.setItem(RASCUNHO_KEY, JSON.stringify(rascunho))
      else localStorage.removeItem(RASCUNHO_KEY)
    } catch { /* quota/privado — tolera perder o rascunho */ }
  }, [active, titulo, descricao, tipo, prioridade, servicoId, anexos])

  // A lista de serviços depende do TIPO: escolher Incidente/Dúvida/etc refaz a
  // consulta. Sem tipo escolhido, traz todos os internos — o usuário costuma
  // clicar no tipo primeiro, mas quem restaurou rascunho já chega com um.
  useEffect(() => {
    if (!active) return
    setLoadingCats(true)
    ;(trpc.helpdesk as any).listServicosChamado.query(tipo ? { tipo } : undefined)
      .then((data: ServicoChamado[]) => setServicos(data || []))
      .catch(() => setServicos([]))
      .finally(() => setLoadingCats(false))
  }, [active, tipo])

  // Trocar o tipo pode tirar o serviço escolhido da lista. Manter a escolha
  // gravaria um chamado classificado com serviço que não atende aquele tipo —
  // erro silencioso, porque o seletor mostraria vazio e o valor iria junto.
  useEffect(() => {
    if (!servicoId || servicos.length === 0) return
    if (!servicos.some(s => s.id === servicoId)) setServicoId(null)
  }, [servicos, servicoId])

  const reset = useCallback(() => {
    setTitulo(''); setDescricao(''); setTipo(null)
    setPrioridade('MEDIA'); setServicoId(null); setAnexos([])
    // Destrava a gravação. Importa no balão do FAB: lá o `active` continua
    // `true` na tela de sucesso, então a trava posta ao criar o ticket ficaria
    // presa — e o PRÓXIMO ticket, escrito sem fechar o balão, não seria salvo.
    suprimirGravacao.current = false
  }, [])

  // Limpa os CAMPOS ao fechar — atraso leve p/ não piscar durante a animação. O
  // rascunho no navegador fica: é ele que devolve o conteúdo na próxima
  // abertura. O timeout é cancelado se a pessoa reabrir antes dos 200ms, senão
  // ele zeraria o formulário logo depois de restaurado.
  useEffect(() => {
    if (active) return
    const t = setTimeout(() => { reset(); setRascunhoRestaurado(false) }, 200)
    return () => clearTimeout(t)
  }, [active, reset])

  /** Botão "Descartar": joga fora o rascunho e zera o formulário. */
  const descartarRascunho = useCallback(async () => {
    const ok = await alerts.confirm({
      title: 'Descartar rascunho?',
      text: 'O que você digitou neste ticket será apagado.',
      confirmText: 'Descartar',
      icon: 'warning',
    })
    if (!ok) return
    limparRascunho()
    reset()
    setRascunhoRestaurado(false)
  }, [limparRascunho, reset])

  const descricaoTexto = descricao.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
  // Título só é exigido quando não é auto (o FAB gera se vazio).
  const canSubmit = (autoTitulo || titulo.trim().length >= 3)
    && !!descricaoTexto
    && !!tipo
    && !anexos.some(a => a.status === 'uploading')

  const submit = useCallback(async () => {
    const descTexto = descricao.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    if (!autoTitulo && titulo.trim().length < 3) { alerts.error('Validação', 'Título precisa ter pelo menos 3 caracteres.'); return }
    if (!tipo) { alerts.error('Validação', 'Escolha o tipo do ticket.'); return }
    if (!descTexto) { alerts.error('Validação', 'Descrição é obrigatória.'); return }
    if (anexos.some(a => a.status === 'uploading')) { alerts.error('Aguarde', 'Aguarde o upload dos anexos terminar.'); return }
    // Usa o título informado; se vazio (só quando autoTitulo, ex.: FAB), gera do
    // tipo + início da descrição — comportamento do balão original restaurado.
    const tituloFinal = titulo.trim().length >= 3
      ? titulo.trim()
      : `[${TIPO_CHIPS.find(c => c.valor === tipo)?.label ?? 'Outro'}] ${descTexto.slice(0, 80) || 'Sem título'}`
    setSalvando(true)
    try {
      const corpo = pageUrl
        ? `${descricao.trim()}<hr><p><small>📍 Página: <a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a></small></p>`
        : descricao.trim()
      const t = await (trpc.helpdesk as any).create.mutate({
        titulo: tituloFinal,
        descricao: corpo,
        tipo,
        prioridade,
        servicoId: servicoId ?? null,
        ...(tags && tags.length ? { tags } : {}),
      }) as TicketCriado
      // Anexos prontos viram HelpdeskAnexo do ticket recém-criado.
      const prontos = anexos.filter(a => a.status === 'ready' && a.fileUrl)
      for (const a of prontos) {
        try {
          await (trpc.helpdesk as any).addAnexo.mutate({
            ticketId: t.id, fileName: a.fileName, fileUrl: a.fileUrl, mimeType: a.mimeType, tamanho: a.tamanho,
          })
        } catch (e) { console.warn('[TicketForm] addAnexo falhou:', (e as Error).message) }
      }
      // O ticket virou registro: o rascunho perdeu a razao de existir.
      suprimirGravacao.current = true
      limparRascunho()
      setRascunhoRestaurado(false)
      onCreated?.(t)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }, [titulo, descricao, tipo, prioridade, servicoId, anexos, pageUrl, tags, onCreated, autoTitulo, limparRascunho])

  return {
    titulo, setTitulo, descricao, setDescricao, tipo, setTipo,
    prioridade, setPrioridade, mostrarPrioridade,
    servicoId, setServicoId, servicos, loadingCats,
    anexos, setAnexos, salvando, canSubmit, submit, reset, autoTitulo: !!autoTitulo,
    rascunhoRestaurado, descartarRascunho, restauracaoSeq,
    /** Há algo digitado? Habilita o "Descartar" e o aviso de saída. */
    temConteudo: rascunhoTemConteudo({ titulo, descricao, anexos }),
  }
}

export type TicketFormApi = ReturnType<typeof useTicketForm>

/**
 * Render dos campos do ticket. `variant='fab'` ajusta densidade (editor mais
 * baixo, dropzone compacto) e usa o **toolbar básico** do editor — especificidade
 * do balão (#HLP0160); o modal usa o toolbar completo. `onSubmitShortcut` (usado
 * pelo FAB) liga Ctrl+Enter.
 */
export function TicketFormFields({ form, variant = 'modal', onSubmitShortcut }: {
  form: TicketFormApi
  variant?: 'modal' | 'fab'
  onSubmitShortcut?: () => void
}) {
  const fab = variant === 'fab'
  return (
    <div className={cn(fab ? 'space-y-3' : 'space-y-4')}>
      {/* Rascunho recuperado — #HLP0384. Fica no topo porque o que a pessoa ve
          primeiro ao reabrir sao os campos ja preenchidos: sem a explicacao,
          parece que o sistema inventou o conteudo. */}
      {form.rascunhoRestaurado && (
        <div className={cn(
          'flex items-start gap-2 rounded-md border px-3 py-2',
          BADGE.amber,
          fab ? 'text-[11px]' : 'text-xs',
        )}>
          <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Recuperamos o que você tinha começado a escrever. Para começar do zero,
            use <strong>Descartar</strong>.
          </span>
        </div>
      )}

      {/* Tipo (chips) */}
      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold">Tipo *</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {TIPO_CHIPS.map(({ valor, label, icon: Icon, cor }) => (
            <button
              key={valor}
              type="button"
              onClick={() => form.setTipo(valor)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 h-14 px-1 rounded-md border text-[11px] font-medium transition-colors',
                form.tipo === valor ? 'border-foreground/30 bg-muted' : 'border-border hover:bg-muted/60',
              )}
              style={form.tipo === valor ? { color: cor } : undefined}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Prioridade (só quem classifica) */}
      {form.mostrarPrioridade ? (
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Prioridade</Label>
          <Select value={form.prioridade} onValueChange={v => form.setPrioridade(v as HelpdeskPrioridade)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {HELPDESK_PRIORIDADE.map(p => {
                const Icon = PRIORIDADE_ICON[p]
                return (
                  <SelectItem key={p} value={p}>
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" style={{ color: HELPDESK_PRIORIDADE_COLORS[p] }} />
                      {HELPDESK_PRIORIDADE_LABELS[p]}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">A TI vai classificar a prioridade ao receber o ticket.</p>
      )}

      {/* Serviço — substituiu a categoria. A lista muda com o tipo escolhido. */}
      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold">Serviço</Label>
        <ServicoSelect servicos={form.servicos} loading={form.loadingCats} value={form.servicoId} onChange={form.setServicoId} semTipo={!form.tipo} />
      </div>

      {/* Título — obrigatório no modal; opcional no FAB (auto-gerado se vazio). */}
      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold">Título{form.autoTitulo ? '' : ' *'}</Label>
        <Input
          value={form.titulo}
          onChange={e => form.setTitulo(e.target.value)}
          placeholder={form.autoTitulo
            ? 'Opcional — se vazio, é gerado sozinho'
            : 'Resumo do problema (ex: Notebook não liga)'}
          className="h-9 text-sm"
          maxLength={200}
        />
      </div>

      {/* Descrição */}
      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold">Descrição *</Label>
        <RichEditor
          // Remonta a cada restauracao de rascunho — ver `restauracaoSeq`.
          key={`descricao-${form.restauracaoSeq}`}
          value={form.descricao}
          onChange={form.setDescricao}
          toolbar={fab ? 'basico' : 'completo'}
          placeholder="Descreva com o máximo de detalhe — passos pra reproduzir, mensagens de erro, prints..."
          className={cn(fab ? 'min-h-[120px]' : 'min-h-[140px]')}
          minHeight={fab ? 120 : undefined}
          maxHeight={fab ? 260 : undefined}
          onKeyDown={onSubmitShortcut ? (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmitShortcut(); return true }
            return false
          } : undefined}
        />
      </div>

      {/* Anexos — mesmo dropzone da modal (drag/drop, click e Ctrl+V) */}
      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" /> Anexos
        </Label>
        <AnexosDropzone value={form.anexos} onChange={form.setAnexos} compact={fab} />
      </div>
    </div>
  )
}

/**
 * Combobox de serviço — substituiu o de categoria.
 *
 * Sem hierarquia pai › filho: serviço não tem esse conceito, então a área faz
 * o papel de agrupador visual (subtítulo). Serviço sem etapas aparece marcado,
 * porque hoje a maioria dos internos da TI ainda não tem roteiro cadastrado e
 * esconder deixaria o seletor quase vazio.
 */
function ServicoSelect({ servicos, loading, value, onChange, semTipo }: {
  servicos: ServicoChamado[]
  loading: boolean
  value: string | null
  onChange: (v: string | null) => void
  semTipo: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = servicos.find(s => s.id === value)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? servicos.filter(s => s.nome.toLowerCase().includes(q) || (s.area?.name ?? '').toLowerCase().includes(q))
    : servicos

  return (
    <div className="relative">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {selected ? (
          <span className="flex items-center gap-2 truncate">
            <span className="truncate">{selected.nome}</span>
            {!selected.temChecklist && (
              <span className="shrink-0 text-[10px] text-muted-foreground">(sem checklist)</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {semTipo ? 'Escolha o tipo primeiro' : 'Selecione o serviço'}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="p-1.5 border-b bg-popover sticky top-0">
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar serviço..."
              className="h-7 text-xs"
            />
          </div>
          <div className="nice-scrollbar max-h-72 overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                {semTipo ? 'Nenhum serviço' : 'Nenhum serviço para este tipo de chamado'}
              </p>
            ) : filtered.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onChange(s.id); setOpen(false); setQuery('') }}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-start justify-between gap-2',
                  value === s.id && 'bg-accent text-accent-foreground',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.nome}</span>
                  {s.area && <span className="block truncate text-[10px] text-muted-foreground">{s.area.name}</span>}
                </span>
                {!s.temChecklist && (
                  <span className="shrink-0 pt-0.5 text-[10px] text-muted-foreground italic">sem checklist</span>
                )}
              </button>
            ))}
          </div>
          {value && (
            <div className="border-t p-1">
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); setQuery('') }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted flex items-center gap-1.5 italic"
              >
                <X className="h-3 w-3" /> Sem serviço
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
