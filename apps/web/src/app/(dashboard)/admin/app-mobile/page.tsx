'use client'

/**
 * App Mobile — Simulador (protótipo clicável).
 *
 * Pré-visualização navegável das telas do app Android/iOS dentro de uma moldura
 * de celular no navegador, para validar o fluxo ANTES de novas implementações.
 *
 * NÃO é o app Expo real: as telas são recriadas em HTML/CSS (mock fiel), com
 * dados de exemplo em PT-BR. Não depende de API, login nem build do Expo.
 *
 * Acesso restrito a master/isEmpresaMaster (mesmo gating do Design System).
 */

import { useState } from 'react'
import {
  Smartphone, Lock, Home, Calendar, CheckSquare, MessageCircle, User,
  Sun, Moon, LogIn,
} from 'lucide-react'
import { Card, CardContent, Badge, Button, cn } from '@saas/ui'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

import { APP_COLORS, type AppTheme } from './_components/app-theme'
import type { AppTela } from './_components/mock-data'
import { PhoneFrame } from './_components/phone-frame'
import {
  StatusBar, LoginScreen, DashboardScreen, AgendaScreen, TarefasScreen,
  HelpdeskScreen, PerfilScreen, AppDrawer,
} from './_components/app-screens'
import { ChangesPanel } from './_components/changes-panel'

// Cor do bloco interno/admin (violet) — chrome da página web.
const MODULE_COLOR = '#8b5cf6'

// Atalhos de tela exibidos nos controles do simulador (fora da moldura).
const TELAS: { tela: AppTela; label: string; Icon: typeof Home }[] = [
  { tela: 'login', label: 'Login', Icon: LogIn },
  { tela: 'dashboard', label: 'Dashboard', Icon: Home },
  { tela: 'agenda', label: 'Agenda', Icon: Calendar },
  { tela: 'tarefas', label: 'Tarefas', Icon: CheckSquare },
  { tela: 'helpdesk', label: 'Helpdesk', Icon: MessageCircle },
  { tela: 'perfil', label: 'Perfil', Icon: User },
]

