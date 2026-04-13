'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, Search, Loader2, Rocket } from 'lucide-react'
import { Button, Input, Label, Card, CardContent } from '@saas/ui'
import { useSession } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'

const schema = z.object({
  razaoSocial: z.string().min(2, 'Razão Social é obrigatória'),
  nomeFantasia: z.string().optional(),
  cnpj: z.string().min(14, 'CNPJ é obrigatório'),
})

type FormData = z.infer<typeof schema>

export default function OnboardingPage() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [saving, setSaving] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [checking, setChecking] = useState(true)

  const { register, handleSubmit, setValue, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Verificar se o usuário já tem empresa → redirecionar para dashboard
  useEffect(() => {
    if (isPending) return
    if (!session) { router.push('/login'); return }

    trpc.onboarding.needsOnboarding.query()
      .then((needs) => {
        if (!needs) router.push('/dashboard')
        else setChecking(false)
      })
      .catch(() => setChecking(false))
  }, [isPending, session, router])

  async function fetchCnpj() {
    const rawCnpj = getValues('cnpj')
    const digits = rawCnpj.replace(/\D/g, '')
    if (digits.length !== 14) return

    setFetching(true)
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.razao_social) setValue('razaoSocial', data.razao_social, { shouldDirty: true })
      if (data.nome_fantasia) setValue('nomeFantasia', data.nome_fantasia, { shouldDirty: true })
    } catch {} finally { setFetching(false) }
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      await trpc.onboarding.createEmpresa.mutate(data)
      await alerts.success('Empresa criada!', 'Bem-vindo ao OneClick ERP. Seu ambiente está pronto.')
      router.push('/dashboard')
    } catch (e) {
      alerts.error('Erro', (e as Error).message ?? 'Não foi possível criar a empresa.')
    } finally { setSaving(false) }
  }

  if (isPending || checking) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5ea3cb] border-t-transparent" />
        <p className="text-sm text-muted-foreground">Verificando...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="OneClick" className="h-10 w-auto dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.png" alt="OneClick" className="h-10 w-auto hidden dark:block" />
      </div>

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md">
          <Building2 className="h-7 w-7" />
        </div>
        <h1>Configure sua empresa</h1>
        <p className="text-sm text-muted-foreground">
          Para começar a usar o OneClick ERP, cadastre os dados da sua empresa.
        </p>
      </div>

      {/* Formulário */}
      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* CNPJ com busca */}
            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                <Input
                  id="cnpj"
                  placeholder="00.000.000/0000-00"
                  {...register('cnpj')}
                  onChange={e => { e.target.value = masks.cnpj(e.target.value); register('cnpj').onChange(e) }}
                  className="flex-1"
                />
                <Button type="button" variant="soft" size="icon" onClick={fetchCnpj} disabled={fetching}>
                  {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {errors.cnpj && <p className="text-xs text-destructive">{errors.cnpj.message}</p>}
              <p className="text-xs text-muted-foreground">Digite o CNPJ e clique na lupa para preencher automaticamente.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="razaoSocial">Razão Social <span className="text-destructive">*</span></Label>
              <Input id="razaoSocial" placeholder="Razão social da empresa" {...register('razaoSocial')} />
              {errors.razaoSocial && <p className="text-xs text-destructive">{errors.razaoSocial.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nomeFantasia">Nome Fantasia</Label>
              <Input id="nomeFantasia" placeholder="Nome fantasia (opcional)" {...register('nomeFantasia')} />
            </div>

            <Button type="submit" variant="success" className="w-full h-11" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {saving ? 'Criando empresa...' : 'Criar empresa e começar'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Você será o administrador desta empresa e poderá convidar outros usuários depois.
      </p>
    </div>
  )
}
