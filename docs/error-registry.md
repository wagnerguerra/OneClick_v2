# Registro de Erros — Banco de Dados de Bugs Pós-Produção

> **Como usar este arquivo**
>
> Antes de marcar qualquer fase como entregue (qualquer build "compilou com sucesso"), Claude deve fazer uma auto-revisão usando os checks abaixo como _gate_. Sempre que um novo erro for encontrado durante uma fase, adicionar uma entrada nova com: sintoma, causa raiz, correção, pre-check.
>
> Categorias: **Imports**, **Tipos**, **Runtime React**, **Schema/DB**, **Validação**, **Módulo/DI**, **Estado/UI**, **Roteamento**, **SSE/Realtime**, **tRPC**.

---

## 🚨 GATE OBRIGATÓRIO ANTES DE ENTREGAR

Toda entrega que toca código de `apps/api/` precisa passar nestes três checks, **NESTA ORDEM**, antes de o assistente reportar "concluído":

1. **Typecheck filtrado** dos arquivos tocados:
   ```
   cd apps/api && npx tsc --noEmit 2>&1 | grep -E "<arquivos editados>"
   ```
   Erros pré-existentes em arquivos não editados podem ser ignorados, mas erros nos arquivos editados são bloqueantes.

2. **Smoke test de boot** — a API precisa **subir sem `UnknownDependenciesException`**:
   ```
   curl -s -o /dev/null -w "HTTP %{http_code}\n" http://192.168.0.58:4000/api/health
   ```
   Se a porta 4000 não responder 200, o watcher Nest provavelmente crashou no boot. Capture o erro com:
   ```
   cd apps/api && timeout 12 node --enable-source-maps dist/main 2>&1 | grep -E "ERROR|UnknownDependencies|Error:" | head -10
   ```
   Erros típicos de boot que **não aparecem** no typecheck:
   - `Nest can't resolve dependencies of the <X>Service (... ?). Please make sure that the argument <Y>Service at index [N] is available in the <Z>Module module` → ver §6.5.
   - `EADDRINUSE :::4000` → watcher antigo segurando porta (não é seu bug, mas confirma que ainda há processos zumbis; aguarde reload).

   **Atenção ao usar `Bash run_in_background` pra subir a API**: comandos em background têm `timeout` (default 120s). Se você usar `node dist/main` direto em background com timeout curto, a API morre quando o timeout estoura. Para o gate, prefira **`npx nest start --watch`** com timeout ≥ 600s, OU rode `node dist/main` em foreground com timeout só pra verificar saúde e depois inicie o watcher real. Se a saída do background mostrar `exit code 0` rapidamente, o processo foi morto pelo timeout — não é "API rodando".

   **Stale code in RAM** (visto em 2026-05-14): o `nest start --watch` recompila o `dist/main.js` quando detecta mudança, MAS NEM SEMPRE REINICIA o processo node em execução. Sintoma: usuário reporta que o fix "não funcionou", `grep` confirma o código novo no `dist/main.js`, mas o backend continua respondendo como se fosse a versão antiga. Diagnóstico: compare `Get-CimInstance Win32_Process | Where {$_.CommandLine -match 'dist.main'} | Select CreationDate` com `ls -la dist/main.js` (mtime). Se o processo é mais antigo que o arquivo, ele tem código stale em RAM. Fix: `Stop-Process -Id <pid> -Force` — o watcher relança automaticamente com o build novo. **HTTP 200 em `/api/health` não garante código atualizado**, só que a porta responde.

3. **Smoke test de endpoint específico** — se mudou um endpoint, chame-o (mesmo retornando 401, mostra que o roteamento está válido):
   ```
   curl -s -o /dev/null -w "HTTP %{http_code}\n" http://192.168.0.58:4000/trpc/<router>.<procedure>
   ```

Sem esse trio, "compilou com sucesso" pode estar mascarando crash em runtime — typecheck não pega DI quebrada do Nest. **Quando o usuário diz que "a API quebrou", quase sempre é §6.5.**

---

## 1. Imports faltando

### 1.1 — `<X> is not defined` ao usar componente sem importar
- **Sintoma**: `Runtime ReferenceError: DropdownMenu is not defined`
- **Causa**: Componente usado no JSX mas não declarado no `import` de `@saas/ui`.
- **Correção**: Adicionar todos os sub-componentes ao import (`DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` — e equivalentes para `Dialog`, `Sheet`, `Select`, `Tabs`).
- **Pre-check**: Após escrever um JSX com `<DropdownMenu>`, `<Dialog>`, `<Sheet>`, `<Select>`, `<Tabs>`, `<Tooltip>`, **rodar grep** dos sub-componentes usados e conferir que todos estão no import topo do arquivo.

### 1.2 — Ícone do `lucide-react` não importado
- **Sintoma**: `<Pause is not defined>` / `<Archive is not defined>`
- **Pre-check**: Quando adicionar um novo `<Icon />` em JSX, conferir o `import { ... } from 'lucide-react'`.

---

## 2. Tipos / Interfaces

### 2.1 — Campo referenciado que não existe na interface TS
- **Sintoma**: `Property 'email' does not exist on type '{ id: string; razaoSocial: string }'`
- **Causa**: Adicionei o campo no schema Prisma e usei no frontend, mas esqueci de atualizar a interface declarada na própria página.
- **Pre-check**: Ao adicionar campo no Prisma + usar no frontend, atualizar simultaneamente a `interface Foo { ... }` local da página.

### 2.2 — Mismatch entre nome do campo backend vs frontend
- **Sintoma**: Backend retorna `emailsContatos`, frontend lê `emails` → undefined silencioso. **Variante mais perigosa**: frontend envia mutation com `{ emails: 'foo' }`, mas o Zod schema só aceita `emailsContatos`. Zod descarta o campo desconhecido **sem erro** — mutation retorna 200 OK mas o valor nunca foi persistido. UI mostra "Salvo" com sucesso, dados não mudam.
- **Causa**: Interface TS local da página listou ambos `emails` e `emailsContatos` por compat legada, e o copy-paste do useState/saveDetails caiu no nome errado.
- **Pre-check**: Padronizar o nome do campo no Prisma como fonte da verdade. Frontend deve usar exatamente o mesmo nome (camelCase). Se a migração do legado tiver nome diferente, mapear via DTO de saída.
- **Pre-check extra**: Sempre conferir o `*Schema` do Zod no `packages/types/` antes de montar o objeto da mutation. Se o schema só conhece `X`, frontend tem que mandar `X` (não `Y`). Quando há campos legados na interface TS local (`emails` + `emailsContatos`), preferir o que o schema valida e remover o legado da interface ou marcar com comentário `// LEGACY READ-ONLY`.

