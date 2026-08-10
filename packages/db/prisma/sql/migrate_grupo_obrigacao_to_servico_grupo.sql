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

-- GUARD: o `prisma db push` do deploy roda ANTES desta etapa e ja remove
-- grupos_obrigacao (ela nao existe mais no schema). Sem o guard, o arquivo passa
-- a estourar "relation does not exist" e derruba TODO deploy seguinte — foi o que
-- aconteceu em 10/08.
--
-- ATENCAO: por causa dessa ordem, a migracao so aproveita os dados se rodar
-- ANTES do primeiro push que apaga a tabela. Depois disso nao ha de onde ler.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'grupos_obrigacao'
  ) THEN
    RAISE NOTICE '[migrate_grupo_obrigacao] grupos_obrigacao ja nao existe — migracao ignorada (concluida).';
    RETURN;
  END IF;

  INSERT INTO servico_grupos (id, nome, descricao, cor, ordem, ativo, empresa_id, tipo, created_at, updated_at)
  SELECT id, nome, descricao, cor, 0, ativo, empresa_id, 'OBRIGACOES', created_at, now()
  FROM grupos_obrigacao
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO servico_grupo_itens (grupo_id, servico_id, ordem, created_at)
  SELECT grupo_id, servico_id, ordem, now()
  FROM grupos_obrigacao_itens
  ON CONFLICT (grupo_id, servico_id) DO NOTHING;
END $$;
