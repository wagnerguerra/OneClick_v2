'use client'

/**
 * Dashboard Financeiro — a porta do LINK público (`/bi-public?token=…`).
 *
 * O token É a autorização: quem tem o link vê os números, sem login. Por isso
 * esta página cuida só de duas coisas — resolver o token e mostrar de quem é o
 * relatório. A tela em si mora em `BiClienteDashboard`, a mesma que o portal
 * do cliente usa atrás do login e da permissão por usuário.
 *
 * Sem cromo de aplicação: nenhum menu, nenhuma barra do sistema. Quem abre
 * isto recebeu um link do contador e quer ver os próprios números.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@saas/ui'

import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import { BiClienteDashboard, type FonteBiCliente } from '@/components/bi-cliente/bi-cliente-dashboard'

interface ContextoDoLink {
  id: string
  razaoSocial: string
  documento: string
  empresaLogo?: string | null
  empresaLogoDark?: string | null
  empresaNome?: string | null
}

export default function BiPublicContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [ctx, setCtx] = useState<ContextoDoLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setError('Token não informado na URL.'); setLoading(false); return }
    trpc.biPublic.context.query({ token })
      .then(c => setCtx(c as ContextoDoLink))
      .catch(() => setError('Token inválido ou expirado.'))
      .finally(() => setLoading(false))
  }, [token])

  // A porta do link: toda busca leva o token.
  const fonte = useMemo<FonteBiCliente>(() => ({
    chave: token,
    anos: () => (trpc.biPublic as any).anosDisponiveis.query({ token }) as Promise<number[]>,
    kpis: (ano, meses) => trpc.biPublic.balanceteKpis.query({ token, ano, meses }),
    analise: (ano, meses) => trpc.biPublic.balanceteAnalise.query({ token, ano, meses }),
    matriz: ano => trpc.biPublic.balanceteMatriz.query({ token, ano }),
  }), [token])

  if (loading) return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  if (error) return (
    <div className="flex h-screen items-center justify-center bg-background px-4">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-lg border border-border bg-card p-8 shadow-sm">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h1 className="text-foreground">Acesso negado</h1>
        <p className="text-center text-sm text-muted-foreground">{error}</p>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ── Identificação ──
          O mínimo para quem abre o link saber de quem é o relatório: a marca do
          escritório e o nome da empresa. */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-screen-xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-8">
          {ctx?.empresaLogo ? (
            <>
              {/* `resolveAssetUrl` remenda o host: a logo foi gravada com a URL
                  absoluta do ambiente de quem subiu o arquivo
                  ("http://localhost:4000/api/upload/…"), e o navegador do cliente
                  não tem como alcançar aquele endereço — a imagem vinha quebrada. */}
              <img alt={ctx.empresaNome ?? 'Logo'} className="h-8 w-auto max-w-[150px] object-contain dark:hidden" src={resolveAssetUrl(ctx.empresaLogo)} />
              <img alt={ctx.empresaNome ?? 'Logo'} className="hidden h-8 w-auto max-w-[150px] object-contain dark:block" src={resolveAssetUrl(ctx.empresaLogoDark ?? ctx.empresaLogo)} />
            </>
          ) : (
            <span className="text-base font-semibold tracking-tight text-primary">{ctx?.empresaNome ?? 'OneClick'}</span>
          )}
          {ctx && (
            <div className="min-w-0">
              <h1 className="truncate text-foreground">{ctx.razaoSocial}</h1>
              <p className="text-xs text-muted-foreground">Dashboard Financeiro</p>
            </div>
          )}
        </div>
      </header>

      <main className={cn('mx-auto w-full max-w-screen-xl flex-1 px-4 py-6 sm:px-8')}>
        <BiClienteDashboard fonte={fonte} />
      </main>

      <footer className="border-t border-border bg-card py-4 text-center text-xs text-muted-foreground">
        Relatório gerado automaticamente pelo OneClick
      </footer>
    </div>
  )
}
