'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bot } from 'lucide-react'
import { Card } from '@saas/ui'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { BackButton } from '@/components/ui/back-button'
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="configuracoes" icon={Bot} />
          <div>
            <h1>Triagem IA — Helpdesk</h1>
            <p className="text-sm text-muted-foreground">
              Comportamento do agente Claude que faz triagem automática dos tickets recém-criados.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BackButton href="/configuracoes" label="Voltar" />
        </div>
      </div>

      <Card className="p-5">
        <HelpdeskIaSection />
      </Card>
    </div>
  )
}