### 2.3 — `setForm({...})` reset com chaves faltando
- **Sintoma**: "A component is changing an uncontrolled input to be controlled"
- **Causa**: Adicionei novo campo ao `useState({ ... })` inicial, mas algum outro `setForm({...})` (ex.: `openCreate`, "limpar") não inclui o campo → vira `undefined` → `value={undefined}` no Input.
- **Pre-check**: Ao adicionar campo ao state inicial do form, **buscar todos os `setForm({` no arquivo** e garantir que todos têm a chave nova. Inputs sempre `value={form.x ?? ''}` ou similar.

### 2.4 — Variável do escopo do componente pai referenciada em sub-componente sem ser passada por prop
- **Sintoma**: `Runtime ReferenceError: opcoesOrigem is not defined` ao trocar de tab/visualizar uma seção que renderiza um sub-componente extraído. TypeScript já reportava `error TS2304: Cannot find name 'opcoesOrigem'` — foi ignorado.
- **Causa**: Em arquivos de form grandes (ex.: `cliente-form.tsx`) é comum extrair partes em sub-componentes (`ComercialCard`, `DetalhesCard` etc.). Ao mover JSX, ficam referências a state/var do pai que não existem no escopo do filho.
- **Correção**: Adicionar a var como **prop tipada** na interface do sub-componente E passá-la na chamada. Não usar `useEffect` para buscar de novo no filho (duplicaria fetch).
  ```tsx
  // antes
  function ComercialCard({ register, control, ... }: { ... }) {
    return <SelectContent>{opcoesOrigem.map(...)}</SelectContent>  // ❌ ReferenceError
  }

  // depois
  function ComercialCard({ register, control, opcoesOrigem, ... }: {
    ...
    opcoesOrigem: Array<{ id: string; valor: string }>
  }) {
    return <SelectContent>{opcoesOrigem.map(...)}</SelectContent>  // ✅
  }
  // E na chamada do pai: <ComercialCard ... opcoesOrigem={opcoesOrigem} />
  ```
- **Pre-check**: **Não ignorar erros TS2304 ("Cannot find name") mesmo que a UI compile** — em forms-form.tsx grandes com sub-componentes, qualquer `error TS2304` é candidato direto a virar runtime ReferenceError quando o usuário navegar para a seção. Rodar `npx tsc --noEmit` antes de fechar a fase e zerar TS2304s.

### 2.5 — Decimal do Prisma chega como string no JSON e quebra `.toFixed()` / aritmética
- **Sintoma**: `Runtime TypeError: descontoPercentCalc.toFixed is not a function` em `<span>{descontoPercentCalc.toFixed(1)}%</span>`. Sempre que um campo do banco é `Decimal` (`db.Decimal(12, 2)` no Prisma), tRPC/Next serializa para JSON como **string** (ex.: `"50.00"`), não number. A interface TS local diz `number`, mas o objeto em runtime é string.
- **Causa**: `Decimal` não tem representação JSON nativa. Prisma serializa via `toString()`. Tipos TS na página (`descontoPct: number`) ficam mentindo, e qualquer chamada como `.toFixed()`, `Math.round()`, ou `value > 0` (com string vazia/`"0.00"`) explode ou comporta-se diferente do esperado.
- **Bug derivado do `||` com strings**: `"0" || fallback` é truthy (string não-vazia). Código tipo `orc.descontoValor || (orc.descontoPct ? subtotal * orc.descontoPct/100 : 0)` cai em `"0"` em vez de no fallback quando o valor real é zero.
- **Correção**: Coerce explícito com `Number(...)` **na fronteira** (logo após ler do `data` retornado do tRPC) e usar a versão numérica em todas as expressões aritméticas / formatação:
  ```ts
  const descontoValorNum = Number(orc?.descontoValor ?? 0) || 0
  const descontoPctNum = Number(orc?.descontoPct ?? 0) || 0
  const descontoAplicado = descontoValorNum || (descontoPctNum > 0 ? subtotal * descontoPctNum / 100 : 0)
  // agora sim: descontoPctNum.toFixed(1) funciona
  ```
- **Pre-check**: Sempre que o schema Prisma tiver `Decimal`, tratar como `string` no tipo TS local OU coerce com `Number(...)` antes de qualquer aritmética/`.toFixed`/`.toLocaleString`. Se usar `||` com campos de banco que podem ser `0`, primeiro coerce — evita o caso `"0"` truthy.

### 2.6 — Conflito de rota por route groups duplicados (`(dashboard)` + `(print)` mesma URL)
- **Sintoma**: Após mover uma página entre route groups (ex: `(dashboard)/orcamentos/[id]/imprimir/page.tsx` → `(print)/orcamentos/[id]/imprimir/page.tsx`), URL retorna `404 NOT_FOUND` ou `500` mesmo que o arquivo exista. Em alguns casos só falha em produção/build.
- **Causa**: Route groups `(...)` em Next.js App Router NÃO aparecem na URL. Se duas pastas em grupos diferentes resolvem para a mesma URL, há conflito silencioso. Pior: o `.next/server/app/...` mantém builds das duas variantes mesmo após apagar a pasta no source — Windows + Next.js dev server às vezes não detecta a deleção (chokidar perde eventos em pastas com nome especial entre parênteses).
- **Correção**: Ao mover uma página entre route groups:
  1. Apagar a pasta antiga **inteira** (não só o `page.tsx`)
  2. Apagar `.next/` por completo (`rm -rf .next`)
  3. Reiniciar o dev server (`pnpm dev`)
- **Pre-check**: Antes de mover páginas entre route groups, fazer `find .next -path "*nome-da-rota*"` pra confirmar que não sobrou cache da localização antiga. Se sobrou, limpar `.next` antes de testar.

### 2.7 — Apagar `.next/` com dev server rodando deixa todas as rotas em 500
- **Sintoma**: Após `rm -rf .next` durante dev, **todas** as URLs retornam `500 Internal Server Error` (não só a editada). `curl http://localhost:3000/qualquer-coisa` → 500.
- **Causa**: Dev server tem caches em memória apontando para arquivos `.next/server/app/.../page.js` que foram apagados. Não consegue servir nenhuma rota porque os artefatos sumiram do disco mas o processo ainda referencia os caminhos antigos. Hot reload não recupera disso.
- **Correção**: **Sempre parar o dev server ANTES de apagar `.next/`**. Fluxo correto: `Ctrl+C` no dev server → `rm -rf .next` → `pnpm dev`.
- **Pre-check**: Quando precisar limpar cache do Next, parar dev server primeiro. Se já apagou `.next` com server rodando, parar e reiniciar — não tem como recuperar in-place.

