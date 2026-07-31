-- Origem do vínculo obrigação → serviço: 'manual' (alguém vinculou na tela) ou
-- 'auto' (veio da sugestão em lote).
--
-- Sem esta marca não há como desfazer apenas o que a máquina criou — foi o que
-- faltou quando a sugestão automática vinculou obrigação demais a um único
-- serviço mensal. Linhas antigas ficam como 'manual' porque não há como saber
-- retroativamente: a limpeza delas é feita por escolha explícita na tela.
ALTER TABLE "acessorias_obligation_maps"
  ADD COLUMN IF NOT EXISTS "origem" TEXT NOT NULL DEFAULT 'manual';
