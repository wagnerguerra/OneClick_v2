'use client'

/**
 * Modelos de E-mail — Ambiente simulado (sandbox).
 *
 * Composer para montar/visualizar os modelos de e-mail padrão do sistema, com
 * preview FIEL ao e-mail real (mesmo shell de `buildEmailLayout` do backend,
 * espelhado em `_lib/email-shell.ts`). NÃO persiste no backend: estado fica no
 * localStorage. A ideia é compor/aprovar aqui e depois replicar no sistema.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Mail, Plus, Copy, Files, Trash2, RotateCcw, Code2, Type as TypeIcon,
  Palette, Sparkles, Tag,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'
import {
  Button, Input, Label, Card, Badge, Separator, RichEditor, cn,
} from '@saas/ui'
import { alerts } from '@/lib/alerts'
import { renderEmailShell } from './_lib/email-shell'
import {
  type EmailTemplate, EMAIL_VARIABLES, SEED_TEMPLATES, STORAGE_KEY,
  aplicarExemplos,
} from './_lib/templates'

const MODULE_COLOR = 'var(--mod-administrativo, #38bdf8)'

// Empresa/logo de exemplo usados só no preview do sandbox.
const PREVIEW_EMPRESA = 'Central Contábil'
const PREVIEW_LOGO: string | null = null

function gerarId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function carregarTemplates(): EmailTemplate[] {
  if (typeof window === 'undefined') return SEED_TEMPLATES
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return SEED_TEMPLATES
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as EmailTemplate[]
    }
    return SEED_TEMPLATES
  } catch {
    return SEED_TEMPLATES
  }
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>(SEED_TEMPLATES)
  const [selectedId, setSelectedId] = useState<string>(SEED_TEMPLATES[0]?.id ?? '')
  const [hydrated, setHydrated] = useState(false)
  const editorRef = useRef<Editor | null>(null)

  // Hidrata do localStorage só no cliente (evita mismatch SSR).
  useEffect(() => {
    const carregados = carregarTemplates()
    setTemplates(carregados)
    setSelectedId((prev) => (carregados.some((t) => t.id === prev) ? prev : carregados[0]?.id ?? ''))
    setHydrated(true)
  }, [])

  // Persiste em localStorage a cada mudança (após hidratar).
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
    } catch {
      /* quota/privado — sandbox tolera perder o rascunho */
    }
  }, [templates, hydrated])

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  )

  // Atualiza um campo do modelo selecionado.
  const patchSelected = useCallback(
    (patch: Partial<EmailTemplate>) => {
      setTemplates((prev) =>
        prev.map((t) => (t.id === selectedId ? { ...t, ...patch } : t)),
      )
    },
    [selectedId],
  )

  // HTML do preview (com exemplos aplicados nas variáveis).
  const previewHtml = useMemo(() => {
    if (!selected) return ''
    return renderEmailShell({
      empresaNome: PREVIEW_EMPRESA,
      logoUrl: PREVIEW_LOGO,
      preheader: aplicarExemplos(selected.preheader),
      heroAccent: selected.accent,
      heroTitle: aplicarExemplos(selected.heroTitle),
      heroSubtitle: aplicarExemplos(selected.heroSubtitle) || undefined,
      bodyHtml: aplicarExemplos(selected.corpoHtml),
      ctaLabel: selected.ctaLabel ? aplicarExemplos(selected.ctaLabel) : undefined,
      ctaUrl: selected.ctaUrl ? aplicarExemplos(selected.ctaUrl) : undefined,
    })
  }, [selected])

  // HTML literal (mantém {{var}}) — usado no "Copiar HTML".
  const htmlLiteral = useMemo(() => {
    if (!selected) return ''
    return renderEmailShell({
      empresaNome: '{{empresa}}',
      logoUrl: PREVIEW_LOGO,
      preheader: selected.preheader,
      heroAccent: selected.accent,
      heroTitle: selected.heroTitle,
      heroSubtitle: selected.heroSubtitle || undefined,
      bodyHtml: selected.corpoHtml,
      ctaLabel: selected.ctaLabel || undefined,
      ctaUrl: selected.ctaUrl || undefined,
    })
  }, [selected])

  // ── Ações ────────────────────────────────────────────────────────────────
  const novoModelo = useCallback(() => {
    const novo: EmailTemplate = {
      id: gerarId(),
      nome: 'Novo modelo',
      assunto: 'Assunto do e-mail',
      preheader: '',
      accent: '#38bdf8',
      heroTitle: 'Título de destaque',
      heroSubtitle: '',
      ctaLabel: '',
      ctaUrl: '',
      corpoHtml: '<p>Escreva o conteúdo do e-mail aqui…</p>',
    }
    setTemplates((prev) => [novo, ...prev])
    setSelectedId(novo.id)
  }, [])

  const duplicarModelo = useCallback(() => {
    if (!selected) return
    const copia: EmailTemplate = {
      ...selected,
      id: gerarId(),
      nome: `${selected.nome} (cópia)`,
    }
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === selected.id)
      const next = [...prev]
      next.splice(idx + 1, 0, copia)
      return next
    })
    setSelectedId(copia.id)
  }, [selected])

  const excluirModelo = useCallback(async () => {
    if (!selected) return
    const ok = await alerts.confirm({
      title: 'Excluir modelo?',
      text: `O rascunho "${selected.nome}" será removido do sandbox.`,
      confirmText: 'Excluir',
      icon: 'warning',
    })
    if (!ok) return
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== selected.id)
      setSelectedId(next[0]?.id ?? '')
      return next
    })
  }, [selected])

  const restaurarExemplos = useCallback(async () => {
    const ok = await alerts.confirm({
      title: 'Restaurar exemplos?',
      text: 'Isso substitui TODOS os modelos do sandbox pelos exemplos originais. Seus rascunhos serão perdidos.',
      confirmText: 'Restaurar',
      icon: 'warning',
    })
    if (!ok) return
    setTemplates(SEED_TEMPLATES)
    setSelectedId(SEED_TEMPLATES[0]?.id ?? '')
  }, [])

  const copiar = useCallback(async (texto: string, label: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      alerts.success('Copiado!', `${label} copiado para a área de transferência.`)
    } catch {
      alerts.error('Falha ao copiar', 'Seu navegador bloqueou o acesso à área de transferência.')
    }
  }, [])

  // Insere `{{var}}` no corpo (via editor) — fallback: anexa ao final do corpo.
  const inserirVariavel = useCallback(
    (chave: string) => {
      const placeholder = `{{${chave}}}`
      const ed = editorRef.current
      if (ed) {
        ed.chain().focus().insertContent(placeholder).run()
      } else if (selected) {
        patchSelected({ corpoHtml: `${selected.corpoHtml} ${placeholder}` })
      }
    },
    [selected, patchSelected],
  )

  return (
    <div className="space-y-5">
      {/* Header — padrão inline de /orcamentos e /crm (ícone gradiente + h1 + descrição) */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
          <Mail className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1>Modelos de E-mail</h1>
          <p className="text-sm text-muted-foreground">
            Ambiente de composição (sandbox) para montar e pré-visualizar os modelos de e-mail do
            sistema. Não envia nem salva no servidor — compõe aqui e replique no sistema quando aprovado.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <Sparkles className="h-4 w-4 shrink-0" />
        Rascunho local: os modelos ficam só no seu navegador (localStorage). Use “Copiar HTML”
        para levar o conteúdo aprovado ao código do sistema.
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Coluna esquerda — lista de modelos */}
        <Card className="lg:col-span-3 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-[13px] font-semibold text-foreground">Modelos</span>
            <Button size="sm" variant="success" onClick={novoModelo} className="h-7 gap-1 px-2 text-xs">
              <Plus className="h-3.5 w-3.5" /> Novo
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {templates.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                Nenhum modelo. Crie um novo ou restaure os exemplos.
              </p>
            ) : (
              <ul className="space-y-1">
                {templates.map((t) => {
                  const ativo = t.id === selectedId
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={cn(
                          'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                          ativo
                            ? 'border-transparent text-white'
                            : 'border-border bg-muted/40 hover:bg-muted',
                        )}
                        style={ativo ? { backgroundColor: MODULE_COLOR } : undefined}
                      >
                        <p className="truncate text-[13px] font-semibold">{t.nome}</p>
                        <p
                          className={cn(
                            'truncate text-[11px]',
                            ativo ? 'text-white/80' : 'text-muted-foreground',
                          )}
                        >
                          {t.assunto || '(sem assunto)'}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-border p-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={restaurarExemplos}
              className="h-7 w-full gap-1.5 text-xs text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar exemplos
            </Button>
          </div>
        </Card>

        {/* Coluna central — editor */}
        <Card className="lg:col-span-5 overflow-hidden">
          {!selected ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Selecione um modelo à esquerda ou crie um novo.
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-foreground">Editor</span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={duplicarModelo} className="h-7 gap-1 px-2 text-xs">
                    <Files className="h-3.5 w-3.5" /> Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="soft-destructive"
                    onClick={excluirModelo}
                    className="h-7 gap-1 px-2 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Nome do modelo</Label>
                <Input
                  className="h-9 text-sm"
                  value={selected.nome}
                  onChange={(e) => patchSelected({ nome: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Assunto</Label>
                <Input
                  className="h-9 text-sm"
                  value={selected.assunto}
                  onChange={(e) => patchSelected({ assunto: e.target.value })}
                  placeholder="Ex.: Orçamento {{numero}} — {{empresa}}"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Preheader</Label>
                <Input
                  className="h-9 text-sm"
                  value={selected.preheader}
                  onChange={(e) => patchSelected({ preheader: e.target.value })}
                  placeholder="Texto curto exibido na prévia da caixa de entrada"
                />
              </div>

              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-4 space-y-1.5">
                  <Label className="flex items-center gap-1 text-[13px] font-semibold">
                    <Palette className="h-3.5 w-3.5" /> Cor de destaque
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selected.accent}
                      onChange={(e) => patchSelected({ accent: e.target.value })}
                      className="h-9 w-10 shrink-0 cursor-pointer rounded border border-border bg-card p-0.5"
                      aria-label="Cor de destaque"
                    />
                    <Input
                      className="h-9 text-sm"
                      value={selected.accent}
                      onChange={(e) => patchSelected({ accent: e.target.value })}
                    />
                  </div>
                </div>
                <div className="col-span-8 space-y-1.5">
                  <Label className="text-[13px] font-semibold">Hero título</Label>
                  <Input
                    className="h-9 text-sm"
                    value={selected.heroTitle}
                    onChange={(e) => patchSelected({ heroTitle: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Hero subtítulo</Label>
                <Input
                  className="h-9 text-sm"
                  value={selected.heroSubtitle}
                  onChange={(e) => patchSelected({ heroSubtitle: e.target.value })}
                  placeholder="Opcional"
                />
              </div>

              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-5 space-y-1.5">
                  <Label className="text-[13px] font-semibold">CTA — texto</Label>
                  <Input
                    className="h-9 text-sm"
                    value={selected.ctaLabel ?? ''}
                    onChange={(e) => patchSelected({ ctaLabel: e.target.value })}
                    placeholder="Ex.: Ver orçamento"
                  />
                </div>
                <div className="col-span-7 space-y-1.5">
                  <Label className="text-[13px] font-semibold">CTA — URL</Label>
                  <Input
                    className="h-9 text-sm"
                    value={selected.ctaUrl ?? ''}
                    onChange={(e) => patchSelected({ ctaUrl: e.target.value })}
                    placeholder="Ex.: {{link}}"
                  />
                </div>
              </div>

              {/* Variáveis */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-[13px] font-semibold">
                  <Tag className="h-3.5 w-3.5" /> Variáveis (clique para inserir no corpo)
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {EMAIL_VARIABLES.map((v) => (
                    <button
                      key={v.chave}
                      type="button"
                      onClick={() => inserirVariavel(v.chave)}
                      className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                      title={`Exemplo: ${v.exemplo}`}
                    >
                      {`{{${v.chave}}}`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  No preview, as variáveis são substituídas por valores de exemplo. Ao copiar o HTML,
                  os {`{{...}}`} são mantidos literalmente.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Corpo (HTML)</Label>
                <RichEditor
                  value={selected.corpoHtml}
                  onChange={(html) => patchSelected({ corpoHtml: html })}
                  onReady={(ed) => {
                    editorRef.current = ed
                  }}
                  placeholder="Conteúdo do e-mail…"
                />
              </div>
            </div>
          )}
        </Card>

        {/* Coluna direita — preview */}
        <Card className="lg:col-span-4 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-[13px] font-semibold text-foreground">Pré-visualização</span>
            {selected && (
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copiar(selected.assunto, 'Assunto')}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <TypeIcon className="h-3.5 w-3.5" /> Assunto
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copiar(htmlLiteral, 'HTML')}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <Code2 className="h-3.5 w-3.5" /> HTML
                </Button>
              </div>
            )}
          </div>

          {!selected ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nada para pré-visualizar.
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-2 p-3">
              {/* Assunto renderizado */}
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Assunto
                </p>
                <p className="truncate text-sm font-medium text-foreground">
                  {aplicarExemplos(selected.assunto) || '(sem assunto)'}
                </p>
              </div>
              {/* E-mail real isolado em iframe */}
              <iframe
                title="Pré-visualização do e-mail"
                srcDoc={previewHtml}
                className="min-h-[520px] w-full flex-1 rounded-md border border-border bg-white"
                sandbox=""
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copiar(htmlLiteral, 'HTML')}
                  className="h-8 flex-1 gap-1.5 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar HTML
                </Button>
                <Badge variant="secondary" className="text-[10px]">Sandbox</Badge>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