### 2.8 — `<Select>` com value que não tem `<SelectItem>` correspondente fica visualmente vazio
- **Sintoma**: Modal "Editar X" abre com `value` setado corretamente no state, mas o `<SelectTrigger>` mostra apenas o placeholder. Não há erro no console — só renderização vazia. Mais comum em selects que iteram sobre listas paginadas/filtradas (`servicos`, `clientes`, `usuarios`).
- **Causa**: O array iterado (`servicos`, `clientes`, etc) é a fatia paginada/filtrada do state principal — não a lista completa. Se o item correspondente ao `value` está em outra página ou foi filtrado por categoria/busca, ele não tem `<SelectItem>` na lista renderizada. O Radix Select casa `value` com `SelectItem.value` para exibir o nome — sem item, fica em branco.
- **Correção**: Manter um state separado **completo** (sem filtros nem paginação) usado apenas em selects de relacionamento. Carregar uma vez ao abrir o form/modal pai.
  ```tsx
  // ❌ errado — itera lista paginada
  const [servicos, setServicos] = useState<Servico[]>([])  // já paginada
  setServicos(filtered.slice((page - 1) * limit, page * limit))
  // ...
  <Select value={destinoId}>
    {servicos.map(s => <SelectItem ... />)}  // pode não conter destinoId
  </Select>

  // ✅ certo — state separado para o select
  const [todosServicos, setTodosServicos] = useState<...>([])
  async function loadTodosServicos() {
    const result = await trpc.x.list.query()  // sem filter/slice
    setTodosServicos(result.map(...))
  }
  // ...
  <Select value={destinoId}>
    {todosServicos.map(s => <SelectItem ... />)}
  </Select>
  ```
- **Pre-check**: Sempre que um `<Select>` exibir uma lista de relacionamento (cliente, usuário, serviço, área), verificar se o array iterado é a lista **completa** ou só a página atual. Em modals de edição, prefira state dedicado carregado on-demand.

---

## 3. Runtime React / Next.js

### 3.1 — `Cannot read properties of null (reading 'removeChild')`
- **Sintoma**: Erro em runtime, especialmente após carregar dados ou em re-fetches que disparam `setLoading(true)` brevemente (ex.: trocar filtro/page/viewMode). **Também aparece em fluxos de auth com MFA** quando dois redirects disputam a navegação ao mesmo tempo.
- **Causa**: Container que **possui um Portal** (Radix `<DropdownMenu>`/`<Dialog>`/`<Sheet>` ou `<DragOverlay>` do dnd-kit) é desmontado e remontado durante navegação/re-render. O portal mantém referência a um node DOM que foi removido em paralelo → `removeChild(null)`.
- **Cenário extra (MFA / auth flows)**: Better Auth com plugin `twoFactor` retorna `result.data.twoFactorRedirect = true` em vez de criar session quando o usuário tem MFA ativo. O `twoFactorClient` faz `window.location.href` (hard redirect) automaticamente. Se o handler do `/login` não checar isso e fizer `router.push('/dashboard')` (soft redirect) ao mesmo tempo, os dois redirects competem e a árvore React desmonta no meio → `removeChild(null)`.
- **Correção pt. 1 (re-fetches silenciosos)**: usar `fetchData(silent=true)` em re-fetches pós-mutação para não voltar `loading` a `true`.
- **Correção pt. 2 (não desmontar a árvore com portal)**: nunca colocar o `<DndContext>` ou container de Dialog dentro de `{!loading && ...}`. Em vez disso, manter o container **sempre montado** quando o `viewMode` exige e mostrar o loader como **overlay absoluto** dentro do mesmo wrapper:
  ```jsx
  {viewMode === 'kanban' && (
    <div className="relative flex-1 flex flex-col">
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70">
          <Loader2 className="animate-spin" />
        </div>
      )}
      <DndContext>
        ...colunas...
        <DragOverlay>{activeCard && <Overlay/>}</DragOverlay>
      </DndContext>
    </div>
  )}
  ```
- **Correção pt. 3 (auth/MFA — evitar redirect duplo)**: ao usar `signIn.email` com plugin `twoFactor`, **sempre checar `result.data.twoFactorRedirect`** antes de fazer `router.push`. Se for `true`, o plugin já vai redirecionar via `window.location` — não disparar push manual:
  ```ts
  const result = await signIn.email({ email, password })
  if (result.error) { setError(...); return }
  // Se MFA ativo, o plugin twoFactorClient redireciona via onTwoFactorRedirect.
  // Nao fazer push pra /dashboard para nao competir com o hard-redirect.
  if ((result.data as any)?.twoFactorRedirect) return
  router.push('/dashboard')
  ```
- **Correção pt. 4 (transição de auth/auth-shell pro app)**: após `verifyTotp`, `signIn.email` ou qualquer ação que **muda o layout** (sai de `(auth)` pra `(dashboard)`), preferir **hard redirect** (`window.location.href`) em vez de `router.push`. Soft navigation via Next router mantém parte da árvore React em transição (incluindo portals do layout antigo) — `removeChild` aparece quando o novo layout monta antes do antigo terminar de desmontar.
- **Correção pt. 5 (race condition session cookie)**: após `verifyTotp` retornar OK, o cookie de session ainda **não foi processado pelo browser** quando você faz `window.location.href`. Resultado: dashboard rejeita a request → volta pra `/login`. Adicionar delay curto antes do redirect:
  ```ts
  const res = await authClient.twoFactor.verifyTotp({ code, trustDevice })
  if (res.error) { ...; return }
  // Browser leva alguns ms para processar Set-Cookie. Sem o await, race condition.
  await new Promise(r => setTimeout(r, 250))
  window.location.href = '/dashboard'
  ```
  **NÃO** usar `authClient.getSession({ disableCookieCache: true })` para confirmar — em alguns cenários ele retorna `data: null` mesmo com session válida (cache do client interno), gerando falso negativo "Sessão não criada".
  Aplicável a qualquer fluxo onde o cookie é setado server-side e usado no próximo request: 2FA, magic-link, OAuth callback, refresh-token rotation.
- **Pre-check**: Em qualquer página com `<DragOverlay>`, `<Dialog>` aberto-condicional ou `<DropdownMenu>` em árvore que pode desmontar: o componente **dono do portal** precisa estar fora do bloco condicional `{!loading && ...}`. Loader vira overlay, não sibling que substitui. Em fluxos de auth com plugins (twoFactor, magicLink, etc.), inspecionar `result.data` para sinais de redirect antes de redirecionar manualmente.

### 3.2 — Input controlled/uncontrolled warning
- **Sintoma**: "A component is changing an uncontrolled input to be controlled"
- **Causa**: `value` do `<Input>` indo de `undefined` para string definida.
- **Correção**: Inicializar todos os campos do form com string vazia, nunca `undefined`. Em renders nullable, usar `value={x ?? ''}`.

