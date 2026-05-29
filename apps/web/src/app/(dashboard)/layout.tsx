'use client'

import { useEffect } from 'react'
import { useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { useSidebar } from '@/hooks/use-sidebar'
import { usePageMeta } from '@/hooks/use-page-meta'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { PageTransition } from '@/components/dashboard/page-transition'
import { RouteProgress } from '@/components/dashboard/route-progress'
import { TabBar } from '@/components/dashboard/tab-bar'
import { ApiHealthMonitor } from '@/components/dashboard/api-health-monitor'
import { FloatingFeedbackButton } from '@/components/dashboard/floating-feedback-button'
import { TabsProvider } from '@/lib/tabs-store'
import { useSyncRouteTab } from '@/hooks/use-sync-route-tab'
import { useTabShortcuts } from '@/hooks/use-tab-shortcuts'
import { usePermissionsSse } from '@/hooks/use-permissions-sse'
import { usePresencePing } from '@/hooks/use-presence-ping'
import { useModuleScope } from '@/hooks/use-module-scope'
import { useAgendaLembreteSse } from '@/hooks/use-agenda-lembrete-sse'
import { cn } from '@saas/ui'

// Componente interno que usa os hooks (precisa estar dentro do TabsProvider)
function DashboardLayoutInner({ children, collapsed, toggle, mobileOpen, openMobile, closeMobile }: {
  children: React.ReactNode
  collapsed: boolean
  toggle: () => void
  mobileOpen: boolean
  openMobile: () => void
  closeMobile: () => void
}) {
  useSyncRouteTab()
  useTabShortcuts()
  usePermissionsSse()
  usePresencePing()
  useModuleScope()
  useAgendaLembreteSse()

  return (
    <div
      className="min-h-screen bg-background"
      style={{ ['--sidebar-w' as string]: collapsed ? '68px' : '260px' }}
    >
      <RouteProgress />
      <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onCloseMobile={closeMobile} />
      <div
        className={cn(
          'transition-all duration-300',
          collapsed ? 'lg:ml-[68px]' : 'lg:ml-[260px]',
        )}
      >
        <Header onOpenMobile={openMobile} />
        <TabBar />
        <main className="p-4 sm:p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <ApiHealthMonitor />
      <FloatingFeedbackButton />
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()
  const { collapsed, toggle, mobileOpen, openMobile, closeMobile, mounted } = useSidebar()
  const router = useRouter()
  usePageMeta()

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

  // Loader full-screen SÓ no carregamento inicial (sem sessão ainda). Durante
  // revalidações do better-auth (isPending=true momentâneo com sessão existente),
  // mantemos a árvore renderizada — desmontar tudo aborta navegações em curso
  // e dá a impressão de "carregando que some sem fazer nada" ao clicar no sidebar.
  if (!mounted || (isPending && !session) || !session) {
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
    <TabsProvider userId={session.user.id}>
      <DashboardLayoutInner
        collapsed={collapsed}
        toggle={toggle}
        mobileOpen={mobileOpen}
        openMobile={openMobile}
        closeMobile={closeMobile}
      >
        {children}
      </DashboardLayoutInner>
    </TabsProvider>
  )
}
