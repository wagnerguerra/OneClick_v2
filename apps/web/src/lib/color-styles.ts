/**
 * Cores de CONCEITO / acento do sistema (claro + escuro) — fonte única.
 *
 * Um export nomeado por PAPEL (BADGE / STRONG / TEXT / SURFACE / BORDER / DOT),
 * cada um um `Record<ColorName, string>`. A ordem `PAPEL.cor` espelha o Tailwind
 * (`bg-emerald`, `text-rose`): `BADGE.emerald`, `TEXT.rose`, `SURFACE[cor]`.
 * Importe só os papéis que usar: `import { BADGE, TEXT } from '@/lib/color-styles'`
 * (ou `import * as tone from ...` para todos numa linha).
 *
 * Por quê: as mesmas "cores de etiqueta" (fundo pastel + texto + borda, com o par
 * `dark:`) estavam copiadas à mão em dezenas de telas — muitas SEM o `dark:`, o
 * que quebrava o tema escuro. Aqui elas vivem UMA vez.
 *
 * Tailwind v4 é CSS-first (sem `tailwind.config`; `@source` em globals.css) e o JIT
 * só gera a classe se o literal existir fisicamente num arquivo escaneado → **este
 * arquivo É o safelist**. Por isso as strings são LITERAIS COMPLETAS. NUNCA
 * interpole (`bg-${c}-50` NÃO é enxergado pelo JIT).
 *
 * Modelo de duas camadas:
 *  - Camada 1 (aqui): "como cada cor se parece", por papel.
 *  - Camada 2 (nos módulos): cada módulo mapeia seu CONCEITO → ColorName e deriva
 *    daqui — não repete literais. Ex.:
 *      const AREA_TONE: Record<string, ColorName> = { Fiscal: 'indigo', ... }
 *      <div className={cn('...layout...', SURFACE[areaTone])} />
 *
 * O objeto devolve SÓ as classes de COR; forma/espaçamento/`border` (largura)
 * ficam na string de layout do próprio elemento.
 *
 * Não cobre (de propósito):
 *  - Cor de AÇÃO (botões) → use as variants do <Button> (`soft-success`, etc.).
 *  - Gráficos / estilo inline que precisa de hex → mapa `*_COR` (hex) no módulo
 *    (o Tailwind não deriva classe a partir de hex em runtime).
 */

export type ColorName =
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'sky'
  | 'indigo'
  | 'lime'
  | 'violet'
  | 'cyan'
  | 'fuchsia'
  | 'orange'
  | 'blue'
  | 'red'
  | 'purple'
  | 'slate'

/** Etiqueta pastel: fundo + texto + borda (claro + escuro). */
export const BADGE: Record<ColorName, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  sky: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800',
  lime: 'bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-950/30 dark:text-lime-400 dark:border-lime-800',
  violet: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-800',
  fuchsia: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/30 dark:text-fuchsia-400 dark:border-fuchsia-800',
  orange: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800',
  blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
  purple: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800',
  slate: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700',
}

/**
 * Etiqueta FORTE/sólida: fundo + texto + borda, mais saturada que a BADGE
 * (fundo `-100`/`-900` sólido no dark). Para status de alta ênfase (kanban,
 * pílulas de estado do chamado). Difere da BADGE (pastel `-50`) só na saturação.
 */
export const STRONG: Record<ColorName, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700',
  rose: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900 dark:text-rose-200 dark:border-rose-700',
  amber: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700',
  sky: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900 dark:text-sky-200 dark:border-sky-700',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900 dark:text-indigo-200 dark:border-indigo-700',
  lime: 'bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-900 dark:text-lime-200 dark:border-lime-700',
  violet: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900 dark:text-violet-200 dark:border-violet-700',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900 dark:text-cyan-200 dark:border-cyan-700',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900 dark:text-fuchsia-200 dark:border-fuchsia-700',
  orange: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700',
  blue: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700',
  red: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-200 dark:border-red-700',
  purple: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700',
  slate: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600',
}

/** Texto colorido (claro -600 / escuro -400). */
export const TEXT: Record<ColorName, string> = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  rose: 'text-rose-600 dark:text-rose-400',
  amber: 'text-amber-600 dark:text-amber-400',
  sky: 'text-sky-600 dark:text-sky-400',
  indigo: 'text-indigo-600 dark:text-indigo-400',
  lime: 'text-lime-600 dark:text-lime-400',
  violet: 'text-violet-600 dark:text-violet-400',
  cyan: 'text-cyan-600 dark:text-cyan-400',
  fuchsia: 'text-fuchsia-600 dark:text-fuchsia-400',
  orange: 'text-orange-600 dark:text-orange-400',
  blue: 'text-blue-600 dark:text-blue-400',
  red: 'text-red-600 dark:text-red-400',
  purple: 'text-purple-600 dark:text-purple-400',
  slate: 'text-slate-600 dark:text-slate-400',
}

/** Superfície suave: fundo + borda, SEM texto (cards / pílulas). */
export const SURFACE: Record<ColorName, string> = {
  emerald: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800',
  rose: 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800',
  amber: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
  sky: 'bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800',
  indigo: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800',
  lime: 'bg-lime-50 border-lime-200 dark:bg-lime-950/30 dark:border-lime-800',
  violet: 'bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-800',
  cyan: 'bg-cyan-50 border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-800',
  fuchsia: 'bg-fuchsia-50 border-fuchsia-200 dark:bg-fuchsia-950/30 dark:border-fuchsia-800',
  orange: 'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800',
  blue: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
  red: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',
  purple: 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800',
  slate: 'bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700',
}

/** Cor da borda apenas (a largura `border`/`border-2` fica no layout). */
export const BORDER: Record<ColorName, string> = {
  emerald: 'border-emerald-200 dark:border-emerald-800',
  rose: 'border-rose-200 dark:border-rose-800',
  amber: 'border-amber-200 dark:border-amber-800',
  sky: 'border-sky-200 dark:border-sky-800',
  indigo: 'border-indigo-200 dark:border-indigo-800',
  lime: 'border-lime-200 dark:border-lime-800',
  violet: 'border-violet-200 dark:border-violet-800',
  cyan: 'border-cyan-200 dark:border-cyan-800',
  fuchsia: 'border-fuchsia-200 dark:border-fuchsia-800',
  orange: 'border-orange-200 dark:border-orange-800',
  blue: 'border-blue-200 dark:border-blue-800',
  red: 'border-red-200 dark:border-red-800',
  purple: 'border-purple-200 dark:border-purple-800',
  slate: 'border-slate-200 dark:border-slate-700',
}

/** Bolinha / indicador sólido. */
export const DOT: Record<ColorName, string> = {
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  indigo: 'bg-indigo-500',
  lime: 'bg-lime-500',
  violet: 'bg-violet-500',
  cyan: 'bg-cyan-500',
  fuchsia: 'bg-fuchsia-500',
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  slate: 'bg-slate-500',
}
