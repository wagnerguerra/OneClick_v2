'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, Label } from '@saas/ui'
import { authClient } from '@/lib/auth-client'
import { ArrowLeft, Mail } from 'lucide-react'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
})

type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setError(null)
    setLoading(true)
    try {
      // O cliente do Better Auth roda sobre better-fetch, que NÃO lança em erro
      // HTTP nem em falha de rede — devolve `{ data, error }`. Sem ler `error`
      // aqui, um 403/500 ou a API fora do ar caíam no `setSent(true)` e a tela
      // dizia "verifique seu e-mail" para uma solicitação que nunca saiu.
      const { error: falha } = await authClient.requestPasswordReset({
        email: data.email,
        redirectTo: '/reset-password',
      })
      if (falha) {
        // Não vaza existência do e-mail: quando ele não existe, a API responde
        // 200 igual. Só chega aqui quando a solicitação de fato falhou.
        setError('Não foi possível enviar o e-mail de recuperação agora. Tente de novo em alguns instantes ou fale com o suporte.')
        return
      }
      setSent(true)
    } catch {
      setError('Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Logo */}
      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="OneClick" className="h-16 w-auto dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.png" alt="OneClick" className="h-16 w-auto hidden dark:block" />
      </div>

      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        {sent ? (
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Verifique seu e-mail</h2>
            <p className="text-sm text-muted-foreground">
              Se o endereço <span className="font-medium text-foreground">{getValues('email')}</span> estiver
              cadastrado, você receberá um link para redefinir sua senha.
            </p>
            <Button variant="outline" size="sm" asChild className="mt-4">
              <Link href="/login">
                <ArrowLeft className="h-4 w-4" />
                Voltar ao login
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-foreground">Recuperar senha</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
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
                  autoComplete="username"
                  required
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <Button type="submit" className="h-11 w-full text-sm font-medium" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
              </Button>
            </form>
          </>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Lembrou a senha?{' '}
        <Link href="/login" className="font-medium text-[#5ea3cb] hover:text-[#4a8db5] transition-colors">
          Voltar ao login
        </Link>
      </p>
    </div>
  )
}
