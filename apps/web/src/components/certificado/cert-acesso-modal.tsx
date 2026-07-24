'use client'

import {
  Dialog, DialogContent, DialogBody, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { ShieldCheck } from 'lucide-react'
import { CertAcessoPanel } from './cert-acesso-panel'

/**
 * Fluxo unificado de acesso ao certificado (#HLP0301) em modal próprio — usado
 * onde o gatilho NÃO está dentro de outro modal (ex.: kebab da gestão). A lógica
 * e as fases moram no CertAcessoPanel; aqui só entra o chrome do Dialog. Onde o
 * botão já está num modal, use o CertAcessoPanel inline em vez deste.
 */
export function CertAcessoModal({ certId, titular, open, onOpenChange }: {
  certId: string | null
  titular: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeaderIcon icon={ShieldCheck} color="violet">
          <DialogTitle>Acesso ao certificado</DialogTitle>
          <DialogDescription>{titular}</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody>
          <CertAcessoPanel
            certId={certId}
            titular={titular}
            active={open}
            reauthMode="inline"
            onCancel={() => onOpenChange(false)}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
