# Migração: Agenda de Contatos (v1 → v2)

Port do `crp_contatos` do OneClick v1 (tabela `ger_age` do `db_intranet`) para
o v2, no bloco Administrativo (`/contatos`). O módulo tinha sido **descartado**
em 20/08 (escrita bloqueada no v1, consulta preservada); em 25/08 o Wagner
decidiu migrá-lo — a permissão `contatos` já existia no catálogo, mas sem tela
o item não aparecia no menu.

## 1. O que o levantamento mostrou

`ger_age` — **1.160 registros** (1.107 ativos, 53 com `ativo=0`):

| Campo | Uso |
|---|---|
| `nome` | 1.160 (100%) — empresa/pessoa da entrada |
| `tel1` / `tel2` / `tel3` | 1.145 / 279 / 232 |
| `cts1` / `cts2` / `cts3` | 344 / 5 / 5 — nome de quem atende |
| `email1` / `email2` / `email3` | 99 / 0 / 0 |
| `obs` | 455 |
| `privado` (0/1) | **4 privados** |
| `dono` (`ger_cad_usu`) | 845 — concentrado em Keila Martinelli (481) e Dayane Moreira (350) |
| `ativo` (0/1) | soft-delete |

Os três blocos fixos de contato quase não são usados além do primeiro — daí a
normalização no v2.

## 2. Modelo no v2

- `Contato` (a entrada): nome, observações, `privado`, `donoId` + `donoNome`
  (resíduo), `ativo` (soft-delete), `legacyId`.
- `ContatoPessoa` (1..N): nome, telefone, email, ordem — os blocos `cts/tel/email`
  do v1 viram linhas, e agora cabem mais de três.
- SQL idempotente: `packages/db/prisma/sql/add_contatos.sql`.

**Visibilidade (fiel ao v1):** entrada privada só aparece para o dono (e para o
master); as demais são da agenda compartilhada da empresa. Regra no service, não
na tela.

**Quem mantém a agenda (25/08):** ler é para todo mundo com acesso ao módulo;
**incluir, editar e excluir exigem a sub-permissão `contatos.gerenciar`**
(catálogo em `MODULE_SUB_PERMISSIONS`, grupo "Manutenção"). O router barra as
quatro mutations com FORBIDDEN e a tela esconde os botões — mesma dupla trava
dos papéis da Coleta.

## 3. Backend / UI

- `apps/api/src/contato/` — service + router (`contato`): listar (busca por nome,
  telefone, e-mail ou observação), getById, criar, atualizar (a lista de pessoas
  é substituída inteira), excluir (soft) e restaurar.
- `apps/web/src/app/(dashboard)/contatos/` — listagem no padrão atual
  (PageHeaderBar + tabela de uma linha), filtros "só os meus privados" e "ver
  excluídos", modal de criar/editar com N pessoas, telefone clicável (`tel:`) e
  e-mail (`mailto:`).
- Item **Contatos** de volta ao menu (bloco Administrativo).

## 4. Carga

Gerador: `scripts/legacy-v1-contatos-import.js` (read-only no v1; idempotente por
`legacy_id`, ids determinísticos). O **dono sai por subselect de e-mail** no
próprio SQL — assim a mesma carga vale em dev e produção, que têm ids distintos.

Resultado (dev **e** produção, 25/08): **1.160 contatos** (1.107 ativos, 4
privados) e **1.663 pessoas/telefones**.

⚠️ **Nenhum dos 8 donos do v1 existe no v2** (são colaboradores antigos): os 845
registros com dono guardam o nome em `dono_nome`, e os **4 contatos privados**
ficaram sem `dono_id` — pela regra de visibilidade, só o master os enxerga. Quem
quiser reabri-los é só editar e desmarcar "privado".

## 5. Desativação no v1 — ✅ (escrita em 20/08, aviso atualizado em 25/08)

`modal-new/edt/del` já redirecionavam para o `index.asp` desde 20/08 (com
`.bak-2026-08-20`); o banner passou de "módulo descontinuado" para "migrada para
o novo sistema OneClick". `fav_in/fav_out` continuam (são favoritos do menu).
