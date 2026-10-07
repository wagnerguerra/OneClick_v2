# Padrão de Cores e Tema

Como cor funciona neste projeto: **tokens semânticos** (a base clara/escura), a
**cor primária** do sistema (conteúdo, ações, destaques), a **fonte única de cores
de conceito** (`@/lib/color-styles.ts`) e a **cor de módulo**, que é só um
indicador de módulo numa lista fechada de lugares. Vale para toda tela nova ou
tocada — por pessoas ou por qualquer ferramenta de IA.

**Referência viva na UI: `/admin/design-system`** (master). Lá estão os exemplos
ao vivo e as tabelas que este doc NÃO repete (cor por ação nos modais, variantes
de botão, KPIs, abas, cabeçalhos). Na dúvida, o Design System vence; este doc
explica o porquê e as regras que atravessam todas as telas.

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
| Primária (sólida) | `bg-primary` + `text-primary-foreground` | `--color-primary` (+ `-hover`, `-foreground`) |
| Primária como texto/ícone/linha | `text-primary-on-surface` / `border-primary-on-surface` | `--color-primary-on-surface` |
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
  `bg-[#f8f9fa]`, `border-[rgba(0,0,0,0.08)]`. Para a divisória fininha use
  **`border-hairline`** (no dark vira branca translúcida sozinha).
- **Fora de classe** (Recharts `fill`/`stroke`, SVG, `style` inline): use
  **`var(--color-<token>)`** — ex.: `var(--color-border)`,
  `var(--color-muted-foreground)`. **Nunca** os nomes antigos do shadcn
  (`var(--border)`, `hsl(var(--muted-foreground))`): não existem neste projeto e
  caem no preto (rótulo ilegível no dark).

### O mecanismo de tema (`.dark`) e as skins

- O tema é **claro/escuro** via classe **`.dark` no `<html>`**. O padrão segue o
  sistema operacional; a escolha do usuário persiste em `localStorage`. Um script
  inline no layout raiz aplica o tema **antes da pintura** (sem flash).
- **Skins de acento** (`data-skin` no `<html>`, painel "Configurações de layout")
  trocam a `--color-primary` (e no dark usam um tom clareado). Por isso **cor
  primária = sempre `*-primary` / `var(--color-primary)`**, nunca um azul literal
  — literal não acompanha a skin.
- **Transição de tema:** nunca `transition-all` num container só para animar
  margem/opacidade — ele anima a `color` herdada e o texto "atrasa" ao trocar o
  tema. Escope: `transition-[margin]`, `transition-opacity`, etc.

---

## 2. A cor primária — cor do conteúdo

Tudo que é **destaque, ação ou identidade da tela** usa a primária. Ela segue o
tema e a skin.

| Uso | Classe / valor |
|---|---|
| Fundo sólido (botão, pill ativa, chip selecionado) | `bg-primary text-primary-foreground` (o `<Button>` padrão já é isso) |
| Texto, ícone, link, valor em destaque, aba ativa sobre card/página | **`text-primary-on-surface`** (`border-primary-on-surface` no sublinhado) |
| Tint / seleção / KPI de identidade | `bg-primary/10` (borda `border-primary/20…/50`) + texto `text-primary-on-surface` |
| Inline / SVG / gráfico (preenchimento) | `var(--color-primary)`; texto inline: `var(--color-primary-on-surface)` |
| Capa/hero de detalhe | gradiente/tint de `var(--color-primary)` (ver `docs/PADRAO_PAGINAS.md` §3.2) |

- **`text-primary` puro NÃO serve para texto sobre superfície:** é escuro demais
  no dark. Texto/ícone/link na primária = **`text-primary-on-surface`**.
- **`style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}` num
  `<Button>` é redundante** — o default já é isso. Use o `<Button>` puro.
- Componentes centrais têm a primária como **default** (`DialogHeaderIcon`,
  `Button`, `Checkbox`, `TabsTrigger variant="sliding"`): não passe cor para
  obter a primária; só passe quando quiser **outra** cor com significado.

---

## 3. Cores com significado (semânticas)

Cor que **codifica um estado ou resultado** não é decoração — mantém a cor do
significado em qualquer tela:

- **Verde = concluído / positivo.**
  - Botão que **conclui** a ação (Salvar, Criar/Adicionar no rodapé, Confirmar,
    Atualizar, Registrar, Aplicar, Importar, Aprovar, Concluir, Copiar) →
    `variant="success"` — **mesmo dentro de modal cujo ícone é de outra cor**
    (ex.: modal de editar com ícone sky e "Salvar" verde).
  - Botão que **só abre** algo ("+ Novo…", "Nova manutenção", "Enviar arquivo" que
    abre o seletor) → `<Button>` padrão (primária).
  - Barra de progresso (e o % dela) → `FILL.emerald` / `TEXT.emerald`.
    Gráfico de barra horizontal (ranking, distribuição) **não** é barra de
    progresso: fica na primária.
  - Toggle ligado com sentido positivo → `<Switch variant="success" />`.
  - "Enviar" (mensagem/e-mail) e botões que filtram/navegam **não** são verdes.
