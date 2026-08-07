-- Frente 3.5 — migra os templates legados GrupoObrigacao → ServicoGrupo(tipo=OBRIGACOES).
--
-- Roda ANTES de dropar grupos_obrigacao/grupos_obrigacao_itens. Depois desta migração,
-- os grupos aparecem em /servicos/grupos (tipo "Obrigações acessórias") e ficam
-- disponíveis no "Aplicar grupo" do cliente.
--
-- Reusa o MESMO id do GrupoObrigacao no ServicoGrupo: torna a migração idempotente
-- (ON CONFLICT DO NOTHING) e rastreável (dá pra saber de qual template veio cada grupo).
-- Só copia o que o ServicoGrupo tem: id, nome, descricao, cor, ativo, empresa_id. Os
-- campos exclusivos do template (slug, tributacao, cnaes, segmento, area) não têm
-- destino — eram usados só pela recomendação automática, que saiu na unificação.

INSERT INTO servico_grupos (id, nome, descricao, cor, ordem, ativo, empresa_id, tipo, created_at, updated_at)
SELECT id, nome, descricao, cor, 0, ativo, empresa_id, 'OBRIGACOES', created_at, now()
FROM grupos_obrigacao
ON CONFLICT (id) DO NOTHING;

INSERT INTO servico_grupo_itens (grupo_id, servico_id, ordem, created_at)
SELECT grupo_id, servico_id, ordem, now()
FROM grupos_obrigacao_itens
ON CONFLICT (grupo_id, servico_id) DO NOTHING;
