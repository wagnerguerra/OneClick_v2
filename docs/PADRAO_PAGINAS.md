# Padrão de Páginas

Como se monta uma tela deste sistema. Não é teoria: cada regra aqui aponta para a
tela que já a implementa, e é essa tela que manda. Em dúvida, **abra a referência
e copie a estrutura** — divergir dela é que gera trabalho depois.

| Tipo de tela | Referência |
|---|---|
| Página inicial de módulo — **listagem em tabela** | `/clientes` |
| Página inicial de módulo — **kanban** | `/crm` e `/orcamentos` |
| Página de **detalhe** de um registro | `/clientes/[id]` (via `_components/cliente-form.tsx`) e `/orcamentos/[id]` |

> O módulo **Usuários** foi inteiramente alinhado a este documento em 26/08/2026 —
> listagem, detalhe e formulário. Serve como exemplo recente de aplicação.

Padrões vizinhos, que continuam valendo: [`PADRAO_MODULOS.md`](PADRAO_MODULOS.md)
(botões, variantes, tipografia), [`PADRAO_KANBAN_DND.md`](PADRAO_KANBAN_DND.md)
(mecânica do arrasto), [`PADRAO_RESPONSIVIDADE.md`](PADRAO_RESPONSIVIDADE.md)
(celular, tablet, notebook) e o `CLAUDE.md` (modais, tokens, cores de módulo).

---

## 1. Página inicial com tabela — referência `/clientes`

A ordem é sempre a mesma: **barra da página → filtros → card da tabela → rodapé**.

### 1.1 Barra da página
`<PageHeaderBar>` — nunca o `<PageHeader>` de capa sangrada, que é de detalhe.

```tsx
<PageHeaderBar
  className="mb-0 sm:mb-0"        {/* só quando o wrapper usa flex+gap — ver abaixo */}
  actions={<>
    {/* 1º a primária "+ Novo…", depois as secundárias, e o menu ⋮ por último */}
    <Button size="sm" asChild className="gap-1.5"><Link href="/clientes/new"><Plus className="h-4 w-4" />Novo Cliente</Link></Button>
    <Button variant="outline" size="sm" className="gap-1.5"><Settings2 className="h-4 w-4" />Opções</Button>
    <DropdownMenu>…<Button variant="outline" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>…</DropdownMenu>
  </>}
>
  <h1 className="truncate">Clientes</h1>
  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
    <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
    <span className="text-muted-foreground/50">›</span>
    <span>Cadastros</span>
    <span className="text-muted-foreground/50">›</span>
    <span>Clientes</span>
  </p>
</PageHeaderBar>
```

O `<h1>` vai **puro** (o estilo vem do global). A trilha é sempre
`Página inicial › Bloco › Módulo`. Subpágina acrescenta o próprio nome e ganha
`<BackButton>` como **último** item das ações.

#### A ordem das ações (09/09/2026)

**O botão "+ Novo…" é sempre o primeiro da esquerda.** É a ação que se usa todo
dia; ficava por último em nove telas, atrás de alternadores de visão, atalhos e
botões que se usam uma vez por semestre. Depois dele vêm as secundárias e, por
último, o menu `⋮` — que é onde mora tudo o que é raro (importações, varreduras,
configurações).

Botão primário usa o `variant` padrão do `Button` (o azul do tema). Não pinte a
ação principal com a cor do módulo: a cor do módulo é para barra de progresso,
checkbox e destaques internos, não para o botão que existe em todas as telas.

#### O espaçamento (`mb-0 sm:mb-0`)

A `PageHeaderBar` traz `mb-4 sm:mb-5` própria. Isso é o certo quando o wrapper
da página usa `space-y-*`: ali o container é bloco, as margens **colapsam** e o
espaço sai igual dos dois lados.

Quando o wrapper é `flex flex-col gap-*`, margens **não** colapsam e o `gap`
entra por cima — o espaço acima do primeiro bloco fica o dobro do que vem
depois. Nesses casos passe `className="mb-0 sm:mb-0"`, deixando o `gap` como
única fonte de espaçamento.

