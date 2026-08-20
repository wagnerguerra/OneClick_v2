'use client'

import { useSession } from '@/lib/auth-client'
import { WidgetsGrid } from './widgets/widgets-grid'

export default function DashboardPage() {
  const { data: session } = useSession()

  return (
    <div className="flex flex-col gap-4">
      <WidgetsGrid
        header={
          <div className="min-w-0">
            <h1 className="truncate">Dashboard</h1>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <span>Página inicial</span>
              <span className="text-muted-foreground/50">›</span>
              <span>Bem-vindo, {session?.user?.name?.split(' ')[0] || 'usuário'}.</span>
            </p>
          </div>
        }
      />
    </div>
  )
}
