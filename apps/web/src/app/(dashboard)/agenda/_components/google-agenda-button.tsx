'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarSync, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react'
import { Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogTitle, cn } from '@saas/ui'
import { DOT, SURFACE, TEXT } from '@/lib/color-styles'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Status { connected: boolean; email?: string; configurado: boolean }
interface ResultadoImportacao { created: number; updated: number; linked: number; skipped: number; errors: number }

/** Rotas da integração (o cliente tRPC da agenda é tipado à mão aqui). */
interface ApiGoogle {
  google: {
    getAuthUrl: { query(): Promise<string> }
    getStatus: { query(): Promise<Status> }
    disconnect: { mutate(): Promise<void> }
    syncFromGoogle: { mutate(i?: { daysBack?: number; daysForward?: number }): Promise<ResultadoImportacao> }
  }
}
const api = () => trpc.agenda as unknown as ApiGoogle

/**
 * Google Agenda na /agenda (port do v1, 10/2026): conectar a conta, ver com qual
 * conta está ligado, desconectar e trazer agora os eventos do Google. Com a
 * conta ligada, criar/editar/excluir um evento reflete sozinho na agenda Google
 * de quem o criou; a importação também roda sozinha a cada 30 minutos.
 */
export function GoogleAgendaButton({ onSincronizado }: { onSincronizado: () => void }) {
  const router = useRouter()
  const params = useSearchParams()
  const [aberto, setAberto] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [ocupado, setOcupado] = useState<'conectar' | 'desconectar' | 'sincronizar' | null>(null)

  const carregar = useCallback(() => {
    api().google.getStatus.query().then(setStatus).catch(() => setStatus({ connected: false, configurado: false }))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  // Volta do Google (/api/google-calendar/callback → /agenda?google=...).
  useEffect(() => {
    const r = params.get('google')
    if (!r) return
    if (r === 'conectado') alerts.success('Google Agenda conectado', 'Seus eventos passam a ir para a sua agenda Google.')
    else alerts.error('Google Agenda', params.get('motivo') || 'Não foi possível conectar.')
    carregar()
    router.replace('/agenda')
  }, [params, router, carregar])

  async function conectar() {
    setOcupado('conectar')
    try { window.location.href = await api().google.getAuthUrl.query() }
    catch (e) { alerts.error('Google Agenda', (e as Error).message); setOcupado(null) }
  }

  async function desconectar() {
    const ok = await alerts.confirm({
      title: 'Desconectar o Google Agenda?',
      text: 'Os eventos deixam de ir para a sua agenda Google. O que já está lá continua lá.',
      confirmText: 'Desconectar',
      icon: 'warning',
    })
    if (!ok) return
    setOcupado('desconectar')
    try { await api().google.disconnect.mutate(); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setOcupado(null) }
  }

  async function sincronizar() {
    setOcupado('sincronizar')
    try {
      const r = await api().google.syncFromGoogle.mutate({ daysBack: 7, daysForward: 30 })
      alerts.success('Agenda sincronizada', `${r.created} novo(s), ${r.updated} atualizado(s), ${r.linked} vinculado(s)${r.errors ? `, ${r.errors} com erro` : ''}.`)
      onSincronizado()
    } catch (e) { alerts.error('Erro ao sincronizar', (e as Error).message) }
    finally { setOcupado(null) }
  }

  const ligado = !!status?.connected
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAberto(true)} title={ligado ? `Google Agenda: ${status?.email ?? 'conectado'}` : 'Google Agenda: não conectado'}>
        <span className={cn('h-2 w-2 rounded-full', ligado ? DOT.emerald : DOT.slate)} />
        <CalendarSync className="h-4 w-4" /> Google Agenda
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeaderIcon icon={CalendarSync} color="sky">
            <DialogTitle>Google Agenda</DialogTitle>
            <DialogDescription>Sincronização com a sua agenda Google</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3 text-sm">
            {!status ? (
              <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Verificando…</p>
            ) : !status.configurado ? (
              <p className={cn('rounded-lg px-3 py-2 text-[13px]', SURFACE.amber, TEXT.amber)}>
                A integração ainda não foi configurada pelo administrador (aplicativo OAuth do Google).
              </p>
            ) : ligado ? (
              <>
                <p className={cn('rounded-lg px-3 py-2 text-[13px]', SURFACE.emerald, TEXT.emerald)}>
                  Conectado{status.email ? <> como <strong>{status.email}</strong></> : ''}.
                </p>
                <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
                  <li>Eventos que você cria, edita ou exclui aqui vão sozinhos para a sua agenda Google.</li>
                  <li>Os eventos da sua agenda Google (7 dias atrás a 30 à frente) entram aqui a cada 30 minutos.</li>
                  <li>Os participantes continuam sendo avisados por e-mail pela agenda.</li>
                </ul>
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Conecte sua conta Google para que os eventos que você cria aqui apareçam na sua agenda Google
                (celular, Gmail) e os de lá apareçam aqui.
              </p>
            )}
          </DialogBody>
          <DialogFooter className="flex-wrap gap-2">
            {ligado ? (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={!!ocupado} onClick={desconectar}>
                  {ocupado === 'desconectar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}Desconectar
                </Button>
                <Button size="sm" className="gap-1.5" disabled={!!ocupado} onClick={sincronizar}>
                  {ocupado === 'sincronizar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Sincronizar agora
                </Button>
              </>
            ) : (
              <Button size="sm" className="gap-1.5" disabled={!!ocupado || !status?.configurado} onClick={conectar}>
                {ocupado === 'conectar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Conectar conta Google
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
