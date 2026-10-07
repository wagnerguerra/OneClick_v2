# Padrão de Módulos CRUD — OneClick ERP

Este documento define o padrão visual, estrutural e de código para todos os módulos CRUD do sistema.
**Módulo de referência: Cargos** (`apps/web/src/app/(dashboard)/cargos/`)

---

## Estrutura de Diretórios

```
packages/types/src/{modulo}.ts          → Schemas Zod (create, update, list)
apps/api/src/{modulo}/
  ├── {modulo}.module.ts                → NestJS Module
  ├── {modulo}.service.ts               → Service com CRUD + paginação + versionamento + eventos
  └── {modulo}.router.ts                → tRPC router
apps/web/src/app/(dashboard)/{modulo}/
  ├── page.tsx                          → Listagem (DataTable + edição inline)
  ├── new/page.tsx                      → Página de criação
  ├── [id]/page.tsx                     → Página de edição (com sidebar)
  └── _components/
      ├── {modulo}-form.tsx             → Formulário compartilhado (create/edit + sidebar)
      └── import-modal.tsx              → Modal de importação Excel/CSV
```

---

## Tipografia

Títulos seguem o CSS global (`globals.css`): `h1`/`h2`/`h3` com tamanho próprio e
cor `var(--color-foreground)` (segue o tema).

**REGRA**: Usar `<h1>` puro sem classes inline nos títulos de página. O estilo vem do CSS global.
Sobre faixa colorida, ponha a cor (ex.: `text-white`) no próprio título — o global vence a herança.

---

## Header de Página (padrão global)

O topo de toda listagem e de todo formulário é a `<PageHeaderBar>` — estrutura,
trilha e ordem das ações em [`PADRAO_PAGINAS.md`](PADRAO_PAGINAS.md) §1.1 e §3.1.
Resumo:

- **Título**: `<h1>` puro (sem classes) + trilha `Página inicial › Bloco › Módulo`.
- **Sem caixa de ícone colorido** ao lado do título (o antigo ícone 48px na cor do
  grupo saiu; a cor do módulo não entra no conteúdo — ver
  [`PADRAO_CORES_E_TEMA.md`](PADRAO_CORES_E_TEMA.md) §6).
- **Listagem**: "+ Novo…" primeiro (`<Button size="sm">` padrão = primária — ele só
  abre o formulário), depois as secundárias e o menu `⋮` por último
  (`variant="outline" size="icon-sm"`, com Importar/Exportar). Sem botão Voltar.
- **Formulário (create/edit)**: "Salvar" `variant="success" size="sm"` com ícone
  `Save`; `<BackButton>` sempre por último (só ícone, porque divide espaço com o
  Salvar). Subtítulo do edit: `#código — Nome do registro`.
- **Botões ficam no header, NÃO dentro do Card nem no rodapé.**

---

## Página de Listagem (DataTable)

### Funcionalidades obrigatórias:
- Busca com debounce 400ms
- Ordenação server-side por coluna clicável (ícones ↑↓)
- Seletor de registros por página (10, 20, 50, 100)
- Paginação numérica (max 5 visíveis) + nav (⟪ ‹ 1 2 3 › ⟫)
- Info "Mostrando X a Y de Z registros"
- Loading spinner dentro da tabela
- Linha clicável abre edição
- Delete com SweetAlert (`alerts.confirmDelete`, ou `alerts.confirm({ …, destructive: true })`)
- Colunas responsivas (`hidden sm:table-cell`, `hidden md:table-cell`)
- **NÃO incluir coluna Status** — gerenciado apenas no formulário
- **Tabela com `table-fixed`** para travar larguras das colunas

### Edição inline (quando aplicável):
- `EditableTextCell` — clique transforma em input, blur/Enter salva, Escape cancela
- `EditableSelectCell` — clique abre Select dropdown (`position="popper"`), salva ao selecionar
- Flash verde (`bg-emerald-100`) por 1.2s após salvar
- `stopPropagation()` para não navegar ao clicar na célula editável
- Estado local atualizado sem refetch (`updateLocal()`)

### Importação (botão no menu ⋮):
- Modal com download de template (Excel/CSV)
- Drag & drop para upload
- Parse client-side via SheetJS (`xlsx`)
- Preview com tabela de validação (linhas verdes/vermelhas)
- Rota backend `importBulk` cria registros um a um com tratamento de erro
- Arquivo: `_components/import-modal.tsx`
- Parser reutilizável: `apps/web/src/lib/parse-import.ts`

