'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Save, Loader2, Check } from 'lucide-react'
import {
  Button, Input, Label, RichEditor, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { PageHeader } from '@/components/page-header'
import { CATEGORIA_ORDEM } from './articles-catalog'
import { iconByName, FAQ_ICON_NAMES, resolveFaqIcon } from './faq-icons'

export interface FaqForm {
  slug: string
  titulo: string
  descricao: string
  modulo: string
  moduloColor: string
  icon: string
  categoria: string
  tags: string // CSV no form; convertido p/ array no save
  conteudoHtml: string
  publicado: boolean
}

// Paleta de cores de módulo (mesmas usadas no projeto).
const CORES = [
  '#0891b2', '#fb7185', '#8b5cf6', '#10b981', '#f59e0b', '#0284c7',
  '#e11d48', '#16a34a', '#7c3aed', '#ea580c', '#475569', '#0d9488',
]

export function emptyFaqForm(): FaqForm {
  return { slug: '', titulo: '', descricao: '', modulo: '', moduloColor: '#0891b2', icon: 'HelpCircle', categoria: 'Comercial', tags: '', conteudoHtml: '', publicado: true }
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export function FaqEditor({ titulo, value, onChange, onSave, saving, slugTravado }: {
  titulo: string
  value: FaqForm
  onChange: (v: FaqForm) => void
  onSave: () => void
  saving: boolean
  /** true no modo edição — slug não muda (é a chave). */
  slugTravado: boolean
}) {
  const set = <K extends keyof FaqForm>(k: K, v: FaqForm[K]) => onChange({ ...value, [k]: v })
  const HeaderIcon = resolveFaqIcon(value.icon)

  return (
    <div className="space-y-5 pb-12">
      {/* Header padrão do sistema (PageHeader) — back no breadcrumb + Salvar à direita */}
      <PageHeader
        color={value.moduloColor}
        icon={HeaderIcon}
        title={titulo}
        breadcrumb={(
          <Button variant="ghost" size="sm" className="h-7 px-2 -ml-2 gap-1.5 text-xs" asChild>
            <Link href="/faq"><ArrowLeft className="h-3.5 w-3.5" /> FAQ&apos;s</Link>
          </Button>
        )}
        actions={(
          <Button variant="success" size="sm" onClick={onSave} disabled={saving || !value.titulo.trim() || !value.slug.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
        )}
      />

      {/* Metadados */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 md:col-span-8 space-y-1.5">
          <Label className="text-[13px] font-semibold">Título</Label>
          <Input className="h-9 text-sm" value={value.titulo}
            onChange={e => {
              const t = e.target.value
              onChange({ ...value, titulo: t, slug: slugTravado || value.slug ? value.slug : slugify(t) })
            }} placeholder="Título do artigo" />
        </div>
        <div className="col-span-12 md:col-span-4 space-y-1.5">
          <Label className="text-[13px] font-semibold">Slug (URL)</Label>
          <Input className="h-9 text-sm font-mono" value={value.slug} disabled={slugTravado}
            onChange={e => set('slug', slugify(e.target.value))} placeholder="meu-artigo" />
        </div>

        <div className="col-span-12 space-y-1.5">
          <Label className="text-[13px] font-semibold">Descrição</Label>
          <Input className="h-9 text-sm" value={value.descricao}
            onChange={e => set('descricao', e.target.value)} placeholder="Uma frase resumindo o artigo (aparece no card)" />
        </div>

        <div className="col-span-12 md:col-span-6 space-y-1.5">
          <Label className="text-[13px] font-semibold">Módulo (rótulo)</Label>
          <Input className="h-9 text-sm" value={value.modulo}
            onChange={e => set('modulo', e.target.value)} placeholder="Ex.: Orçamentos" />
        </div>
        <div className="col-span-12 md:col-span-6 space-y-1.5">
          <Label className="text-[13px] font-semibold">Categoria</Label>
          <Select value={value.categoria} onValueChange={v => set('categoria', v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIA_ORDEM.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Cor do módulo */}
        <div className="col-span-12 md:col-span-6 space-y-1.5">
          <Label className="text-[13px] font-semibold">Cor do módulo</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {CORES.map(c => (
              <button key={c} type="button" onClick={() => set('moduloColor', c)}
                className={cn('h-7 w-7 rounded-md border transition-transform hover:scale-110', value.moduloColor === c ? 'ring-2 ring-offset-1 ring-foreground/40' : 'border-border')}
                style={{ backgroundColor: c }} title={c} />
            ))}
            <input type="color" value={value.moduloColor} onChange={e => set('moduloColor', e.target.value)}
              className="h-7 w-9 rounded-md border border-border bg-transparent p-0.5 cursor-pointer" title="Cor personalizada" />
          </div>
        </div>

        {/* Tags */}
        <div className="col-span-12 md:col-span-6 space-y-1.5">
          <Label className="text-[13px] font-semibold">Tags (separadas por vírgula)</Label>
          <Input className="h-9 text-sm" value={value.tags}
            onChange={e => set('tags', e.target.value)} placeholder="orçamento, proposta, envio" />
        </div>

        {/* Ícone */}
        <div className="col-span-12 space-y-1.5">
          <Label className="text-[13px] font-semibold">Ícone</Label>
          <div className="flex flex-wrap gap-1.5 rounded-md border border-border p-2 max-h-28 overflow-y-auto bg-muted/20">
            {FAQ_ICON_NAMES.map(name => {
              const I = iconByName[name]!
              const sel = value.icon === name
              return (
                <button key={name} type="button" onClick={() => set('icon', name)} title={name}
                  className={cn('flex h-8 w-8 items-center justify-center rounded-md border transition-colors', sel ? 'text-white' : 'border-border text-muted-foreground hover:bg-muted')}
                  style={sel ? { backgroundColor: value.moduloColor, borderColor: value.moduloColor } : undefined}>
                  <I className="h-4 w-4" />
                </button>
              )
            })}
          </div>
        </div>

        {/* Publicado */}
        <div className="col-span-12">
          <button type="button" onClick={() => set('publicado', !value.publicado)}
            className={cn('inline-flex items-center gap-2 rounded-md border px-3 h-9 text-sm transition-colors', value.publicado ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800' : 'border-border text-muted-foreground')}>
            <span className={cn('flex h-4 w-4 items-center justify-center rounded border', value.publicado ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-muted-foreground/40')}>
              {value.publicado && <Check className="h-3 w-3" />}
            </span>
            {value.publicado ? 'Publicado (visível a todos)' : 'Rascunho (só master vê)'}
          </button>
        </div>
      </div>

      {/* Corpo */}
      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold">Conteúdo</Label>
        <RichEditor value={value.conteudoHtml} onChange={v => set('conteudoHtml', v)} placeholder="Escreva o conteúdo do artigo..." maxHeight={600} />
        <p className="text-[11px] text-muted-foreground">Dica: use títulos (H2/H3) para criar seções — elas viram itens do índice lateral.</p>
      </div>
    </div>
  )
}
