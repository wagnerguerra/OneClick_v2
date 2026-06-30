import Link from 'next/link'
import { Home, LifeBuoy } from 'lucide-react'
import { Button } from '@saas/ui'

/**
 * Conteúdo da página 404 (PT-BR + identidade visual). Reutilizado pela 404 raiz
 * (full-screen, com logo) e pela 404 do dashboard (dentro do layout com sidebar).
 * F-004.
 */
export function NotFoundView({ withLogo = false }: { withLogo?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {withLogo && (
        <div className="mb-10 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="OneClick" className="h-10 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-light.png" alt="OneClick" className="h-10 w-auto hidden dark:block" />
        </div>
      )}

      <p className="select-none text-7xl font-bold tracking-tight text-primary/30 sm:text-8xl">404</p>
      <h1 className="mt-4 text-xl font-semibold text-foreground sm:text-2xl">Página não encontrada</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        A página que você procura não existe, foi movida ou ainda não está disponível.
        Confira o endereço ou volte para um lugar seguro.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/dashboard">
            <Home className="h-4 w-4" />
            Voltar ao Dashboard
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/faq">
            <LifeBuoy className="h-4 w-4" />
            Central de Ajuda
          </Link>
        </Button>
      </div>
    </div>
  )
}
