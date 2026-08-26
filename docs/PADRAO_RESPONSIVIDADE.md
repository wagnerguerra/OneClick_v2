# Padrão de Responsividade

**Este é o modelo.** Toda tela nova — e toda tela tocada — segue o que está aqui.
O que quebrou o sistema em 26/08/2026 não foi falta de esforço: foi cada tela
resolvendo largura do seu jeito. Aqui a regra é uma só.

## As três larguras que existem de verdade

| Alvo | Largura | Viewport útil no sistema | Onde dói |
|---|---|---|---|
| Celular | 390px | 390px (sidebar vira gaveta) | Tudo que assume mouse e espaço |
| Tablet | 768px | ~700px | Grades de 3+ colunas, filtros lado a lado |
| Notebook | 1366px | ~1190px (sidebar aberta) · ~1250px (recolhida) | Sub-abas, tabelas largas |

**A altura também é curta.** Num notebook de 768px, com barra de tarefas e o
navegador, sobra **~600px de viewport**. Quem projeta olhando a própria tela de
1440×900 não vê isso.

## Regras

### 1. Todo filho de flex que contém texto leva `min-w-0`
Sem isso o texto define a largura mínima do pai e **empurra o card para fora da
tela** — foi o que aconteceu nas permissões do usuário. `truncate` só funciona
com a cadeia inteira de `min-w-0` até o container.

```tsx
<div className="flex">
  <aside className="w-[170px] shrink-0">…</aside>
  <div className="min-w-0 flex-1">…</div>   {/* ← sem isto, vaza */}
</div>
```

### 2. Nunca `justify-center` em container que rola
Quando o conteúdo não cabe, centralizar **corta o começo, e o pedaço cortado é
inalcançável** — a rolagem não vai para trás do início. Foi o que sumiu com o
bloco Cadastros na sidebar recolhida.

```tsx
{/* errado */}  <div className="flex flex-col justify-center overflow-y-auto">
{/* certo  */}  <div className="flex flex-col overflow-y-auto"><div className="my-auto">…</div></div>
```

### 3. Grade nenhuma nasce com número fixo de colunas
```tsx
{/* errado */} grid-cols-3
{/* certo  */} grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
{/* certo  */} grid-cols-[repeat(auto-fill,minmax(260px,1fr))]
```
Exceções legítimas: `grid-cols-7` (semanas do calendário) e `grid-cols-12` (o
grid de formulário da casa, cujos filhos já usam `col-span-12 sm:col-span-N`).

### 4. Largura fixa só com prefixo de breakpoint
```tsx
{/* errado */} className="w-[900px]"     {/* estoura em qualquer celular */}
{/* certo  */} className="w-full sm:w-[900px]"
{/* certo  */} className="sm:max-w-[900px]"   {/* modal: a base já é w-full */}
```

### 5. Componentes da casa já resolvem — use-os
- **`<Table>` do `@saas/ui`**: já vem embrulhada em `overflow-auto`. Tabela solta, não.
- **`<DialogContent>`**: já é `w-full max-w-lg` dentro de um container com padding e
  `max-h-[calc(100vh-3rem)]`; o corpo rola sozinho. Só acrescente `sm:max-w-[…]`.
- **`<SheetContent>`**: largura total no celular, 70% a partir de `sm`.

### 6. Colunas secundárias somem antes de espremer
```tsx
<TableCell className="hidden md:table-cell">…</TableCell>
```
Ordem de sacrifício: metadados (data de cadastro, autor) → categorias → números
de apoio. O que identifica o registro e a ação principal ficam sempre.

### 7. Barra de filtros: quebra, não rola
```tsx
<div className="flex flex-wrap items-center gap-2">
  <Select …><SelectTrigger className="h-8 w-full sm:w-[180px]" /></Select>
  …
</div>
```
Rolagem horizontal com barra escondida esconde filtro de quem mais precisa dele.

### 7.1 Grupo de ações do cabeçalho quebra linha
```tsx
{/* errado */} <div className="flex items-center gap-2 shrink-0">
{/* certo  */} <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
```
`shrink-0` no celular empurra a barra inteira para fora da tela — foi o que
aconteceu em 113 telas de uma vez, porque a classe era a do padrão.

### 8. Nada depende de hover
Toda ação que só aparece no `group-hover` precisa de um equivalente alcançável no
toque (item no menu `⋮`, botão visível abaixo de `sm`). No celular não existe hover.

### 9. Alvo de toque: 36px de altura (`h-9`) nas ações principais
`size="xs"` é para desktop denso. No celular, a ação principal do card ou da linha
vem em `h-9` ou maior.

### 10. Muda a APARÊNCIA → Tailwind. Muda a ESTRUTURA → `useIsMobile`
```ts
import { useIsMobile } from '@/hooks/use-media-query'
```
Trocar colunas, espaçamento, tamanho: classes. Trocar grade arrastável por pilha,
desligar drag-and-drop, renderizar outro componente: hook. Media query em JS custa
render e não roda no servidor — só use quando CSS não resolve.

## Como conferir antes de entregar

1. **DevTools em 390 × 844, 768 × 1024 e 1366 × 768** (esta última com a altura
   real: ~600px de viewport).
2. **Sem rolagem lateral na página.** No console:
   ```js
   document.documentElement.scrollWidth - document.documentElement.clientWidth
   ```
   Tem que dar `0`. Se não der, ache o culpado:
   ```js
   const vw = document.documentElement.clientWidth
   ;[...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > vw + 2).slice(0, 10)
   ```
3. **A ação principal é alcançável com o polegar** — não escondida atrás de hover
   nem fora da área visível.

Progresso da varredura por módulo: [`docs/responsividade-progresso.md`](responsividade-progresso.md).
