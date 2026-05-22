'use client'

import { useSession } from '@/lib/auth-client'
import { WidgetsGrid } from './widgets/widgets-grid'

export default function DashboardPage() {
  const { data: session } = useSession()

  return (
    <div className="flex flex-col gap-4">
      <WidgetsGrid
        header={
          <div>
            <h1>Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Bem-vindo, {session?.user?.name?.split(' ')[0] || 'usuário'}.
            </p>
          </div>
        }
      />
    </div>
  )
}
