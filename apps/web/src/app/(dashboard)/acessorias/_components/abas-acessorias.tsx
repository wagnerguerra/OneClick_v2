'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@saas/ui'
import { useAbasPermitidas } from './abas'

/**
 * Abas de navegação do módulo no estilo SUBLINHADO (o das abas padrão do
 * sistema): ativa sublinhada e em primary-on-surface. De propósito diferente
 * das sub-abas dentro das páginas (ex.: Integração), que usam a cápsula
 * deslizante — assim os dois níveis não se confundem quando empilhados.
 *
 * Fica DENTRO de cada página, logo abaixo do cabeçalho — por isso é componente
 * e não parte do layout, que só consegue desenhar acima do conteúdo.
 *
 * Aqui as abas são rotas, não painéis, então são links: o `Tabs` do Radix
 * exigiria que todo o conteúdo vivesse na mesma árvore.
 */
export function AbasAcessorias() {
  const pathname = usePathname()
  const { abas } = useAbasPermitidas()

  // Com uma aba só não há para onde navegar.
  if (abas.length <= 1) return null

  return (
    <div className="flex overflow-x-auto nice-scrollbar rounded-t-md border-b border-border bg-muted/40">
      <div className="flex min-w-max">
        {abas.map((a) => {
          const ativo = pathname === a.href || pathname.startsWith(`${a.href}/`)
          const Icone = a.icon
          return (
            <Link
              key={a.href}
              href={a.href}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors',
                ativo
                  ? 'rounded-t-md border-primary-on-surface bg-card text-primary-on-surface shadow-[0_-1px_4px_rgba(0,0,0,0.06)] dark:shadow-[0_-1px_4px_rgba(0,0,0,0.3)]'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icone className="h-3.5 w-3.5" />
              {a.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
