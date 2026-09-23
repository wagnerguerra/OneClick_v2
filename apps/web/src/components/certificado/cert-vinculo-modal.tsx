'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Button, Label,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { Link2, Loader2, Unlink } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { ClienteCombobox } from '@/app/(dashboard)/orcamentos/_components/cliente-combobox'

type ClienteOpt = { id: string; razaoSocial: string; documento?: string | null }

export type CertVinculoAlvo = {
  id: string
  titular: string
  cliente: { id: string; razaoSocial: string } | null
}

/**
 * Troca o cliente vinculado a um certificado já cadastrado.
 *
 * O vínculo era escolhido só no cadastro e ficava definitivo — o modal de
 * detalhes mostra Cliente/Empresa/Sócio como texto, sem edição, e o menu da
 * linha não tinha a ação. Errar o cliente no cadastro significava excluir o
 * certificado e subir o PFX de novo.
 *
 * Só o CLIENTE se altera aqui. Empresa é fronteira de tenant (o router valida
 * com `scopedEmpresaIdOpt`) e sócio pertence ao cadastro do cliente — mexer
 * neles daqui seria outra decisão, não a que o chamado pediu.
 */
export function CertVinculoModal({ open, onOpenChange, alvo, clientes, onSalvo }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  alvo: CertVinculoAlvo | null
  clientes: ClienteOpt[]
  onSalvo: () => void
}) {
  const [clienteId, setClienteId] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Reabrir para outro certificado tem de partir do vínculo DELE, não do que
  // sobrou da vez anterior.
  useEffect(() => {
    if (open) setClienteId(alvo?.cliente?.id ?? '')
  }, [open, alvo])

  if (!alvo) return null

  const atual = alvo.cliente?.razaoSocial ?? null
  const mudou = (clienteId || null) !== (alvo.cliente?.id ?? null)

  async function salvar(novoClienteId: string | null) {
    if (!alvo) return
    setSalvando(true)
    try {
      await (trpc.certificadoDigital as any).update.mutate({
        id: alvo.id,
        clienteId: novoClienteId,
      })
      alerts.success(
        novoClienteId ? 'Vínculo alterado' : 'Vínculo removido',
        novoClienteId
          ? 'O certificado passou a responder pelo novo cliente.'
          : 'O certificado ficou sem cliente vinculado.',
      )
      onSalvo()
      onOpenChange(false)
    } catch (e) {
      alerts.error('Não foi possível alterar', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeaderIcon icon={Link2} color="sky">
          <DialogTitle>Alterar vínculo</DialogTitle>
          <DialogDescription>
            Troca o cliente ao qual este certificado responde.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Certificado</p>
            <p className="text-sm font-medium text-foreground">{alvo.titular}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Vínculo atual: <strong className="text-foreground">{atual ?? 'sem cliente vinculado'}</strong>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Cliente vinculado</Label>
            <ClienteCombobox
              clientes={clientes}
              value={clienteId}
              onSelect={setClienteId}
              placeholder="Buscar cliente mensal por razão social ou CNPJ..."
            />
            <p className="text-[10px] text-muted-foreground">
              Apenas clientes com situação <strong>Mensal</strong> são listados. A troca fica
              registrada na trilha do certificado, com o vínculo anterior e o novo.
            </p>
          </div>
        </DialogBody>

        <DialogFooter className="gap-2">
          {/* Remover fica à esquerda e separado do salvar: é a ação destrutiva
              do par, e o certificado sem cliente some dos vínculos do cadastro. */}
          {alvo.cliente && (
            <Button
              variant="outline"
              size="sm"
              className="mr-auto gap-1.5"
              disabled={salvando}
              onClick={() => void salvar(null)}
            >
              <Unlink className="h-3.5 w-3.5" /> Remover vínculo
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={salvando} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={salvando || !mudou || !clienteId}
            onClick={() => void salvar(clienteId)}
          >
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Salvar vínculo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
