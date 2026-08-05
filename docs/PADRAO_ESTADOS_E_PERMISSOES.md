# Padrão de Estados & Permissões

Toda regra que **deriva** um estado ou valor — seja por **lógica/matemática** (uma janela de tempo, um total, um SLA estourado, um status computado) ou por **permissão** — é calculada **uma vez, no backend**, e volta no payload como **flag/valor pronto**. O front **consome e compõe**; nunca reimplementa a regra. Permissões são um **caso particular** desse princípio.

> **Diretriz de melhoria contínua (sob confirmação):** ao notar uma regra derivada **duplicada/recalculada no front** (ou ad-hoc que deveria ser um flag do backend), ou um `write` que libera campos que deveriam ter permissão mais fina, ou uma tela que gateia por permissão mas exige reload — **proponha o encaixe**. Nunca aplique direto: sugira, explique o ganho (fim do drift), e só depois de confirmado.

---

## Parte A — Estado derivado mora no backend; o front compõe

### A regra
- **Fonte única.** A regra vive num helper do backend, usado tanto por quem a **impõe** (guard / mutation) quanto por quem a **informa** (a flag no payload). Nunca duas cópias.
- **O payload traz estado PURO** — a decisão já calculada: `congelado`, `bloqueiaMensagemPublica`, `avaliacaoDisponivel`, `totalGeral`… Não misture o **papel do usuário** (`podeAtuar`, `isSolicitante`) na resposta da API.
- **O front compõe** o papel por cima: `const podeEditar = podeAtuar && !ticket.congelado`. Composição trivial, sem lógica de negócio no cliente.

### Por quê
Evita **drift**: se a regra existe em dois lugares (back e front), eles divergem com o tempo — a lista diz uma coisa e o detalhe outra (foi a causa de um bug real na reforma do HelpDesk). Uma regra, um lugar; o front vira reflexo.

### Exemplos vivos
- **Lógica / tempo:** `avaliacaoDisponivel` e `concluidoSemAvaliacao` no HelpDesk (janela de N dias a partir de `concluidoEm`, calculada no `getById`); `congelado` / `bloqueiaMensagemPublica` / `permiteTrocarResponsavel` (derivados de status + arquivado, via helper único usado pelo guard **e** pela flag).
- **Valor derivado:** os totais do orçamento em `recalcularTotais` — o backend calcula, o front só exibe.
- **Permissão:** ver a Parte B.

### Como aplicar
Ao mexer em algo com regra de estado espelhada no front: extraia um helper no backend (fonte única), faça o **guard** e o **payload** usarem o mesmo helper, e troque a re-derivação do front por `obj.<flag>`. Mantenha a flag como **estado puro**; o papel do usuário fica no front.

---

## Parte B — Permissões (RBAC)

Os flags de permissão são uma aplicação da Parte A: **quem pode** é decidido no backend; o front reflete.

### Modelo
- **Persistência:** `UserPermission` por usuário/módulo — `canRead`, `canWrite`, `canDelete` + `subPermissions` (`Record<string, boolean>`).
- **Master / EmpresaMaster** passam sempre (bypass em todos os middlewares).
- **Sub-permissões são default-deny:** valem só se `subPermissions[key] === true`.
- **Rótulos de exibição** das sub-permissões ficam em `packages/types/src/user.ts` (`{ key, label, group }`) — é o nome que o admin vê em `/usuarios`. Ex.: `edit_details` → "Editar detalhes do cliente"; `manage_commercial` → "Gerenciar aba comercial".

### Procedures (guardas de endpoint) — `apps/api/src/trpc/trpc.service.ts`
| Helper | Exige |
|---|---|
| `writeProcedure` / `readProcedure` | escrita / leitura no módulo |
| `writeSubProcedure(module, subKey, label)` | escrita **+** a sub-permissão |
| `readSubProcedure(module, subKey, label)` | leitura **+** a sub-permissão |
| `readSubAnyProcedure(module, subKeys[], label)` | leitura **+** QUALQUER uma das subs (permissão ampla implica a menor) |

### Permissão de CAMPO — `hasSubPermission`
Quando um `write` precisa de permissão **mais fina que a da procedure** (um subconjunto de campos exige uma sub mais estrita que a que libera o endpoint), use **`hasSubPermission(userId, moduleSlug, subKey, { isMaster, isEmpresaMaster })`** (`apps/api/src/trpc/trpc.service.ts`) — checa a sub **fora do middleware**, com a mesma regra (master/empresa-master passam; precisa de `canRead`; a sub precisa ser `true`).

1. **Resolva a flag no resolver** e passe ao service:
   `const podeX = await hasSubPermission(ctx.userId, MODULE, 'sub_key', { isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster })`
2. **O service enforça só quando o VALOR muda** (compara com o `before`) — quem tem a permissão do endpoint mas não a fina **segue salvando o resto**, e **chamadas internas** (sync/integração) que não passam a flag seguem livres.
3. **O front gateia a UI** pela mesma permissão (desabilita/oculta), sem repetir a regra.

**Exemplo vivo:** `cliente.update` exige `manage_commercial` para alterar `situacao`/`origem`/`grupo` — resolvido no resolver, imposto no service só na mudança de valor (`apps/api/src/cliente/cliente.{router,service}.ts`).

### Propagação automática — sem recarregar a página
Mudou a permissão de um usuário (admin editou em `/usuarios`)? A tela dele reflete **na hora**:
1. **`usePermissionsSse`** (`apps/web/src/hooks/use-permissions-sse.ts`), montado no `layout.tsx` do dashboard, abre um **SSE** em `/api/permissions/events`. Ao receber `{ type: 'updated', userId }` **do próprio usuário**, chama `refreshUserPermissions()`.
2. `refreshUserPermissions()` dispara o evento de window **`user-permissions-refresh`** (constante `USER_PERMISSIONS_REFRESH_EVENT` em `use-user-permissions.ts`).
3. **`useUserPermissions`** (`@/hooks/use-user-permissions`) — e hooks derivados como `useClientesPerms` — assinam o evento e **re-buscam** `user.getMyPermissions`. A UI recompõe sozinha.

**Ao construir tela que gateia por permissão:** consuma via `useUserPermissions` (ou um hook derivado do módulo) — a propagação vem de graça. Se criar um **probe de permissão próprio** (ex.: indicadores do HelpDesk), assine `USER_PERMISSIONS_REFRESH_EVENT` para reagir junto, em vez de exigir reload.

---

**Relacionados:** `docs/PADRAO_MODULOS.md` (estrutura de módulo). Referenciado no `CLAUDE.md` (Padrões de Código).