### 3.3 — `suppressHydrationWarning` necessário em wrapper
- **Sintoma**: Hydration mismatch durante refresh
- **Pre-check**: Em `<div>` raiz que muda baseado em `localStorage`/`window`, adicionar `suppressHydrationWarning`.

### 3.3.1 — `Cannot access 'X' before initialization` (Temporal Dead Zone num componente)
- **Sintoma runtime**: `ReferenceError: Cannot access 'fetchList' before initialization` apontando pra **dependency array** de um `useEffect` antes da declaração da função.
- **Causa**: Em componentes longos, ao inserir um novo `useEffect` (ex: novo SSE listener), o bloco foi posicionado **antes** das `useCallback`s que aparecem no `[…]` de dependências. JavaScript não permite usar `const`/`let` antes do `let`/`const` no escopo do componente (TDZ).
- **Correção**: Mover o novo `useEffect` para **depois** das `useCallback`s que ele referencia. Convenção: declarar todos os fetchers/handlers (`useCallback`) primeiro, e em seguida os `useEffect`s que os consomem.
- **Pre-check**: Ao adicionar um `useEffect` novo em um componente já existente, conferir que **cada identificador no `[…]`** já foi declarado antes (search no arquivo: `const X = ` deve aparecer **acima** do useEffect). Não confiar só no typecheck — TypeScript não detecta TDZ entre declarações `const` no mesmo escopo de função.

### 3.5 — `Tooltip must be used within TooltipProvider`
- **Sintoma**: Runtime error ao montar uma página que usa `<Tooltip>` do `@saas/ui`. Stack aponta para o componente Radix UI Tooltip.
- **Causa**: O Radix Tooltip exige um `<TooltipProvider>` ancestral. **Esse provider NÃO está incluído no layout raiz do app** — cada página/componente que usa Tooltip teria de envolver o conteúdo manualmente. Importar e usar `Tooltip` "solto" sem wrapper sempre quebra.
- **Correção**: Para uma dica de texto simples em botão/ícone, usar o atributo HTML nativo `title=`. Funciona em qualquer browser, zero dependência e visualmente equivalente a tooltip discreto:
  ```tsx
  // Antes (quebra):
  <Tooltip>
    <TooltipTrigger asChild><Button>...</Button></TooltipTrigger>
    <TooltipContent>Abrir fonte</TooltipContent>
  </Tooltip>

  // Depois (funciona):
  <Button title="Abrir fonte">...</Button>
  ```
  Se precisar de tooltip estilizado/rich content, envolver explicitamente a árvore com `<TooltipProvider>` no topo do componente.
- **Pre-check**: Antes de importar `Tooltip` do `@saas/ui`, conferir se o ancestral mais próximo (ou o layout da rota) já tem `<TooltipProvider>`. Em /obrigacoes/page.tsx tinha ficado sem — corrigido trocando por `title`.

### 3.9 — `<div> cannot be a descendant of <p>` (hydration error com Badge dentro de p)
- **Sintoma**: Console "In HTML, `<div>` cannot be a descendant of `<p>`". Stack aponta pra um `<Badge>` (ou outro componente que renderiza `<div>`) usado dentro de um `<p>` próprio.
- **Causa**: `<Badge>` do `@saas/ui` é uma `<div>` (`badge.tsx`: `return <div ... />`). HTML proíbe block-elements dentro de `<p>` — o browser fecha o `<p>` automaticamente antes do `<div>`, gerando mismatch com o que o React renderizou. **Outros componentes `@saas/ui` que renderizam `<div>` e podem causar isso**: `Card`, `Alert`, `Tooltip`, qualquer `Primitive.div` do Radix.
- **Correção**: Trocar o `<p>` por `<div>` ou `<span>` (e ajustar classes pra manter o look):
  ```tsx
  // ❌ Quebra
  <p className="text-sm font-semibold">
    Sugestão: {nome}
    <Badge variant="outline">{score}% match</Badge>
  </p>

  // ✅ Funciona
  <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
    <span>Sugestão: {nome}</span>
    <Badge variant="outline">{score}% match</Badge>
  </div>
  ```
- **Pre-check**: Ao usar `<Badge>`, `<Alert>` ou outro componente que possa renderizar `<div>` interno, o pai imediato precisa ser `<div>`/`<section>`/etc., **nunca** `<p>`. Pra texto + badge inline, prefira `<div className="flex items-center gap-2 flex-wrap">` + `<span>` em vez de `<p>`.

### 3.8 — `<button> cannot be a descendant of <button>` (hydration error)
- **Sintoma**: Console error "In HTML, `<button>` cannot be a descendant of `<button>`" + falha de hidratação. Stack aponta pra um componente que renderiza outro componente clicável dentro de um `<button>` próprio.
- **Causa**: Vários componentes do `@saas/ui` baseados em Radix renderizam um `<button>` por baixo dos panos — incluindo `<Checkbox>`, `<DropdownMenuTrigger asChild>`, `<Switch>`, `<ToggleGroupItem>`. Quando você envolve um deles em um `<button>` próprio (ex.: linha clicável de lista que mostra um checkbox visual), o HTML resultante tem `<button><button>...</button></button>` — inválido.
- **Correção**: Trocar o componente Radix por um **indicador visual puro** (span/div) já que o `<button>` pai captura o click. Estilo CSS replica o look-and-feel do componente original:
  ```tsx
  // ❌ Quebra — Checkbox renderiza <button> dentro do <button> pai
  <button onClick={toggle}>
    <Checkbox checked={ativo} className="pointer-events-none" />
    <span>{label}</span>
  </button>

  // ✅ Funciona — span com style de checkbox
  <button onClick={toggle} aria-pressed={ativo}>
    <span className={cn(
      'h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center',
      ativo ? 'bg-primary border-primary text-primary-foreground' : 'border-input bg-background',
    )}>
      {ativo && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
    <span>{label}</span>
  </button>
  ```
  Alternativa: usar `<label>` + Checkbox nativo (Radix permite clicar no label):
  ```tsx
  <label className="flex items-center gap-2 cursor-pointer">
    <Checkbox checked={ativo} onCheckedChange={toggle} />
    <span>{label}</span>
  </label>
  ```
- **Pre-check**: Componentes Radix-based que renderizam button — não embrulhar em outro `<button>`. Quando uma linha de lista inteira precisa ser clicável + ter checkbox/dropdown visível, ou (a) usa span/div estilizado pra parecer um botão, ou (b) usa `<label>` + Checkbox real (label captura click no Checkbox).

