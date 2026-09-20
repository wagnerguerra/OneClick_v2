'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Mail, Send } from 'lucide-react'
import {
  Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogTitle,
  Input, Label, Textarea,
} from '@saas/ui'

import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import type { AreaDaEquipe } from './painel-inicio'

/**
 * Modal "Escrever para a equipe" do portal.
 *
 * O cliente não escolhe endereço: escolhe a pessoa no bloco "Sua equipe", e o
 * servidor resolve para quem vai (responsável da área, ou o substituto quando
 * o responsável não está ativo). A resposta do contador chega no e-mail de
 * quem escreveu.
 *
 * A mensagem é TEXTO PURO, num `Textarea`, e não no `RichEditor`: ela vira o
 * corpo de um e-mail enviado em nome do escritório, e texto de fora entra
 * escapado. Formatação rica aqui seria HTML do cliente dentro do e-mail — o que
 * o servidor, de propósito, não aceita.
 */

const ASSUNTO_MAX = 150
const MENSAGEM_MAX = 5000

interface ApiContato {
  contato: {
    enviar: {
      mutate(i: { clienteId: string; areaId: string; assunto: string; mensagem: string }): Promise<{ destinatario: string }>
    }
  }
}

export function ContatoEquipeModal({
  clienteId, area, onClose,
}: {
  clienteId: string
  /** Área escolhida; `null` fecha o modal. */
  area: AreaDaEquipe | null
  onClose: () => void
}) {
  const [assunto, setAssunto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null)

  // Cada abertura começa limpa: reaproveitar o rascunho de outra pessoa
  // mandaria a mensagem certa para a área errada.
  useEffect(() => {
    if (!area) return
    setAssunto('')
    setMensagem('')
    setErro(null)
    setEnviadoPara(null)
  }, [area])

  const pessoa = area?.responsavel?.nome ?? area?.substituto?.nome ?? null
  const valido = assunto.trim().length >= 3 && mensagem.trim().length >= 5

  async function enviar() {
    if (!area || !valido || enviando) return
    setEnviando(true)
    setErro(null)
    try {
      const api = trpc.portal as unknown as ApiContato
      const r = await api.contato.enviar.mutate({ clienteId, areaId: area.areaId, assunto: assunto.trim(), mensagem: mensagem.trim() })
      setEnviadoPara(r.destinatario)
    } catch (e) {
      setErro((e as Error).message || 'Não foi possível enviar agora. Tente de novo em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={!!area} onOpenChange={(aberto) => { if (!aberto && !enviando) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeaderIcon icon={Mail} color="blue">
          <DialogTitle>{pessoa ? `Escrever para ${pessoa}` : 'Escrever para a equipe'}</DialogTitle>
          <DialogDescription>
            {area?.area ?? ''} · a resposta chega no e-mail do seu acesso.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody>
          {enviadoPara ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <p className="text-[14px] font-semibold text-foreground">Mensagem enviada</p>
              <p className="max-w-sm text-[13px] text-muted-foreground">
                {enviadoPara} recebeu a sua mensagem por e-mail. Quando responder, a resposta chega na sua caixa de entrada.
              </p>
            </div>
          ) : (
            <form
              id="form-contato-equipe"
              className="flex flex-col gap-4 py-1"
              onSubmit={(e) => { e.preventDefault(); void enviar() }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="contato-assunto" className="text-[13px] font-semibold">Assunto</Label>
                <Input
                  id="contato-assunto"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  maxLength={ASSUNTO_MAX}
                  placeholder="Ex.: Dúvida sobre a guia de setembro"
                  className="h-9 text-sm"
                  autoFocus
                  disabled={enviando}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="contato-mensagem" className="text-[13px] font-semibold">Mensagem</Label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{mensagem.length}/{MENSAGEM_MAX}</span>
                </div>
                <Textarea
                  id="contato-mensagem"
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  maxLength={MENSAGEM_MAX}
                  rows={7}
                  placeholder="Escreva a sua mensagem para a equipe do escritório."
                  className="resize-y text-sm"
                  disabled={enviando}
                />
              </div>
              {erro && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                  {erro}
                </p>
              )}
            </form>
          )}
        </DialogBody>

        <DialogFooter>
          {enviadoPara ? (
            <Button type="button" size="sm" onClick={onClose}>Fechar</Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={enviando}>Cancelar</Button>
              <Button type="submit" form="form-contato-equipe" size="sm" disabled={!valido || enviando}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {enviando ? 'Enviando…' : 'Enviar mensagem'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
