'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { loginSchema, type LoginInput } from '@saas/types'
import { Button, Label } from '@saas/ui'
import { signIn } from '@/lib/auth-client'
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // "Lembrar-me" controla a duração da sessão:
  //  - desmarcado (padrão SaaS): cookie de sessão, expira ao fechar o navegador
  //  - marcado: cookie persistente conforme session.expiresIn (7 dias)
  const [rememberMe, setRememberMe] = useState(false)

  async function handleGoogleSignIn() {
    setError(null)
    setGoogleLoading(true)
    try {
      // Better Auth client → redireciona pro Google OAuth consent.
      // callbackURL precisa ser ABSOLUTO apontando pro host do Web (não da API)
      // — senão Better Auth usa BETTER_AUTH_URL como base (= localhost:4000 em
      // dev), que é a porta do NestJS e não tem rota /dashboard.
      const callbackURL = typeof window !== 'undefined'
        ? `${window.location.origin}/dashboard`
        : '/dashboard'
      await signIn.social({
        provider: 'google',
        callbackURL,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar login com Google')
      setGoogleLoading(false)
    }
  }

  const {
    register,
    setError: setFieldError,
    clearErrors,
    formState: { errors },
  } = useForm<LoginInput>({
    // Sem `resolver` automático aqui — validamos manualmente no submit lendo
    // direto do DOM via FormData (única fonte que sempre reflete o autofill
    // do browser, mesmo quando Chrome popula os inputs sem disparar onChange).
  })

  /**
   * Handler de submit DOM-first. Por quê: o autofill do Chrome popula os inputs
   * mas NÃO dispara `onChange`, então o RHF state continua vazio. Se usássemos
   * `handleSubmit(onSubmit)` do RHF, o zodResolver rejeitaria os "vazios" e o
   * user veria a tela "piscar" sem login acontecer. Lendo via FormData no submit
   * nativo do form, sempre temos os valores reais que o user vê.
   */
  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    clearErrors()
    setError(null)

    const formData = new FormData(e.currentTarget)
    const email = String(formData.get('email') || '').trim()
    const password = String(formData.get('password') || '')

    // Validação manual com o mesmo schema Zod — erros vão pro RHF pra mostrar
    // nos campos. Mantém UX consistente com o resto do projeto.
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path[0]
        if (path === 'email' || path === 'password') {
          setFieldError(path, { type: 'manual', message: issue.message })
        }
      }
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
        setError('Usuário ou senha inválidos. Verifique suas credenciais e tente novamente.')
        return
      }

      // Se o usuario tem MFA ativo, o plugin twoFactorClient ja redirecionou via
      // window.location.href (onTwoFactorRedirect). NAO fazer push pra /dashboard
      // para evitar conflito de redirects (causa "removeChild" em portals abertos).
      if ((result.data as Record<string, unknown> | undefined)?.twoFactorRedirect) {
        return
      }

      router.push('/dashboard')
    } catch {
      setError('Usuário ou senha inválidos. Verifique suas credenciais e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Logo — centralizada */}
      <div className="flex justify-center mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="OneClick"
          className="h-16 w-auto dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-light.png"
          alt="OneClick"
          className="h-16 w-auto hidden dark:block"
        />
      </div>

      {/* Card de login */}
      <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-lg shadow-black/5 dark:shadow-black/20">
        {/* Header do card */}
        <div className="mb-7 text-center">
          <h2 className="text-[22px] font-semibold text-foreground tracking-tight">
            Bem-vindo de volta!
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Acesse sua conta para continuar
          </p>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4">
          {/* Alerta de erro */}
          {error && (
            <div className="flex items-start gap-3 rounded-lg bg-destructive/8 border border-destructive/20 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-[13px] text-destructive leading-snug">{error}</p>
            </div>
          )}

          {/* E-mail */}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[13px] font-medium">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[16px] w-[16px] text-muted-foreground/50" />
              <input
                id="email"
                type="email"
                placeholder="seu@email.com"
                className="flex w-full h-11 rounded-lg border border-border bg-background px-3.5 pl-10 text-sm transition-colors placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                {...register('email')}
              />
            </div>
            {errors.email && (
              <p className="text-xs text-destructive pl-1">{errors.email.message}</p>
            )}
          </div>

          {/* Senha */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-[13px] font-medium">Senha</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-[#5ea3cb] hover:text-[#4a8db5] transition-colors font-medium"
              >
                Esqueceu a senha?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[16px] w-[16px] text-muted-foreground/50" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Digite sua senha"
                className="flex w-full h-11 rounded-lg border border-border bg-background px-3.5 pl-10 pr-11 text-sm transition-colors placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                {...register('password')}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                {showPassword
                  ? <EyeOff className="h-[16px] w-[16px]" />
                  : <Eye className="h-[16px] w-[16px]" />
                }
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-destructive pl-1">{errors.password.message}</p>
            )}
          </div>

          {/* Lembrar-me — controla duração da sessão (7 dias se marcado, até fechar o navegador se não) */}
          <div className="flex items-center gap-2 pt-0.5">
            <input
              type="checkbox"
              id="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border text-primary accent-primary cursor-pointer"
            />
            <label
              htmlFor="remember"
              className="text-[13px] text-muted-foreground cursor-pointer select-none"
              title={rememberMe
                ? 'Sua sessão vai durar 7 dias neste navegador.'
                : 'Sua sessão termina quando você fechar o navegador.'}
            >
              Lembrar-me por 7 dias
            </label>
          </div>

          {/* Botão de login */}
          <Button
            type="submit"
            className="h-11 w-full text-sm font-semibold tracking-wide mt-1"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </Button>
        </form>

        {/* Divisor */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border/70" />
          <span className="text-xs text-muted-foreground/70 uppercase tracking-wider font-medium">ou</span>
          <div className="h-px flex-1 bg-border/70" />
        </div>

        {/* OAuth Google */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="flex w-full h-11 items-center justify-center gap-3 rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-all hover:bg-muted/60 hover:border-foreground/20 hover:shadow-sm active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {googleLoading ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          ) : (
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}
          {googleLoading ? 'Redirecionando...' : 'Entrar com Google'}
        </button>
      </div>

      {/* Link de registro */}
      <p className="text-center text-[13px] text-muted-foreground">
        Ainda nao tem uma conta?{' '}
        <Link
          href="/register"
          className="font-semibold text-[#5ea3cb] hover:text-[#4a8db5] transition-colors"
        >
          Criar conta
        </Link>
      </p>
    </div>
  )
}
