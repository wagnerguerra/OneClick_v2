'use client'

/**
 * Página intermediária do handshake desktop. Cenário:
 *   1. Aplicativo OneClick Chat (Electron) abriu /login?desktop=1 no browser
 *   2. User logou normalmente (form, OAuth, MFA)
 *   3. /login redirecionou pra cá após sucesso
 *   4. Esta página chama POST /api/auth/desktop-handshake (autenticado por cookie),
 *      recebe um token de uso único e redireciona pra `oneclick-chat://auth?token=X`
 *   5. O SO abre o app desktop, que captura a URL, troca o token por uma sessão
 *      própria via /api/auth/desktop-consume e seta o cookie na BrowserWindow
 *
 * O app de destino vem de `?app=` no /login (guardado em sessionStorage para
 * sobreviver ao MFA e ao OAuth): `chat` (padrão) ou `viewer` (OneClick Viewer).
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'
import { getApiUrl } from '@/lib/api-url'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

// App desktop que recebe a sessão: deep-link de retorno e nome exibido.
const APPS = {
  chat: { scheme: 'oneclick-chat', nome: 'OneClick Chat' },
  viewer: { scheme: 'oneclick-viewer', nome: 'OneClick Viewer' },
} as const
type AppDesktop = keyof typeof APPS

function appDoFluxo(): AppDesktop {
  if (typeof window === 'undefined') return 'chat'
  const daUrl = new URLSearchParams(window.location.search).get('app')
  let salvo: string | null = null
  try { salvo = sessionStorage.getItem('oc-desktop-app') } catch { /* ignora */ }
  return (daUrl ?? salvo) === 'viewer' ? 'viewer' : 'chat'
}

type Estado =
  | { kind: 'carregando' }
  | { kind: 'redirecionando' }
  | { kind: 'sucesso' }
  | { kind: 'erro'; msg: string }

export default function DesktopHandshakePage() {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>({ kind: 'carregando' })
  const [app] = useState<AppDesktop>(appDoFluxo)
  const { scheme, nome } = APPS[app]

  useEffect(() => {
    if (isPending) return
    if (!session) {
      router.push(app === 'chat' ? '/login?desktop=1' : `/login?desktop=1&app=${app}`)
      return
    }
    // Limpa flag do sessionStorage assim que chegamos aqui — já cumpriu o papel
    try {
      sessionStorage.removeItem('oc-desktop-flow')
      sessionStorage.removeItem('oc-desktop-app')
    } catch { /* ignora */ }
    let cancelado = false
    ;(async () => {
      try {
        setEstado({ kind: 'carregando' })
        const r = await fetch(`${getApiUrl()}/api/auth/desktop-handshake`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = await r.json() as { token: string }
        if (cancelado) return
        setEstado({ kind: 'redirecionando' })
        // Aciona o handler de protocolo registrado pelo Electron
        const url = `${scheme}://auth?token=${encodeURIComponent(data.token)}`
        window.location.href = url
        // O navegador pode mostrar "Abrir <app>?" — após confirmar,
        // a página continua aberta com a tela de sucesso.
        setTimeout(() => {
          if (!cancelado) setEstado({ kind: 'sucesso' })
        }, 1500)
      } catch (e) {
        if (!cancelado) setEstado({ kind: 'erro', msg: (e as Error).message })
      }
    })()
    return () => { cancelado = true }
  }, [isPending, session, router, app, scheme])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-4 p-8 rounded-lg border border-border bg-card">
        {(estado.kind === 'carregando' || estado.kind === 'redirecionando') && (
          <>
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-sky-500" />
            <h1 className="text-lg font-semibold">
              {estado.kind === 'carregando' ? 'Preparando sessão…' : `Abrindo ${nome}…`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {estado.kind === 'redirecionando'
                ? `Se o aplicativo não abrir automaticamente, confirme o aviso "Abrir ${nome}?" do navegador.`
                : 'Gerando token seguro pra entregar ao aplicativo desktop.'}
            </p>
          </>
        )}

        {estado.kind === 'sucesso' && (
          <>
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
            <h1 className="text-lg font-semibold">Sessão entregue ao aplicativo</h1>
            <p className="text-sm text-muted-foreground">
              Você pode fechar esta aba e voltar pro {nome}.
            </p>
          </>
        )}

        {estado.kind === 'erro' && (
          <>
            <AlertTriangle className="h-10 w-10 mx-auto text-rose-500" />
            <h1 className="text-lg font-semibold">Erro no handshake</h1>
            <p className="text-sm text-muted-foreground">{estado.msg}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 inline-flex items-center px-3 h-9 rounded-md bg-sky-500 text-white text-sm font-medium hover:bg-sky-600"
            >
              Tentar de novo
            </button>
          </>
        )}
      </div>
    </div>
  )
}