### 3.7 — `Cannot read properties of undefined (reading 'map')` em export duplicado de `@saas/types`
- **Sintoma**: Runtime error em uma página específica. Stack aponta pra `XXX.map(...)` onde XXX é uma constante exportada por `@saas/types`. Console mostra `undefined` ao logar o valor.
- **Causa**: Dois arquivos em `packages/types/src/` exportam **o mesmo nome** (tipo + const, ou dois consts homônimos). O `export * from './fileA'` + `export * from './fileB'` no `index.ts` causa **conflito de re-export**. O bundler do Next/Webpack resolve a ambiguidade dando `undefined` em vez de eleger um. TypeScript type-checker pode passar (avisa em modo strict mas compila).
- **Correção**: Consolidar em UM lugar (geralmente o módulo mais antigo / canônico). Outros módulos importam e re-exportam com alias quando precisarem do mesmo símbolo:
  ```ts
  // ❌ Ambos exportam `TaxRegime` — conflito
  // empresa.ts:
  export const TaxRegime = { SIMPLES_NACIONAL: 'SIMPLES_NACIONAL', ... } as const
  // grupo-obrigacao.ts:
  export const TAX_REGIME = ['SIMPLES_NACIONAL', ...] as const
  export type TaxRegime = (typeof TAX_REGIME)[number]  // ⚠ tipo homônimo

  // ✅ Consolidar em empresa.ts (fonte única)
  // empresa.ts:
  export const TaxRegime = { ... } as const
  export type TaxRegime = (typeof TaxRegime)[keyof typeof TaxRegime]
  export const TAX_REGIME_VALUES = Object.values(TaxRegime)
  // grupo-obrigacao.ts:
  import { TaxRegime, TAX_REGIME_VALUES, taxRegimeLabels } from './empresa'
  export { TaxRegime, TAX_REGIME_VALUES, taxRegimeLabels }
  // Usar `z.nativeEnum(TaxRegime)` em vez de `z.enum([...])` quando trabalha com const-object.
  ```
- **Pre-check**: Antes de criar uma constante/tipo em `packages/types/src/<modulo>.ts`, faça `grep "export const NomeDoSimbolo\|export type NomeDoSimbolo" packages/types/src` pra ver se já existe noutro arquivo. Em caso afirmativo, importe de lá em vez de re-declarar.

### 3.6 — `Each child in a list should have a unique "key" prop` com Fragment curta dentro de `.map()`
- **Sintoma**: Console warning "Each child in a list should have a unique 'key' prop" mesmo quando você está retornando algo no `.map()`. Stack aponta para o pai imediato (ex.: `TableBody`).
- **Causa**: O callback do `.map()` retorna **dois ou mais nós irmãos** envoltos em `<>...</>` (sintaxe curta do Fragment). A sintaxe curta **não aceita** `key`. Mesmo que você tenha posto `key={...}` num filho interno, o React precisa da key **no nó raiz** retornado.
- **Correção**: Trocar `<>` por `<Fragment key={x}>` (Fragment longa):
  ```tsx
  import { Fragment } from 'react'

  // ❌ Quebra — Fragment curta não aceita key
  items.map((i) => (
    <>
      <TableRow key={i.id}>...</TableRow>
      <TableRow>...exemplos...</TableRow>
    </>
  ))

  // ✅ Funciona
  items.map((i) => (
    <Fragment key={i.id}>
      <TableRow>...</TableRow>
      <TableRow>...exemplos...</TableRow>
    </Fragment>
  ))
  ```
- **Pre-check**: Sempre que o callback do `.map()` precisar retornar mais de 1 sibling, use `<Fragment key={...}>` no envolvente — nunca `<>`.

### 3.4 — `text-white` (ou outra classe Tailwind) sendo ignorado em `<h1>`/`<h2>`/`<h3>`
- **Sintoma**: Aplico `text-white` no h1 mas o texto continua escuro (ou vice-versa). Frequentemente em headers com background colorido ou imagem.
- **Causa**: `globals.css:198-205` define `h1, h2, h3 { color: rgb(18, 52, 77) }` como regra global. Essa regra tem mesma especificidade da classe Tailwind, mas o CSS global é carregado depois — vence a cascata.
- **Correção**: Para sobrescrever cor em h1/h2/h3, usar **inline style** (maior precedência que classes):
  ```tsx
  <h1 className="text-2xl font-bold" style={{ color: '#ffffff' }}>...</h1>
  ```
  Ou Tailwind important: `!text-white` — mas inline é mais explícito e funciona sem dúvidas.
- **Pre-check**: Quando precisar de cor customizada em h1/h2/h3 (especialmente em banners/headers com bg colorido), usar `style={{ color }}` em vez de `text-*`. O mesmo se aplica se aparecer outra regra global do tipo `label { color: #000 }`.

---

## 4. Schema / Banco de Dados

### 4.1 — Coluna não existe após mudança no schema
- **Sintoma**: `column "x" does not exist`
- **Causa**: Migrations não estão sendo usadas; alterações precisam ser aplicadas via `ALTER TABLE` manualmente.
- **Correção**: Após editar `schema.prisma`, rodar `ALTER TABLE` correspondente direto via `node -e ... $executeRawUnsafe` ou `prisma db push`.
- **Pre-check**: Toda mudança em `schema.prisma` requer 2 passos: (1) ALTER TABLE no DB, (2) `pnpm --filter @saas/db db:generate`.

### 4.2 — Prisma Client desatualizado após schema change
- **Sintoma**: Tipos antigos sendo usados; `field xyz does not exist on type` mesmo após adicionar
- **Causa**: Prisma client não foi regenerado.
- **Correção**: `taskkill /F /IM node.exe` (Windows) + `pnpm --filter @saas/db db:generate`
- **Pre-check**: Sempre regenerar após mudar schema; matar todos os processos node antes para liberar lock no DLL.

### 4.3 — NOT NULL em coluna que virou nullable
- **Sintoma**: `null value in column "x" violates not-null constraint`
- **Causa**: Tornei o campo opcional no Prisma mas a coluna no DB ainda tem `NOT NULL`.
- **Correção**: `ALTER TABLE x ALTER COLUMN col DROP NOT NULL`.
- **Pre-check**: Ao mudar `String` para `String?` no Prisma, sempre rodar `DROP NOT NULL` no DB.

### 4.4 — Enum não existe ao usar
- **Sintoma**: `type "OrcamentoStatus" does not exist`
- **Pre-check**: Ao usar `enum` no schema Prisma, criar o tipo no DB com `CREATE TYPE "X" AS ENUM (...)` antes do primeiro INSERT.

