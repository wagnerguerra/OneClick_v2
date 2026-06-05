'use client'

/**
 * Configurações do OneClick Chat — acessível tanto pelo header do chat embed
 * (rota /chat-desktop/settings) quanto pelo tray menu do aplicativo Electron.
 *
 * Preferências armazenadas:
 *   - LocalStorage (preferências locais por device): tema, som, notificação desktop
 *   - DB via trpc.chat.setStatus (chatStatus): status manual padrão
 *
 * Quando rodando no Electron (window.chatDesktop existe), a seção "Sistema"
 * aparece com opções nativas (iniciar com Windows, verificar atualizações).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Bell, Volume2, Shield, Monitor, Loader2, Check,
} from 'lucide-react'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

type ChatStatus = 'online' | 'ausente' | 'dnd' | 'invisible' | null
type ThemeMode = 'auto' | 'dark' | 'light'

const STORAGE_KEYS = {
  notifSound: 'oc-chat:notif-sound',
  notifDesktop: 'oc-chat:notif-desktop',
  theme: 'oc-chat:theme',
} as const

function loadBoolPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const v = window.localStorage.getItem(key)
  if (v === null) return fallback
  return v === '1'
}

function saveBoolPref(key: string, value: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, value ? '1' : '0')
}

export default function ChatSettingsPage() {
  // Detecta Electron via window.chatDesktop (sem hydration mismatch)
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    setIsDesktop(
      typeof window !== 'undefined'
      && !!(window as unknown as { chatDesktop?: { isDesktop?: boolean } }).chatDesktop?.isDesktop,
    )
  }, [])

  // Preferências locais
  const [notifSound, setNotifSound] = useState(true)
  const [notifDesktop, setNotifDesktop] = useState(true)
  const [theme, setTheme] = useState<ThemeMode>('dark')

  // Status manual (vem do banco, vai via trpc.chat.setStatus)
  const [meuStatus, setMeuStatus] = useState<ChatStatus>(null)
  const [savingStatus, setSavingStatus] = useState(false)

  useEffect(() => {
    setNotifSound(loadBoolPref(STORAGE_KEYS.notifSound, true))
    setNotifDesktop(loadBoolPref(STORAGE_KEYS.notifDesktop, true))
    const t = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEYS.theme) : null
    if (t === 'auto' || t === 'dark' || t === 'light') setTheme(t)
  }, [])

  async function trocarStatus(s: ChatStatus) {
    setMeuStatus(s)
    setSavingStatus(true)
    try {
      await (trpc.chat as any).setStatus.mutate({ status: s })
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <div className="min-h-screen bg-card text-foreground">
      {/* Header slim com voltar */}
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border/40 px-4 py-3 flex items-center gap-3">
        <Link
          href="/chat-desktop"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Voltar pro chat"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-base font-semibold">Configurações</h1>
      </header>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-8">

        {/* Notificações */}
        <section>
          <SectionHeader icon={Bell} title="Notificações" subtitle="Como você é avisado sobre mensagens novas" />
          <div className="rounded-lg border border-border/60 overflow-hidden bg-card">
            <ToggleRow
              icon={Bell}
              label="Notificação no desktop"
              hint={isDesktop
                ? 'Mostra balão nativo do Windows quando chega mensagem'
                : 'Mostra notificação do navegador quando chega mensagem (permissão precisa estar autorizada)'}
              checked={notifDesktop}
              onChange={(v) => { setNotifDesktop(v); saveBoolPref(STORAGE_KEYS.notifDesktop, v) }}
            />
            <ToggleRow
              icon={Volume2}
              label="Som"
              hint="Toca um som curto ao receber mensagem"
              checked={notifSound}
              onChange={(v) => { setNotifSound(v); saveBoolPref(STORAGE_KEYS.notifSound, v) }}
            />
          </div>
        </section>

        {/* Privacidade */}
        <section>
          <SectionHeader icon={Shield} title="Privacidade" subtitle="Como você aparece pros outros usuários" />
          <div className="rounded-lg border border-border/60 overflow-hidden bg-card">
            <StatusRow
              label="Online"
              hint="Aparece como ativo. Outras pessoas veem o ponto verde."
              active={meuStatus === 'online' || meuStatus === null}
              onClick={() => trocarStatus('online')}
              disabled={savingStatus}
              dotColor="bg-emerald-500"
            />
            <StatusRow
              label="Ausente"
              hint="Aparece como ausente. Útil quando você não pode responder rápido."
              active={meuStatus === 'ausente'}
              onClick={() => trocarStatus('ausente')}
              disabled={savingStatus}
              dotColor="bg-amber-500"
            />
            <StatusRow
              label="Não perturbar"
              hint="Silencia as notificações desktop. As pessoas veem ponto vermelho."
              active={meuStatus === 'dnd'}
              onClick={() => trocarStatus('dnd')}
              disabled={savingStatus}
              dotColor="bg-rose-500"
            />
            <StatusRow
              label="Invisível"
              hint="Você aparece como offline pros outros, mas continua recebendo mensagens normalmente."
              active={meuStatus === 'invisible'}
              onClick={() => trocarStatus('invisible')}
              disabled={savingStatus}
              dotColor="bg-muted-foreground/40"
            />
          </div>
        </section>

        {/* Aparência — placeholder pra próxima rodada */}
        <section>
          <SectionHeader icon={Monitor} title="Aparência" subtitle="Tema da interface" />
          <div className="rounded-lg border border-border/60 overflow-hidden bg-card">
            <ThemeRow value={theme} onChange={(v) => { setTheme(v); window.localStorage.setItem(STORAGE_KEYS.theme, v) }} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 px-1">
            O app desktop hoje usa tema escuro fixo. A configuração será aplicada na próxima atualização.
          </p>
        </section>

        {/* Sistema — só no Electron */}
        {isDesktop && (
          <section>
            <SectionHeader icon={Monitor} title="Sistema" subtitle="Opções do aplicativo desktop" />
            <div className="rounded-lg border border-border/60 overflow-hidden bg-card">
              <div className="px-4 py-3 text-[12px] text-muted-foreground">
                Use o menu do <strong>system tray</strong> (clique direito no ícone próximo ao relógio) pra:
                <ul className="list-disc list-inside mt-1.5 space-y-0.5">
                  <li>Iniciar com o Windows</li>
                  <li>Verificar atualizações</li>
                  <li>Sair completamente</li>
                </ul>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-[12px] text-muted-foreground leading-snug">{subtitle}</p>
      </div>
    </div>
  )
}