Na dúvida: se o wrapper tem `gap-`, use `mb-0 sm:mb-0`.

### 1.2 Filtros
Card colapsável com contador de filtros ativos e "Limpar". Fechado, a faixa
inteira é clicável para abrir. Regras: `flex flex-wrap` (quebra, não rola),
`setPage(1)` a cada mudança, e placeholder `__all__` nos selects.

### 1.3 Card da tabela
Um `<Card>` com três partes:

```tsx
<Card>
  {/* toolbar: quantos por página à esquerda, busca à direita */}
  <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">…</div>

  <Table>…</Table>   {/* o <Table> do @saas/ui já rola sozinho na horizontal */}

  {/* rodapé: contagem + paginação */}
  <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">…</div>
</Card>
```

- **Busca** com debounce de 400ms; **Exibir** com 10/20/50/100.
- **Uma linha de cabeçalho e uma linha por registro.** Sub-linha só quando o
  Wagner pedir; complemento vai inline na própria célula.
- **Ordenação** por coluna clicável, server-side, com o ícone indicando o sentido.
- **Ações** em dropdown `⋮` (`MoreVertical`), nunca botões soltos na linha.
- **Sem coluna Status** — situação é badge dentro da linha, gerenciada no form.
- **Colunas somem antes de espremer** (`hidden md:table-cell`); ordem de sacrifício
  em [`PADRAO_RESPONSIVIDADE.md`](PADRAO_RESPONSIVIDADE.md) §6.
- **Carregando** é spinner dentro da tabela; **vazio** é ícone + frase, no lugar da lista.

### 1.4 Paginação — referência `/clientes`

Duas metades, sempre no mesmo lugar: **"Exibir N registros" na barra de cima**,
**contagem e navegação no rodapé**.

```tsx
{/* toolbar, à esquerda da busca */}
<div className="flex items-center gap-2 text-xs text-muted-foreground">
  <span className="hidden sm:inline">Exibir</span>
  <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
    <SelectTrigger className="h-8 w-[68px] bg-card text-xs"><SelectValue /></SelectTrigger>
    <SelectContent>{[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
  </Select>
  <span className="hidden sm:inline">registros</span>
</div>

{/* rodapé do card */}
<div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
  <p className="text-xs text-muted-foreground">
    Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{total}</span> registros
  </p>
  {totalPages > 1 && (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
      <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
      {getPageNumbers().map(n => (
        <Button key={n} variant={n === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(n)}>{n}</Button>
      ))}
      <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
      <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
    </div>
  )}
</div>
```

Regras:

- **Opções fixas: 10 / 20 / 50 / 100.** Não invente outras.
- **No máximo 5 números**, centrados na página atual — a janela desliza:
  `start = max(1, page - 2)`, `end = min(totalPages, start + 4)`, e então
  `start = max(1, end - 4)` para a janela não encolher no fim da lista.
- **A navegação some quando só há uma página** (`totalPages > 1`). Setas
  desabilitadas numa lista de dez linhas são ruído.
- **Saltos para a primeira e a última** existem porque, com muitas páginas, ir
  do fim ao começo de um em um é trabalho.
- **Qualquer mudança de filtro, busca ou tamanho de página volta para a
  página 1.** Sem isso, filtrar estando na página 3 deixa a tabela vazia com o
  rodapé dizendo que há registros — e a pessoa conclui que o filtro quebrou.
- **"Selecionar todos" marca a página, não a lista inteira.** Marcar 500 itens
  dos quais 20 estão à vista, com uma ação em massa logo adiante, é o caminho
  curto para excluir o que ninguém viu.
- **Página vazia não some sozinha:** ao excluir o último registro de uma página,
  volte para a anterior.

**Server-side é o padrão** (`page`/`limit` no input, `total`/`totalPages` na
resposta) — é o que `/clientes` faz. Paginar no cliente só quando a lista já
vem inteira por outra razão legítima e o volume é pequeno (ex.: `/beneficios-fiscais`,
com algumas dezenas de vínculos e busca server-side). O rodapé é idêntico nos
dois casos; o que muda é de onde vêm `total` e a fatia.

