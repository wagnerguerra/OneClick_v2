'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@saas/ui'
import { useAbasPermitidas } from './abas'

const MODULE_COLOR = 'var(--mod-administrativo, #0ea5e9)'

/**
 * Pills de navegação do módulo, no mesmo desenho das páginas de detalhe
 * (orçamentos, clientes): cápsula arredondada, pill ativa na cor do módulo.
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
    <div className="flex overflow-x-auto nice-scrollbar">
      <div className="flex min-w-max gap-1.5 rounded-full border border-border bg-muted/40 p-1 shadow-sm">
        {abas.map((a) => {
          const ativo = pathname === a.href || pathname.startsWith(`${a.href}/`)
          const Icone = a.icon
          return (
            <Link
              key={a.href}
              href={a.href}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors',
                ativo ? 'bg-card shadow-sm' : 'text-foreground/60 hover:text-foreground',
              )}
              style={ativo ? { color: MODULE_COLOR } : undefined}
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