### 4.5 — Campo de DSL/configuração apontando para coluna inexistente no schema
- **Sintoma**: Avaliador de regras roda em produção e sempre retorna `null` para um campo do DSL — regras silenciosamente nunca disparam (nem `eq` nem `is_null` se comportam como esperado, porque `getValor` retorna sempre o mesmo valor).
- **Causa**: Ao desenhar o DSL (ex: `CAMPOS_CONDICAO` em `processo.ts`) anotei nomes plausíveis (`cliente.naturezaJuridica`, `cliente.razaoSocial`) sem validar que existem no Prisma. O TypeScript não reclama porque o DSL é só uma string literal numa enum Zod; o runtime tenta `select: { naturezaJuridica: true }` e o Prisma falha com `Unknown field` — ou pior, se o `select` é dinâmico via `getValor`, retorna `undefined` silenciosamente.
- **Pre-check**: Ao definir um DSL/whitelist de campos baseados no schema Prisma, abrir o `schema.prisma` e conferir cada nome literal antes de adicionar à enum. Cobrir com pelo menos um teste de unit que faça `select` real do banco para cada `CampoDSL`. Se o backend usa `select` dinâmico, validar a existência do campo via tipo (`keyof Prisma.ClienteSelect`) ao montar o select.

### 4.6 — Trigger automático de transição de status falha silenciosamente por FSM forward-only
- **Sintoma**: Cascata interna (ex: `finalizarExecucaoComCascata` tentando levar orçamento para `FINALIZADO` quando a execução-raiz conclui) é engolida — orçamento permanece em status anterior. Nenhum erro pro usuário, apenas `console.warn` no log da API.
- **Causa**: A FSM do domínio (`ORCAMENTO_ALLOWED_TRANSITIONS`) só permite `APROVADO → LIBERADO → FINALIZADO`, refletindo o fluxo manual operacional. Triggers automáticos de cascata tentam `APROVADO → FINALIZADO` direto e batem na validação `isAllowedTransition()`, que lança erro. Como o chamador envolve em `try/catch` com warning silencioso, o usuário nunca vê.
- **Correção**: Triggers internos devem **respeitar a FSM** progredindo passo a passo, mas pular notificações dos passos intermediários para não disparar e-mails fora de contexto. Adicionar opção `skipNotifications` no `changeStatus` e fazer o trigger chamar 2 vezes:
  ```ts
  // 1. APROVADO → LIBERADO (silencioso — não dispara email "liberado para execução")
  if (orc.status === 'APROVADO') {
    await orcamentoService.changeStatus(id, 'LIBERADO', userId, { skipNotifications: true })
  }
  // 2. LIBERADO → FINALIZADO (normal — dispara email "finalizado" + cria pesquisa NPS)
  await orcamentoService.changeStatus(id, 'FINALIZADO', userId)
  ```
- **Pre-check**: Sempre que um trigger automático faz `changeStatus`, verificar se a transição alvo está direta na FSM. Se não, progredir por estágios e usar `skipNotifications: true` nos intermediários cujos side-effects (e-mails, criação de derivados) não fazem sentido fora do fluxo manual. **Nunca** deixar o `try/catch` engolir erro silenciosamente sem alertar o usuário ou registrar evento — pelo menos chame `addEvento` com tipo `cascata_falhou` para a auditoria saber.

### 4.7 — Hard-delete de Servico falha por FK em outras tabelas (contratos, etc)
- **Sintoma**: `prisma.servico.delete()` lança `PrismaClientKnownRequestError` com `Foreign key constraint violated on the constraint: contrato_servicos_servico_id_fkey` (ou similar para outras tabelas que referenciam Servico).
- **Causa**: Templates de Servico podem estar vinculados a múltiplas tabelas além de execução/etapas/passos: `contrato_servicos`, `orcamento_itens` (catalogoId), encadeamentos, etc. CASCADE no schema só desce até filhos diretos do próprio modelo, não sai pra outras tabelas que referenciam o template.
- **Correção**: Para cleanup de templates duplicados/obsoletos, prefira **soft-delete** (`update({ data: { ativo: false, disponivelOrcamento: false } })`) em vez de `delete()`. Soft-delete:
  - Tira o template do `/servicos` (filtro padrão `ativo: true`)
  - Tira do seletor de orçamento (`disponivelOrcamento: false`)
  - Preserva FKs históricas (contratos antigos, orçamentos passados não quebram)
  - É idempotente para re-run de scripts de cleanup
- **Pre-check**: Antes de hard-delete em qualquer modelo "raiz" (Cliente, Servico, Empresa, etc), buscar `findMany` em todas as tabelas que têm FK para ele. Se houver vínculos, usar soft-delete. Em scripts de cleanup, **sempre comece por soft-delete** — só upgrade para hard-delete quando confirmar zero vínculos.

---

## 5. Validação (Zod)

### 5.1 — `limit > max permitido`
- **Sintoma**: 400 no tRPC com "Number must be less than or equal to 100"
- **Causa**: Tentei passar `limit: 200` para o kanban; `paginationSchema` define `max(100)`.
- **Pre-check**: Antes de passar valores grandes em paginated queries, conferir o schema Zod do input.

### 5.2 — Campo obrigatório vazio = `undefined`
- **Sintoma**: "Required" ao salvar
- **Pre-check**: Validações Zod devem refletir o que o usuário pode esperar. Se o backend tolera vazio, usar `.optional()` ou `.default('')`.

### 5.3 — Mutation tRPC com input "Required" no path `data`
- **Sintoma**: `[ { "code": "invalid_type", "expected": "object", "received": "undefined", "path": [ "data" ], "message": "Required" } ]`
- **Causa**: O endpoint foi declarado com `.input(z.object({ id, data: schema }))`, mas o frontend está mandando os campos no nível raiz (`{ id, nome, ... }`) ao invés de embrulhar em `data`.
- **Correção**: Envolver os campos em `data`: `mutate({ id, data: { nome, ... } })`.
- **Pre-check**: Antes de chamar uma mutation `update*` no frontend, conferir como o `input()` do endpoint está montado — alguns aceitam `{ id, ...campos }`, outros `{ id, data: {...} }`.

---

## 6. Módulo / Dependency Injection (NestJS)

### 6.1 — Dependência circular entre módulos
- **Sintoma**: `Cannot create instance of X. UndefinedDependency`
- **Correção**: `forwardRef(() => ServiceY)` em ambos os lados (módulo + injeção no constructor).
- **Pre-check**: Quando dois services se injetam mutuamente, sempre `forwardRef`.

### 6.2 — `@Global()` não precisa estar no `imports[]`
- **Pre-check**: `EmailModule` é `@Global()`. Não tentar importá-lo em outros módulos — basta injetar `EmailService` no constructor.

