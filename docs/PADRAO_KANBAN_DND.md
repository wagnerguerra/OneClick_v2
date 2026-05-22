# Padrão: Kanban com Drag-and-Drop

Recipe para implementar kanban arrastável (`@dnd-kit/core` + `@dnd-kit/sortable`) com overlay visual durante o drag, sem armadilhas comuns.

Aplicado em:
- `apps/web/src/app/(dashboard)/orcamentos/page.tsx` — colunas de largura fixa
- `apps/web/src/app/(dashboard)/crm/page.tsx` — colunas com `flex-1`

---

## Estrutura geral

```tsx
<DndContext
  sensors={kanbanSensors}
  collisionDetection={closestCenter}
  onDragStart={handleKanbanDragStart}
  onDragMove={handleKanbanDragMove}
  onDragOver={handleKanbanDragOver}
  onDragEnd={handleKanbanDragEnd}
  onDragCancel={handleKanbanDragCancel}
>
  <div className="flex gap-3 overflow-x-auto">
    {columns.map(col => <KanbanColumn ... />)}
  </div>
  <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
    {activeCard && <KanbanCardOverlay ... />}
  </DragOverlay>
</DndContext>
```

Cada `KanbanColumn` envolve seus cards com `<SortableContext>` + cards via `useSortable`. O card original some (opacity baixa) durante o drag e o `<DragOverlay>` renderiza uma cópia do card que segue o cursor.

---

## ⚠️ Pitfall #1: Card "encolhe" ao iniciar o drag

**Sintoma**: ao segurar o card, ele diminui (parece menor que antes), e quando solta volta ao tamanho original.

**Causa**: o `KanbanCardOverlay` tem largura **diferente** do card real. O card real tem largura ditada pelo layout da coluna (com paddings/borders); o overlay normalmente recebe um `w-[260px]` (ou similar) chumbado.

**Fix — coluna de largura fixa**: calcule e chume a largura útil do card.

```tsx
// Coluna w-[360px] com border (1px each = 2px) e padding p-2 (8px each = 16px)
// → largura disponível para o card: 360 - 2 - 16 = 342px

<DragOverlay>
  <div className="w-[342px] ...">  {/* mesma largura do card real */}
    <KanbanCardContent ... />
  </div>
</DragOverlay>
```

**Fix — coluna `flex-1` (largura variável)**: capturar a largura real do card no `dragStart` e aplicar via inline style.

```tsx
const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null)

const handleKanbanDragStart = (event: DragStartEvent) => {
  setActiveCardId(event.active.id as string)
  // event.active.rect.current.initial = bounding rect quando o drag começou
  const initial = (event.active as any).rect?.current?.initial
  setActiveCardWidth(initial?.width ?? null)
}

// No overlay:
<KanbanCardOverlay width={activeCardWidth} ... />

// Dentro do overlay:
<div style={{ width: width ?? 260 }}>...</div>  // fallback se measurement falhar
```

---

## ⚠️ Pitfall #2: Card "balança" várias vezes ao arrastar

**Sintoma**: ao iniciar o drag, o card balança (rotaciona) repetidamente antes de estabilizar — efeito de pêndulo subamortecido.

**Causa**: o overlay usa um simulador de mola-amortecedor (spring-mass-damper) para dar uma sensação de "peso" ao card. Com damping fraco (`0.95`), a oscilação demora muitas iterações pra dissipar.

**Física do simulador** (executa a cada `requestAnimationFrame`):

```ts
angVelRef.current += inputVelRef.current * 0.06    // input puxa angular velocity
inputVelRef.current *= 0.3                          // input decai rápido
angVelRef.current += -rotRef.current * 0.04        // mola puxa de volta para 0
angVelRef.current *= DAMPING_FACTOR                 // amortecimento
rotRef.current += angVelRef.current
rotRef.current = clamp(-8, 8, rotRef.current)       // limite ±8 graus
```

