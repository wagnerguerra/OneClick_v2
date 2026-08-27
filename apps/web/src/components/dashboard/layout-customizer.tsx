'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { SlidersHorizontal, X, RotateCcw, Sun, Moon, Monitor, Check } from 'lucide-react'
import { cn, Switch } from '@saas/ui'
import { useTheme } from '@/hooks/use-theme'
import { useLayoutPrefs, SKINS, PRESETS, notificarPrefs, type PresetKey } from '@/lib/layout-prefs'

/**
 * "Configurações de layout" — o customizer do modelo LuminAux, adaptado ao
 * que o OneClick tem: tema, skin de acento, predefinições, navegação (Acesso
 * rápido, abas, cabeçalho fixo), barra de título fixa e sidebar. Tudo aplica
 * na hora e fica guardado no navegador.
 */
export function LayoutCustomizer() {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const { prefs, set, aplicarPreset, reset } = useLayoutPrefs()
  const { theme, setTheme } = useTheme()
  const [sidebarReduzida, setSidebarReduzida] = useState(false)

  useEffect(() => {
    const ler = () => setSidebarReduzida(localStorage.getItem('sidebar-collapsed') === 'true')
    ler()
    window.addEventListener('oc-prefs', ler)
    return () => window.removeEventListener('oc-prefs', ler)
  }, [])

  function fechar() {
    setClosing(true)
    setTimeout(() => { setOpen(false); setClosing(false) }, 200)
  }
  function setSidebar(v: boolean) {
    localStorage.setItem('sidebar-collapsed', String(v))
    setSidebarReduzida(v)
    notificarPrefs('sidebar')
  }

  // Predefinição ativa = a que bate com as prefs atuais (só pra destacar o botão)
  const presetAtivo = (Object.keys(PRESETS) as PresetKey[]).find((k) => {
    const d = PRESETS[k]
    return d.sidebarReduzida === sidebarReduzida && Object.entries(d.prefs).every(([key, v]) => prefs[key as keyof typeof prefs] === v)
  })

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Configurações de layout"
        title="Configurações de layout"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
      >
        <SlidersHorizontal className="h-5 w-5" />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div className={cn('fixed inset-0 z-[90] bg-black/30 transition-opacity duration-200', closing ? 'opacity-0' : 'opacity-100')} onClick={fechar} aria-hidden />
          <div
            role="dialog"
            aria-label="Configurações de layout"
            className={cn(
              'fixed inset-y-0 right-0 z-[100] flex w-[26rem] max-w-[90vw] flex-col border-l border-border bg-card shadow-xl transition-transform duration-200 ease-[cubic-bezier(.16,1,.3,1)]',
              closing ? 'translate-x-full' : 'translate-x-0 animate-[drawerIn_.25s_cubic-bezier(.16,1,.3,1)]',
            )}
          >
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Configurações de layout</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">As alterações são aplicadas instantaneamente e permanecem em vigor.</p>
              </div>
              <button type="button" onClick={fechar} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto nice-scrollbar">
              {/* Aparência — tema */}
              <Secao titulo="Aparência">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {([
                    { v: 'light', label: 'Claro', Icon: Sun },
                    { v: 'dark', label: 'Escuro', Icon: Moon },
                    { v: 'system', label: 'Sistema', Icon: Monitor },
                  ] as const).map(({ v, label, Icon }) => (
                    <OpcaoCard key={v} ativo={theme === v} onClick={() => setTheme(v)}>
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-medium">{label}</span>
                    </OpcaoCard>
                  ))}
                </div>
              </Secao>

              {/* Design — skin de acento */}
              <Secao titulo="Design">
                <div className="grid grid-cols-2 gap-2">
                  {SKINS.map((s) => (
                    <OpcaoCard key={s.key} ativo={prefs.skin === s.key} onClick={() => set('skin', s.key)} alinhado="start">
                      <span className="flex items-center gap-2">
                        <span className="h-3.5 w-3.5 rounded-full ring-2 ring-white/70 dark:ring-black/40" style={{ backgroundColor: s.cor }} />
                        <span className="text-sm font-medium">{s.nome}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{s.descricao}</span>
                    </OpcaoCard>
                  ))}
                </div>
              </Secao>

              {/* Predefinição */}
              <Secao titulo="Predefinição">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => aplicarPreset(k)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                        presetAtivo === k ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-muted',
                      )}
                    >
                      {PRESETS[k].nome}
                    </button>
                  ))}
                </div>
              </Secao>

              {/* Navegação */}
              <Secao titulo="Navegação">
                <Toggle titulo="Acesso rápido" descricao="Menu com os módulos fixados, no cabeçalho" checked={prefs.acessoRapido} onChange={(v) => set('acessoRapido', v)} />
                <Toggle titulo="Abas de navegação" descricao="Cada tela aberta vira uma aba abaixo do cabeçalho (fechar, fixar, arrastar)" checked={prefs.abas} onChange={(v) => set('abas', v)} />
                <Toggle titulo="Cabeçalho fixo" descricao="O cabeçalho permanece fixo durante a rolagem" checked={prefs.headerFixo} onChange={(v) => set('headerFixo', v)} />
              </Secao>

              {/* Conteúdo */}
              <Secao titulo="Conteúdo">
                <Toggle titulo="Barra de título fixa" descricao="A barra de título da página fica presa abaixo do cabeçalho" checked={prefs.barraPaginaFixa} onChange={(v) => set('barraPaginaFixa', v)} />
              </Secao>

              {/* Barra lateral */}
              <Secao titulo="Barra lateral">
                <Toggle titulo="Barra lateral reduzida" descricao="Só os ícones dos módulos" checked={sidebarReduzida} onChange={setSidebar} />
                <Toggle titulo="Expandir ao passar o mouse" descricao="Quando reduzida, abre por cima do conteúdo ao passar o mouse" checked={prefs.sidebarHover} onChange={(v) => set('sidebarHover', v)} />
              </Secao>
            </div>

            <div className="border-t border-border p-4">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-input bg-card text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
              >
                <RotateCcw className="h-4 w-4" /> Redefinir para os padrões
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-b border-border px-5 py-4 last:border-b-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {children}
    </div>
  )
}

function OpcaoCard({ ativo, onClick, children, alinhado = 'center' }: { ativo: boolean; onClick: () => void; children: React.ReactNode; alinhado?: 'center' | 'start' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'relative flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors',
        alinhado === 'center' ? 'items-center' : 'items-start',
        ativo ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-muted',
      )}
    >
      {ativo && <Check className="absolute right-2 top-2 h-3.5 w-3.5" />}
      {children}
    </button>
  )
}

function Toggle({ titulo, descricao, checked, onChange }: { titulo: string; descricao: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{titulo}</span>
        <span className="block text-xs text-muted-foreground">{descricao}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}
