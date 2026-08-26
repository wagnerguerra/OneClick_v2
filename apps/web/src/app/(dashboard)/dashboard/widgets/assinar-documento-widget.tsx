'use client'

import { useState } from 'react'
import { PenLine, ShieldCheck, Lock } from 'lucide-react'
import { Button, Card, CardContent } from '@saas/ui'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { AssinarPdfModal } from '../../ferramentas/_components/assinar-pdf-modal'

/**
 * Assinar documento — widget de botão.
 *
 * Não mostra número nenhum: existe para encurtar o caminho até a assinatura,
 * que antes exigia ir a Ferramentas e achar o utilitário no meio dos outros.
 * O modal é o MESMO de /ferramentas — uma tela de assinatura só, com um
 * caminho a mais para chegar nela; duas cópias divergiriam na primeira
 * correção.
 *
 * Assina com o certificado A1 já guardado na Gestão de Certificados, e por
 * isso depende de liberação explícita (sub-permissão `assinar`): quem tem o
 * botão assina em nome da empresa.
 */
export function AssinarDocumentoWidget({ canRead, title, bloco }: {
  canRead: boolean
  title?: string
  bloco?: string
}) {
  const titulo = title ?? 'Assinar Documento'
  const [aberto, setAberto] = useState(false)
  const { permissions, isMaster, isEmpresaMaster } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'ferramentas-gerais')
  const subs = (perm?.subPermissions ?? {}) as Record<string, boolean>
  const podeAssinar = isMaster || isEmpresaMaster || subs.assinar === true
  void bloco

  return (
    <>
      <Card className="@container/widget h-full overflow-hidden transition-shadow hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-3 p-4 @sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 @sm:h-10 @sm:w-10 dark:bg-emerald-900/20">
              <PenLine className="h-4 w-4 text-emerald-600 @sm:h-5 @sm:w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{titulo}</h3>
              <p className="truncate text-xs text-muted-foreground">Certificado A1 do cadastro</p>
            </div>
          </div>

          {!canRead || !podeAssinar ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Lock className="mt-px h-3.5 w-3.5 shrink-0" />
              Assinatura não liberada no seu perfil. Fale com o administrador — assinar usa o
              certificado da empresa.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Envie o PDF, marque onde a assinatura aparece e baixe o documento assinado.
              </p>
              <Button
                className="mt-auto w-full gap-1.5"
                onClick={() => setAberto(true)}
              >
                <PenLine className="h-4 w-4" />Assinar documento
              </Button>
              <p className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3" />PAdES — validade jurídica de assinatura digital
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {aberto && <AssinarPdfModal onClose={() => setAberto(false)} />}
    </>
  )
}
