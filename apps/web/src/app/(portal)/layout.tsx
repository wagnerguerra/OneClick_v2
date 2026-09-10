'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  FolderOpen, CalendarCheck, LifeBuoy, LayoutGrid, Building2, ChevronDown,
  LogOut, Moon, Sun, Loader2,
} from 'lucide-react'
import { cn } from '@saas/ui'

import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import { authClient, useSession } from '@/lib/auth-client'
import { PortalContexto, type VinculoPortal } from './_lib/contexto'

/**
 * Casca do Portal do Cliente.
 *
 * Deliberadamente NADA a ver com o layout interno. O de dentro é uma estação de
 * trabalho — sidebar de módulos, abas, trilhos de tarefas e notas, chat da
 * equipe, FAB de chamado. Nada disso pertence à tela de quem é cliente: o
 * cliente entra para resolver uma coisa e sair.
 *
 * A referência é o LuminAux, e o traço estrutural que ele traz é a NAVBAR
 * horizontal no lugar da sidebar. Isso, sozinho, já torna as duas interfaces
 * irreconhecíveis uma na outra — que era o pedido.
 *
 * O que este layout NÃO monta, e é o ponto: `usePermissionsSse`,
 * `usePresencePing`, chat, abas, trilhos. O usuário externo não deve nem
 * abrir conexão com esses canais.
 */

/** Item de menu. `emBreve` some da barra e vira aviso na tela de destino. */
const NAV = [
  { href: '/portal', rotulo: 'Início', icone: LayoutGrid },
  { href: '/portal/documentos', rotulo: 'Documentos', icone: FolderOpen },
  { href: '/portal/obrigacoes', rotulo: 'Obrigações', icone: CalendarCheck, emBreve: true },
  { href: '/portal/chamados', rotulo: 'Atendimento', icone: LifeBuoy, emBreve: true },
] as const

