'use client'

/**
 * Construtor de expressão cron.
 *
 * Ninguém deveria precisar saber que `0 5 * * 1-5` quer dizer "às 5h, de segunda
 * a sexta" para agendar um job. O campo vira o que a pessoa tem na cabeça: uma
 * hora e os dias em que ela se repete.
 *
 * A expressão crua continua editável, e por um motivo concreto: cron faz coisas
 * que este construtor não cobre — a cada 15 minutos, no dia 1 de cada mês, de
 * duas em duas horas. Esconder o campo obrigaria a mexer no banco para
 * configurar o que o formato já sabe fazer. Quando a expressão sai do que o
 * construtor entende, ele se recolhe e diz isso, em vez de reescrevê-la por
 * cima e apagar o que alguém montou à mão.
 */

import { useMemo } from 'react'
import { Input, cn } from '@saas/ui'

const DIAS = [
  { n: 1, curto: 'Seg', longo: 'segunda' },
  { n: 2, curto: 'Ter', longo: 'terça' },
  { n: 3, curto: 'Qua', longo: 'quarta' },
  { n: 4, curto: 'Qui', longo: 'quinta' },
  { n: 5, curto: 'Sex', longo: 'sexta' },
  { n: 6, curto: 'Sáb', longo: 'sábado' },
  { n: 0, curto: 'Dom', longo: 'domingo' },
]

type Lido = {
  /** `false` quando a expressão usa recurso que o construtor não representa. */
  simples: boolean
  hora: string          // HH:MM
  dias: number[]        // vazio = todos os dias
}

/**
 * Lê a expressão para alimentar os controles.
 *
 * Só aceita o formato que sabe reconstruir sem perda: minuto e hora fixos,
 * qualquer dia do mês e do ano, e dias da semana como `*` ou lista de números.
 * Passo no minuto (a cada 15), intervalo com hífen ou `L` no dia caem em
 * `simples: false` — e aí os controles somem, em vez de mentir sobre o que
 * está agendado.
 */
function ler(expr: string): Lido {
  const partes = (expr || '').trim().split(/\s+/)
  if (partes.length !== 5) return { simples: false, hora: '', dias: [] }
  const [min, hora, diaMes, mes, diaSemana] = partes as [string, string, string, string, string]

  const numero = (v: string) => (/^\d{1,2}$/.test(v) ? Number(v) : null)
  const m = numero(min)
  const h = numero(hora)
  if (m === null || h === null || m > 59 || h > 23) return { simples: false, hora: '', dias: [] }
  if (diaMes !== '*' || mes !== '*') return { simples: false, hora: '', dias: [] }

  let dias: number[] = []
  if (diaSemana !== '*') {
    const lista = diaSemana.split(',')
    if (!lista.every(v => /^[0-6]$/.test(v))) return { simples: false, hora: '', dias: [] }
    dias = lista.map(Number)
  }

  return {
    simples: true,
    hora: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    dias,
  }
}

function escrever(hora: string, dias: number[]): string {
  const [h = '0', m = '0'] = (hora || '00:00').split(':')
  // A ordem da semana começa no domingo, como o cron espera — a lista da tela
  // começa na segunda porque é assim que se pensa em dia útil.
  const dow = dias.length === 0 || dias.length === 7
    ? '*'
    : [...dias].sort((a, b) => a - b).join(',')
  return `${Number(m)} ${Number(h)} * * ${dow}`
}

/** "às 05:00, de segunda a sexta" — o que a expressão significa, em português. */
function porExtenso(hora: string, dias: number[]): string {
  if (!hora) return ''
  if (dias.length === 0 || dias.length === 7) return `Todos os dias às ${hora}`
  const uteis = [1, 2, 3, 4, 5]
  const ehUteis = dias.length === 5 && uteis.every(d => dias.includes(d))
  if (ehUteis) return `De segunda a sexta, às ${hora}`
  const nomes = DIAS.filter(d => dias.includes(d.n)).map(d => d.longo)
  const lista = nomes.length > 1
    ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
    : nomes[0]
  return `Toda ${lista}, às ${hora}`
}

export function CampoCron({ valor, onChange, placeholder }: {
  valor: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  // Sem valor gravado, o construtor parte do padrão do campo — assim ele já
  // abre mostrando o que vai acontecer se ninguém mexer.
  const expr = valor || placeholder || '0 5 * * *'
  const lido = useMemo(() => ler(expr), [expr])

  function trocarHora(hora: string) {
    onChange(escrever(hora, lido.dias))
  }

  function alternarDia(n: number) {
    const dias = lido.dias.includes(n) ? lido.dias.filter(d => d !== n) : [...lido.dias, n]
    onChange(escrever(lido.hora || '05:00', dias))
  }

  return (
    <div className="space-y-2">
      {lido.simples ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="time"
              value={lido.hora}
              onChange={e => trocarHora(e.target.value)}
              className="h-9 w-[110px] text-sm"
            />
            <div className="flex flex-wrap gap-1">
              {DIAS.map(d => {
                // Nenhum dia marcado significa TODOS: é o `*` do cron. Mostrar
                // sete botões apagados sugeriria que nada roda.
                const ativo = lido.dias.length === 0 || lido.dias.includes(d.n)
                return (
                  <button
                    key={d.n}
                    type="button"
                    onClick={() => alternarDia(d.n)}
                    aria-pressed={ativo}
                    className={cn(
                      'h-9 min-w-[42px] rounded-lg border px-2 text-xs font-medium transition-colors',
                      ativo
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {d.curto}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {porExtenso(lido.hora, lido.dias)}
            <span className="ml-1.5 opacity-60">· {expr}</span>
          </p>
        </>
      ) : (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Expressão avançada — fora do que os controles representam. Edite abaixo.
        </p>
      )}

      {/* A expressão crua fica sempre à mão: é o que permite agendar o que o
          construtor não cobre, sem precisar de alguém no banco. */}
      <Input
        value={valor}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || '0 5 * * *'}
        className="h-9 font-mono text-xs"
      />
    </div>
  )
}
