# Padrão de Cores e Tema

Como cor funciona neste projeto: **tokens semânticos** (a base clara/escura), a
**fonte única de cores de conceito** (`@/lib/color-styles.ts`) e a **cor de
módulo dinâmica** (`--mod-<slug>`). Vale para toda tela nova ou tocada. Referência
viva na UI: `/admin/design-system`.

---

## 1. Tokens semânticos de tema (a base)

Toda superfície/texto/borda **neutro** usa um token — nunca hex hardcoded (hex
quebra o dark). Os tokens são CSS vars declaradas em `@theme` no
`apps/web/src/app/globals.css` e redefinidas no bloco `.dark`; o Tailwind gera os
utilitários (`bg-card`, `text-foreground`, …) a partir delas.

| Papel | Utilitário | Token |
|---|---|---|
| Fundo do corpo | `bg-background` | `--color-background` |
| Texto principal | `text-foreground` | `--color-foreground` |
| Cartão / painel | `bg-card` | `--color-card` |
| Popover / dropdown | `bg-popover` | `--color-popover` |
| Ação primária | `bg-primary` / `text-primary` / `border-primary` | `--color-primary` (+ `-hover`, `-foreground`) |
| Secundário | `bg-secondary` | `--color-secondary` |
| Suave / desênfase | `bg-muted` / `text-muted-foreground` | `--color-muted` (+ `-foreground`) |
| Realce (hover de item) | `bg-accent` / `text-accent-foreground` | `--color-accent` |
| Perigo | `bg-destructive` / `text-destructive` | `--color-destructive` |
| Borda padrão | `border-border` | `--color-border` |
| **Divisória fininha** | `border-hairline` | `--color-hairline` |
| Campo de entrada | `border-input` | `--color-input` |
| Anel de foco | `ring-ring` | `--color-ring` |
| Sidebar | `bg-sidebar` / `border-sidebar-border` | `--color-sidebar` |

- **Regra:** `bg-muted/40`, `border-border`, `text-foreground` — **nunca**
  `bg-[#f8f9fa]`, `border-[rgba(0,0,0,0.08)]`. Para a divisória fininha que antes
  era `border-[rgba(0,0,0,0.08)]`, use **`border-hairline`** (no dark vira branca
  translúcida sozinha).
- **Inputs herdam o tema pelo `globals.css`** (regra global sem-camada de
  `input/textarea/select/[role=combobox]`): NÃO ponha `bg-*`/`border-*` no
  call-site de um campo — só layout (`h-`/`px-`/`rounded-`/`focus:ring`). Um
  combobox feito à mão (um `<button>` que abre um `Command`) precisa de
  `role="combobox"` para ser alcançado por essa regra.

### O mecanismo de tema (`.dark`) e as skins

- O tema é **claro/escuro** via classe **`.dark` no `<html>`**. O padrão segue o
  sistema operacional; a escolha do usuário persiste em `localStorage`. Um script
  inline no layout raiz aplica o tema **antes da pintura** (sem flash), inclusive
  nas telas de auth (fora do dashboard).
- **Skins de acento** (`data-skin` no `<html>`, painel "Configurações de layout")
  trocam a `--color-primary` (e no dark usam um tom clareado). Por isso **cor
  primária = sempre `bg-primary`/`text-primary`/var**, nunca um azul literal fixo
  — literal não acompanha a skin.

---

## 2. Cores de conceito — a fonte única `@/lib/color-styles.ts`

As cores **de conceito/acento** (status, ênfase, superfícies coloridas) vêm de
**um lugar só**: `apps/web/src/lib/color-styles.ts`. São **16 cores da casa**
(`ColorName`: emerald, rose, amber, sky, indigo, lime, violet, cyan, teal,
fuchsia, pink, orange, blue, red, purple, slate) × **8 papéis**, cada papel um
`Record<ColorName, string>` de **classes literais completas** (claro + `dark:`).

