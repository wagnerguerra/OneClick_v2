'use client'

/**
 * Página unificada de Downloads do OneClick.
 * Reúne, em cards, todos os aplicativos distribuídos pelo sistema:
 *  - App Mobile (OneClick ERP) — Android APK + versões anteriores + iOS (/api/mobile-app)
 *  - Chat (Desktop, Windows) — instalador .exe (/api/chat-desktop-updates)
 *  - Launcher / Service Manager — instalador .exe (/api/launcher-updates)
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
  History,
  MonitorDown,
  DownloadCloud,
  Server,
} from 'lucide-react'
import { Button, Card } from '@saas/ui'

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

interface VersionEntry {
  url: string
  file: string
  version: string | null
  build: number | null
  sizeMb: number
  mtime: string
}

interface MobileApp {
  ok: boolean
  android: { url: string; file: string | null } | null
  latest: VersionEntry | null
  versions: VersionEntry[]
  ios: { url: string } | null
  error?: string
}

interface UpdatesList {
  ok: boolean
  dir?: string
  files?: string[]
  error?: string
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Prefixa url relativa ("/api/...") com a base da API; absoluta passa direto. */
function resolveHref(url: string): string {
  return url.startsWith('http') ? url : `${getApiUrl()}${url}`
}

/** Formata uma data ISO em pt-BR (dd/mm/aaaa). */
function formatData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export default function DownloadsPage() {
  // ---- App Mobile ----
  const [mobile, setMobile] = useState<MobileApp | null>(null)
  const [mobileLoading, setMobileLoading] = useState(true)
  const [mobileErro, setMobileErro] = useState<string | null>(null)

  // ---- Chat Desktop ----
  const [chat, setChat] = useState<UpdatesList | null>(null)
  const [chatLoading, setChatLoading] = useState(true)

  // ---- Launcher / Service Manager ----
  const [launcher, setLauncher] = useState<UpdatesList | null>(null)
  const [launcherLoading, setLauncherLoading] = useState(true)

  useEffect(() => {
    let alive = true

    // App Mobile
    ;(async () => {
      try {
        const r = await fetch(`${getApiUrl()}/api/mobile-app`, { cache: 'no-store' })
        const json = (await r.json()) as MobileApp
        if (alive) setMobile(json)
      } catch (e) {
        if (alive) setMobileErro((e as Error).message)
      } finally {
        if (alive) setMobileLoading(false)
      }
    })()

    // Chat Desktop
    ;(async () => {
      try {
        const r = await fetch(`${getApiUrl()}/api/chat-desktop-updates`, { cache: 'no-store' })
        const json = (await r.json()) as UpdatesList
        if (alive) setChat(json)
      } catch (e) {
        if (alive) setChat({ ok: false, error: (e as Error).message })
      } finally {
        if (alive) setChatLoading(false)
      }
    })()

    // Launcher / Service Manager
    ;(async () => {
      try {
        const r = await fetch(`${getApiUrl()}/api/launcher-updates`, { cache: 'no-store' })
        const json = (await r.json()) as UpdatesList
        if (alive) setLauncher(json)
      } catch (e) {
        if (alive) setLauncher({ ok: false, error: (e as Error).message })
      } finally {
        if (alive) setLauncherLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  /* ---- App Mobile (derivados) ---- */
  const latest = mobile?.latest ?? null
  const versions = mobile?.versions ?? []
  const android = mobile?.android ?? null
  const latestHref = latest
    ? resolveHref(latest.url)
    : android
      ? resolveHref(android.url)
      : null
  const olderVersions = latest ? versions.filter((v) => v.file !== latest.file) : []
  const ios = mobile?.ios ?? null

  /* ---- Chat / Launcher (derivados) ---- */
  const chatExe = chat?.files?.find((f) => f.endsWith('.exe'))
  const launcherExe = launcher?.files?.find((f) => f.endsWith('.exe'))

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <DownloadCloud className="h-6 w-6 text-muted-foreground" />
          Downloads
        </h1>
        <p className="text-sm text-muted-foreground">
          Aplicativos do OneClick — instale onde precisar para acompanhar suas
          obrigações, conversar com a equipe e gerenciar os serviços.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* ============================================================ */}
        {/* Card — App Mobile (OneClick ERP)                            */}
        {/* ============================================================ */}
        <Card className="p-6 flex flex-col gap-4 bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">App Mobile (OneClick ERP)</h2>
              <p className="text-[12px] text-muted-foreground">Android e iPhone / iPad</p>
            </div>
          </div>

          {mobileLoading && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando builds disponíveis…
            </div>
          )}

          {!mobileLoading && mobileErro && (
            <div className="rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800 p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-semibold text-sm">Não foi possível verificar os downloads</span>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Tente novamente em instantes. Detalhe técnico: {mobileErro}
              </p>
            </div>
          )}

          {!mobileLoading && !mobileErro && (
            <>
              {/* ---- Android ---- */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                  <Smartphone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Android (APK)
                </div>

                {latestHref ? (
                  <>
                    {latest && (
                      <div className="flex flex-wrap items-center gap-2">
                        {latest.version && (
                          <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                            v{latest.version}
                            {latest.build != null && ` (build ${latest.build})`}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {latest.sizeMb} MB · {formatData(latest.mtime)}
                        </span>
                      </div>
                    )}

                    <Button asChild variant="success" className="w-full">
                      <a href={latestHref} download>
                        <Download className="h-4 w-4" />
                        Baixar APK
                      </a>
                    </Button>

                    {(latest?.file ?? android?.file) && (
                      <p className="text-[11px] text-muted-foreground text-center break-all">
                        Arquivo: {latest?.file ?? android?.file}
                      </p>
                    )}
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
              </div>

              {/* ---- iOS ---- */}
              <div className="space-y-3 pt-1 border-t border-border">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground pt-3">
                  <Apple className="h-4 w-4 text-muted-foreground" />
                  iPhone / iPad
                </div>

                {ios ? (
                  <Button asChild variant="dark" className="w-full">
                    <a href={ios.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Abrir no TestFlight / App Store
                    </a>
                  </Button>
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
              </div>

              {/* ---- Versões anteriores ---- */}
              {olderVersions.length > 0 && (
                <details className="pt-1 border-t border-border">
                  <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-foreground select-none pt-3">
                    <History className="h-4 w-4 text-muted-foreground" />
                    Versões anteriores ({olderVersions.length})
                  </summary>
                  <ul className="mt-3 divide-y divide-border">
                    {olderVersions.map((v) => (
                      <li
                        key={v.file}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-[13px] font-medium text-foreground">
                            {v.version ? (
                              <>
                                v{v.version}
                                {v.build != null && (
                                  <span className="text-muted-foreground font-normal">
                                    {' '}
                                    (build {v.build})
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="break-all">{v.file}</span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {v.sizeMb} MB · {formatData(v.mtime)}
                          </p>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <a href={resolveHref(v.url)} download>
                            <Download className="h-4 w-4" />
                            Baixar
                          </a>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </Card>

        {/* ============================================================ */}
        {/* Card — Chat (Desktop)                                        */}
        {/* ============================================================ */}
        <Card className="p-6 flex flex-col gap-4 bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <MonitorDown className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Chat (Desktop)</h2>
              <p className="text-[12px] text-muted-foreground">Windows 10 ou superior</p>
            </div>
          </div>

          <p className="text-[13px] text-muted-foreground leading-relaxed">
            App do chat interno para Windows — fica no system tray, notifica novas
            mensagens em tempo real e mantém você logado entre sessões.
          </p>

          {chatLoading && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando versão disponível…
            </div>
          )}

          {!chatLoading && chatExe && (
            <Button asChild className="w-full">
              <a href={`${getApiUrl()}/api/chat-desktop-updates/${chatExe}`} download>
                <Download className="h-4 w-4" />
                Baixar {chatExe}
              </a>
            </Button>
          )}

          {!chatLoading && !chatExe && (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-semibold text-sm">Instalador não disponível</span>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                O build do aplicativo ainda não foi publicado. Volte em breve.
              </p>
              {chat?.error && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400">
                  Detalhe técnico: {chat.error}
                </p>
              )}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 mt-auto border-t border-border">
            <MonitorDown className="h-3.5 w-3.5 inline mr-1" />
            Após instalar, o aplicativo pode abrir automaticamente ao iniciar o
            computador (configurável no tray).
          </p>
        </Card>

        {/* ============================================================ */}
        {/* Card — Launcher / Service Manager                            */}
        {/* ============================================================ */}
        <Card className="p-6 flex flex-col gap-4 bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Server className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Launcher / Service Manager</h2>
              <p className="text-[12px] text-muted-foreground">Ferramenta interna — Windows</p>
            </div>
          </div>

          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Gerenciador de serviços do OneClick — inicia/para os apps locais
            (API, web, banco) com um clique e acompanha os logs.
          </p>

          {launcherLoading && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando versão disponível…
            </div>
          )}

          {!launcherLoading && launcherExe && (
            <Button asChild variant="outline" className="w-full">
              <a href={`${getApiUrl()}/api/launcher-updates/${launcherExe}`} download>
                <Download className="h-4 w-4" />
                Baixar {launcherExe}
              </a>
            </Button>
          )}

          {!launcherLoading && !launcherExe && (
            <div className="rounded-md border border-border bg-muted/40 p-4 flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Build não disponível</p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  O instalador do Launcher ainda não foi publicado neste servidor.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
