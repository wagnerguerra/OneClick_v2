'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@saas/ui'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { HelpdeskIaSection } from '../_components/helpdesk-ia-section'

/**
 * Página dedicada da Triagem IA (acessível via menu lateral).
 * O conteúdo é o mesmo componente usado na tab "Triagem IA" dentro
 * da pill Helpdesk em /configuracoes — single source of truth.
 */
export default function HelpdeskAiConfigPage() {
  const router = useRouter()
  const { profile, loading: loadingProfile } = useCurrentUserProfile()

  useEffect(() => {
    if (!loadingProfile && profile && !profile.isMaster) router.replace('/configuracoes')
  }, [loadingProfile, profile, router])

  if (loadingProfile) return null

  return (
    <div className="space-y-6">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <BackButton href="/configuracoes" label="Voltar" />
      </>}>
        <h1 className="truncate">Triagem IA — Helpdesk</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Configurações</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Configurações Gerais</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Triagem IA — Helpdesk</span>
        </p>
      </PageHeaderBar>

      <Card className="p-5">
        <HelpdeskIaSection />
      </Card>
    </div>
  )
}
