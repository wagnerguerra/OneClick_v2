'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { registerSchema, type RegisterInput } from '@saas/types'
import { Button, Input, Label } from '@saas/ui'
import { signUp } from '@/lib/auth-client'

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  })

  async function onSubmit(data: RegisterInput) {
    setError(null)
    setLoading(true)

    try {
      const result = await signUp.email({
        name: data.name,
        email: data.email,
        password: data.password,
      })

      if (result.error) {
        setError(result.error.message ?? 'Erro ao criar conta')
        return
      }

      router.push('/onboarding')
    } catch {
      setError('Erro ao criar conta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Logo — troca automaticamente com dark mode via CSS */}
      <div className="flex justify-center">
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

      {/* Card de registro */}
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-foreground">Criar Conta</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Preencha os dados para começar
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Nome completo</Label>
            <Input
              id="name"
              placeholder="Seu nome"
              className="h-11"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenantName">Nome da empresa</Label>
            <Input
              id="tenantName"
              placeholder="Sua empresa"
              className="h-11"
              {...register('tenantName')}
            />
            {errors.tenantName && (
              <p className="text-xs text-destructive">
                {errors.tenantName.message}
              </p>
            )}
          </div>

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
            <Label htmlFor="password">Senha</Label>
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
            {loading ? 'Criando conta...' : 'Criar conta'}
          </Button>
        </form>
      </div>

      {/* Link de login */}
      <p className="text-center text-sm text-muted-foreground">
        Já tem uma conta?{' '}
        <Link
          href="/login"
          className="font-medium text-[#5ea3cb] hover:text-[#4a8db5] transition-colors"
        >
          Entrar
        </Link>
      </p>
    </div>
  )
}
