'use client'

import { Lock } from 'lucide-react'
import { Card } from '@saas/ui'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

/**
 * Guard de página para administração de PLATAFORMA (config de sistema,
 * integrações globais, métricas, backups). Renderiza o conteúdo apenas para o
 * master global (`isMaster`). Admins de tenant (isEmpresaMaster) veem "Acesso
 * restrito". É defesa em profundidade — a autorização real é server-side
 * (masterProcedure no tRPC). F-009.
 */
export function MasterGate({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useCurrentUserProfile()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!profile?.isMaster) {
    return (
      <Card className="max-w-md mx-auto mt-12">
        <div className="p-8 text-center space-y-3">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground">
            Esta página é exclusiva do administrador da plataforma.
          </p>
        </div>
      </Card>
    )
  }

  return <>{children}</>
}
