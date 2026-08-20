# Migração: Coleta e Recebimento (v1 → v2)

Port do módulo `crp_coleta` do OneClick v1 para o v2, no bloco Administrativo
(`/coleta-documentos`). É o trâmite físico de documentos entre cliente,
recepção/rota, arquivo e setores — **módulo em uso diário no v1** (último
registro em 19/08/2026), então o corte da gravação no v1 precisa de timing
combinado com o Wagner.

## 1. O que o levantamento mostrou

- **`crpclt` — 1.310 (1.211 ativos)**: tipo 1/2/3 (Entrega/Coleta/Recebimento),
  situação 1..12, prioridade 1/2/3 (Baixa/Média/Alta), categoria
  (`crpcltcat`), competência, cliente (id do `ger_cad_cli`), contato,
  solicitante (`usuario` → `ger_cad_usu`), descrição em HTML do editor,
  soft-delete com `motivo_excluir`.
- **`crpcltsts` — 12 situações**, na ordem: Aguardando Rota, Rota Confirmada,
  Retirada Disponível, Entregue ao Cliente, Na Recepção, Em Triagem, No
  Setor, Devolvido ao Arquivo, Devolvido ao Cliente, Protocolo Arquivado,
  Entregue ao Arquivo, Protocolo entregue. (4 e 9 não têm botão nos ASPs
  atuais — ficam no enum sem transição.)
- **`crpcltlog` — 11.637**: a trilha (registro, situação, usuário, data,
  texto do evento). 11.376 pertencem a registros ativos.
- **`crpcltcat` — 19 categorias**, cada uma apontando um setor
  (`area` = `ger_cad_set.id`).
- **Papéis pelas pastas**: `usu/` (qualquer um solicita e edita a própria),
  `adm/` (Recepção/rota), `arq/` (Arquivo), `sup/` (vazia).
- **Situação inicial** (`enviar.asp`): tipo 1/2 → Aguardando Rota; tipo 3
  (Recebimento) → Entregue ao Arquivo (o documento já chegou).

## 2. A máquina de estados no v2 (o "quem faz o que e quando")

`COLETA_TRANSICOES` (`packages/types/src/coleta.ts`) nomeia cada ação com o
**destino**, o **papel** que a executa e o **texto de evento** idêntico ao que
o v1 gravava no log:

| Ação | Papel | Destino |
|---|---|---|
| Confirmar rota | rota | Rota Confirmada |
| Receber na Recepção | rota | Na Recepção |
| Entregar ao Arquivo | rota | Entregue ao Arquivo |
| Protocolo entregue ao arquivo | rota | Protocolo Entregue |
| Iniciar triagem | arquivo | Em Triagem |
| Entregar ao setor | arquivo | No Setor |
| Devolver ao arquivo | arquivo | Devolvido ao Arquivo |
| Disponibilizar retirada | arquivo | Retirada Disponível |
| Arquivar protocolo | arquivo | Protocolo Arquivado |
| Solicitar entrega ao cliente | arquivo | Aguardando Rota (e o tipo vira ENTREGA) |

Os papéis viram **sub-permissões** do módulo `coleta-documentos`: `rota`
(Recepção) e `arquivo`. O service decide `transicoesDisponiveis` por situação
× papel e entrega pronto no payload — o front só desenha os botões
(padrão de estados derivados). Toda ação grava `ColetaLog`.

## 3. Modelo / backend / UI

- `ColetaCategoria` + `Coleta` + `ColetaLog`
  (SQL: `packages/db/prisma/sql/add_coleta_documentos.sql`, idempotente).
- `apps/api/src/coleta/` — service + router (`coleta`); exclusão é soft com
  motivo obrigatório e o solicitante pode excluir/editar a própria (como no
  `usu/` do v1).
- `apps/web/src/app/(dashboard)/coleta-documentos/` — listagem (filtros por
  tipo/situação/categoria/só as minhas), criação em modal, gestão de
  categorias, e detalhe com os botões do trâmite + trilha completa.

## 4. Carga dos dados

Gerador: `scripts/legacy-v1-coleta-import.js` (read-only no v1; idempotente
por `legacy_id`). Mapeamentos: cliente por **CNPJ** (subselect no destino,
escopo EMP-ou-NULL preferindo EMP); solicitante/autor por email→nome com
resíduo; categoria→área por nome do setor; descrição HTML → texto puro
(entidades decodificadas); prioridade preservada.

Resultado (dev, 20/08): **19 categorias** (19 com área), **1.211 registros**
(1.133 com cliente vinculado; 465 solicitantes só no resíduo —
ex-colaboradores), **11.376 eventos de trilha**, 0 órfãos.

## 5. Produção — pendente

Aplicar `add_coleta_documentos.sql` + `scripts/out/v1-coleta.sql` como
`-U oneclick`, depois de validar os cuids embutidos (usuários e áreas) contra
a produção. O cliente entra por subselect de CNPJ, então não embute id.

## 6. Desativação no v1 — pendente (COMBINAR O TIMING)

O módulo está **em uso diário**. O corte (banner + bloqueio server-side nos
`enviar*.asp` das três pastas, com `.bak` antes) só depois que o Wagner der o
sinal — de preferência num fim de dia, com a carga de produção reaplicada na
sequência para pegar os registros do intervalo.
