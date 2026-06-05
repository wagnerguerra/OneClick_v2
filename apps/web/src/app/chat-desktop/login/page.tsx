'use client'

/**
 * Tela de login dedicada do OneClick Chat — usada pelo aplicativo desktop
 * e pela rota /chat-desktop quando o user não está autenticado. UI
 * compact dark, identidade visual do chat (sem o branding completo do
 * sistema). Fluxo idêntico ao /login: signIn.email do Better Auth +
 * redirect pro /desktop-handshake (que entrega token via deep-link pro
 * Electron) ou direto pro /chat-desktop se rodando no browser.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, MessageSquare,
  ExternalLink, LogIn,
} from 'lucide-react'
import { loginSchema } from '@saas/types'
import { signIn } from '@/lib/auth-client'

const REDIRECT_AFTER_LOGIN = '/desktop-handshake'

export default function ChatDesktopLoginPage() {
  const router = useRouter()

  // Detecta Electron sem hydration mismatch
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    setIsDesktop(
      typeof window !== 'undefined'
      && !!(window as unknown as { chatDesktop?: { isDesktop?: boolean } }).chatDesktop?.isDesktop,
    )
  }, [])

  // Persiste a flag desktop pra que o /login/2fa (MFA) saiba também
  useEffect(() => {
    if (typeof window !== 'undefined') sessionStorage.setItem('oc-desktop-flow', '1')
  }, [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = loginSchema.safeParse({ email: email.trim(), password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique e-mail e senha.')
      return
    }
    setLoading(true)
    try {
      const result = await signIn.email({
        email: parsed.data.email,
        password: parsed.data.password,
        rememberMe,
      })
      if (result.error) {
        setError('Usuário ou senha inválidos.')
        return
      }
      // Se o user tem MFA, o plugin twoFactorClient redireciona via
      // window.location.href pro /login/2fa. Não chamamos location.href aqui.
      if ((result.data as Record<string, unknown> | undefined)?.twoFactorRedirect) {
        return
      }
      // Login normal → handshake desktop ou direto pro chat
      window.location.href = REDIRECT_AFTER_LOGIN
    } catch {
      setError('Usuário ou senha inválidos.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)
    try {
      const callbackURL = typeof window !== 'undefined'
        ? `${window.location.origin}${REDIRECT_AFTER_LOGIN}`
        : REDIRECT_AFTER_LOGIN
      await signIn.social({ provider: 'google', callbackURL })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar login com Google.')
      setGoogleLoading(false)
    }
  }

  function abrirNoNavegador() {
    // Quando rodando no Electron, abrir /login?desktop=1 no browser default.
    // Quando rodando no browser, esse botão não faz sentido — escondido.
    const desktop = (window as unknown as { chatDesktop?: { openLogin?: () => void } }).chatDesktop
    if (desktop?.openLogin) {
      desktop.openLogin()
    } else {
      router.push('/login?desktop=1')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-card">
      {/* Logo do chat */}
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <MessageSquare className="h-8 w-8 text-white" strokeWidth={2.2} />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-bold text-foreground">OneClick Chat</h1>
          <p className="text-[12px] text-muted-foreground">Entre com sua conta pra começar</p>
        </div>
      </div>

      {/* Card de login */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[340px] space-y-3 rounded-xl border border-border/60 bg-background/40 p-5 backdrop-blur"
      >
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-[12px] text-destructive leading-snug">{error}</p>
          </div>
        )}

        {/* E-mail */}
        <div className="space-y-1">
          <label htmlFor="email" className="text-[12px] font-medium text-foreground">E-mail</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-muted-foreground/60" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full h-10 rounded-md border border-border bg-card px-3 pl-9 text-[13px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/60"
            />
          </div>
        </div>

        {/* Senha */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-[12px] font-medium text-foreground">Senha</label>
            <Link
              href="/forgot-password"
              target={isDesktop ? '_blank' : undefined}
              rel={isDesktop ? 'noopener noreferrer' : undefined}
              className="text-[11px] text-sky-400 hover:text-sky-300"
            >
              Esqueci a senha
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-muted-foreground/60" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-10 rounded-md border border-border bg-card px-3 pl-9 pr-10 text-[13px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/60"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/60 hover:text-muted-foreground"
            >
              {showPassword ? <EyeOff className="h-[14px] w-[14px]" /> : <Eye className="h-[14px] w-[14px]" />}
            </button>
          </div>
        </div>

        {/* Lembrar-me */}
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer select-none pt-0.5">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-3.5 w-3.5 accent-sky-500"
          />
          Manter conectado neste computador
        </label>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md bg-gradient-to-br from-sky-500 to-indigo-500 text-white text-[13px] font-semibold transition-all hover:shadow-md hover:shadow-indigo-500/30 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Entrar
        </button>

        {/* Separador */}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 h-px bg-border/60" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">ou</span>
          <div className="flex-1 h-px bg-border/60" />
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md border border-border bg-card text-[13px] font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60"
        >
          {googleLoading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : (
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
          Entrar com Google
        </button>

        {/* Abrir no navegador (só Electron) */}
        {isDesktop && (
          <button
            type="button"
            onClick={abrirNoNavegador}
            className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ExternalLink className="h-3 w-3" /> Entrar pelo navegador (recomendado pra MFA)
          </button>
        )}
      </form>

      <p className="mt-6 text-[10px] text-muted-foreground/60">OneClick Chat Desktop</p>
    </div>
  )
}
