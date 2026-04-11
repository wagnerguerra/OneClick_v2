'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginInput } from '@saas/types'
import { Button, Input, Label } from '@saas/ui'
import { signIn } from '@/lib/auth-client'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginInput) {
    setError(null)
    setLoading(true)

    try {
      const result = await signIn.email({
        email: data.email,
        password: data.password,
      })

      if (result.error) {
        setError('Usuário ou senha inválidos. Verifique suas credenciais e tente novamente.')
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
    <div className="space-y-8">
      {/* Logo — troca automaticamente com dark mode via CSS */}
      <div className="flex justify-center lg:justify-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="OneClick"
          className="h-12 w-auto dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-light.png"
          alt="OneClick"
          className="h-12 w-auto hidden dark:block"
        />
      </div>

      {/* Card de login */}
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-foreground">Entrar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesse sua conta para continuar
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              className="h-11"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-[#5ea3cb] hover:text-[#4a8db5] transition-colors"
              >
                Esqueceu a senha?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              className="h-11"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="h-11 w-full text-sm font-medium"
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        {/* Divisor */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">ou continue com</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* OAuth */}
        <Button
          variant="outline"
          className="h-11 w-full text-sm font-medium"
          type="button"
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
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
          Google
        </Button>
      </div>

      {/* Link de registro */}
      <p className="text-center text-sm text-muted-foreground">
        Não tem uma conta?{' '}
        <Link
          href="/register"
          className="font-medium text-[#5ea3cb] hover:text-[#4a8db5] transition-colors"
        >
          Criar conta
        </Link>
      </p>
    </div>
  )
}