/** Guarda a empresa escolhida — o diretor de grupo troca e espera continuar nela. */
const CHAVE_CLIENTE = 'portal:cliente-ativo'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: sessao, isPending } = useSession()

  const [vinculos, setVinculos] = useState<VinculoPortal[]>([])
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  /** Falhou a consulta? Distingue de "não tem empresa" — ver o efeito abaixo. */
  const [erro, setErro] = useState<string | null>(null)
  const [abrirEmpresas, setAbrirEmpresas] = useState(false)
  const [abrirPerfil, setAbrirPerfil] = useState(false)
  const [escuro, setEscuro] = useState(false)

  // Quem é do escritório não tem o que fazer aqui — e o contrário também vale,
  // no layout do dashboard. Sem isso, um interno curioso veria a casca vazia.
  useEffect(() => {
    if (isPending) return
    if (!sessao?.user) { router.replace('/login'); return }
    const role = (sessao.user as { role?: string }).role
    if (role && role !== 'COLABORADOR_CLIENTE') router.replace('/dashboard')
  }, [isPending, sessao, router])

  useEffect(() => {
    ;(trpc.portal as any).meusClientes.query()
      .then((v: VinculoPortal[]) => {
        setVinculos(v)
        setErro(null)
        const salvo = typeof window !== 'undefined' ? localStorage.getItem(CHAVE_CLIENTE) : null
        // Só aceita o salvo se ele ainda estiver entre os vínculos: acesso
        // revogado não pode continuar sendo a empresa "atual".
        const valido = v.find(x => x.clienteId === salvo)?.clienteId
        setClienteId(valido ?? v[0]?.clienteId ?? null)
      })
      // Engolir a falha aqui foi o que fez uma consulta BLOQUEADA aparecer como
      // "nenhuma empresa vinculada" — e mandou procurar o problema no cadastro,
      // que estava certo. Lista vazia e consulta que falhou são coisas
      // diferentes e a tela precisa dizer qual das duas aconteceu.
      .catch((e: Error) => setErro(e.message || 'Não foi possível carregar suas empresas.'))
      .finally(() => setCarregando(false))
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    setEscuro(document.documentElement.classList.contains('dark'))
  }, [])

  const trocarTema = useCallback(() => {
    const novo = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', novo)
    try { localStorage.setItem('theme', novo ? 'dark' : 'light') } catch { /* privado */ }
    setEscuro(novo)
  }, [])

  const escolherCliente = useCallback((id: string) => {
    setClienteId(id)
    setAbrirEmpresas(false)
    try { localStorage.setItem(CHAVE_CLIENTE, id) } catch { /* privado */ }
  }, [])

  const atual = useMemo(
    () => vinculos.find(v => v.clienteId === clienteId) ?? null,
    [vinculos, clienteId],
  )

  // A marca segue o cliente ativo. O primeiro vínculo é o reserva para o
  // instante entre carregar a lista e a empresa ficar escolhida.
  const escritorio = atual?.escritorio ?? vinculos[0]?.escritorio ?? null

  const iniciais = (sessao?.user?.name ?? '?')
    .split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

  if (isPending || carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8fb] dark:bg-[#0b1220]">
        <Loader2 className="h-6 w-6 animate-spin text-[#1a6dff]" />
      </div>
    )
  }

  if (erro) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f6f8fb] px-6 text-center dark:bg-[#0b1220]">
        <Building2 className="h-10 w-10 text-muted-foreground/40" />
        <h1 className="text-lg font-semibold">Não foi possível abrir o portal</h1>
        <p className="max-w-md text-sm text-muted-foreground">{erro}</p>
        <div className="mt-2 flex items-center gap-4">
          <button type="button" onClick={() => window.location.reload()} className="text-sm text-[#1a6dff] hover:underline">
            Tentar de novo
          </button>
          <button
            type="button"
            onClick={() => authClient.signOut().then(() => router.replace('/login'))}
            className="text-sm text-muted-foreground hover:underline"
          >
            Sair
          </button>
        </div>
      </div>
    )
  }

  // Cadastrado no sistema mas sem nenhum cliente ativo: acontece quando o acesso
  // é revogado depois do convite. Dizer isso é melhor do que uma tela vazia.
  if (vinculos.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f6f8fb] px-6 text-center dark:bg-[#0b1220]">
        <Building2 className="h-10 w-10 text-muted-foreground/40" />
        <h1 className="text-lg font-semibold">Nenhuma empresa vinculada</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Seu acesso não está vinculado a nenhuma empresa ativa. Fale com o seu escritório
          contábil para liberar.
        </p>
        <button
          type="button"
          onClick={() => authClient.signOut().then(() => router.replace('/login'))}
          className="mt-2 text-sm text-[#1a6dff] hover:underline"
        >
          Sair
        </button>
      </div>
    )
  }

  return (
    // `flex-col` + `min-h-screen` e o `<main>` com `flex-1`: o conteúdo empurra
    // o rodapé para baixo quando é longo, e o rodapé encosta na base quando é
    // curto. Sem isso ele flutuava no meio da tela em página com pouca coisa,
    // como a de documentos de um cliente novo.
    <div className="flex min-h-screen flex-col bg-[#f6f8fb] dark:bg-[#0b1220]">
      {/* ── Navbar ────────────────────────────────────────────────────────
          Horizontal, no topo. É a diferença estrutural em relação ao sistema
          interno, que é todo organizado por uma sidebar de módulos. */}
      <header className="sticky top-0 z-40 border-b border-[#e6ebf2] bg-white/90 backdrop-blur dark:border-[#1b2739] dark:bg-[#0e1726]/90">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-3 px-5">
          {/* A marca é a do ESCRITÓRIO, não do produto. Quem entra aqui é
              cliente da Central Contábil — ele não tem relação com o nome do
              sistema, e ver a logo de quem o atende é o que faz a página
              parecer dele. Cai no nome quando não há logo cadastrada. */}
          <Link href="/portal" className="flex shrink-0 items-center gap-2" title="Início">
            {escritorio?.logoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveAssetUrl(escritorio.logoUrl)}
                  alt={escritorio.nome}
                  className={cn(
                    'h-8 w-auto max-w-[150px] object-contain',
                    escritorio.logoDarkUrl && 'dark:hidden',
                  )}
                />
                {escritorio.logoDarkUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveAssetUrl(escritorio.logoDarkUrl)}
                    alt={escritorio.nome}
                    className="hidden h-8 w-auto max-w-[150px] object-contain dark:block"
                  />
                )}
              </>
            ) : (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a6dff] text-white">
                  <LayoutGrid className="h-4 w-4" />
                </span>
                <span className="max-w-[180px] truncate text-[15px] font-bold tracking-tight">
                  {escritorio?.nome ?? 'Portal do cliente'}
                </span>
              </>
            )}
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map(item => {
              const ativo = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                    ativo
                      ? 'bg-[#eaf1ff] text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#16233a] dark:hover:text-slate-100',
                  )}
                >
                  <item.icone className="h-4 w-4" />
                  {item.rotulo}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Seletor de empresa — só aparece para quem tem mais de uma.
                Um botão que nunca muda nada é ruído. */}
            {vinculos.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setAbrirEmpresas(v => !v); setAbrirPerfil(false) }}
                  className="flex max-w-[220px] items-center gap-2 rounded-lg border border-[#e6ebf2] bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-slate-50 dark:border-[#1b2739] dark:bg-[#0e1726] dark:hover:bg-[#16233a]"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-[#1a6dff]" />
                  <span className="truncate">{atual?.razaoSocial}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </button>
                {abrirEmpresas && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-[280px] overflow-hidden rounded-xl border border-[#e6ebf2] bg-white shadow-lg dark:border-[#1b2739] dark:bg-[#0e1726]">
                    <p className="border-b border-[#eef2f7] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-[#1b2739]">
                      Suas empresas
                    </p>
                    {vinculos.map(v => (
                      <button
                        key={v.clienteId}
                        type="button"
                        onClick={() => escolherCliente(v.clienteId)}
                        className={cn(
                          'flex w-full items-start gap-2 px-4 py-2.5 text-left text-[13px] hover:bg-slate-50 dark:hover:bg-[#16233a]',
                          v.clienteId === clienteId && 'bg-[#f2f7ff] dark:bg-[#16233a]',
                        )}
                      >
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1a6dff]" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{v.razaoSocial}</span>
                          <span className="block text-[11px] text-slate-500">{v.nivel.toLowerCase()}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={trocarTema}
              title={escuro ? 'Tema claro' : 'Tema escuro'}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-[#16233a]"
            >
              {escuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => { setAbrirPerfil(v => !v); setAbrirEmpresas(false) }}
                className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-[#16233a]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a6dff] text-[11px] font-bold text-white">
                  {iniciais}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[140px] truncate text-[13px] font-semibold leading-tight">
                    {sessao?.user?.name}
                  </span>
                  <span className="block text-[11px] leading-tight text-slate-500">
                    {atual ? atual.nivel.toLowerCase() : ''}
                  </span>
                </span>
              </button>
              {abrirPerfil && (
                <div className="absolute right-0 top-full z-50 mt-2 w-[220px] overflow-hidden rounded-xl border border-[#e6ebf2] bg-white shadow-lg dark:border-[#1b2739] dark:bg-[#0e1726]">
                  <p className="border-b border-[#eef2f7] px-4 py-2.5 text-[12px] text-slate-500 dark:border-[#1b2739]">
                    {sessao?.user?.email}
                  </p>
                  <button
                    type="button"
                    onClick={() => authClient.signOut().then(() => router.replace('/login'))}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] hover:bg-slate-50 dark:hover:bg-[#16233a]"
                  >
                    <LogOut className="h-4 w-4" /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navegação em telas estreitas: a barra vira uma linha rolável. */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-[#eef2f7] px-4 py-1.5 md:hidden dark:border-[#1b2739]">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium',
                pathname === item.href
                  ? 'bg-[#eaf1ff] text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]'
                  : 'text-slate-600 dark:text-slate-400',
              )}
            >
              <item.icone className="h-3.5 w-3.5" />
              {item.rotulo}
            </Link>
          ))}
        </nav>
      </header>

      {/* Degradê suave sob a navbar — o "céu" do LuminAux. Puramente decorativo. */}
      <div
        aria-hidden="true"
        className="pointer-events-none h-40 w-full bg-gradient-to-b from-[#e8f1ff] to-transparent dark:from-[#101b2e]"
      />

      <main className="mx-auto -mt-40 w-full max-w-[1180px] flex-1 px-5 pb-16 pt-8">
        {clienteId
          ? <PortalContexto.Provider value={{ clienteId, vinculo: atual }}>{children}</PortalContexto.Provider>
          : null}
      </main>

      <footer className="mt-auto border-t border-[#e6ebf2] bg-white py-5 dark:border-[#1b2739] dark:bg-[#0e1726]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-5 text-[12px] text-slate-500">
          <span>{escritorio?.nome ?? 'Portal do cliente'} · {atual?.razaoSocial}</span>
          <span>Dúvidas sobre o acesso? Fale com o seu escritório contábil.</span>
        </div>
      </footer>
    </div>
  )
}
