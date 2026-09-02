-- Agenda: como a serie recorrente trata fim de semana e feriado.
--
-- MANTER (padrao, comportamento antigo) | ANTECIPAR | POSTERGAR.
-- Em recorrencia DIARIA, != MANTER significa "contar so dias uteis": a serie
-- PULA o dia nao util em vez de ajustar, senao sabado, domingo e segunda
-- viravam tres eventos na mesma segunda.
--
-- Default MANTER garante que toda serie ja existente continue igual.
ALTER TABLE agenda_eventos
  ADD COLUMN IF NOT EXISTS ajuste_dia_util TEXT NOT NULL DEFAULT 'MANTER';