### Exportação (botão no menu ⋮):
- Rota backend `exportAll` retorna todos os registros sem paginação
- Gera Excel (.xlsx) via SheetJS
- Campos rich text são stripped de HTML na exportação
- Arquivo: `apps/web/src/lib/export-data.ts`

---

## Formulário (Create/Edit)

### Layout com Tabs + Sidebar

```
┌────────────────────────────────────────────┬──────────────┐
│ Card com Tabs:                             │ Sidebar:     │
│ ┌─ TabsList ─────────────────────────────┐ │              │
│ │ [📋 Aba 1] [🎓 Aba 2]                 │ │ Colaboradores│
│ ├────────────────────────────────────────┤ │ Arquivos     │
│ │ Conteúdo (grids + rich editors)        │ │ Eventos      │
│ └────────────────────────────────────────┘ │              │
└────────────────────────────────────────────┴──────────────┘
```

- Layout: `lg:grid-cols-[1fr_320px]` (form + sidebar) — **somente no edit**
- No create: sidebar não aparece (grid sem coluna lateral)

### Regras do formulário:
- **React Hook Form** + **Zod** (mesmo schema frontend/backend)
- Campos obrigatórios: `<RequiredMark />` (asterisco vermelho)
- Tooltips de ajuda: `<FieldHint text="..." />`
- Erros inline: `<p className="text-xs text-destructive mt-1">`
- Grid responsivo: `sm:grid-cols-2 lg:grid-cols-3`
- Selects opcionais: `value="__none__"` como placeholder
- SweetAlert após salvar ou em erro
- Campos de texto formatado: `<RichEditor />` (TipTap)
- Campos de formulário **sem** `bg-*`/`border-*` — herdam fundo e borda do `globals.css`

### Rich Text Editor (TipTap):
- Componente: `@saas/ui` → `<RichEditor value={} onChange={} />`
- Toolbar: Bold, Italic, Underline, Listas, Citação, Link, Limpar
- Salva como HTML string no banco (`@db.Text`)
- `immediatelyRender: false` para SSR/Next.js
- Toolbar sem fundo cinza (transparente com borda sutil)

---

## Sidebar (somente no edit)

### Colaboradores vinculados
- Lista de users com FK para o registro
- Avatar + nome + email + perfil badge
- Header com contador

### Arquivos (placeholder — fase futura)
- Card com mensagem "Nenhum arquivo anexado"

### Eventos / Histórico de auditoria (ISO 9001)
- Scrollable `max-h-[400px]`
- Header com contador de registros
- Cada evento mostra:
  - Data (dia grande + dia da semana)
  - Tipo: "Criação do cargo" / "Atualização do cargo"
  - Autor (nome do usuário)
  - Data/hora completa
  - Badges dos campos alterados
  - Badge de versão: `v1 → v2`

---

## Versionamento e Auditoria (ISO 9001)

### Prisma:
```prisma
model Modulo {
  version  Int  @default(1)  // Incrementa a cada update
  // ... demais campos
  events   ModuloEvent[]
}

model ModuloEvent {
  id        String   @id @default(cuid())
  moduloId  String
  userId    String?
  type      String   // "created", "updated", "deleted"
  version   Int
  changes   Json?    // { campo: { from: "antigo", to: "novo" } }
  createdAt DateTime @default(now())
}
```

### Service:
- `create()` → evento "created", version=1
- `update()` → detecta diff dos campos, incrementa version, evento "updated" com changes JSON
- `delete()` → evento "deleted" antes de excluir
- `getEvents(id)` → retorna lista com user name, ordenada por data desc

### Tabela de listagem:
- Coluna **Versão** (`v1`, `v2`, etc.) — `hidden md:table-cell`

### Uma linha por registro (regra do Wagner, 25/08/2026)
Toda listagem tem **uma linha de cabeçalho e uma linha por registro**. Nada de
sub-linha dentro da célula (nome em cima, complemento embaixo) — isso dobra a
altura e desalinha as colunas. Só use mais de uma linha quando o Wagner pedir.

O que iria na sub-linha vira **sufixo inline** na mesma célula
(`NOME · complemento`, em `text-muted-foreground`), coluna própria ou `title`:

```tsx
<TableRow className="[&_td]:whitespace-nowrap [&_td]:py-2">
  <TableCell>
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="truncate font-medium">{r.nome}</span>
      {r.contato && <span className="truncate text-[11px] text-muted-foreground">· {r.contato}</span>}
    </span>
  </TableCell>
  …
  <TableCell className="pr-5 text-right">{/* Ações — pr-5 pra não colar na borda */}</TableCell>
</TableRow>
```
Cabeçalho: `<TableRow className="[&_th]:whitespace-nowrap">`.