- **Vermelho = destrutivo.**
  - Item de menu destrutivo → `text-destructive focus:text-destructive` (sem o
    `focus:` o item perde o vermelho no hover). Nunca `TEXT.rose`/`text-red-*`.
  - Confirmação (`alerts.confirm`, `@/lib/alerts`) → `destructive: true` quando a
    ação é destrutiva (excluir, remover, apagar, revogar, desvincular, limpar
    dados) **ou** quando o gatilho que abre o Swal é vermelho (variant
    `destructive`/`soft-destructive`, `text-destructive`, ícone/texto vermelho —
    inclusive só no hover). **Arquivar nunca é destrutivo.** Se a mesma função
    atende gatilhos vermelhos e neutros, o flag vai por parâmetro, só no vermelho.
    `alerts.confirmDelete(nome)` já é o atalho de "excluir".
- **Âmbar = atenção / aviso**, **sky = informação**, e os status de cada domínio
  vêm do mapa de status do módulo (Camada 2, abaixo) — não de uma cor escolhida
  "para combinar" com a tela.
- **Cor por ação nos modais** (ícone do `DialogHeaderIcon` + botão de
  confirmação): tabela única em `/admin/design-system` → aba **Modais** → "Quando
  usar cada cor". Não copie a tabela.

---

## 4. Cores de conceito — a fonte única `@/lib/color-styles.ts`

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
| `PILL` | pastel **sem** borda + texto | `-100/-700` · dark `-900/30` | chip/pílula (borda pesaria) |
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
- `<Badge>` do `@saas/ui` com helper: `variant="outline"` (o neutro).
- Os shades são **base ajustável** pela validação na UI, não regra canônica.

**Consumo:** o objeto devolve **só as classes de cor**; forma/espaçamento/largura
de borda ficam na string de layout.
```tsx
import { BADGE, TEXT } from '@/lib/color-styles'
<span className={cn('inline-flex px-2 py-0.5 rounded-full border', BADGE.emerald)}>ok</span>
<p className={cn('text-sm font-medium', TEXT.rose)}>erro</p>
```

**Critério de migração para o helper = INTENÇÃO, não shade exato.** Um par
light+dark de cor de conceito (`text-<c>-600 dark:text-<c>-400`, pastel, sólido,
superfície) vai para o papel correspondente mesmo que o tom não bata exatamente.
Dar dark e centralizar é **um passo só**: se falta o par dark e a cor casa um
papel, aplique o helper — não adicione um `dark:` literal solto.

**O que o helper NÃO cobre (de propósito):**
- **Cor de AÇÃO (botões)** → variants do `<Button>` (`default` = primária,
  `success`, `destructive`, `warning`, `soft-*`, `outline-*`). Não pinte botão com
  o helper nem com `bg-*`/`style`.
- **Hex para gráfico / estilo inline** (Recharts `fill`, SVG, `color-mix`) → mapa
  `*_COR` (hex) local no módulo.

---

## 5. Modelo de duas camadas

- **Camada 1 — `color-styles.ts`:** "como cada cor se parece", por papel.
- **Camada 2 — o módulo:** cada módulo mapeia seu **CONCEITO → `ColorName`** e
  **deriva** do helper (ex.: `STATUS_TONE: Record<Status, ColorName>`), em vez de
  repetir literais. Status de domínio compartilhado com o backend fica no
  `@saas/types` (ex.: `CONTRATO_STATUS_COLORS`) — fonte única tipada pelo enum.

Regras da Camada 2:
- Conceito do módulo → escolhe uma `ColorName`.
- Precisa de cor/papel **novo e reutilizável** → **promove** pro `color-styles.ts`.
- Cor genuinamente **one-off** → literal local **documentado, com `dark:`**.
- `*_COR` (hex) só para gráfico/estilo inline.

---

## 6. Cor de módulo — só indicador, lista fechada

Cada bloco da sidebar tem uma cor **editável** em `/admin/design-system → Tokens
& cores`, persistida em `module_colors` e injetada como CSS var (`--mod-<slug>`)
em `:root` pelo `ModuleColorsProvider`. Defaults em `DEFAULT_MODULE_COLORS`
(`apps/api/src/theme/theme.service.ts` + mirror em
`apps/web/src/components/theme/module-colors.tsx`). Slugs em `docs/MODULOS.md`.

**A cor do módulo NÃO é cor de conteúdo.** Ela só identifica o módulo, e aparece
**somente** em:

