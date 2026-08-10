-- Remove o vínculo de origem de ClienteObrigacao (vindo_de_template_id).
--
-- Contexto: na unificação dos grupos (Frente 3), "Aplicar template" (que lia
-- GrupoObrigacao) virou "Aplicar grupo" (lê ServicoGrupo tipo=OBRIGACOES). O
-- ponteiro de origem por-template deixou de ser usado — o modo "substituir" hoje
-- limpa TODAS as obrigações do cliente antes de aplicar, sem escopo por template.
-- Além disso, esta FK apontava pra grupos_obrigacao, que é dropada em F3.5;
-- removê-la aqui destrava aquele drop.
--
-- Destrutivo e irreversível (perde a rastreabilidade de qual template originou
-- cada vínculo). Idempotente (IF EXISTS): rodar de novo não faz nada.

-- A FK carrega nome gerado pelo Prisma; dropa por padrão de nome e por catálogo.
ALTER TABLE cliente_obrigacoes DROP CONSTRAINT IF EXISTS "cliente_obrigacoes_vindo_de_template_id_fkey";
DROP INDEX IF EXISTS "cliente_obrigacoes_vindo_de_template_id_idx";
ALTER TABLE cliente_obrigacoes DROP COLUMN IF EXISTS vindo_de_template_id;
