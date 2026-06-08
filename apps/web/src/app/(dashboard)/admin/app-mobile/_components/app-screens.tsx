'use client'

// Telas recriadas do app mobile OneClick (protótipo clicável).
//
// IMPORTANTE: este é um MOCK FIEL renderizado em HTML/CSS dentro da moldura de
// celular do simulador — NÃO é o app Expo real. As cores literais (sky/azure)
// são a IDENTIDADE da marca do app mobile, resolvidas via APP_COLORS conforme
// o tema claro/escuro do simulador (o chrome da página web usa tokens próprios).
//
// Cada screen recebe `c` (paleta do app) e callbacks de navegação simulada.

import {
  Menu, Calendar, CheckSquare, MessageCircle, User, Home, LogOut,
  ChevronRight, Plus, Bell, Globe, Contrast, Settings,
} from 'lucide-react'

import type { AppColors } from './app-theme'
import { iniciais, type AppTheme } from './app-theme'
import {
  MOCK_USER, MOCK_EMPRESA, MOCK_EVENTOS, MOCK_TAREFAS, MOCK_TICKETS,
  STATUS_LABEL, STATUS_CLASSES, type AppTela,
} from './mock-data'

// ── Barra de navegação inferior (bottom tab bar) ────────────────────
// Marca registrada da nova identidade: 4 destinos fixos no rodapé da moldura.
// Aparece em TODAS as telas autenticadas (não no Login). Ícone ativo em azul
// primário com leve realce; inativos em muted. É a navegação principal — o
// Drawer (☰) continua disponível como acesso secundário.
export function BottomTabBar({
  c, telaAtiva, onIr,
}: {
  c: AppColors
  telaAtiva: AppTela
  onIr: (t: AppTela) => void
}) {
  const tabs: { tela: AppTela; label: string; Icon: typeof Home }[] = [
    { tela: 'dashboard', label: 'Início', Icon: Home },
    { tela: 'agenda', label: 'Agenda', Icon: Calendar },
    { tela: 'helpdesk', label: 'Helpdesk', Icon: MessageCircle },
    { tela: 'perfil', label: 'Perfil', Icon: Settings },
  ]
  return (
    <div
      className="shrink-0 flex items-stretch px-2 pt-1.5 pb-5 border-t"
      style={{ background: c.card, borderColor: c.border }}
    >
      {tabs.map(t => {
        // "Tarefas" não é um destino da tab bar, mas mantém "Início" como
        // contexto visual ao navegar por ele a partir dos atalhos.
        const ativo = t.tela === telaAtiva
        return (
          <button
            key={t.tela}
            type="button"
            onClick={() => onIr(t.tela)}
            className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl active:opacity-70 transition-colors"
            aria-label={t.label}
            aria-current={ativo ? 'page' : undefined}
          >
            <span
              className="h-9 w-12 flex items-center justify-center rounded-full transition-colors"
              style={{ background: ativo ? c.primarySoft : 'transparent' }}
            >
              <t.Icon
                className="h-5 w-5"
                style={{ color: ativo ? c.primary : c.mutedForeground }}
                strokeWidth={ativo ? 2.4 : 2}
              />
            </span>
            <span
              className="text-[10px] font-semibold leading-none"
              style={{ color: ativo ? c.primary : c.mutedForeground }}
            >
              {t.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Anel de progresso circular (SVG) ────────────────────────────────
// Usado no card hero do Dashboard. Traço em duas voltas: trilho translúcido +
// progresso. Cores vêm do tema (coral/amarelo).
function ProgressRing({
  size, stroke, progress, trackColor, barColor, children,
}: {
  size: number
  stroke: number
  progress: number // 0..1
  trackColor: string
  barColor: string
  children?: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.max(0, Math.min(1, progress)))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={barColor}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

// ── Barra de progresso horizontal (track + preenchimento colorido) ──
function ProgressBar({
  c, label, valor, total, cor,
}: {
  c: AppColors
  label: string
  valor: number
  total: number
  cor: string
}) {
  const pct = total > 0 ? Math.max(0, Math.min(1, valor / total)) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: c.mutedForeground }}>{label}</span>
        <span className="font-semibold tabular-nums" style={{ color: c.foreground }}>{valor}/{total}</span>
      </div>
      <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: c.muted }}>
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: cor }} />
      </div>
    </div>
  )
}

// ── Barra de status fake (topo da moldura) ──────────────────────────
export function StatusBar({ c, theme }: { c: AppColors; theme: AppTheme }) {
  return (
    <div
      className="flex items-center justify-between px-6 pt-2 pb-1 text-[11px] font-semibold select-none"
      style={{ color: c.foreground }}
    >
      <span className="tabular-nums">09:41</span>
      <div className="flex items-center gap-1.5">
        {/* Sinal */}
        <span className="inline-flex items-end gap-[2px]" aria-hidden>
          <span className="inline-block w-[3px] h-[4px] rounded-sm" style={{ background: c.foreground }} />
          <span className="inline-block w-[3px] h-[6px] rounded-sm" style={{ background: c.foreground }} />
          <span className="inline-block w-[3px] h-[8px] rounded-sm" style={{ background: c.foreground }} />
          <span className="inline-block w-[3px] h-[10px] rounded-sm" style={{ background: theme === 'dark' ? c.mutedForeground : c.foreground }} />
        </span>
        <span className="text-[10px]">5G</span>
        {/* Bateria */}
        <span className="inline-flex items-center" aria-hidden>
          <span className="inline-block w-[18px] h-[9px] rounded-[3px] border" style={{ borderColor: c.foreground }}>
            <span className="block h-full w-[70%] rounded-[1px] m-[1px]" style={{ background: c.foreground }} />
          </span>
        </span>
      </div>
    </div>
  )
}

// ── Header do app (barra superior com hambúrguer) ───────────────────
function AppHeader({
  c, titulo, sobretitulo, onMenu, trailing,
}: {
  c: AppColors
  titulo: string
  sobretitulo: string
  onMenu: () => void
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-3">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Abrir menu"
        className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg active:opacity-70"
        style={{ background: c.muted }}
      >
        <Menu className="h-5 w-5" style={{ color: c.foreground }} />
      </button>
      <div className="flex-1 min-w-0 pl-0.5">
        <p className="text-[10px] uppercase tracking-wide truncate" style={{ color: c.mutedForeground }}>{sobretitulo}</p>
        <p className="text-lg font-bold truncate" style={{ color: c.foreground }}>{titulo}</p>
      </div>
      {trailing}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════════════════
export function LoginScreen({ c, onEntrar }: { c: AppColors; onEntrar: () => void }) {
  return (
    <div className="relative flex-1 flex flex-col" style={{ background: c.background }}>
      {/* Hero do topo: imagem de fundo + logo do sistema centralizada */}
      <div className="relative h-52 shrink-0 rounded-b-[36px] overflow-hidden flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/auth-bg.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
        {/* Overlay sutil — dá profundidade e destaca a logo sobre a imagem */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.12), rgba(15,23,42,0.28))' }} aria-hidden />
        {/* Logo centralizada num cartão branco (lê bem sobre qualquer fundo) */}
        <div className="relative rounded-2xl bg-white px-5 py-3.5 shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_topo.png" alt="OneClick" className="h-9 w-auto object-contain" />
        </div>
      </div>

      {/* Conteúdo: subtítulo + card de autenticação */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-[300px] flex flex-col gap-5">
          <p className="text-center text-sm" style={{ color: c.mutedForeground }}>Entre na sua conta</p>

          <div className="rounded-2xl border p-5 flex flex-col gap-4" style={{ background: c.card, borderColor: c.border }}>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold" style={{ color: c.foreground }}>E-mail</span>
              <div className="h-9 px-3 flex items-center rounded-md border text-sm" style={{ borderColor: c.border, color: c.foreground, background: c.background }}>
                {MOCK_USER.email}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold" style={{ color: c.foreground }}>Senha</span>
              <div className="h-9 px-3 flex items-center rounded-md border text-sm tracking-widest" style={{ borderColor: c.border, color: c.mutedForeground, background: c.background }}>
                ••••••••
              </div>
            </div>
            <button
              type="button"
              onClick={onEntrar}
              className="mt-1 h-10 rounded-md text-sm font-semibold active:opacity-80 transition-opacity"
              style={{ background: c.primary, color: c.primaryForeground }}
            >
              Entrar
            </button>
            <p className="text-center text-xs" style={{ color: c.mutedForeground }}>Esqueci minha senha</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════
// ── Cor do evento (hex) → rgba com alpha (tinta de fundo do bloco) ──
function tintHex(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ── Agenda do dia (grade de horários no Dashboard) ──────────────────
// Faixas de 30 min; cada evento vira um bloco colorido pela COR DO EVENTO
// (cor do tipo, como no sistema). Um slot vazio exibe o atalho "Digite para
// adicionar um evento". A hora atual fica destacada na cor primária.
function DayAgenda({ c, isDark, onVerTudo }: { c: AppColors; isDark: boolean; onVerTudo: () => void }) {
  const slots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30']
  const horaAtual = '09:30'    // slot "agora"
  const slotAdicionar = '10:00' // slot vazio com o atalho de adicionar
  return (
    <div className="flex flex-col">
      {slots.map((s, i) => {
        const ev = MOCK_EVENTOS.find(e => e.inicio === s)
        const agora = s === horaAtual
        const adicionar = !ev && s === slotAdicionar
        return (
          <div key={s} className="flex items-stretch gap-3" style={{ borderTop: i > 0 ? `1px solid ${c.border}` : undefined }}>
            <span
              className="w-11 shrink-0 pt-2.5 text-[12px] tabular-nums"
              style={{ color: agora ? c.primary : c.mutedForeground, fontWeight: agora ? 700 : 400 }}
            >
              {s}
            </span>
            <div className="flex-1 py-1.5 min-h-[42px]">
              {ev ? (
                <button
                  type="button"
                  onClick={onVerTudo}
                  className="w-full text-left rounded-xl flex items-stretch gap-2.5 pl-2.5 active:opacity-80"
                  style={{ background: tintHex(ev.cor, isDark ? 0.20 : 0.12) }}
                >
                  {/* Barra lateral arredondada e embutida, na cor do evento */}
                  <span className="w-[3px] my-2 rounded-full shrink-0" style={{ background: ev.cor }} />
                  <p className="flex-1 py-2.5 pr-3 text-[13px] font-semibold leading-snug" style={{ color: ev.cor }}>{ev.titulo}</p>
                </button>
              ) : adicionar ? (
                <div className="w-full rounded-xl flex items-stretch gap-2.5 pl-2.5" style={{ background: c.muted }}>
                  <span className="w-[3px] my-2 rounded-full shrink-0" style={{ background: c.mutedForeground }} />
                  <p className="flex-1 py-2.5 pr-3 text-[13px] leading-snug" style={{ color: c.mutedForeground }}>Digite para adicionar um evento</p>
                </div>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function DashboardScreen({ c, onMenu, onIr, temHelpdesk = true, theme = 'light' }: { c: AppColors; onMenu: () => void; onIr: (t: AppTela) => void; temHelpdesk?: boolean; theme?: AppTheme }) {
  // KPIs em UMA linha (cards compactos). O card de Helpdesk só aparece quando o
  // usuário tem permissão no módulo (simulada aqui pelo toggle `temHelpdesk`).
  const kpis = [
    { label: 'Eventos hoje', valor: MOCK_EVENTOS.length, Icon: Calendar },
    { label: 'Tarefas abertas', valor: MOCK_TAREFAS.filter(t => !t.concluida).length, Icon: CheckSquare },
    ...(temHelpdesk
      ? [{ label: 'Chamados abertos', valor: MOCK_TICKETS.filter(t => t.status !== 'CONCLUIDO').length, Icon: MessageCircle }]
      : []),
  ]
  const primeiroNome = MOCK_USER.nome.split(/\s+/)[0]

  // Progresso do "plano de hoje" — derivado das tarefas mock.
  const totalTarefas = MOCK_TAREFAS.length
  const feitas = MOCK_TAREFAS.filter(t => t.concluida).length
  const progresso = totalTarefas > 0 ? feitas / totalTarefas : 0

  return (
    <div className="flex-1 flex flex-col" style={{ background: c.background }}>
      {/* Logo OneClick no topo (clara/escura conforme o tema do app). */}
      <div className="flex items-center justify-center px-4 pt-3 pb-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={theme === 'dark' ? '/logo-light.png' : '/logo.png'}
          alt="OneClick"
          className="h-14 w-auto object-contain"
        />
      </div>
      <div className="flex items-center px-4 pt-2 pb-1 gap-2">
        <button
          type="button" onClick={onMenu} aria-label="Abrir menu"
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl active:opacity-70"
          style={{ background: c.muted }}
        >
          <Menu className="h-5 w-5" style={{ color: c.foreground }} />
        </button>
        <div className="flex-1 pl-1">
          {/* Saudação destacada em azul (estilo "Good Day, Carla!"). */}
          <p className="text-2xl font-bold leading-tight" style={{ color: c.primary }}>Bom dia, {primeiroNome}!</p>
          <p className="text-[13px]" style={{ color: c.mutedForeground }}>Vamos começar o seu dia</p>
        </div>
        <div className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>
          {iniciais(MOCK_USER.nome)}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 flex flex-col gap-5">
        {/* Card HERO coral com anel de progresso circular */}
        <div
          className="rounded-3xl p-5 flex items-center gap-4 shadow-sm"
          style={{ background: c.accent, color: c.accentForeground }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wide font-semibold opacity-80">Plano de hoje</p>
            <p className="text-lg font-bold leading-tight mt-0.5">{feitas} de {totalTarefas} concluídas</p>
            <p className="text-[12px] opacity-85 mt-1">Continue assim, falta pouco!</p>
          </div>
          <ProgressRing
            size={72} stroke={8} progress={progresso}
            trackColor="rgba(255,255,255,0.25)" barColor={c.warning}
          >
            <span className="text-base font-bold" style={{ color: c.accentForeground }}>{Math.round(progresso * 100)}%</span>
          </ProgressRing>
        </div>

        {/* KPIs — uma linha (cards compactos) */}
        <div className="flex gap-2">
          {kpis.map(k => (
            <div key={k.label} className="flex-1 min-w-0 rounded-2xl border p-3 flex flex-col gap-2" style={{ background: c.elevated, borderColor: c.border }}>
              <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: c.primarySoft }}>
                <k.Icon className="h-4 w-4" style={{ color: c.primary }} />
              </div>
              <div>
                <p className="text-xl font-bold leading-none tabular-nums" style={{ color: c.foreground }}>{k.valor}</p>
                <p className="text-[11px] mt-1 leading-tight" style={{ color: c.mutedForeground }}>{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Agenda do dia (substitui Atalhos) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold" style={{ color: c.foreground }}>Agenda de hoje</p>
            <button type="button" onClick={() => onIr('agenda')} className="text-[12px] font-semibold active:opacity-70" style={{ color: c.primary }}>Ver tudo</button>
          </div>
          <DayAgenda c={c} isDark={theme === 'dark'} onVerTudo={() => onIr('agenda')} />
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// AGENDA
// ════════════════════════════════════════════════════════════════════
export function AgendaScreen({ c, onMenu }: { c: AppColors; onMenu: () => void }) {
  // Faixa de 7 dias da semana (mock). "Hoje" e o dia selecionado em destaque.
  const dias = [
    { nome: 'dom', n: 7, hoje: false },
    { nome: 'seg', n: 8, hoje: true },
    { nome: 'ter', n: 9, hoje: false },
    { nome: 'qua', n: 10, hoje: false },
    { nome: 'qui', n: 11, hoje: false },
    { nome: 'sex', n: 12, hoje: false },
    { nome: 'sáb', n: 13, hoje: false },
  ]
  const selecionado = 8

  return (
    <div className="relative flex-1 flex flex-col" style={{ background: c.background }}>
      <AppHeader
        c={c} sobretitulo="Agenda" titulo="8 de junho" onMenu={onMenu}
        trailing={
          <div className="flex items-center gap-1.5">
            {['‹', '›'].map((s, i) => (
              <span key={i} className="h-8 w-8 flex items-center justify-center rounded-md border text-base" style={{ borderColor: c.border, color: c.foreground, background: c.card }}>{s}</span>
            ))}
          </div>
        }
      />

      {/* Faixa horizontal de dias */}
      <div className="border-b pb-3 px-3" style={{ borderColor: c.border }}>
        <div className="flex gap-2 overflow-x-auto">
          {dias.map(d => {
            const sel = d.n === selecionado
            return (
              <div
                key={d.n}
                className="h-16 w-12 shrink-0 flex flex-col items-center justify-center rounded-xl border"
                style={{
                  background: sel ? c.primary : c.card,
                  borderColor: sel ? c.primary : c.border,
                }}
              >
                <span className="text-[11px] font-medium" style={{ color: sel ? c.primaryForeground : c.mutedForeground }}>{d.nome}</span>
                <span className="text-base font-bold" style={{ color: sel ? c.primaryForeground : c.foreground }}>{d.n}</span>
                <span className="mt-0.5 h-1 w-1 rounded-full" style={{ background: d.hoje && !sel ? c.primary : 'transparent' }} />
              </div>
            )
          })}
        </div>
      </div>

      {/* Lista de eventos */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {MOCK_EVENTOS.map(ev => (
          <div
            key={ev.id}
            className="rounded-xl border p-4"
            style={{ background: c.card, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: ev.cor }}
          >
            <p className="text-sm font-semibold" style={{ color: c.foreground }}>{ev.titulo}</p>
            <p className="text-sm mt-0.5" style={{ color: c.mutedForeground }}>{ev.horario}</p>
            {ev.local && <p className="text-sm" style={{ color: c.mutedForeground }}>{ev.local}</p>}
          </div>
        ))}
      </div>

      {/* FAB */}
      <button
        type="button" aria-label="Novo evento"
        className="absolute bottom-5 right-5 h-14 w-14 rounded-full flex items-center justify-center shadow-lg active:opacity-80"
        style={{ background: c.primary }}
      >
        <Plus className="h-6 w-6" style={{ color: c.primaryForeground }} />
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// TAREFAS
// ════════════════════════════════════════════════════════════════════
export function TarefasScreen({ c, onMenu }: { c: AppColors; onMenu: () => void }) {
  return (
    <div className="flex-1 flex flex-col" style={{ background: c.background }}>
      <AppHeader c={c} sobretitulo="Tarefas" titulo="Minhas tarefas" onMenu={onMenu} />

      {/* Criação rápida (estática no protótipo) */}
      <div className="px-4 pb-3 flex flex-col gap-2">
        <div className="h-9 px-3 flex items-center rounded-md border text-sm" style={{ borderColor: c.border, color: c.mutedForeground, background: c.card }}>
          Nova tarefa...
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 h-9 px-3 flex items-center rounded-md border text-sm" style={{ borderColor: c.border, color: c.foreground, background: c.card }}>
            2026-06-08
          </div>
          <span className="h-9 px-4 flex items-center rounded-md text-sm font-semibold" style={{ background: c.primary, color: c.primaryForeground }}>Adicionar</span>
        </div>
      </div>

      {/* Toggle Abertas / Concluídas */}
      <div className="flex gap-2 px-4 pb-3">
        <span className="flex-1 h-9 flex items-center justify-center rounded-md text-sm font-semibold" style={{ background: c.primary, color: c.primaryForeground }}>Abertas</span>
        <span className="flex-1 h-9 flex items-center justify-center rounded-md border text-sm font-medium" style={{ borderColor: c.border, color: c.mutedForeground }}>Concluídas</span>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {MOCK_TAREFAS.map(t => (
          <div key={t.id} className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: c.card, borderColor: c.border }}>
            <div className="flex items-start gap-3">
              <div
                className="mt-0.5 h-6 w-6 shrink-0 flex items-center justify-center rounded-full border-2 text-[11px] font-bold"
                style={{
                  borderColor: t.concluida ? c.primary : c.border,
                  background: t.concluida ? c.primary : 'transparent',
                  color: c.primaryForeground,
                }}
              >
                {t.concluida ? '✓' : ''}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold"
                  style={{ color: t.concluida ? c.mutedForeground : c.foreground, textDecoration: t.concluida ? 'line-through' : 'none' }}
                >
                  {t.titulo}
                </p>
                <p className="text-sm mt-0.5" style={{ color: c.mutedForeground }}>{t.prazo}</p>
              </div>
              {/* Selo de prioridade */}
              {t.prioridade === 'ALTA' ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: c.accentSoft, color: c.accent }}>Alta</span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium border" style={{ borderColor: c.border, color: c.mutedForeground }}>
                  {t.prioridade === 'NORMAL' ? 'Normal' : 'Baixa'}
                </span>
              )}
            </div>
            {/* Botão de ação "Concluído" / "Concluir" em azul (estilo referência) */}
            <button
              type="button"
              className="h-8 rounded-lg text-[12px] font-semibold active:opacity-80"
              style={
                t.concluida
                  ? { background: c.primarySoft, color: c.primary }
                  : { background: c.primary, color: c.primaryForeground }
              }
            >
              {t.concluida ? 'Concluído' : 'Marcar como concluída'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// HELPDESK
// ════════════════════════════════════════════════════════════════════
export function HelpdeskScreen({ c, onMenu }: { c: AppColors; onMenu: () => void }) {
  const scopes = ['Meus', 'Área', 'Todos']
  const chips = ['Todos', 'Aberto', 'Em andamento', 'Aguardando', 'Concluído']

  return (
    <div className="relative flex-1 flex flex-col" style={{ background: c.background }}>
      <AppHeader
        c={c} sobretitulo="Suporte" titulo="Helpdesk" onMenu={onMenu}
        trailing={<span className="text-xs" style={{ color: c.mutedForeground }}>{MOCK_TICKETS.length} chamados</span>}
      />

      {/* Seu progresso — barras coral (chamados resolvidos x abertos) */}
      <div className="px-4 pb-3">
        <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: c.card, borderColor: c.border }}>
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold" style={{ color: c.foreground }}>Seu progresso</p>
            <span className="text-[11px] font-semibold" style={{ color: c.accent }}>
              {Math.round((MOCK_TICKETS.filter(t => t.status === 'CONCLUIDO').length / MOCK_TICKETS.length) * 100)}%
            </span>
          </div>
          <ProgressBar
            c={c} label="Resolvidos"
            valor={MOCK_TICKETS.filter(t => t.status === 'CONCLUIDO').length}
            total={MOCK_TICKETS.length} cor={c.accent}
          />
          <ProgressBar
            c={c} label="Em atendimento"
            valor={MOCK_TICKETS.filter(t => t.status === 'EM_ANDAMENTO' || t.status === 'AGUARDANDO').length}
            total={MOCK_TICKETS.length} cor={c.warning}
          />
        </div>
      </div>

      {/* Escopo */}
      <div className="px-4 pb-3 flex gap-2">
        {scopes.map((s, i) => (
          <span
            key={s}
            className="h-9 px-3 flex items-center justify-center rounded-full border text-sm font-medium"
            style={{
              background: i === 0 ? c.primary : c.card,
              borderColor: i === 0 ? c.primary : c.border,
              color: i === 0 ? c.primaryForeground : c.mutedForeground,
            }}
          >
            {s}
          </span>
        ))}
      </div>

      {/* Filtro de status (chips horizontais) */}
      <div className="border-b pb-3 px-3" style={{ borderColor: c.border }}>
        <div className="flex gap-2 overflow-x-auto">
          {chips.map((ch, i) => (
            <span
              key={ch}
              className="h-9 px-3 shrink-0 flex items-center justify-center rounded-full border text-sm font-medium"
              style={{
                background: i === 0 ? c.primary : c.card,
                borderColor: i === 0 ? c.primary : c.border,
                color: i === 0 ? c.primaryForeground : c.mutedForeground,
              }}
            >
              {ch}
            </span>
          ))}
        </div>
      </div>

      {/* Lista de tickets */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {MOCK_TICKETS.map(t => {
          const sc = STATUS_CLASSES[t.status]
          return (
            <div key={t.id} className="rounded-xl border p-4 flex flex-col gap-2" style={{ background: c.card, borderColor: c.border }}>
              <div>
                <p className="text-xs" style={{ color: c.mutedForeground }}>#HLP{String(t.numero).padStart(4, '0')}</p>
                <p className="text-sm font-semibold" style={{ color: c.foreground }}>{t.titulo}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sc.bg} ${sc.text}`}>{STATUS_LABEL[t.status]}</span>
                <span className="text-[11px] font-semibold" style={{ color: t.prioridadeCor }}>{t.prioridade}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: c.mutedForeground }}>{t.categoria}</span>
                <span className="text-xs" style={{ color: c.mutedForeground }}>{t.data}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* FAB */}
      <button
        type="button" aria-label="Novo chamado"
        className="absolute bottom-5 right-5 h-14 w-14 rounded-full flex items-center justify-center shadow-lg active:opacity-80"
        style={{ background: c.primary }}
      >
        <Plus className="h-6 w-6" style={{ color: c.primaryForeground }} />
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// PERFIL
// ════════════════════════════════════════════════════════════════════
export function PerfilScreen({ c, onMenu, onSair }: { c: AppColors; onMenu: () => void; onSair: () => void }) {
  return (
    <div className="flex-1 flex flex-col" style={{ background: c.background }}>
      <div className="flex items-center gap-3 px-4 pt-3 pb-1">
        <button
          type="button" onClick={onMenu} aria-label="Abrir menu"
          className="h-9 w-9 flex items-center justify-center rounded-lg active:opacity-70"
          style={{ background: c.muted }}
        >
          <Menu className="h-5 w-5" style={{ color: c.foreground }} />
        </button>
        <p className="text-xl font-bold" style={{ color: c.foreground }}>Perfil</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Card de identidade */}
        <div className="rounded-2xl border p-4 flex flex-col items-center gap-3" style={{ background: c.card, borderColor: c.border }}>
          <div className="h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold" style={{ background: c.primary, color: c.primaryForeground }}>
            {iniciais(MOCK_USER.nome)}
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-xl font-bold" style={{ color: c.foreground }}>{MOCK_USER.nome}</p>
            <p className="text-sm" style={{ color: c.mutedForeground }}>{MOCK_USER.email}</p>
            <span className="mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: c.muted, color: c.foreground }}>{MOCK_USER.papel}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: c.mutedSoft }}>
            <div className="h-6 w-6 rounded flex items-center justify-center text-[11px] font-black" style={{ background: c.primarySoft, color: c.primary }}>O</div>
            <span className="text-sm font-medium" style={{ color: c.foreground }}>{MOCK_EMPRESA.nome}</span>
          </div>
        </div>

        {/* Seu progresso (barras coral/amarelo) */}
        <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: c.card, borderColor: c.border }}>
          <p className="text-[13px] font-semibold" style={{ color: c.foreground }}>Seu progresso</p>
          <ProgressBar
            c={c} label="Tarefas concluídas"
            valor={MOCK_TAREFAS.filter(t => t.concluida).length}
            total={MOCK_TAREFAS.length} cor={c.accent}
          />
          <ProgressBar
            c={c} label="Chamados resolvidos"
            valor={MOCK_TICKETS.filter(t => t.status === 'CONCLUIDO').length}
            total={MOCK_TICKETS.length} cor={c.warning}
          />
        </div>

        {/* Preferências */}
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold" style={{ color: c.foreground }}>Preferências</p>
          <div className="rounded-xl border p-3 flex items-center gap-3" style={{ background: c.card, borderColor: c.border }}>
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: c.muted }}>
              <Bell className="h-4 w-4" style={{ color: c.primary }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: c.foreground }}>Notificações push</p>
              <p className="text-xs" style={{ color: c.mutedForeground }}>Receber alertas no dispositivo</p>
            </div>
            {/* Switch ligado */}
            <span className="w-9 h-5 rounded-full p-0.5 flex items-center" style={{ background: c.primary }}>
              <span className="h-4 w-4 rounded-full bg-white ml-auto" />
            </span>
          </div>
          <PerfilRow c={c} Icon={Contrast} titulo="Tema" trailing="Automático" />
          <PerfilRow c={c} Icon={Globe} titulo="Idioma" trailing="Português" />
        </div>

        {/* Botão Sair */}
        <button
          type="button"
          onClick={onSair}
          className="mt-1 h-10 rounded-md text-sm font-semibold flex items-center justify-center gap-2 active:opacity-80"
          style={{ background: c.destructive, color: '#ffffff' }}
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </div>
  )
}

function PerfilRow({ c, Icon, titulo, trailing }: { c: AppColors; Icon: typeof Globe; titulo: string; trailing: string }) {
  return (
    <div className="rounded-xl border p-3 flex items-center gap-3" style={{ background: c.card, borderColor: c.border }}>
      <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: c.muted }}>
        <Icon className="h-4 w-4" style={{ color: c.primary }} />
      </div>
      <p className="flex-1 text-sm font-medium" style={{ color: c.foreground }}>{titulo}</p>
      <span className="text-sm" style={{ color: c.mutedForeground }}>{trailing}</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// DRAWER (menu lateral sobreposto)
// ════════════════════════════════════════════════════════════════════
export function AppDrawer({
  c, telaAtiva, onSelecionar, onFechar, onSair,
}: {
  c: AppColors
  telaAtiva: AppTela
  onSelecionar: (t: AppTela) => void
  onFechar: () => void
  onSair: () => void
}) {
  const itens: { label: string; Icon: typeof Home; tela: AppTela }[] = [
    { label: 'Início', Icon: Home, tela: 'dashboard' },
    { label: 'Agenda', Icon: Calendar, tela: 'agenda' },
    { label: 'Tarefas', Icon: CheckSquare, tela: 'tarefas' },
    { label: 'Helpdesk', Icon: MessageCircle, tela: 'helpdesk' },
  ]

  return (
    <div className="absolute inset-0 z-20 flex">
      {/* Painel do drawer */}
      <div className="w-[78%] max-w-[280px] h-full overflow-y-auto p-4 flex flex-col" style={{ background: c.card }}>
        {/* Header da empresa */}
        <div className="flex items-center gap-3 pb-4 mb-2 border-b" style={{ borderColor: c.border }}>
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center text-lg font-black" style={{ background: c.primarySoft, color: c.primary }}>O</div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wide" style={{ color: c.mutedForeground }}>Empresa</p>
            <p className="text-sm font-bold leading-tight" style={{ color: c.foreground }}>{MOCK_EMPRESA.nome}</p>
          </div>
        </div>

        {/* Cartão do usuário */}
        <button
          type="button"
          onClick={() => onSelecionar('perfil')}
          className="flex items-center gap-3 rounded-2xl p-3 text-left active:opacity-80"
          style={{ background: c.mutedSoft }}
        >
          <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>
            {iniciais(MOCK_USER.nome)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: c.foreground }}>{MOCK_USER.nome}</p>
            <p className="text-xs truncate" style={{ color: c.mutedForeground }}>{MOCK_USER.email}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: c.mutedForeground }} />
        </button>

        {/* Itens de menu */}
        <div className="mt-4 flex flex-col gap-1">
          {itens.map(it => {
            const ativo = it.tela === telaAtiva
            return (
              <button
                key={it.label}
                type="button"
                onClick={() => onSelecionar(it.tela)}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left active:opacity-80"
                style={{ background: ativo ? c.primarySoft : 'transparent' }}
              >
                <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: ativo ? c.primarySoft : c.muted }}>
                  <it.Icon className="h-4.5 w-4.5" style={{ color: ativo ? c.primary : c.mutedForeground, width: 18, height: 18 }} />
                </div>
                <span className="flex-1 text-sm font-medium" style={{ color: ativo ? c.primary : c.foreground }}>{it.label}</span>
              </button>
            )
          })}
        </div>

        {/* Rodapé: Perfil + Sair */}
        <div className="mt-6 pt-4 border-t flex flex-col gap-1" style={{ borderColor: c.border }}>
          <button
            type="button"
            onClick={() => onSelecionar('perfil')}
            className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left active:opacity-80"
          >
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: c.muted }}>
              <User className="h-4 w-4" style={{ color: c.mutedForeground }} />
            </div>
            <span className="flex-1 text-sm font-medium" style={{ color: c.foreground }}>Perfil</span>
          </button>
          <button
            type="button"
            onClick={onSair}
            className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left active:opacity-80"
          >
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: c.destructiveSoft }}>
              <LogOut className="h-4 w-4" style={{ color: c.destructive }} />
            </div>
            <span className="flex-1 text-sm font-medium" style={{ color: c.destructive }}>Sair</span>
          </button>
        </div>
      </div>

      {/* Backdrop (fecha ao tocar) */}
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={onFechar}
        className="flex-1 h-full"
        style={{ background: 'rgba(0,0,0,0.45)' }}
      />
    </div>
  )
}