---

## 2. Página inicial com kanban — referências `/crm` e `/orcamentos`

O kanban **não substitui** a lista: convive com ela.

### 2.1 Alternador
Dois botões (grade / lista) no fim da barra de ações, com a escolha em
`localStorage` (`crm-view-mode`, `orcamentos-view-mode`). Sem preferência salva,
**o celular abre em lista** — coluna de 250–340px não cabe em 390px.

### 2.2 Estrutura
```tsx
<DndContext sensors={kanbanSensors} collisionDetection={closestCenter} …>
  <div className="nice-scrollbar -mx-1 flex-1 overflow-x-auto overflow-y-hidden pb-4">
    <div className="flex h-full gap-4 px-1" style={{ minWidth: `${colunas.length * 250}px` }}>
      {/* uma <KanbanColuna> por etapa */}
    </div>
  </div>
  <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>…</DragOverlay>
</DndContext>
```

- Coluna com **largura fixa** (`w-[250px]` no CRM, `w-[340px]` nos Orçamentos) e
  `shrink-0`; a rolagem horizontal é do container, com `.nice-scrollbar`.
- **`<DndContext>` sempre montado** enquanto o modo for kanban. Loading vira
  overlay absoluto — desmontar mata o portal do `DragOverlay`.
- Cabeçalho da coluna: nome, contador e menu `⋮` da coluna.
- Depois de mover, refetch **silencioso** (`silent: true`), sem piscar a tela.
- O resto da mecânica (damping 0.82, FSM de drop, largura do overlay) está em
  [`PADRAO_KANBAN_DND.md`](PADRAO_KANBAN_DND.md).

### 2.3 Cartão
Título, identidade (cliente/lead), badges de estado e o indicador do que exige
ação. Nada que só apareça no hover — no celular não existe hover.

---

## 3. Página de detalhe — referências `/clientes/[id]` e `/orcamentos/[id]`

Quatro camadas, nesta ordem: **barra da página → hero → abas → conteúdo**.

### 3.1 Barra da página
Mesma `<PageHeaderBar>` da listagem: `<h1>` com o identificador do registro
(`Orçamento #0142`, o nome do cliente), trilha terminando no registro, ações à
direita e `<BackButton>` por último.

