'use client'

import type { ComponentType, ReactNode } from 'react'
import { Lightbulb, Info, ArrowRight, FileSearch, Calendar, RotateCcw } from 'lucide-react'
import { ArticleShell } from './article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from './article-blocks'

const FAQ_COLOR = '#0891b2'

export interface CadeiaTemplate {
  nome: string
  descricao: string
  templates: string[]
}

interface Props {
  modulo: string
  moduloColor: string
  icon: ComponentType<{ className?: string }>
  titulo: string
  descricao: string
  /** Glossário de 3-6 termos do segmento */
  glossario: { termo: string; texto: string }[]
  /** As 3 cadeias do segmento (ou 2 se não tem onboarding específico) */
  cadeias: { onboarding?: CadeiaTemplate; mensal: CadeiaTemplate; anual?: CadeiaTemplate }
  /** Particularidades fiscais do segmento — texto livre em formato bullets */
  particularidades: ReactNode
  /** Casos comuns: pergunta + resposta */
  casos: { titulo: string; resposta: ReactNode }[]
}

/**
 * Casca padronizada para artigos de FAQ por segmento. Todos seguem a mesma
 * estrutura: glossário → cadeias → particularidades → casos comuns → atalhos.
 */
export function SegmentoShell({ modulo, moduloColor, icon, titulo, descricao, glossario, cadeias, particularidades, casos }: Props) {
  return (
    <ArticleShell modulo={modulo} moduloColor={moduloColor} icon={icon} titulo={titulo} descricao={descricao}>
      {/* Glossário */}
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          {glossario.map(g => <DefRow key={g.termo} termo={g.termo} texto={g.texto} />)}
        </div>
      </Section>

      {/* Cadeias */}
      <Section icon={FileSearch} titulo="Cadeias disponíveis no catálogo" cor={FAQ_COLOR}>
        <div className="space-y-3">
          {cadeias.onboarding && <CadeiaBlock cor={moduloColor} icon={RotateCcw} {...cadeias.onboarding} />}
          <CadeiaBlock cor={moduloColor} icon={Calendar} {...cadeias.mensal} />
          {cadeias.anual && <CadeiaBlock cor={moduloColor} icon={Calendar} {...cadeias.anual} />}
        </div>
        <Callout tipo="info">
          Todos os templates estão criados com <strong>disponivelOrcamento: false</strong> —
          gestor revisa e ativa manualmente em <code className="text-[11px]">/servicos</code>{' '}
          antes que apareçam no seletor de orçamento.
        </Callout>
      </Section>

      {/* Particularidades */}
      <Step n={1} cor={moduloColor} icon={Info} titulo="Particularidades fiscais do segmento">
        {particularidades}
      </Step>

      {/* Casos comuns */}
      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          {casos.map((c, i) => (
            <div key={i} className="rounded-md border p-3 text-[12px]">
              <p className="text-sm font-semibold mb-1">{c.titulo}</p>
              <div className="text-foreground/70">{c.resposta}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Atalhos */}
      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/servicos" label="Ver e ativar templates" cor={moduloColor} />
          <QuickLink href="/clientes" label="Cadastros de cliente" cor={moduloColor} />
          <QuickLink href="/orcamentos" label="Criar orçamento" cor={moduloColor} />
          <QuickLink href="/faq/processos" label="Como o fluxo de Processos funciona" cor={moduloColor} />
        </div>
      </Section>
    </ArticleShell>
  )
}

function CadeiaBlock({ nome, descricao, templates, cor, icon: Icon }: CadeiaTemplate & { cor: string; icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-md border p-3 text-[12px]">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4" style={{ color: cor }} />
        <p className="text-sm font-semibold">{nome}</p>
      </div>
      <p className="text-foreground/70 mb-2">{descricao}</p>
      <ul className="space-y-0.5 ml-2">
        {templates.map((t, i) => (
          <li key={i} className="text-foreground/80">
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{t}</code>
          </li>
        ))}
      </ul>
    </div>
  )
}
