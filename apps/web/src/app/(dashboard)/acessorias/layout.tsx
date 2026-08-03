'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@saas/ui'
import { useAbasPermitidas } from './_components/abas'

const MODULE_COLOR = 'var(--mod-administrativo, #0ea5e9)'

/** Barra de abas comum às telas do Acessórias — o módulo tem um só item de menu. */
export default function AcessoriasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { abas } = useAbasPermitidas()

  // Com uma aba só, a barra vira ruído: não há para onde navegar.
  const mostrarAbas = abas.length > 1

  return (
    <div className="space-y-4">
      {mostrarAbas && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border">
          {abas.map((a) => {
            const ativo = pathname === a.href || pathname.startsWith(`${a.href}/`)
            const Icone = a.icon
            return (
              <Link
                key={a.href}
                href={a.href}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors',
                  ativo
                    ? 'font-medium'
                    : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
                style={ativo ? { color: MODULE_COLOR, borderColor: MODULE_COLOR } : undefined}
              >
                <Icone className="h-4 w-4" />
                {a.label}
              </Link>
            )
          })}
        </div>
      )}
      {children}
    </div>
  )
}