> **Safelist literal (Tailwind v4 CSS-first):** o JIT só gera a classe se o
> literal existir fisicamente num arquivo escaneado — **este arquivo É o
> safelist**. **NUNCA interpole** (`bg-${c}-50` não é enxergado). Cor/papel novo
> se adiciona aqui, como string literal.

### Os 8 papéis

| Papel | O que é | Base (shade) | Quando usar |
|---|---|---|---|
| `BADGE` | pastel **com** borda + texto | `-50/-200/-700` · dark `-950/30` | tag/badge de status **suave** |
| `PILL` | pastel **sem** borda + texto | `-100/-700` · dark `-900/30` | chip/pílula de seleção (borda pesaria) |
| `STRONG` | sólido/forte, borda + texto | `-100/-700` · dark `-900` sólido | status de **alta ênfase** (kanban, chamado) |
| `TEXT` | só texto colorido | `-600/-700` · dark `-400/-500` | texto/ícone colorido |
| `SURFACE` | fundo + borda, **sem texto** | `-50/-200` · dark `-950/30` | card/painel (texto neutro ou à parte) |
| `BORDER` | só a cor da borda | `-200` · dark `-800` | contorno (largura fica no layout) |
| `DOT` | bolinha sólida | `-500` | indicador pontual (legenda, status dot) |
| `FILL` | preenchimento de área | `-500` | barra de progresso / medidor / faixa |

**Fronteiras que confundem:**
- `BADGE` × `STRONG` × `SURFACE`: decide-se por **intenção/ênfase**, não pelo
  shade claro. `STRONG` é só alta ênfase (dark **sólido** `-900`); status comum é
  `BADGE` mesmo que o claro coincida em `-100`. `SURFACE` não traz texto (combine
  com `TEXT` se precisar: `cn(SURFACE.sky, TEXT.sky)`).
- `BADGE`/`PILL`/`STRONG` **já trazem o texto** — não combine com `TEXT`.
- `DOT` (pontua) × `FILL` (preenche): mesmo tom hoje (`-500`), papéis à parte de
  propósito (podem divergir no futuro).
- Os shades são **base ajustável** pela validação na UI, não regra canônica — um
  papel pode diferir por cor sem virar "exceção".

**Consumo:** o objeto devolve **só as classes de cor**; forma/espaçamento/largura
de borda ficam na string de layout.
```tsx
import { BADGE, TEXT } from '@/lib/color-styles'
<span className={cn('inline-flex px-2 py-0.5 rounded-full border', BADGE.emerald)}>ok</span>
<p className={cn('text-sm font-medium', TEXT.rose)}>erro</p>
```

**O que o helper NÃO cobre (de propósito):**
- **Cor de AÇÃO (botões)** → use as variants do `<Button>` (`default` = primária,
  `soft`, `soft-success/-warning/-info/-destructive`, `outline-*`) e
  `DialogHeaderIcon color=`. Não pinte botão com o helper.
- **Hex para gráfico / estilo inline** (Recharts `fill`, SVG, `color-mix`) → mapa
  `*_COR` (hex) local no módulo. O Tailwind não deriva classe de hex em runtime.

---

## 3. Modelo de duas camadas

- **Camada 1 — `color-styles.ts`:** "como cada cor se parece", por papel (acima).
- **Camada 2 — o módulo:** cada módulo mapeia seu **CONCEITO → `ColorName`** e
  **deriva** do helper, em vez de repetir literais.

```tsx
// <modulo>/_lib/<conceito>-styles.ts
const AREA_TONE: Record<string, ColorName> = { Fiscal: 'indigo', Contábil: 'violet', ... }
<div className={cn('rounded-md border p-3', SURFACE[areaTone], TEXT[areaTone])} />
```

Regras da Camada 2:
- Conceito do módulo → escolhe uma `ColorName`.
- Precisa de cor/papel **novo e reutilizável** → **promove** pro `color-styles.ts`.
- Cor genuinamente **one-off** do módulo → literal local **documentado, com `dark:`**.
- Mantém `*_COR` (hex) só para gráfico/estilo inline.