### 3.2 Hero
```tsx
<div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
  <div className="relative overflow-hidden">
    {/* capa: imagem do registro OU gradiente da cor do módulo */}
    <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR} 0%, var(--color-primary) 100%)` }} />
    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/25" />

    <div className="relative z-10 px-5 pb-5 pt-24 text-white sm:px-6 sm:pt-28">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-card shadow-lg ring-4 ring-white/50">…</div>
          <div className="min-w-0">
            {/* nome + chips de vidro, todos na MESMA linha */}
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl font-bold tracking-tight text-white drop-shadow">{titulo}</p>
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-white ring-1 ring-white/25 backdrop-blur">…</span>
            </div>
            {/* meta: ícone + valor, separados por gap, sem barrinhas */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/85">…</div>
          </div>
        </div>
        {/* números do registro, à direita */}
        <div className="flex gap-6">
          <div className="text-center">
            <p className="text-lg font-bold tracking-tight text-white drop-shadow tabular-nums">{valor}</p>
            <p className="text-xs text-white/75">Rótulo</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  {/* abas na base do hero */}
  <div className="border-t border-border px-3">
    <div className="nice-scrollbar flex gap-1.5 overflow-x-auto py-2">
      <button type="button" className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
        ativa ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
        <Icon className="h-4 w-4 shrink-0" />Detalhes
      </button>
    </div>
  </div>
</div>
```

**A capa é do registro, não do módulo.** Quando o registro tem imagem própria,
é ela que aparece: o cliente usa a capa do cliente, o orçamento a sua, e o
usuário a imagem de fundo que a pessoa escolheu em `/perfil` (`cover_image`).
O gradiente da cor do módulo é o que sobra quando não há imagem.

Detalhes que não são decoração:
- **Chips em CAIXA ALTA**, de vidro (`bg-white/15 ring-1 ring-white/25 backdrop-blur`),
  na mesma linha do título — status, áreas, avisos de estado.
- As abas são **botões simples**, não `role="tablist"`: o CSS global do tema
  impõe borda inferior e raio 0 nos triggers e briga com o formato de pílula.
- Os **números à direita** são o resumo do registro (total, itens, mensagens;
  módulos, clientes, acessos). Três ou quatro, não mais.

### 3.3 Conteúdo
```tsx
<div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
```
Coluna principal + lateral fixa de `20rem`. Inverta para `[20rem_1fr]` quando a
lateral for a identidade do registro (é o caso de `/usuarios/[id]`). Abaixo de
`lg` empilha sozinho.

Cada seção é um **`<SectionCard>`** (`@/components/section-card`): ícone, título,
descrição, ações opcionais no cabeçalho e recolher/expandir animado. **Não** use
`<Card><CardHeader>` cru aqui — o detalhe do usuário já foi corrigido uma vez por
causa disso.

Modais seguem o `DialogHeaderIcon` obrigatório (ver `CLAUDE.md`).

---

## 4. O que não fazer

| Anti-padrão | Por quê |
|---|---|
| `<PageHeader>` (capa sangrada) numa listagem | é de detalhe; gera a capa colorida que destoa de `/clientes` e `/crm` |
| `p-4 md:p-6` no wrapper da página | o layout do dashboard já dá o padding — sai dobrado |
| `<Card><CardHeader>` cru no detalhe | o padrão é `SectionCard`, com recolher e cabeçalho uniforme |
| Botões de ação soltos na linha da tabela | a coluna Ações é dropdown `⋮` |
| Badge/chip em minúsculas no hero | os chips do hero são caixa alta |
| Coluna Status na tabela | situação é badge na linha; o estado se gerencia no form |
| Ação que só aparece no hover | some no celular — ver `PADRAO_RESPONSIVIDADE.md` §8 |
| Kanban como única visão | sempre com alternador para lista, e lista é o padrão no celular |

## 5. Antes de entregar

1. A tela abre igual à referência quando posta lado a lado? (`/clientes` para
   tabela, `/crm` para kanban, `/orcamentos/[id]` para detalhe.)
2. `pnpm --filter @saas/web exec tsc --noEmit` limpo para os arquivos tocados.
3. Confere nas três larguras do `PADRAO_RESPONSIVIDADE.md` — 390, 768 e 1366.
4. Tocou em `apps/api/`? Passe pelo gate de `docs/error-registry.md`.

---

## 6. Cobertura da varredura (26/08/2026)

O topo de **todas as telas do dashboard** foi passado para a `PageHeaderBar`
(título + trilha `Página inicial › Bloco › Módulo` à esquerda, ações à direita).
Três lotes: `b46e5869` (21 telas na forma exata), `71c1cb9f` (68 telas com
cabeçalho fora da forma) e `222d9e0a` (detalhes, formulários compartilhados e
ferramentas).

O que a conversão preservou, de propósito: selos ao lado do título e subtítulo
com dados do registro descem para uma linha logo abaixo da trilha. O que ela
descartou: a caixa de ícone de 48px e a **descrição estática** — a trilha ocupa
o lugar dela.

Fora da varredura, e por quê:

| Tela | Motivo |
|---|---|
| `/whatsapp` | chat de altura cheia (`h-[calc(100vh-90px)]`), sem cabeçalho |
| `/ferramentas/fiscal/*`, `/ferramentas/contabil/*` | usam o `PageHeader` de capa, que é componente da casa |
| `/faq/[slug]`, `/faq/novo`, `/faq/editar/[slug]` | idem — a capa do artigo é o `PageHeader` |
| `*/imprimir`, `*/old` | página de impressão e legado |
| `/dashboard`, `/helpdesk/[id]`, `/helpdesk/n/[numero]`, `/orcamentos/indicadores` | sem cabeçalho próprio: grid de widgets, wrapper de componente ou redirecionamento |

Tela nova nasce com a barra. Tela antiga que for tocada migra junto.
