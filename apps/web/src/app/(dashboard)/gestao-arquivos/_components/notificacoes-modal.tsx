'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Save, Mail } from 'lucide-react'
import {
  Button, Checkbox, Switch, Input, Label,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

/**
 * Administração das notificações do módulo.
 *
 * Edita a regra PADRÃO da empresa (`clienteId` nulo). A sobreposição por
 * cliente existe no backend e ainda não tem tela — quando tiver, é este mesmo
 * componente recebendo um `clienteId`.
 */

interface Regra {
  evento: string
  ativo: boolean
  notificaResponsavel: boolean
  notificaSubstituto: boolean
  notificaCoordenador: boolean
  notificaDiretor: boolean
  emailsExtras: string | null
}

const EVENTOS: Array<{ chave: string; titulo: string; ajuda: string }> = [
  {
    chave: 'ARQUIVO_ENVIADO',
    titulo: 'Cliente enviou arquivo',
    ajuda: 'O caso principal: sem este aviso, o documento só é descoberto se alguém abrir o portal por conta própria.',
  },
  {
    chave: 'ARQUIVO_EXCLUIDO',
    titulo: 'Arquivo excluído',
    ajuda: 'O evento irreversível. Avisar a chefia é a trava social que a permissão sozinha não dá.',
  },
  {
    chave: 'SOLICITACAO_VENCIDA',
    titulo: 'Solicitação vencida',
    ajuda: 'O escritório pediu um documento e o prazo passou sem resposta.',
  },
  {
    chave: 'ARQUIVO_LIDO',
    titulo: 'Cliente abriu o arquivo',
    ajuda: 'Recibo de leitura. É o evento de maior volume — todo cliente abrindo toda guia.',
  },
]

const DESTINOS: Array<{ campo: keyof Regra; rotulo: string }> = [
  { campo: 'notificaResponsavel', rotulo: 'Responsável pela área' },
  { campo: 'notificaSubstituto', rotulo: 'Substituto' },
  { campo: 'notificaCoordenador', rotulo: 'Coordenação / Gestão' },
  { campo: 'notificaDiretor', rotulo: 'Diretoria' },
]

function regraVazia(evento: string): Regra {
  return {
    evento,
    ativo: false,
    notificaResponsavel: true,
    notificaSubstituto: false,
    notificaCoordenador: false,
    notificaDiretor: false,
    emailsExtras: null,
  }
}

export function NotificacoesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [regras, setRegras] = useState<Record<string, Regra>>({})
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc as any).gestaoArquivos.listarRegras.query({ clienteId: null })
      .then((lista: Regra[]) => {
        const mapa: Record<string, Regra> = {}
        for (const e of EVENTOS) mapa[e.chave] = regraVazia(e.chave)
        for (const r of lista) mapa[r.evento] = { ...regraVazia(r.evento), ...r }
        setRegras(mapa)
      })
      .catch(() => {
        const mapa: Record<string, Regra> = {}
        for (const e of EVENTOS) mapa[e.chave] = regraVazia(e.chave)
        setRegras(mapa)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (open) carregar() }, [open, carregar])

  function alterar(evento: string, patch: Partial<Regra>) {
    setRegras(r => ({ ...r, [evento]: { ...r[evento]!, ...patch } }))
  }

  async function salvar() {
    setSalvando(true)
    try {
      // Sequencial em vez de Promise.all: são quatro chamadas e cada uma pode
      // criar a linha que ainda não existe. Em paralelo, duas criações do mesmo
      // evento correriam juntas e o índice parcial rejeitaria uma delas.
      for (const e of EVENTOS) {
        const r = regras[e.chave]!
        await (trpc as any).gestaoArquivos.salvarRegra.mutate({
          clienteId: null,
          evento: e.chave,
          ativo: r.ativo,
          notificaResponsavel: r.notificaResponsavel,
          notificaSubstituto: r.notificaSubstituto,
          notificaCoordenador: r.notificaCoordenador,
          notificaDiretor: r.notificaDiretor,
          emailsExtras: r.emailsExtras,
        })
      }
      alerts.success('Notificações salvas.')
      onClose()
    } catch (err) {
      alerts.error(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeaderIcon icon={Mail} color="slate">
          <DialogTitle>Notificações por e-mail</DialogTitle>
          <DialogDescription>
            Regra padrão do escritório. Vale para todos os clientes.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="max-h-[60vh] overflow-y-auto nice-scrollbar">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {EVENTOS.map(e => {
                const r = regras[e.chave]!
                return (
                  <div key={e.chave} className="rounded-lg border border-border p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-foreground">{e.titulo}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{e.ajuda}</p>
                      </div>
                      <Switch
                        checked={r.ativo}
                        onCheckedChange={v => alterar(e.chave, { ativo: v })}
                        aria-label={`Ativar aviso de ${e.titulo}`}
                      />
                    </div>

                    {r.ativo && (
                      <div className="mt-3 space-y-2.5 border-t border-border pt-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {DESTINOS.map(d => (
                            <label key={String(d.campo)} className="flex cursor-pointer items-center gap-2">
                              <Checkbox
                                checked={Boolean(r[d.campo])}
                                onCheckedChange={v => alterar(e.chave, { [d.campo]: v === true } as Partial<Regra>)}
                              />
                              <span className="text-[13px] text-foreground">{d.rotulo}</span>
                            </label>
                          ))}
                        </div>
                        <div>
                          <Label className="text-[12px] font-semibold">Outros endereços</Label>
                          <Input
                            value={r.emailsExtras ?? ''}
                            onChange={ev => alterar(e.chave, { emailsExtras: ev.target.value })}
                            placeholder="fulano@escritorio.com.br; ciclano@escritorio.com.br"
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Os avisos vão em cópia oculta: quem recebe não vê a lista dos demais.
                &ldquo;Responsável&rdquo; e &ldquo;substituto&rdquo; são os das áreas contratadas do
                cliente — as mesmas pessoas que já enxergam os arquivos dele aqui.
              </p>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || loading} className="gap-1.5">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