function ToggleRow({ icon: Icon, label, hint, checked, onChange }: {
  icon: React.ComponentType<{ className?: string }>
  label: string; hint: string; checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors border-b border-border/40 last:border-b-0">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
      </div>
      <input
        type="checkbox"
        className="h-4 w-4 accent-sky-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

function StatusRow({ label, hint, active, onClick, disabled, dotColor }: {
  label: string; hint: string; active: boolean; onClick: () => void; disabled: boolean; dotColor: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors border-b border-border/40 last:border-b-0 disabled:opacity-60',
        active && 'bg-sky-500/[0.06]',
      )}
    >
      <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', dotColor)} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
      </div>
      {active && <Check className="h-4 w-4 text-sky-500 shrink-0" />}
      {disabled && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </button>
  )
}

function ThemeRow({ value, onChange }: { value: ThemeMode; onChange: (v: ThemeMode) => void }) {
  const opts: { v: ThemeMode; label: string }[] = [
    { v: 'auto', label: 'Acompanhar sistema' },
    { v: 'dark', label: 'Escuro' },
    { v: 'light', label: 'Claro' },
  ]
  return (
    <>
      {opts.map(o => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            'w-full flex items-center px-4 py-3 text-left text-[13px] hover:bg-muted/30 transition-colors border-b border-border/40 last:border-b-0',
            value === o.v && 'bg-sky-500/[0.06]',
          )}
        >
          <span className="flex-1">{o.label}</span>
          {value === o.v && <Check className="h-4 w-4 text-sky-500 shrink-0" />}
        </button>
      ))}
    </>
  )
}
