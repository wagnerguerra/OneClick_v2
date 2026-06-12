'use client'

import type { ComponentType, ReactNode } from 'react'

/**
 * PADRÃO ÚNICO de cabeçalho do sistema (páginas de detalhe / módulos).
 *
 * Wrapper bleed-edge (sangra até as bordas via -mx/-mt) com capa em gradiente
 * da cor do módulo, ícone (componente lucide OU imagem de /materiais), título,
 * subtítulo opcional, breadcrumb opcional e ações à direita. Pills/abas podem
 * ir em `children` (renderizados abaixo, dentro da capa).
 *
 * SEMPRE use este componente para o cabeçalho — não recrie a capa na mão.
 * Documentado em CLAUDE.md ("Header de páginas de detalhe").
 */
export function PageHeader({
  color,
  icon: Icon,
  iconImg,
  title,
  subtitle,
  breadcrumb,
  actions,
  children,
  bleed = true,
}: {
  /** Cor do módulo (hex ou var CSS) — usada na capa e no ícone. */
  color: string
  /** Ícone lucide. Ignorado se `iconImg` for informado. */
  icon?: ComponentType<{ className?: string }>
  /** Imagem do ícone (ex.: "/materiais/icon_faqs.png") — sem moldura. */
  iconImg?: string
  title: ReactNode
  subtitle?: ReactNode
  /** Conteúdo do breadcrumb (links/spans). Renderizado acima do título. */
  breadcrumb?: ReactNode
  /** Botões/ações alinhados à direita. */
  actions?: ReactNode
  /** Conteúdo extra dentro da capa, abaixo do título (ex.: abas/pills). */
  children?: ReactNode
  /** Sangra até as bordas do `<main>` (-mx/-mt). Desligue quando o pai já
   *  controla a borda (ex.: layout de altura fixa que rola só o miolo). */
  bleed?: boolean
}) {
  return (
    <div
      className={`relative overflow-hidden border-b border-border${bleed ? ' -mx-4 sm:-mx-6 -mt-4 sm:-mt-6' : ''}`}
      style={{ backgroundColor: `color-mix(in srgb, ${color} 9%, transparent)` }}
    >
      {/* Gradiente decorativo da cor do módulo (direita) */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: `linear-gradient(120deg, transparent 30%, color-mix(in srgb, ${color} 22%, transparent) 100%)` }}
      />
      <div className="relative z-10 px-4 sm:px-6 pt-3 pb-5 space-y-3">
        {breadcrumb && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">{breadcrumb}</div>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {iconImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={iconImg} alt="" className="h-12 w-12 object-contain shrink-0" />
            ) : Icon ? (
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
                style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 87%, transparent))` }}
              >
                <Icon className="h-6 w-6" />
              </div>
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}