---

## 4. Cor de módulo dinâmica (`--mod-<slug>`)

Cada bloco/módulo tem uma cor **editável** em `/admin/design-system → Tokens &
cores`, persistida em `module_colors` e injetada como CSS var em `:root` pelo
`ModuleColorsProvider`. Defaults em `DEFAULT_MODULE_COLORS`
(`apps/api/src/theme/theme.service.ts` + **mirror** em
`apps/web/src/components/theme/module-colors.tsx`). Slugs e mapa cor↔bloco em
`docs/MODULOS.md`.

**Consumo:**
```tsx
// CSS var (preferencial) — segue a cor editável
const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'
// Hook (quando precisa do hex puro, ex.: Recharts)
import { useModuleColor } from '@/components/theme/module-colors'
const cor = useModuleColor('cadastros')
```
**Nunca** um hex estático (`const MODULE_COLOR = '#10b981'`): quando o admin troca
a cor, o literal fica na cor velha. Cor nova de módulo = adicionar em
`DEFAULT_MODULE_COLORS` (backend **e** mirror do front).

### O retint `.mod-<slug>`

Cada página roda sob `body.mod-<slug>` (aplicado por `use-module-scope.ts`
conforme a rota, via `resolveSlug`). O `globals.css` então **retinge** os
utilitários da **cor daquele módulo** para `var(--mod-<slug>)` — tanto os shades
claros quanto os `dark:`. Ex.: em `/clientes` (`.mod-cadastros`, emerald),
`bg-emerald-50/100`, `text-emerald-600/700`, `dark:bg-emerald-950/30` etc. viram o
tom do módulo. Cores que **não** são a do módulo não retingem.

### Regra de INTENÇÃO (o que decide o mecanismo)

1. **É a cor do MÓDULO** (acento/CTA/header que combina com a identidade da tela)
   → use a **variável** `var(--mod-<slug>)` / `useModuleColor` **explícita**.
   Nunca conte só com "o retint vai pegar".
2. **É uma cor de conceito predefinida** (status/ênfase/superfície com par
   light/dark) → use o **helper** (`TEXT`/`BADGE`/…), **mesmo que por coincidência
   seja a cor-base do módulo** naquela página (o retint pegar é efeito colateral
   aceito). Sob retint, `STRONG` e `BADGE` da cor do módulo renderizam iguais (o
   tom do módulo) — tudo bem.
3. **Componente central que só aceita paleta fixa** e você precisa da cor do
   módulo → **estenda o componente** para aceitar a var (ex.: `accentColor?:
   string` no `DialogHeaderIcon`), não force um `color="indigo"` torcendo pro
   retint.

**Hex inline que É cor de módulo** (`style={{ color: '#8b5cf6' }}`) → troque pela
**var**. **Classe Tailwind** da cor do módulo (`bg-sky-500`) já é dinâmica via
retint → fica. **Hex de status** (verm/verde/âmbar que não é a cor do módulo) →
continua `*_COR` inline.

---

## 5. Receitas

**Dar dark a algo que não tem:**
1. Tenta **token semântico** (`bg-card`, `text-foreground`, `border-border`,
   `bg-muted`, `border-hairline`).
2. Se é cor de conceito → **aplica o helper** (isso já centraliza; não adicione um
   `dark:` literal solto).
3. Hex/rgba hardcoded → token (ou `border-hairline` na divisória fininha).

**Corrigir baixo contraste:** garanta os 3 pares (bg/border/text) com `dark:`; o
texto colorido sobe para `-400`/`-200` no dark; **nunca** texto colorido sem par
dark; evite `text-muted-foreground` dentro de bloco colorido. Ambíguo de
shade/contraste → decidir na validação da UI, não chutar.

**Trava de CI:** `pnpm check:prose` (classe `prose` proibida) e o guard de grep de
badge literal fora do `color-styles.ts`.
