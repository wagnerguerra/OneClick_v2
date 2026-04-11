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

Títulos seguem o CSS global (`globals.css`):

```css
h1 { font-size: 24px; line-height: 1.2; font-weight: 400; letter-spacing: 0.5px; color: rgb(18, 52, 77); }
h2 { font-size: 20px; line-height: 30px; }
h3 { font-size: 16px; line-height: 24px; }
```

**REGRA**: Usar `<h1>` puro sem classes inline nos títulos de página. O estilo vem do CSS global.

---

## Header de Página (padrão global)

### Listagem

```
┌──────────────────────────────────────────────────────────────┐
│ ┌────┐                                                       │
│ │ 🔷 │  Título do Módulo                  [➕ Novo ...]  [⋮] │
│ │icon│  Descrição do módulo                                  │
│ └────┘                                                       │
└──────────────────────────────────────────────────────────────┘
```

- **Ícone**: quadrado 48x48 (`h-12 w-12`), `rounded-[4px]`, cor sólida do grupo (sem degradê), `shadow-md`
- **Título**: `<h1>` puro (sem classes)
- **Descrição**: `<p className="text-sm text-muted-foreground">`
- **Botão Novo**: `variant="success" size="sm"` com ícone `Plus`
- **Menu ⋮**: `DropdownMenu` com `MoreVertical` icon (`variant="outline" size="icon-sm"`)
  - Importar (ícone `FileUp`)
  - Exportar (ícone `FileDown`)
- **SEM botão Voltar** na listagem

### Formulário (Create/Edit)

```
┌──────────────────────────────────────────────────────────────┐
│ ┌────┐                                                       │
│ │ 🔷 │  Título                       [💾 Salvar]  [← Voltar] │
│ │icon│  #código — Nome do registro                           │
│ └────┘                                                       │
└──────────────────────────────────────────────────────────────┘
```

- **Ícone**: quadrado com degradê diagonal (`bg-gradient-to-br from-[cor] to-[cor]`), `shadow-md`
- **Subtítulo** (edit): `#código — Nome do registro`
- **Salvar**: `variant="success" size="sm"` com ícone `Save` — texto fixo "Salvar"
- **Voltar**: `variant="outline" size="sm"` com ícone `ArrowLeft` — **sempre último da direita**
- **Botões ficam no header, NÃO dentro do Card nem no rodapé**

### Props do formulário:
```tsx
<ModuloForm
  mode="create" | "edit"
  title="Editar Cargo"
  description="#10 — Analista de Sistemas"
  icon={<Briefcase className="h-6 w-6" />}
  iconBg="from-emerald-500 to-emerald-600"
  defaultValues={...}
  linkedUsers={[...]}  // sidebar colaboradores (edit only)
  events={[...]}       // sidebar eventos (edit only)
/>
```

---

## Cores de ícone por GRUPO

| Grupo | Cor sólida (listagem) | Degradê (form) |
|-------|----------------------|-----------------|
| **Cadastros** | `bg-emerald-500` | `from-emerald-500 to-emerald-600` |
| **Corporativo** | `bg-sky-500` | `from-sky-500 to-sky-600` |
| **Qualidade** | `bg-amber-500` | `from-amber-500 to-amber-600` |
| **Configurações** | `bg-orange-700` | `from-orange-700 to-orange-800` |

> **REGRA**: Listagem usa cor sólida. Formulário usa degradê. Nunca cores individuais por módulo.

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
- Delete com SweetAlert (`alerts.confirmDelete`)
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
- Campos de formulário usam `bg-card` (não `bg-background`)

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
| Criar registro | `success` | `sm` | `Plus` |
| Salvar formulário | `success` | `sm` | `Save` |
| Voltar (formulário) | `outline` | `sm` | `ArrowLeft` |
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
- Transições: `transition-all duration-200`
- Sidebar: sempre dark mode
- Inputs/Selects/RichEditor: `bg-card` (não `bg-background`)
- Inputs focus: `border-primary ring-1 ring-primary` (sem ring-offset)
- Títulos h1: sem classes inline, estilo global via CSS
