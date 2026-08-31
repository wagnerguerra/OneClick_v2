'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Button, Input, cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { Ban, Loader2, Info } from 'lucide-react'

/**
 * Modal único de inativação de cliente(s) (#HLP0209/0211). Serve tanto para uma
 * linha/detalhe (`count = 1`) quanto para o lote (`count > 1`).
 *
 * - Data de saída é OPCIONAL: só se preenche quando o cliente está virando
 *   ex-cliente. Um prospect que nunca foi cliente não tem saída — a interface
 *   deixa isso explícito.
 * - Motivo é opcional e vai só para o histórico (não é coluna do cliente).
 * - No lote, avisa que a MESMA data e o MESMO motivo (se informados) valem para
 *   todos os selecionados.
 */
export function InativarClienteModal({
  open, count, nome, initialDataSaida = '', onOpenChange, onConfirm,
}: {
  open: boolean
  count: number
  nome?: string
  /** Pré-preenche a data de saída (ex.: gatilho vindo do campo "Data de saída"). */
  initialDataSaida?: string
  onOpenChange: (o: boolean) => void
  onConfirm: (dataSaida: string, motivo: string, programadaPara: string | null) => Promise<void>
}) {
  const [dataSaida, setDataSaida] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  // Quando inativar: agora ou no dia marcado. O offboarding quase sempre chega
  // com data futura — a rescisão é avisada hoje, o cliente sai no fim do mês.
  const [quando, setQuando] = useState<'imediata' | 'programada'>('imediata')
  const [dataProgramada, setDataProgramada] = useState('')

  // Ao abrir, começa com a data inicial (vazia por padrão = sem saída) e motivo limpo.
  useEffect(() => {
    if (!open) return
    setDataSaida(initialDataSaida)
    setMotivo('')
    setQuando('imediata')
    setDataProgramada(initialDataSaida)
  }, [open, initialDataSaida])

  const lote = count > 1
  const programada = quando === 'programada'
  const faltaData = programada && !dataProgramada

  async function confirmar() {
    setSalvando(true)
    try {
      await onConfirm(dataSaida, motivo.trim(), programada ? dataProgramada : null)
      onOpenChange(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!salvando) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeaderIcon icon={Ban} color="amber">
          <DialogTitle className="text-[15px]">{lote ? 'Inativar clientes' : 'Inativar cliente'}</DialogTitle>
          <DialogDescription className="text-[11px]">
            {lote
              ? `${count} clientes serão inativados. Eles saem da lista de ativos, mas continuam na base (visíveis pelo filtro "Inativo").`
              : `"${nome}" será inativado. Ele sai da lista de ativos, mas continua na base (visível pelo filtro "Inativo").`}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          {/* Quando — a escolha vem antes de tudo porque muda o significado dos
              campos abaixo: numa, a data é registro do que já aconteceu; na
              outra, é o gatilho do que vai acontecer. */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-foreground">Quando inativar</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { valor: 'imediata' as const, titulo: 'De imediato', detalhe: 'Sai da lista de ativos agora' },
                { valor: 'programada' as const, titulo: 'Em uma data', detalhe: 'Continua ativo até o dia marcado' },
              ]).map(op => (
                <button
                  key={op.valor}
                  type="button"
                  onClick={() => setQuando(op.valor)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    quando === op.valor
                      ? 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30'
                      : 'border-border hover:bg-muted/60',
                  )}
                >
                  <span className="block text-[13px] font-semibold text-foreground">{op.titulo}</span>
                  <span className="block text-[11px] text-muted-foreground">{op.detalhe}</span>
                </button>
              ))}
            </div>
          </div>

          {programada ? (
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground">Data da inativação <span className="text-rose-500">*</span></label>
              <Input
                type="date"
                value={dataProgramada}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => setDataProgramada(e.target.value)}
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                O cliente continua <strong>ativo</strong> até lá — o time segue com acesso ao que ainda precisa
                entregar. No dia, o sistema inativa e avisa as áreas que não registraram a data de encerramento
                do serviço.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground">Data de saída <span className="font-normal text-muted-foreground">(opcional)</span></label>
              <Input type="date" value={dataSaida} onChange={e => setDataSaida(e.target.value)} className="h-9 text-sm" />
              <p className="text-[11px] text-muted-foreground">Só informe quando o cliente está virando <strong>ex-cliente</strong>. Um prospect que nunca chegou a ser cliente não tem data de saída — deixe em branco.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-foreground">Motivo <span className="text-rose-500">*</span></label>
            <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: encerrou atividades, migrou de contador..." className="h-9 text-sm" />
            <p className="text-[11px] text-muted-foreground">Obrigatório — fica registrado no histórico do cliente.</p>
          </div>
          {lote && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {programada
                  ? <>A mesma <strong>data de inativação</strong> e o mesmo <strong>motivo</strong> serão agendados para os {count} clientes selecionados.</>
                  : <>A mesma <strong>data de saída</strong> e o mesmo <strong>motivo</strong> (se informados) serão aplicados aos {count} clientes selecionados.</>}
              </span>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button variant="warning" size="sm" onClick={confirmar} disabled={salvando || !motivo.trim() || faltaData}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            {programada ? 'Agendar inativação' : 'Inativar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