export default function AppMobileSimuladorPage() {
  const { profile, loading } = useCurrentUserProfile()

  // Estado do simulador.
  const [telaAtiva, setTelaAtiva] = useState<AppTela>('login')
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [appTheme, setAppTheme] = useState<AppTheme>('light')
  // Permissão de Helpdesk (simulada) — controla o card/atalho no Dashboard.
  const [temHelpdesk, setTemHelpdesk] = useState(true)

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
  }

  const isMaster = profile?.isMaster || profile?.isEmpresaMaster
  if (!isMaster) {
    return (
      <Card className="max-w-md mx-auto mt-12">
        <CardContent className="p-8 text-center space-y-3">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground">Esta página é interna — só master.</p>
        </CardContent>
      </Card>
    )
  }

  const c = APP_COLORS[appTheme]

  // Navegação simulada.
  function irPara(tela: AppTela) {
    setTelaAtiva(tela)
    setDrawerAberto(false)
  }
  function abrirMenu() {
    setDrawerAberto(true)
  }
  function sair() {
    setDrawerAberto(false)
    setTelaAtiva('login')
  }

  // Renderiza a tela ativa dentro da moldura.
  function renderTela() {
    switch (telaAtiva) {
      case 'login':
        return <LoginScreen c={c} onEntrar={() => irPara('dashboard')} />
      case 'dashboard':
        return <DashboardScreen c={c} onMenu={abrirMenu} onIr={irPara} temHelpdesk={temHelpdesk} />
      case 'agenda':
        return <AgendaScreen c={c} onMenu={abrirMenu} />
      case 'tarefas':
        return <TarefasScreen c={c} onMenu={abrirMenu} />
      case 'helpdesk':
        return <HelpdeskScreen c={c} onMenu={abrirMenu} />
      case 'perfil':
        return <PerfilScreen c={c} onMenu={abrirMenu} onSair={sair} />
    }
  }

  // No Login não há header/menu — escondemos a barra de status só na ilha.
  const noLogin = telaAtiva === 'login'

  return (
    <div className="space-y-4">
      {/* ── Header da página (chrome web — tokens semânticos) ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-sm"
            style={{ background: MODULE_COLOR }}
          >
            <Smartphone className="h-6 w-6" />
          </div>
          <div>
            <h1>App Mobile — Simulador</h1>
            <p className="text-sm text-muted-foreground">
              Pré-visualização navegável das telas do app Android/iOS para validar o fluxo antes de novas implementações
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1.5 h-7">
          <Lock className="h-3 w-3" /> Protótipo · master only
        </Badge>
      </div>

      {/* Badges das telas disponíveis */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">Telas:</span>
        {TELAS.map(t => (
          <Badge key={t.tela} variant="secondary" className="gap-1 h-6 text-[11px]">
            <t.Icon className="h-3 w-3" /> {t.label}
          </Badge>
        ))}
      </div>

      {/* ── Corpo: controles + moldura ── */}
      <div className="grid lg:grid-cols-[260px_1fr] gap-4 items-start">
        {/* Controles do simulador */}
        <Card>
          <CardContent className="p-4 space-y-5">
            {/* Seletor de tela */}
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Ir para a tela</p>
              <div className="flex flex-col gap-1">
                {TELAS.map(t => {
                  const active = telaAtiva === t.tela
                  return (
                    <button
                      key={t.tela}
                      type="button"
                      onClick={() => irPara(t.tela)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium text-left transition-colors',
                        !active && 'text-foreground/70 hover:bg-muted/60 hover:text-foreground',
                      )}
                      style={active ? { backgroundColor: MODULE_COLOR, color: 'white' } : undefined}
                    >
                      <t.Icon className="h-3.5 w-3.5" />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Toggle de tema do app */}
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Tema do app</p>
              <div className="flex gap-2">
                <Button
                  variant={appTheme === 'light' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => setAppTheme('light')}
                >
                  <Sun className="h-3.5 w-3.5" /> Claro
                </Button>
                <Button
                  variant={appTheme === 'dark' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => setAppTheme('dark')}
                >
                  <Moon className="h-3.5 w-3.5" /> Escuro
                </Button>
              </div>
            </div>

            {/* Permissões simuladas */}
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Permissões (simulação)</p>
              <button
                type="button"
                onClick={() => setTemHelpdesk(v => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border text-[12px] font-medium hover:bg-muted/60 transition-colors"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <MessageCircle className="h-3.5 w-3.5" /> Helpdesk
                </span>
                <span
                  className={cn('w-9 h-5 rounded-full p-0.5 flex items-center transition-colors', temHelpdesk ? 'bg-violet-600' : 'bg-muted-foreground/30')}
                >
                  <span className={cn('h-4 w-4 rounded-full bg-white transition-transform', temHelpdesk && 'ml-auto')} />
                </span>
              </button>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Com a permissão, o Dashboard mostra o card e o atalho de Helpdesk; sem ela, ficam ocultos.
              </p>
            </div>

            {/* Ações rápidas */}
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Ações</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => setDrawerAberto(v => !v)}
                disabled={noLogin}
              >
                <Smartphone className="h-3.5 w-3.5" />
                {drawerAberto ? 'Fechar menu' : 'Abrir menu lateral'}
              </Button>
              <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={sair}>
                <LogIn className="h-3.5 w-3.5" /> Voltar ao login
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
              Protótipo clicável (mock fiel) — não é o app real. Dados de exemplo, sem API.
              Toque no <strong>☰</strong> dentro da moldura para abrir o menu.
            </p>
          </CardContent>
        </Card>

        {/* Moldura de celular centralizada sobre fundo neutro */}
        <div className="flex justify-center rounded-xl border border-border bg-muted/40 p-6 lg:p-10">
          <PhoneFrame c={c}>
            {/* Barra de status fake (some na tela de login pra dar respiro à marca) */}
            {!noLogin && <StatusBar c={c} theme={appTheme} />}
            {noLogin && <div className="h-8" />}

            {/* Tela ativa — `key` por tela re-dispara a animação a cada troca,
                simulando a transição suave de abas proposta para o app real. */}
            <div key={telaAtiva} className="flex-1 flex flex-col min-h-0" style={{ animation: 'fadeSlideIn 0.28s ease-out' }}>
              {renderTela()}
            </div>

            {/* Drawer sobreposto */}
            {drawerAberto && !noLogin && (
              <AppDrawer
                c={c}
                telaAtiva={telaAtiva}
                onSelecionar={irPara}
                onFechar={() => setDrawerAberto(false)}
                onSair={sair}
              />
            )}
          </PhoneFrame>
        </div>
      </div>

      {/* ── Painel de alterações propostas (colaboração) ── */}
      <ChangesPanel />
    </div>
  )
}
