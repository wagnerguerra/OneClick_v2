'use client'

import { useState, useEffect } from 'react'
import { useSession } from '@/lib/auth-client'
import { Card, CardHeader, CardTitle, CardContent } from '@saas/ui'
import { Users, Building2, BarChart3, FileText, Mail, AlertTriangle, MailWarning, Clock, Star } from 'lucide-react'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import Link from 'next/link'

const stats = [
  { label: 'Colaboradores', value: '0', icon: Users, color: 'text-[#5ea3cb]' },
  { label: 'Clientes', value: '0', icon: Building2, color: 'text-emerald-500' },
  { label: 'Processos', value: '0', icon: BarChart3, color: 'text-amber-500' },
  { label: 'Documentos', value: '0', icon: FileText, color: 'text-purple-500' },
]

interface CaixaPostalTotais {
  total: number
  lidas: number
  naoLidas: number
  naoLidasP0: number
  naoLidasP1: number
  naoLidasP2: number
  naoLidasP3: number
  importantes: number
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [caixaPostal, setCaixaPostal] = useState<CaixaPostalTotais | null>(null)

  useEffect(() => {
    trpc.caixaPostal.totalizadores.query()
      .then(data => setCaixaPostal(data as CaixaPostalTotais))
      .catch(() => {})
  }, [])

  const urgentes = (caixaPostal?.naoLidasP0 ?? 0) + (caixaPostal?.naoLidasP1 ?? 0)
  const medias = caixaPostal?.naoLidasP2 ?? 0

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

      {/* Caixa Postal e-CAC — indicador de mensagens não lidas */}
      {caixaPostal && (caixaPostal.naoLidas > 0 || caixaPostal.importantes > 0) && (
        <Card className="border-l-4 border-l-sky-500">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Link href="/caixapostal" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-900/20">
                  <Mail className="h-5 w-5 text-sky-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Caixa Postal e-CAC</h3>
                  <p className="text-xs text-muted-foreground">
                    {caixaPostal.naoLidas} mensagem(ns) não lida(s)
                  </p>
                </div>
              </Link>
              <div className="flex items-center gap-3">
                {/* P0 — Crítica */}
                {caixaPostal.naoLidasP0 > 0 && (
                  <Link href="/caixapostal?prioridade=P0" className="flex items-center gap-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 border border-red-200 dark:border-red-800 hover:shadow-md hover:scale-105 transition-all cursor-pointer">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-700 dark:text-red-400 leading-none">{caixaPostal.naoLidasP0}</p>
                      <p className="text-[10px] text-red-600/70 font-medium">Crítica</p>
                    </div>
                  </Link>
                )}
                {/* P1 — Alta */}
                {caixaPostal.naoLidasP1 > 0 && (
                  <Link href="/caixapostal?prioridade=P1" className="flex items-center gap-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 px-3 py-2 border border-orange-200 dark:border-orange-800 hover:shadow-md hover:scale-105 transition-all cursor-pointer">
                    <MailWarning className="h-4 w-4 text-orange-600" />
                    <div className="text-right">
                      <p className="text-lg font-bold text-orange-700 dark:text-orange-400 leading-none">{caixaPostal.naoLidasP1}</p>
                      <p className="text-[10px] text-orange-600/70 font-medium">Alta</p>
                    </div>
                  </Link>
                )}
                {/* P2 — Média */}
                {medias > 0 && (
                  <Link href="/caixapostal?prioridade=P2" className="flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 border border-amber-200 dark:border-amber-800 hover:shadow-md hover:scale-105 transition-all cursor-pointer">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <div className="text-right">
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-400 leading-none">{medias}</p>
                      <p className="text-[10px] text-amber-600/70 font-medium">Média</p>
                    </div>
                  </Link>
                )}
                {/* Total não lidas (P3 incluídas) */}
                {caixaPostal.naoLidasP3 > 0 && (
                  <Link href="/caixapostal?prioridade=P3" className="flex items-center gap-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 border border-gray-200 dark:border-gray-700 hover:shadow-md hover:scale-105 transition-all cursor-pointer">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-600 dark:text-gray-400 leading-none">{caixaPostal.naoLidasP3}</p>
                      <p className="text-[10px] text-gray-500/70 font-medium">Baixa</p>
                    </div>
                  </Link>
                )}
                {/* Importantes */}
                {caixaPostal.importantes > 0 && (
                  <Link href="/caixapostal?importante=1" className="flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 border border-amber-300 dark:border-amber-700 hover:shadow-md hover:scale-105 transition-all cursor-pointer">
                    <Star className="h-4 w-4 text-amber-500 fill-amber-400" />
                    <div className="text-right">
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-400 leading-none">{caixaPostal.importantes}</p>
                      <p className="text-[10px] text-amber-600/70 font-medium">Importante</p>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
