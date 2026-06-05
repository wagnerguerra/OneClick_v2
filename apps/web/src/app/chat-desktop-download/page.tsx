'use client'

/**
 * Página pública de download do aplicativo OneClick Chat Desktop.
 * Lê /api/chat-desktop-updates pra descobrir o nome do instalador disponível
 * e oferece o link de download. Útil pra distribuir pros colaboradores.
 */

import { useEffect, useState } from 'react'
import { getApiUrl } from '@/lib/api-url'
import { Download, MonitorDown, Loader2, AlertTriangle } from 'lucide-react'

interface UpdatesList {
  ok: boolean
  dir?: string
  files?: string[]
  error?: string
}

export default function ChatDesktopDownloadPage() {
  const [data, setData] = useState<UpdatesList | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch(`${getApiUrl()}/api/chat-desktop-updates`, { cache: 'no-store' })
        const json = await r.json() as UpdatesList
        if (alive) setData(json)
      } catch (e) {
        if (alive) setData({ ok: false, error: (e as Error).message })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const exeFile = data?.files?.find(f => f.endsWith('.exe'))

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-lg w-full text-center space-y-6 p-8 rounded-lg border border-border bg-card shadow-sm">
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/chat-desktop-icon.png"
            alt="OneClick Chat"
            className="h-20 w-20 drop-shadow-md"
          />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold">OneClick Chat Desktop</h1>
          <p className="text-sm text-muted-foreground">
            Aplicativo do chat interno pra Windows — fica no system tray,
            notifica novas mensagens em tempo real e mantém você logado entre sessões.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando versão disponível…
          </div>
        )}

        {!loading && exeFile && (
          <a
            href={`${getApiUrl()}/api/chat-desktop-updates/${exeFile}`}
            className="inline-flex items-center justify-center gap-2 w-full h-11 px-4 rounded-md bg-sky-500 hover:bg-sky-600 text-white font-semibold transition-colors"
            download
          >
            <Download className="h-4 w-4" />
            Baixar {exeFile}
          </a>
        )}

        {!loading && !exeFile && (
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 text-left space-y-2">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-semibold text-sm">Instalador não disponível</span>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              O build do aplicativo ainda não foi publicado. Pra gerar o instalador:
            </p>
            <pre className="text-[11px] bg-muted p-2 rounded font-mono overflow-x-auto">
{`cd scripts/chat-desktop
npm install
npm run build
# → dist/OneClick-Chat-Setup-X.X.X.exe`}
            </pre>
            {data?.error && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-2">
                Detalhe técnico: {data.error}
              </p>
            )}
          </div>
        )}

        <div className="text-[11px] text-muted-foreground leading-relaxed pt-4 border-t border-border">
          <MonitorDown className="h-3.5 w-3.5 inline mr-1" />
          Requer Windows 10 ou superior. Após instalar, o aplicativo abre automaticamente
          ao iniciar o computador (opcional, configurável no tray).
        </div>
      </div>
    </div>
  )
}