**Damping crítico** (sem oscilação) com `stiffness=0.04`: ≈ `0.6`.
- `0.95` (5% por tick) → ~5-7 oscilações visíveis (subamortecido fraco)
- `0.82` (18% por tick) → ~1 balançada visível, depois estabiliza ✓ **(usar este)**
- `<0.7` → praticamente sem oscilação, parece "morto"

**Fix**: trocar `angVelRef.current *= 0.95` por `angVelRef.current *= 0.82`.

Se quiser ajustar o "peso" sentido (mais ou menos balanço) sem alterar o damping:
- Aumentar `stiffness` (ex: `0.04` → `0.06`) faz a mola voltar mais rápido (precisa também aumentar damping pra manter "uma só balançada")
- Aumentar `inputVelRef * 0.06` faz o card balançar mais alto na inclinação inicial

---

## ⚠️ Pitfall #3: `removeChild` ao re-fetch durante drag

**Sintoma**: `Cannot read properties of null (reading 'removeChild')` quando troca de filtro/recarrega lista enquanto o drag está ativo. Já documentado em `error-registry.md` §3.1.

**Causa**: o `<DragOverlay>` mantém um portal DOM. Se o `<DndContext>` for desmontado e remontado (ex: container condicional `{!loading && <DndContext>...}`), o portal perde a referência.

**Fix**: nunca colocar o `<DndContext>` dentro de `{!loading && ...}`. Manter sempre montado quando `viewMode === 'kanban'` e usar **loading como overlay absoluto**:

```tsx
{viewMode === 'kanban' && (
  <div className="relative flex-1 flex flex-col">
    {loading && (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70">
        <Loader2 className="animate-spin" />
      </div>
    )}
    <DndContext>...</DndContext>
  </div>
)}
```

Re-fetches pós-mutação devem ser `silent: true` pra não acionar `setLoading(true)` durante o drag.

---

## ⚠️ Pitfall #4: Bloqueio visual de drop (FSM)

Quando há regras de transição (status forward-only no orcamento, etapas no CRM), o usuário precisa ver visualmente que algumas colunas não aceitam o card sendo arrastado.

**Padrão**: calcular `dropDisabled` por coluna baseado em `activeCard?.status` + lógica do FSM, e aplicar:

```tsx
const dropDisabled = !!activeCard
  && activeCard.status !== status
  && !isOrcamentoTransitionAllowed(activeCard.status, status)

// No KanbanColumn:
<div className={cn('flex flex-col ...', dropDisabled && 'opacity-40 grayscale')}>
  {dropDisabled && (
    <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-rose-50/40 backdrop-blur-[1px]">
      <div className="rounded-md bg-white/95 px-3 py-1.5 text-xs font-medium text-rose-700">
        🚫 Não permitido
      </div>
    </div>
  )}
  <SortableContext>...</SortableContext>
</div>
```

`useDroppable({ disabled: dropDisabled })` impede o drop de fato, e o overlay visual + opacidade comunica ao usuário.

---

## Checklist para um novo kanban

1. ✅ `<DndContext>` com handlers de start/move/over/end/cancel
2. ✅ Cards via `useSortable`, opacity baixa quando `isDragging`
3. ✅ `<DragOverlay>` com `KanbanCardOverlay` separado (componente que NÃO usa `useSortable`)
4. ✅ **Largura do overlay = largura real do card**:
   - Coluna fixa → chumbar `w-[NNNpx]` matematicamente
   - Coluna `flex-1` → capturar `event.active.rect.current.initial.width` no `dragStart`
5. ✅ Damping do simulador de balanço em **`0.82`** (não `0.95`)
6. ✅ `<DndContext>` sempre montado quando `viewMode === 'kanban'`; loading como overlay absoluto
7. ✅ Re-fetches pós-mutação com `silent: true`
8. ✅ Se houver FSM/regras de transição, aplicar `dropDisabled` visual + `useDroppable({ disabled })`