---

## Backend — Padrão Completo do Service

```typescript
@Injectable()
export class XxxService {
  async list(input: ListXxxInput)                    // Paginação + search + sort + include relações
  async getById(id: string)                          // Include relações + users vinculados
  async create(input: CreateXxxInput, userId?)       // Campos opcionais → null + evento "created"
  async update(id: string, input, userId?)           // Partial update + version++ + evento "updated" com diff
  async delete(id: string, userId?)                  // Evento "deleted" + hard delete
  async getEvents(id: string)                        // Eventos ordenados desc com user name
  async exportAll()                                  // Todos os registros sem paginação (para exportação)
  async bulkCreate(items[], userId?)                 // Importação em massa com tratamento de erro por linha
  async listForSelect()                              // Dados mínimos para dropdowns
}
```

## Backend — Padrão do Router tRPC

```typescript
export function createXxxRouter(service: XxxService) {
  return router({
    list:          protectedProcedure.input(listSchema).query(...)
    getById:       protectedProcedure.input(z.object({ id })).query(...)
    create:        protectedProcedure.input(createSchema).mutation(({ input, ctx }) => service.create(input, ctx.userId))
    update:        protectedProcedure.input(z.object({ id, data })).mutation(({ input, ctx }) => service.update(..., ctx.userId))
    delete:        protectedProcedure.input(z.object({ id })).mutation(({ input, ctx }) => service.delete(input.id, ctx.userId))
    getEvents:     protectedProcedure.input(z.object({ moduloId })).query(...)
    exportAll:     protectedProcedure.query(...)
    listForSelect: protectedProcedure.query(...)
    importBulk:    protectedProcedure.input(z.object({ items: z.array(createSchema) })).mutation(({ input, ctx }) => service.bulkCreate(..., ctx.userId))
  })
}
```

---

## Botões — Variantes por Contexto

| Contexto | Variante | Tamanho | Ícone |
|----------|----------|---------|-------|
| "+ Novo…" (abre o formulário) | `default` (primária) | `sm` | `Plus` |
| Salvar / Criar que conclui | `success` | `sm` | `Save` |
| Voltar | `<BackButton>` (componente) | — | — |
| Menu ⋮ (listagem) | `outline` | `icon-sm` | `MoreVertical` |
| Editar (tabela) | `soft-info` | `icon-sm` | `Pencil` |
| Excluir (tabela) | `soft-destructive` | `icon-sm` | `Trash2` |
| Paginação (nav) | `outline` | `icon-xs` | `ChevronLeft/Right` |
| Paginação (ativa) | `soft` | `icon-xs` | — |

---

## SweetAlert — Padrão de Alertas

```typescript
import { alerts } from '@/lib/alerts'

await alerts.success('Registro criado', 'O registro foi salvo com sucesso.')
await alerts.success('Registro atualizado', 'As alterações foram salvas.')
await alerts.success('Registro excluído', `"${nome}" foi removido com sucesso.`)
const confirmed = await alerts.confirmDelete(nomeDoRegistro)
alerts.error('Erro', 'Não foi possível realizar a operação.')
```

---

## Componentes UI Disponíveis (@saas/ui)

- `Button`, `Input`, `Label`, `Checkbox`, `Select*`, `Tabs*`
- `Card*`, `FormSection` (com ícone + título)
- `Table*`, `Badge`, `Separator`, `ScrollArea`
- `Dialog*`, `DropdownMenu*`, `Tooltip*`
- `Avatar*`, `Collapsible*`
- `RichEditor` (TipTap)

---

## Estilo Visual Global

- Bordas: `rounded-[2px]` (quase reto, corporativo)
- Shadows: `shadow-[0_1px_2px_rgba(0,0,0,0.04)]` (mínimo)
- Table header: `bg-muted/40`, `uppercase`, `tracking-wider`, `text-xs`, `font-semibold`
- Toolbar/footer: `bg-muted/20`, `border-border/60`
- Transições: `transition-colors`/`transition-opacity` etc. escopadas — nunca `transition-all` em container (anima a cor herdada e atrasa o texto ao trocar o tema)
- Sidebar: sempre dark mode
- Inputs/Selects/RichEditor: fundo e borda vêm do `globals.css` — **nunca** `bg-*`/`border-*` no campo (ver `PADRAO_CORES_E_TEMA.md`)
- Inputs focus: `border-primary ring-1 ring-primary` (sem ring-offset)
- Títulos h1: sem classes inline, estilo global via CSS
