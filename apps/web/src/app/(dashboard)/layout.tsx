'use client'

import { useEffect } from 'react'
import { useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { useSidebar } from '@/hooks/use-sidebar'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { PageTransition } from '@/components/dashboard/page-transition'
import { cn } from '@saas/ui'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, isPending } = useSession()
  const { collapsed, toggle, mobileOpen, openMobile, closeMobile, mounted } = useSidebar()
  const router = useRouter()

  useEffect(() => {
    if (isPending) return
    if (!session) {
      router.push('/login')
      return
    }
    // Guard: usuário sem empresa (e não MASTER global) → onboarding
    const user = session.user as Record<string, unknown>
    const isMasterGlobal = (user.isMaster as boolean) ?? false
    const hasEmpresa = !!(user.empresaId as string)
    if (!isMasterGlobal && !hasEmpresa) {
      router.push('/onboarding')
    }
  }, [isPending, session, router])

  if (isPending || !mounted || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5ea3cb] border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />
      <div
        className={cn(
          'transition-all duration-300',
          // Desktop: margin-left para sidebar fixa
          // Mobile: sem margin (sidebar é overlay)
          collapsed ? 'lg:ml-[68px]' : 'lg:ml-[260px]',
        )}
      >
        <Header onOpenMobile={openMobile} />
        <main className="p-4 sm:p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  )
}