1. a **sidebar**;
2. os **widgets do dashboard** (ícone por módulo);
3. o **FAQ** (cor do artigo/tópico pelo módulo que ele documenta);
4. os **grupos de permissão** em `/usuarios` (aba Permissões / Permissões em massa);
5. os **nós do editor de fluxo** de Serviços (por área).

Nesses lugares ela vem **sempre da var** (`var(--mod-<slug>, #fallback)`,
`useModuleColor`, `groupColorVar`/`groupModuleColorVar` em `navigation.ts`) —
nunca hex nem classe da hue do módulo.

- **Proibido** usá-la em botões, abas, links, KPIs, badges, barras, capas,
  avatares, ícones de tela, cabeçalhos — tudo isso é a **primária** (§2) ou uma
  cor com significado (§3).
- **Não acrescente lugares** à lista sem aprovação explícita. Algo novo que seja
  agrupado/listado **por módulo** *pode* ser sugerido para derivar de
  `--mod-<slug>` — só aplicar com permissão.
- Não existe mais retint (`.mod-<slug>`): nenhuma classe da hue do módulo é
  "convertida" sozinha. O que for escrito é o que aparece.
- **Cor nova de módulo:** adicionar em `DEFAULT_MODULE_COLORS` (backend **e**
  mirror do front) e no mapa da sidebar.

**Ao tocar uma tela antiga:** uma cor que é a hue-padrão do módulo daquela tela
usada como identidade/decoração → troque pela primária. Mas confira a
**intenção**: se era verde de progresso/conclusão, é semântico (§3) e fica verde.
Cor que não é a hue de módulo nenhum ali (acento distinto de propósito) fica.

---

## 7. Campos de formulário

- **Inputs herdam o tema pelo `globals.css`** (regra base de
  `input/textarea/select/[role=combobox]`): **NÃO** ponha `bg-*` nem
  `border`/`border-*` num `<input>`, `<textarea>`, `<select>`, `<Input>`,
  `<Textarea>` ou `<SelectTrigger>` — nem `bg-card`, `bg-background`,
  `bg-transparent`. Só layout (`h-`/`w-`/`px-`/`text-`/`rounded-`/`resize`).
  Um `bg-card` faz o campo destoar dos outros no dark.
- **Exceção:** borda de **erro de validação** (`border-destructive` condicional).
- **Combobox feito à mão** (um `<button>` que abre um `Command`) precisa de
  `role="combobox"` para ser alcançado pela regra base — e sem `bg-*`.
- Seletor de cor (`type="color"`) é swatch, não campo: pode ter borda própria.

---

## 8. Gráficos, tooltips e exceções de tema

- **Gráficos (Recharts):** série principal em `var(--color-primary)`; status por
  mapa `*_COR`; grade/eixo/rótulo com `var(--color-*)`. Tooltip de gráfico =
  `<Tooltip content={<ChartTooltip format={…} />} cursor={{ fill: CHART_CURSOR_FILL }} />`
  (`@/components/chart-tooltip`) — o `<Tooltip>` cru do Recharts é uma caixa
  branca que não segue o dark.
- **Tooltip do `@saas/ui` é INVERTIDO** (`bg-foreground text-background`): escuro
  no claro, claro no escuro. Cor dentro dele usa tom `-400` no claro e `-600` no
  `dark:` (não o helper `TEXT`, feito para superfície normal); neutro =
  `text-background/70`.
- **Documento / papel** (etiqueta, termo, prévia de impressão): cores claras
  **fixas** nos dois temas (`bg-white text-slate-900`) — é papel, não tela.
  Fac-símiles e páginas vistas por externos: perguntar antes de mexer.
- **Título sobre fundo colorido:** o CSS global pinta `h1/h2/h3` com
  `--color-foreground`; sobre faixa colorida ponha `text-white` (ou a cor certa)
  **no próprio título**.
- **Carve-outs que ficam como estão:** hex de status em gráfico/SVG, `dark:`
  condicional (`cond && 'dark:…'`), cor sólida de tom único que lê nos dois temas
  (ponto/ícone `-500`), glass de hero (`bg-white/15 backdrop-blur`), HTML de
  SweetAlert.

---

## 9. Receitas e travas

**Dar dark a algo que não tem:**
1. Tenta **token semântico** (`bg-card`, `text-foreground`, `border-border`,
   `bg-muted`, `border-hairline`).
2. Se é cor de conceito → **aplica o helper**.
3. Hex/rgba hardcoded → token (ou `border-hairline` na divisória fininha).

**Corrigir baixo contraste:** garanta os 3 pares (bg/border/text) com `dark:`;
texto colorido sobe para `-400`/`-200` no dark; **nunca** texto colorido sem par
dark; evite `text-muted-foreground` dentro de bloco colorido.

**Trava de CI:** `pnpm check:prose` (classe `prose` proibida — use `RichContent`).
