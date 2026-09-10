'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, Label } from '@saas/ui'
import { CheckCircle, Loader2, ShieldX } from 'lucide-react'
import { PasswordStrength } from '@/components/auth/password-strength'
import { trpc } from '@/lib/trpc'

/**
 * Primeiro acesso ao Portal do Cliente.
 *
 * Quem chega aqui não tem senha — foi cadastrado pelo escritório e recebeu o
 * link por e-mail. A rota é pública porque não pode haver sessão ainda: o token
 * do link É a autenticação.
 *
 * A tela mostra o e-mail e o cliente antes do formulário, de propósito: a
 * pessoa precisa poder conferir para qual conta está definindo a senha,
 * sobretudo quem atende mais de uma empresa.
 */

const schema = z.object({
  senha: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres'),
  confirmacao: z.string().min(8, 'Repita a senha'),
}).refine(d => d.senha === d.confirmacao, {
  message: 'As senhas não conferem',
  path: ['confirmacao'],
})

type FormData = z.infer<typeof schema>

interface ConviteValido {
  nome: string
  email: string
  cliente: string
  primeiroAcesso: boolean
}

export default function ConvitePortalPage() {
  const params = useParams<{ token: string }>()
  const token = params.token

  const [convite, setConvite] = useState<ConviteValido | null>(null)
  const [validando, setValidando] = useState(true)
  const [invalido, setInvalido] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  const senha = watch('senha') ?? ''

  useEffect(() => {
    if (!token) { setInvalido('Link incompleto.'); setValidando(false); return }
    ;(trpc.portal as any).convite.validar.query({ token })
      .then((c: ConviteValido) => setConvite(c))
      .catch((e: Error) => setInvalido(e.message))
      .finally(() => setValidando(false))
  }, [token])

  async function onSubmit(data: FormData) {
    setSalvando(true)
    setErro(null)
    try {
      await (trpc.portal as any).convite.definirSenha.mutate({ token, senha: data.senha })
      setPronto(true)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  if (validando) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Verificando o convite…
      </div>
    )
  }

  if (invalido) {
    return (
      <div className="py-10 text-center">
        <ShieldX className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <h1 className="text-lg font-semibold">Convite indisponível</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{invalido}</p>
        <p className="mx-auto mt-4 max-w-sm text-xs text-muted-foreground">
          Links de convite valem por sete dias e só podem ser usados uma vez. Se o seu já
          foi usado ou expirou, peça um novo ao seu escritório contábil.
        </p>
        <Link href="/login" className="mt-5 inline-block text-sm text-primary hover:underline">
          Ir para o login
        </Link>
      </div>
    )
  }

  if (pronto) {
    return (
      <div className="py-10 text-center">
        <CheckCircle className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
        <h1 className="text-lg font-semibold">Senha definida</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Agora é só entrar com <strong>{convite?.email}</strong> e a senha que você acabou de criar.
        </p>
        <Link href="/login" className="mt-5 inline-block">
          <Button>Entrar</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="py-6">
      <h1 className="text-lg font-semibold">
        {convite?.primeiroAcesso ? 'Bem-vindo ao portal' : 'Definir nova senha'}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {convite?.primeiroAcesso
          ? 'Crie sua senha para acessar os dados da sua empresa.'
          : 'Crie a nova senha do seu acesso.'}
      </p>

      {/* Para qual conta. Quem atende mais de uma empresa precisa conferir. */}
      <div className="mt-4 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
        <p className="font-medium">{convite?.nome}</p>
        <p className="text-xs text-muted-foreground">{convite?.email}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Acesso a <strong className="text-foreground">{convite?.cliente}</strong>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
        <div>
          <Label htmlFor="senha" className="text-[13px] font-semibold">Nova senha</Label>
          <Input
            id="senha" type="password" autoComplete="new-password" autoFocus
            className="mt-1.5 h-9 text-sm" {...register('senha')}
          />
          {errors.senha && <p className="mt-1 text-xs text-destructive">{errors.senha.message}</p>}
          <PasswordStrength password={senha} />
        </div>

        <div>
          <Label htmlFor="confirmacao" className="text-[13px] font-semibold">Repita a senha</Label>
          <Input
            id="confirmacao" type="password" autoComplete="new-password"
            className="mt-1.5 h-9 text-sm" {...register('confirmacao')}
          />
          {errors.confirmacao && <p className="mt-1 text-xs text-destructive">{errors.confirmacao.message}</p>}
        </div>

        {erro && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {erro}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Definir senha e entrar'}
        </Button>
      </form>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        Se você não esperava este convite, feche esta página — sem a senha, nada é acessado.
      </p>
    </div>
  )
}
