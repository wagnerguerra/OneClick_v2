// Campos de DATA e HORA que abrem os seletores NATIVOS do Android
// (calendário e relógio) via @react-native-community/datetimepicker.
//
// Mantêm o mesmo "contrato" dos inputs de texto antigos: a data trafega como
// string 'yyyy-MM-dd' e a hora como 'HH:MM' — então o schema/zod do form não muda.
// Visual espelha o componente Input (h-11, borda, bg-card) pra consistência.

import { Ionicons } from '@expo/vector-icons'
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { Pressable, View } from 'react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { fromISODate, toISODate, formatDiaMesExtenso } from '@/features/agenda/date'

/** Converte 'HH:MM' numa Date de hoje com aquele horário (pro picker). */
function horaParaDate(hhmm: string): Date {
  const base = new Date()
  const [h, m] = hhmm.split(':').map((x) => Number(x))
  base.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0)
  return base
}

/** Formata uma Date pra 'HH:MM' (24h). */
function dateParaHora(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

const CAMPO = 'h-11 flex-row items-center justify-between rounded-md border border-border bg-card px-3 active:opacity-80'

/** Campo de DATA — abre o calendário nativo. Valor: 'yyyy-MM-dd'. */
export function DateField({
  value,
  onChange,
  placeholder = 'Selecionar data',
}: {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
}) {
  const temValor = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const label = temValor
    ? `${formatDiaMesExtenso(fromISODate(value))} de ${value.slice(0, 4)}`
    : placeholder

  function abrir() {
    DateTimePickerAndroid.open({
      value: temValor ? fromISODate(value) : new Date(),
      mode: 'date',
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(toISODate(date))
      },
    })
  }

  return (
    <Pressable accessibilityRole="button" onPress={abrir} className={CAMPO}>
      <Text className={cn('text-base', temValor ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
      </Text>
      <Ionicons name="calendar-outline" size={18} color="#94a3b8" />
    </Pressable>
  )
}

/** Campo de HORA — abre o relógio nativo (24h). Valor: 'HH:MM'. */
export function TimeField({
  value,
  onChange,
  placeholder = '--:--',
}: {
  value: string
  onChange: (hhmm: string) => void
  placeholder?: string
}) {
  const temValor = /^\d{1,2}:\d{2}$/.test(value)

  function abrir() {
    DateTimePickerAndroid.open({
      value: temValor ? horaParaDate(value) : new Date(),
      mode: 'time',
      is24Hour: true,
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(dateParaHora(date))
      },
    })
  }

  return (
    <Pressable accessibilityRole="button" onPress={abrir} className={CAMPO}>
      <Text
        className={cn('text-base', temValor ? 'text-foreground' : 'text-muted-foreground')}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {temValor ? value : placeholder}
      </Text>
      <Ionicons name="time-outline" size={18} color="#94a3b8" />
    </Pressable>
  )
}
