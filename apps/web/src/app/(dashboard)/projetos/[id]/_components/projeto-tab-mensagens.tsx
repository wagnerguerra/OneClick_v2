'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Send, MessageSquare } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/api-url'
import { Button, Card } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Mensagem {
  id: string
  texto: string
  createdAt: string | Date
  autor: { id: string; name: string; image: string | null } | null
}

interface Props {
  projetoId: string
  projetoCor: string
  canWrite: boolean
}

export function ProjetoTabMensagens({ projetoId, projetoCor, canWrite }: Props) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)

  const fetchMsgs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await trpc.projetos.listMensagensProjeto.query({ projetoId })
      setMensagens(data as unknown as Mensagem[])
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [projetoId])

  useEffect(() => { fetchMsgs() }, [fetchMsgs])

  async function handleSend() {
    if (!texto.trim()) return
    setSending(true)
    try {
      await trpc.projetos.addMensagemProjeto.mutate({ projetoId, texto: texto.trim() })
      setTexto('')
      fetchMsgs()
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="overflow-hidden flex flex-col" style={{ minHeight: 400 }}>
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Mensagens
        </h3>
        <span className="text-[11px] text-muted-foreground">{mensagens.length}</span>
      </div>

      {/* Composer (topo) */}
      {canWrite && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-start gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="flex-1 min-h-[60px] rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Escreva uma mensagem ao time..."
            />
            <Button
              onClick={handleSend}
              disabled={sending || !texto.trim()}
              size="sm"
              className="h-9 gap-1.5"
              style={{ background: projetoCor }}
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Send className="h-3.5 w-3.5" /> Enviar</>}
            </Button>
          </div>
        </div>
      )}

      {/* Lista (cronológica decrescente) */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
          </div>
        ) : mensagens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm">
            <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
            Nenhuma mensagem ainda
          </div>
        ) : (
          <div className="divide-y divide-border">
            {mensagens.map((m) => (
              <MensagemItem key={m.id} msg={m} />
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function MensagemItem({ msg }: { msg: Mensagem }) {
  const dt = new Date(msg.createdAt)
  const dataFmt = dt.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const autorNome = msg.autor?.name ?? 'Anônimo'

  return (
    <div className="flex gap-3 px-4 py-3 hover:bg-muted/30">
      {msg.autor?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolveAssetUrl(msg.autor.image)} alt={autorNome} className="h-8 w-8 rounded-full shrink-0" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold shrink-0">
          {autorNome.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-[13px] font-semibold text-foreground">{autorNome}</span>
          <span className="text-[11px] text-muted-foreground">{dataFmt}</span>
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap">{msg.texto}</p>
      </div>
    </div>
  )
}
