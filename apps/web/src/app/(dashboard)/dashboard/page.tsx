'use client'

import { useSession } from '@/lib/auth-client'
import { Card, CardHeader, CardTitle, CardContent } from '@saas/ui'
import { Users, Building2, BarChart3, FileText } from 'lucide-react'

const stats = [
  { label: 'Colaboradores', value: '0', icon: Users, color: 'text-[#5ea3cb]' },
  { label: 'Clientes', value: '0', icon: Building2, color: 'text-emerald-500' },
  { label: 'Processos', value: '0', icon: BarChart3, color: 'text-amber-500' },
  { label: 'Documentos', value: '0', icon: FileText, color: 'text-purple-500' },
]

export default function DashboardPage() {
  const { data: session } = useSession()

  return (
    <div className="space-y-6">
      <div>
        <h1>
          Bem-vindo, {session?.user?.name?.split(' ')[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Aqui está um resumo do seu sistema
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                  <Icon className={`h-8 w-8 ${stat.color} opacity-80`} />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Placeholder cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Atividade Recente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Nenhuma atividade registrada ainda.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pendências</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Nenhuma pendência no momento.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