### 6.3 — Cron scheduler com método `executar()` retornando algo diferente de `void`
- **Sintoma**: `TS2769: No overload matches this call. Argument of type '() => Promise<{...}>' is not assignable to parameter of type 'CronCommand<null, false>'`
- **Causa**: `new CronJob(cron, fn)` espera callback que retorne `void` (ou `Promise<void>`). Se o método `executar()` retornar stats (`{ disparados, ignorados }` etc), o tipo não bate.
- **Correção**: Envolver no `() => { void this.executar() }` no construtor. Mantém o método com retorno tipado pra uso explícito (testes/manual), mas o cron recebe void.
- **Pre-check**: ao criar `*Scheduler`, se quiser retornar stats do `executar()`, sempre envelopar na função do cron.

### 6.4 — Schedulers cruzados criam circular DI
- **Sintoma**: Modulo A (ex.: `NotificacaoModule`) declara um scheduler que injeta service do Modulo B (ex.: `ServicoService`), enquanto B exporta service consumido por A (ex.: `NotificacaoService`). Nest dá erro de undefined dependency.
- **Correção**: `forwardRef(() => ServiceB)` no `@Inject(...)` do scheduler **E** `forwardRef(() => ModuleB)` nos `imports[]` de ambos os módulos. Não basta forwardRef num lado só.
- **Pre-check**: Ao criar um `*Scheduler` que precisa orquestrar fluxo de outro módulo (ex.: criar execuções), verifique se há ciclo. Sempre forwardRef nos dois lados.

### 6.5 — Service injetado sem importar o módulo dono (não-Global)
- **Sintoma runtime no boot**:
  ```
  Nest can't resolve dependencies of the CrmService (OrcamentoService, CrmEventsService, ?).
  Please make sure that the argument NotificationService at index [2] is available in the CrmModule module.
  ```
  Build (`nest build` / `tsc`) passa, watcher recompila — mas API morre no `InstanceLoader` antes de `Nest application successfully started`. Porta 4000 fica fora do ar.
- **Causa**: Adicionei `private readonly notificationService: NotificationService` no constructor de `CrmService`, mas `CrmModule` não tinha `NotificationModule` em `imports[]`. Como `NotificationModule` **não é `@Global()`**, o Nest não consegue resolver o provider.
- **Correção**: Adicionar o módulo dono em `imports[]`:
  ```ts
  // crm.module.ts
  import { NotificationModule } from '../notification/notification.module'

  @Module({
    imports: [forwardRef(() => OrcamentoModule), NotificationModule],
    // ...
  })
  ```
- **Pre-check** (faça SEMPRE ao injetar service novo num constructor):
  1. O módulo dono do service injetado é `@Global()`? → não precisa importar. Lista atual de globais: `PermissionsEventsModule`, `NotificationsEventsModule`, `EmailModule`.
  2. Caso contrário, adicionar `XModule` em `imports[]` do módulo consumidor.
  3. **Rodar o smoke test §GATE.2** — typecheck NÃO detecta esse erro porque o tipo está correto; só o boot do Nest pega.
- **Lição central**: TypeScript não modela o grafo de DI do Nest. Sempre que o constructor de um service mudar, rodar o gate de boot.

---

## 7. Roteamento (Next.js)

### 7.1 — Conflito entre rota dentro de `(dashboard)` e fora
- **Pre-check**: Rotas em route groups `(name)` mantêm a mesma URL. Não criar `(dashboard)/x` e `x/` que produzam o mesmo path.

### 7.2 — Página pública precisa de layout próprio
- **Pre-check**: Páginas sem auth ficam em `(public)/...`, com `layout.tsx` mínimo (sem sidebar/header autenticado).

---

## 8. SSE / Realtime

### 8.1 — `EventSource` em loop infinito de reconexão
- **Sintoma**: Browser trava, requests sem fim no console.
- **Causa**: Comportamento padrão do `EventSource` é reconectar imediatamente em erro.
- **Correção**: No `onerror`, fechar manualmente (`es.close()`) e agendar reconexão com `setTimeout(connect, 15000)`. Usar flag `closed` para cleanup.
- **Pre-check**: Toda nova conexão SSE deve ter retry com backoff e cleanup correto no useEffect return.

---

## 9. tRPC

### 9.1 — Endpoint público não acessível
- **Pre-check**: Para rotas sem auth (token-based), usar `publicProcedure`, não `readProcedure(MODULE)`.

### 9.2 — `ctx.userId` undefined em endpoint que requer auditoria
- **Pre-check**: Sempre passar `ctx.userId` ao service quando ele registra evento no log.

### 9.4 — Auth controller perde múltiplos Set-Cookie ao usar `res.setHeader`
- **Sintoma**: Login com MFA retorna 200, mas o browser só recebe **um** dos cookies. Tipicamente o `better-auth.session_token` não é setado ou o `better-auth.two_factor` não é expirado. Resultado: dashboard rejeita session válida e redireciona para `/login` em loop.
- **Causa**: O Better Auth (e qualquer auth lib) pode retornar **múltiplos `Set-Cookie`** em uma única response (ex: `verifyTotp` seta session, expira cookie temporário, e seta trust-device — 3 cookies de uma vez). O loop `response.headers.forEach((v,k) => res.setHeader(k,v))` **sobrescreve** o header anterior — só o último Set-Cookie chega ao browser.
- **Correção**: Tratar `Set-Cookie` como array, usando `Headers.getSetCookie()`:
  ```ts
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie?.() ?? []
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return
    res.setHeader(key, value)
  })
  if (setCookies.length > 0) res.setHeader('Set-Cookie', setCookies) // express aceita array
  ```
- **Pre-check**: Em qualquer controller/route que faça proxy de Web Response → Express Response, **nunca** copie cookies via `setHeader` no forEach. Sempre use `getSetCookie()` (Node 18.14+) e passe array para `res.setHeader('Set-Cookie', [...])`.

### 9.3 — `getById` sem incluir relação esperada
- **Sintoma**: Campo da relação aparece em branco na tela de detalhes mesmo com dado salvo no banco. Tipico em campos relacionais (`solicitante`, `responsavel`, `responsavelTecnico`, etc.).
- **Causa**: `list` enriquece via batch `findMany IN`, mas o `getById` foi escrito separadamente e esqueceu de fazer o mesmo. O frontend lê `data.x.name` mas o backend só retorna `data.xId`.
- **Correção**: Replicar o enrichment no `getById`. Quando vários IDs vêm do mesmo modelo, agrupar numa única query `findMany IN`:
  ```ts
  const userIds = [orc.solicitanteId, orc.responsavelId].filter(Boolean) as string[]
  const users = userIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id, name, email, image } })
    : []
  const map = new Map(users.map(u => [u.id, u]))
  return { ...orc, solicitante: orc.solicitanteId ? map.get(orc.solicitanteId) || null : null, responsavel: ... }
  ```
- **Pre-check**: Sempre que o `list` enriquece um relacionamento (cliente, responsavel, solicitante, etc.), o `getById` do mesmo modulo deve enriquecer **identicamente**. Se a UI usa o mesmo campo (ex: `data.responsavel.name`) nas duas telas, o backend deve retornar o mesmo shape.

