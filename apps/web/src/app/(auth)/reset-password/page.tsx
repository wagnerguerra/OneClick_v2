'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, Label } from '@saas/ui'
import { authClient } from '@/lib/auth-client'
import { CheckCircle } from 'lucide-react'
import { PasswordStrength } from '@/components/auth/password-strength'

const schema = z.object({
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  confirmPassword: z.string().min(8, 'Confirme a senha'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não conferem',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  const password = watch('password') ?? ''

  async function onSubmit(data: FormData) {
    if (!token) {
      setError('Token de recuperação não encontrado. Solicite um novo link.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await authClient.resetPassword({
        newPassword: data.password,
        token,
      })
      setDone(true)
    } catch {
      setError('Não foi possível redefinir a senha. O link pode ter expirado.')
    } finally {
      setLoading(false)
    }
  }

  if (!token && !done) {
    return (
      <div className="space-y-8">
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="OneClick" className="h-16 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-light.png" alt="OneClick" className="h-16 w-auto hidden dark:block" />
        </div>
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm text-center space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Link inválido</h2>
          <p className="text-sm text-muted-foreground">
            O link de recuperação é inválido ou expirou. Solicite um novo.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/forgot-password">Solicitar novo link</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="OneClick" className="h-16 w-auto dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.png" alt="OneClick" className="h-16 w-auto hidden dark:block" />
      </div>

      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        {done ? (
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle className="h-6 w-6 text-emerald-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Senha redefinida</h2>
            <p className="text-sm text-muted-foreground">
              Sua senha foi alterada com sucesso. Você já pode fazer login.
            </p>
            <Button variant="success" size="sm" asChild className="mt-4">
              <Link href="/login">Ir para o login</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-foreground">Nova senha</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Defina sua nova senha abaixo.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {error && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  className="h-11"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  {...register('password')}
                />
                <PasswordStrength password={password} />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repita a senha"
                  className="h-11"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type="submit" className="h-11 w-full text-sm font-medium" disabled={loading}>
                {loading ? 'Redefinindo...' : 'Redefinir senha'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
