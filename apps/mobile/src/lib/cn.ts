import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Junta classes NativeWind/Tailwind resolvendo conflitos (igual ao web). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