### 9.5 — Cast TS de campo novo no Prisma após `db push`
- **Sintoma**: após adicionar campo no schema (ex: `rotulo` em `ServicoEncadeamento`) e fazer `db push + generate`, o tsc reclama em casts:
  ```
  Conversion of type '{...}' to type '{ rotulo: string | null }' may be a mistake.
  Property 'rotulo' is missing in type '{...}'
  ```
- **Causa**: `prisma.X.findMany()` sem `select` cria o tipo a partir do client cacheado em memória — pode estar atrás do schema. O cast simples não sobrepõe.
- **Pre-check**:
  - Sempre rodar `prisma generate` explicitamente após `db push`
  - Reiniciar API (`nest start --watch` mantém o tipo antigo até DLL travada ser liberada)
  - Se persistir: duplo cast `(x as unknown as { rotulo?: string | null }).rotulo`
  - Ou (melhor): incluir o campo explicitamente no `select` do query, evita o cast.

---

## 10. Estado / UX

### 10.1 — Re-fetch pós-mutação pisca a tela / desmonta árvore com portal
- **Sintoma**: kanban pisca ao soltar; página de detalhes "vai pro loader" ao incluir item; `Cannot read properties of null (removeChild)` em portais (Dialog/DragOverlay/DropdownMenu).
- **Causa**: `fetch*()` sem flag silent dispara `setLoading(true)`, que desmonta toda a árvore renderizada (incluindo portals abertos) antes do re-render.
- **Correção**: Padronizar todo `fetch*` da página com `silent` opcional. Carregamento inicial via `useEffect` chama com `false` (loader visível); **toda mutação** (`handleAddItem`, `handleSave`, drag end, etc.) chama com `true`.
  ```ts
  const fetchOrc = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try { setOrc(await trpc.x.getById.query(...)) }
    finally { if (!silent) setLoading(false) }
  }, [id])
  ```
- **Pre-check**: Em qualquer página com forms persistentes ou portals (Dialog/Sheet/DropdownMenu/DragOverlay), todas as chamadas `fetch*()` que vêm depois de uma mutação devem ser `fetch*(true)`. Só o `useEffect` inicial passa `false`.

### 10.2 — Item se sobrepõe ao final do drag
- **Causa**: Listener `onClick` do card disparando ao soltar.
- **Correção**: Verificar `isDraggingAny` antes de chamar `onClick={() => openDetail(...)}`.

### 10.3 — Card pula ao iniciar drag por mudança no header
- **Causa**: Botão `<MoreVertical>` removido do DOM no estado de drag → header colapsa.
- **Correção**: Manter sempre o `<div className="h-6 w-6">` wrapper, condicionar apenas o conteúdo interno.

### 10.4 — `useState(defaultValue)` persiste valor entre aberturas de dialog
- **Sintoma**: Usuário cria o primeiro bloco PERGUNTA, edita os campos (pergunta/opções). Ao criar o segundo, o dialog abre já com os valores do primeiro — não com os defaults declarados no `useState`.
- **Causa**: `useState(defaultValue)` só usa o `defaultValue` na **primeira** renderização do componente. Em aberturas subsequentes do dialog (que reaproveitam o mesmo componente, sem unmount), o estado persiste como ficou.
- **Correção**: Resetar explicitamente os campos quando o dialog abre. Em vez de só `setOpen(true)`, fazer `setOpen(true); setNome(''); setOpcoes(['default1', 'default2'])`. Ou seja, **forçar a reidratação** dos defaults a cada abertura.
- **Pre-check**: Sempre que um form em modal/popover guardar estado no componente pai, conferir o ponto de "abrir" e resetar campos explicitamente. Não confiar no `useState(defaultValue)` pra isso.

---

## Checklist pré-entrega (rodar antes de declarar uma fase como concluída)

- [ ] **Imports**: grep dos componentes usados no JSX presentes no `import`
- [ ] **Tipos**: novas props/campos no schema refletidos nas interfaces TS locais
- [ ] **Schema/DB**: `ALTER TABLE` rodado para cada mudança no Prisma + `db:generate`
- [ ] **Builds**: `pnpm --filter api build` retorna `compiled successfully`
- [ ] **Lint TS**: `npx tsc --noEmit` no escopo da página alterada (sem erros novos)
- [ ] **Forms**: todos os `setForm({...})` reset incluem todas as chaves do state
- [ ] **Inputs**: nenhum `value={x}` onde `x` pode ser `undefined`
- [ ] **Portais**: nenhum ternário grande de árvore DOM com Dialog/Sheet/DragOverlay ativo
- [ ] **Public pages**: rotas públicas em `(public)/` com layout mínimo
- [ ] **tRPC**: endpoints com `publicProcedure` se não exigem auth, `readProcedure(MODULE)` caso contrário
- [ ] **Auditoria**: actions importantes registram evento via `addEvento`

---

## Atualizações ao registro

Quando um novo bug aparecer:
1. Adicionar entrada na seção apropriada com sintoma + causa + pre-check
2. Atualizar checklist se for um padrão recorrente (≥ 2 ocorrências)
3. Não duplicar — preferir atualizar entrada existente

---

## Pendências de typecheck (backlog — NÃO bloqueiam runtime)

Capturado em 2026-06-06 durante o início do app mobile. A API tem **~100 erros de
`tsc --noEmit` pré-existentes** que NÃO impedem o boot (a build transpila sem
checagem estrita; `curl /api/health` = 200). São independentes do app mobile —
tratar numa rodada dedicada de saneamento de tipos. Distribuição por arquivo:

- `src/dte/dte.service.ts` — 46
- `src/crm/crm.service.ts` — 10
- `src/servico/servico.service.ts` — 5
- `src/cnd/cnd-municipal.service.ts` — 5
- `src/cliente/cliente.router.ts` — 5
- `src/cnd/cnd.router.ts` — 4
- `src/user/user.service.ts` — 3
- `src/cnd/alvara-funcionamento.service.ts` — 3
- `src/certificado-digital/pfx-parser.ts` — 3
- `src/acessorias/acessorias.service.ts` — 3 (ex: TS2322 `id` possivelmente undefined)
- `src/contrato/contrato.service.ts` — 2
- `src/cnd/cgu-certidao.service.ts` — 2
- `src/certificado-digital/bulk-import-cert.service.ts` — 2
- demais: 1 cada (tabs, socio.router, orcamento, cnpj, cnd/alvara-bombeiros,
  cliente.service, certificado-digital.service)

Reproduzir: `cd apps/api && npx tsc --noEmit`. Priorizar `dte.service.ts` (quase
metade do total).
