'use client'

/**
 * Página do dashboard para baixar o app mobile OneClick ERP.
 * Lê /api/mobile-app pra descobrir os builds disponíveis (Android APK e iOS)
 * e oferece os links de download/instalação pros colaboradores.
 */

import { useEffect, useState } from 'react'
import { getApiUrl } from '@/lib/api-url'
import {
  Smartphone,
  Apple,
  Download,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { Button, Card } from '@saas/ui'

interface MobileApp {
  ok: boolean
  android: { url: string; file: string | null } | null
  ios: { url: string } | null
  error?: string
}

export default function BaixarAppPage() {
  const [data, setData] = useState<MobileApp | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch(`${getApiUrl()}/api/mobile-app`, { cache: 'no-store' })
        const json = (await r.json()) as MobileApp
        if (alive) setData(json)
      } catch (e) {
        if (alive) setErro((e as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // android.url pode ser relativa ("/api/...") ou absoluta ("http...").
  const android = data?.android ?? null
  const androidHref = android
    ? android.url.startsWith('http')
      ? android.url
      : `${getApiUrl()}${android.url}`
    : null
  const ios = data?.ios ?? null

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Smartphone className="h-6 w-6 text-muted-foreground" />
          Baixar o app OneClick ERP
        </h1>
        <p className="text-sm text-muted-foreground">
          Instale o aplicativo no seu celular para acompanhar suas obrigações,
          serviços e notificações onde estiver.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 text-muted-foreground py-16">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verificando builds disponíveis…
        </div>
      )}

      {/* Erro de rede */}
      {!loading && erro && (
        <div className="rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800 p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-semibold text-sm">
              Não foi possível verificar os downloads
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Tente novamente em instantes. Detalhe técnico: {erro}
          </p>
        </div>
      )}

      {/* Cards */}
      {!loading && !erro && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* ---------- Android ---------- */}
          <Card className="p-6 flex flex-col gap-4 bg-card border-border">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Smartphone className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Android (APK)</h2>
                <p className="text-[12px] text-muted-foreground">Smartphones e tablets Android</p>
              </div>
            </div>

            {androidHref ? (
              <>
                <Button asChild variant="success" className="w-full">
                  <a href={androidHref} download>
                    <Download className="h-4 w-4" />
                    Baixar APK
                  </a>
                </Button>

                {android?.file && (
                  <p className="text-[11px] text-muted-foreground text-center break-all">
                    Arquivo: {android.file}
                  </p>
                )}

                <ol className="space-y-2 text-[13px] text-muted-foreground pt-1">
                  <li className="flex gap-2">
                    <span className="font-semibold text-foreground">1.</span>
                    Baixe o APK no seu celular.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-foreground">2.</span>
                    Permita instalar de fontes desconhecidas (Android pede ao abrir).
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-foreground">3.</span>
                    Abra o arquivo baixado e conclua a instalação.
                  </li>
                </ol>
              </>
            ) : (
              <div className="rounded-md border border-border bg-muted/40 p-4 flex items-start gap-2">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">Build em preparação</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    O APK do Android ainda não foi publicado. Volte em breve.
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* ---------- iOS ---------- */}
          <Card className="p-6 flex flex-col gap-4 bg-card border-border">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-500/10 text-foreground">
                <Apple className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">iPhone / iPad</h2>
                <p className="text-[12px] text-muted-foreground">Dispositivos Apple (iOS)</p>
              </div>
            </div>

            {ios ? (
              <>
                <Button asChild variant="dark" className="w-full">
                  <a href={ios.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Abrir no TestFlight / App Store
                  </a>
                </Button>

                <ol className="space-y-2 text-[13px] text-muted-foreground pt-1">
                  <li className="flex gap-2">
                    <span className="font-semibold text-foreground">1.</span>
                    Toque no botão acima para abrir a página de instalação.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-foreground">2.</span>
                    Se for TestFlight, instale o app TestFlight primeiro (link na página).
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-foreground">3.</span>
                    Instale o OneClick ERP e abra normalmente.
                  </li>
                </ol>
              </>
            ) : (
              <div className="rounded-md border border-border bg-muted/40 p-4 flex items-start gap-2">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">Em breve</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    A versão para iPhone / iPad chegará em breve na App Store / TestFlight.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
