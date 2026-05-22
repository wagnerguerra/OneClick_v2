'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, Input, Label, Checkbox } from '@saas/ui'
import { authClient } from '@/lib/auth-client'
import { Shield, Loader2, AlertCircle, KeyRound } from 'lucide-react'

function detectBrowserLabel(): string {
  if (typeof navigator === 'undefined') return 'Navegador desconhecido'
  const ua = navigator.userAgent
  let browser = 'Outro'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Chrome'
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  let os = 'Outro'
  if (/Windows/.test(ua)) os = 'Windows'
  else if (/Mac OS X/.test(ua)) os = 'Mac'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/iPhone|iPad/.test(ua)) os = 'iOS'
  else if (/Linux/.test(ua)) os = 'Linux'
  return `${browser} no ${os}`
}

export default function TwoFactorPage() {
  const [code, setCode] = useState('')
  const [useBackup, setUseBackup] = useState(false)
  const [trustDevice, setTrustDevice] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleVerify() {
    setError(null)
    setLoading(true)
    try {
      const res = useBackup
        ? await authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice })
        : await authClient.twoFactor.verifyTotp({ code: code.replace(/\D/g, ''), trustDevice })

      if ((res as any).error) {
        setError(useBackup ? 'Código de backup inválido.' : 'Código inválido. Tente novamente.')
        setLoading(false)
        return
      }

      // Marca o flag de "trust device pendente" no sessionStorage.
      // O dashboard, ao montar, le esse flag e dispara o registro em background.
      if (trustDevice && typeof window !== 'undefined') {
        sessionStorage.setItem('oc-trust-device-pending', JSON.stringify({
          label: detectBrowserLabel(),
          userAgent: navigator.userAgent.slice(0, 500),
        }))
      }

      // Pequeno delay para o browser processar Set-Cookie do verifyTotp
      await new Promise(resolve => setTimeout(resolve, 400))

      // Hard redirect via <form> submit — força nova navegacao top-level com cookies atualizados.
      // Mais confiavel que router.push (evita removeChild) e que window.location (que pode ter race condition).
      const form = document.createElement('form')
      form.method = 'GET'
      form.action = '/dashboard'
      document.body.appendChild(form)
      form.submit()
    } catch (e) {
      setError((e as Error).message || 'Falha ao verificar código.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div className="flex justify-center mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="OneClick" className="h-16 w-auto" />
      </div>

      <div className="text-center space-y-1">
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Shield className="h-6 w-6 text-emerald-600" />
          </div>
        </div>
        <h1 className="text-xl font-bold">Verificação em dois fatores</h1>
        <p className="text-sm text-muted-foreground">
          {useBackup
            ? 'Digite um dos seus códigos de backup'
            : 'Abra seu app autenticador e digite o código de 6 dígitos'}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-900/10 dark:border-rose-900/30 p-3">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {useBackup ? 'Código de backup' : 'Código de autenticação'}
          </Label>
          {useBackup ? (
            <Input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="h-10 font-mono text-sm tracking-wider"
              placeholder="xxxxxxxx"
              autoFocus
              autoComplete="one-time-code"
              onKeyDown={e => { if (e.key === 'Enter') handleVerify() }}
            />
          ) : (
            <Input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="h-12 text-center text-2xl font-mono tracking-[0.5em]"
              placeholder="000000"
              autoFocus
              autoComplete="one-time-code"
              onKeyDown={e => { if (e.key === 'Enter') handleVerify() }}
            />
          )}
        </div>

        {/* Confiar neste equipamento */}
        <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border/60 p-2.5 hover:bg-muted/30 transition-colors">
          <Checkbox checked={trustDevice} onCheckedChange={v => setTrustDevice(v === true)} className="mt-0.5" />
          <div className="text-xs">
            <span className="font-medium">Confiar neste equipamento por 30 dias</span>
            <p className="text-muted-foreground mt-0.5">
              Não pediremos o código de verificação nos próximos logins deste navegador. Você pode revogar a qualquer momento em Meu Perfil → Segurança.
            </p>
          </div>
        </label>

        <Button
          className="w-full h-10 gap-1.5"
          onClick={handleVerify}
          disabled={loading || (useBackup ? code.trim().length < 6 : code.length !== 6)}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
          Verificar e entrar
        </Button>

        <button
          type="button"
          className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-1"
          onClick={() => { setUseBackup(b => !b); setCode(''); setError(null) }}
        >
          <KeyRound className="h-3 w-3" />
          {useBackup
            ? 'Voltar e usar código do app autenticador'
            : 'Não tem o app? Usar um código de backup'}
        </button>
      </div>

      <div className="text-center">
        <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground">
          ← Cancelar e voltar ao login
        </Link>
      </div>
    </div>
  )
}
