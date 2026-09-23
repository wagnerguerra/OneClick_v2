import { AlertTriangle } from 'lucide-react'
import { Input, Label, Checkbox, cn } from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import type { TreatmentDefinition } from '@saas/types'
import { ColumnSelect, ModeCards, EmptyHint, HelpTip } from '../ui'
import type { SetDef } from '../types'
import { soDigitos } from '../utils'

/** Colunas de JD do modelo que não estão no arquivo enviado (realce âmbar). */
export interface JurosDescontosFora { juros?: string; descontos?: string; unificada?: string }

/**
 * Conteúdo da etapa "Juros e Descontos". Controla o bloco opcional `jurosDescontos`
 * da definição: liga/desliga, modo (colunas separadas × coluna unificada com sinal),
 * seleção de coluna(s) e as duas contas contábeis (juros e descontos). O card e o
 * StepHeader ficam no editor (index.tsx); aqui só os campos.
 */
export function JurosDescontosSection({ def, setDef, headers, fora, samplesFor }: {
  def: TreatmentDefinition
  setDef: SetDef
  headers: string[]
  fora: JurosDescontosFora
  samplesFor: (col: string) => string[]
}) {
  const jd = def.jurosDescontos
  const upd = (patch: Partial<TreatmentDefinition['jurosDescontos']>) =>
    setDef((d) => ({ ...d, jurosDescontos: { ...d.jurosDescontos, ...patch } }))

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <Checkbox checked={jd.ativo} onCheckedChange={(v) => upd({ ativo: !!v })} className="mt-0.5" />
        <span>
          <span className="block text-[13px] font-semibold text-foreground">O documento traz valores de Juros/Descontos</span>
          <span className="block text-[11px] text-muted-foreground">
            {jd.ativo
              ? 'Cada valor de juros/desconto encontrado será um lançamento separado no arquivo SCI.'
              : 'Se não for o caso, deixe desmarcado para pular esta etapa.'}
          </span>
        </span>
      </label>

      {jd.ativo && (
        <>
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-foreground">Como esses valores aparecem no documento:</p>
            <ModeCards
              accent="indigo"
              value={jd.modo}
              options={[
                { value: 'UNIFICADA', label: 'Coluna única', hint: 'Uma coluna só; o sinal (+/−) diz se é juro ou desconto.' },
                { value: 'SEPARADAS', label: 'Colunas separadas', hint: 'Uma coluna de Juros e uma de Descontos.' },
              ]}
              onChange={(v) => upd({ modo: v as 'SEPARADAS' | 'UNIFICADA' })}
            />
          </div>

          {headers.length === 0 ? (
            <EmptyHint>Envie um arquivo de exemplo para listar as colunas.</EmptyHint>
          ) : jd.modo === 'SEPARADAS' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <CampoColuna label="Coluna de Juros" col={jd.colunaJuros} foraCol={fora.juros} headers={headers} samplesFor={samplesFor} onChange={(v) => upd({ colunaJuros: v })} />
              <CampoColuna label="Coluna de Descontos" col={jd.colunaDescontos} foraCol={fora.descontos} headers={headers} samplesFor={samplesFor} onChange={(v) => upd({ colunaDescontos: v })} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <CampoColuna label="Coluna de Juros/Descontos" col={jd.colunaUnificada} foraCol={fora.unificada} headers={headers} samplesFor={samplesFor} onChange={(v) => upd({ colunaUnificada: v })} />
              </div>
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                  Nessa coluna, qual sinal corresponde a Juros?
                  <HelpTip text="A coluna única sempre traz valores com sinal. O sinal escolhido aqui será classificado como Juros; o sinal oposto, como Desconto." />
                </p>
                <ModeCards
                  accent="indigo"
                  value={jd.sinalJuros}
                  options={[
                    { value: 'POSITIVO', label: 'Positivo = Juros', hint: 'Valores negativos serão Descontos.' },
                    { value: 'NEGATIVO', label: 'Negativo = Juros', hint: 'Valores positivos serão Descontos.' },
                  ]}
                  onChange={(v) => upd({ sinalJuros: v as 'POSITIVO' | 'NEGATIVO' })}
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Conta contábil de Juros <span className="text-destructive">*</span></Label>
              <Input className="h-9 text-sm" inputMode="numeric" value={jd.contaJuros} onChange={(e) => upd({ contaJuros: soDigitos(e.target.value) })} placeholder="Número da conta" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Conta contábil de Descontos <span className="text-destructive">*</span></Label>
              <Input className="h-9 text-sm" inputMode="numeric" value={jd.contaDescontos} onChange={(e) => upd({ contaDescontos: soDigitos(e.target.value) })} placeholder="Número da conta" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function CampoColuna({ label, col, foraCol, headers, samplesFor, onChange }: {
  label: string
  col: string
  foraCol?: string
  headers: string[]
  samplesFor: (col: string) => string[]
  onChange: (v: string) => void
}) {
  const samples = col ? samplesFor(col) : []
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px] font-semibold">{label} <span className="text-destructive">*</span></Label>
      <ColumnSelect headers={headers} value={col} onChange={onChange} className={foraCol ? 'border-amber-400 ring-1 ring-amber-400/40' : undefined} />
      {foraCol && (
        <p className={cn('flex items-center gap-1 text-[11px]', TEXT.amber)}>
          <AlertTriangle className="h-3 w-3 shrink-0" /> A coluna &quot;{foraCol}&quot; não está no arquivo enviado.
        </p>
      )}
      {samples.length > 0 && (
        <div className="text-[11px] text-muted-foreground/80">
          <span className="font-medium">Prévia de dados:</span>
          {samples.map((s, i) => <div key={i} className="truncate">{s}</div>)}
        </div>
      )}
    </div>
  )
}
