export function toISODate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + amount)
  return next
}

export function weekDays(reference: Date) {
  const start = addDays(reference, -reference.getDay())
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export function formatDateTitle(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(date)
}

export function formatShortWeekday(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
    .format(date)
    .replace('.', '')
}

export function sameDay(a: Date, b: Date) {
  return toISODate(a) === toISODate(b)
}

export function formatTime(value?: string | null) {
  return value ? value.slice(0, 5) : ''
}
