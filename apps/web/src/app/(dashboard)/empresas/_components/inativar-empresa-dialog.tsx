'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, PowerOff } from 'lucide-react'
import {
  Button,
  Dialog, DialogContent, DialogBody, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

type Vinculos = Awaited<ReturnType<typeof trpc.empresa.vinculos.query>>

interface Props {
  /** Empresa a inativar; `null` fecha o modal. */
  empresa: { id: string; razaoSocial: string } | null
  onClose: () => void
  onInativada: () => void
}

/**
 * Levantamento do que está ligado à empresa, mostrado ANTES de inativar.
 *
 * Os números e a trava da própria empresa vêm prontos do backend
 * (`empresa.vinculos`): esta tela só os mostra.
 */
export function InativarEmpresaDialog({ empresa, onClose, onInativada }: Props) {
  const [vinculos, setVinculos] = useState<Vinculos | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!empresa) return
    setVinculos(null)
    setErro(null)
    let vivo = true
    trpc.empresa.vinculos
      .query({ id: empresa.id })
      .then((v) => { if (vivo) setVinculos(v) })
      .catch((e: Error) => { if (vivo) setErro(e.message) })
    return () => { vivo = false }
  }, [empresa])

  async function inativar() {
    if (!empresa) return
    setEnviando(true)
    try {
      const r = await trpc.empresa.desativar.mutate({ id: empresa.id })
      onClose()
      onInativada()
      await alerts.success('Empresa inativada', r.jaInativa
        ? `"${empresa.razaoSocial}" já estava inativa.`
        : `${r.usuariosDesativados} usuário(s) perderam o acesso.`)
    } catch (e) {
      alerts.error('Não foi possível inativar', (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  const bloqueada = !!vinculos?.ehSuaEmpresa

  return (
    <Dialog open={!!empresa} onOpenChange={(o) => { if (!o && !enviando) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeaderIcon icon={PowerOff} color="rose">
          <DialogTitle>Inativar empresa</DialogTitle>
          <DialogDescription>{empresa?.razaoSocial}</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody>
          {erro ? (
            <p className="py-6 text-center text-sm text-destructive">{erro}</p>
          ) : !vinculos ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Levantando os vínculos da empresa...
            </div>
          ) : (
            <div className="space-y-4 py-1">
              {bloqueada && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Esta é a empresa à qual você pertence. Para inativá-la, peça a um master de outra empresa.
                </div>
              )}

              {vinculos.grupos.map((g) => (
                <section key={g.chave} className="rounded-lg border border-border">
                  <header className="border-b border-border bg-muted/40 px-3 py-2">
                    <p className="text-[13px] font-semibold text-foreground">{g.titulo}</p>
                    <p className="text-xs text-muted-foreground">{g.nota}</p>
                  </header>
                  <ul className="divide-y divide-border/60">
                    {g.itens.map((i) => (
                      <li key={i.rotulo} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]">
                        <span className={i.total === 0 ? 'text-muted-foreground' : 'text-foreground'}>
                          {i.rotulo}
                          {i.detalhe && i.total > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">{i.detalhe}</span>
                          )}
                        </span>
                        <span className={`tabular-nums font-semibold ${i.total === 0 ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {i.total.toLocaleString('pt-BR')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {vinculos.mastersMantidos > 0 && (
                <p className="text-xs text-muted-foreground">
                  {vinculos.mastersMantidos} master(s) da plataforma vinculado(s) a esta empresa mantêm o acesso.
                </p>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="destructive"
            size="sm"
            type="button"
            disabled={!vinculos || bloqueada || enviando}
            onClick={inativar}
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4" />}
            {enviando ? 'Inativando...' : 'Inativar empresa'}
          </Button>
          <DialogClose asChild>
            <Button variant="outline" size="sm" type="button" disabled={enviando}>Cancelar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
