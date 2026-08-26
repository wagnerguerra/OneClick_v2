# Padrão de Páginas

Como se monta uma tela deste sistema. Não é teoria: cada regra aqui aponta para a
tela que já a implementa, e é essa tela que manda. Em dúvida, **abra a referência
e copie a estrutura** — divergir dela é que gera trabalho depois.

| Tipo de tela | Referência |
|---|---|
| Página inicial de módulo — **listagem em tabela** | `/clientes` |
| Página inicial de módulo — **kanban** | `/crm` e `/orcamentos` |
| Página de **detalhe** de um registro | `/clientes/[id]` (via `_components/cliente-form.tsx`) e `/orcamentos/[id]` |

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
  actions={<>
    {/* secundárias → menu ⋮ → primária, nesta ordem */}
    <Button variant="outline" size="sm" className="gap-1.5"><Settings2 className="h-4 w-4" />Opções</Button>
    <DropdownMenu>…<Button variant="outline" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>…</DropdownMenu>
    <Button size="sm" asChild className="gap-1.5"><Link href="/clientes/new"><Plus className="h-4 w-4" />Novo Cliente</Link></Button>
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
- **Rodapé** com "Mostrando X a Y de Z registros" e a paginação numérica.
- **Carregando** é spinner dentro da tabela; **vazio** é ícone + frase, no lugar da lista.

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
