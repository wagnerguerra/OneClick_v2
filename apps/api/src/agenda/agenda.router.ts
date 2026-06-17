import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure, writeSubProcedure, deleteSubProcedure, readSubProcedure } from '../trpc/trpc.service'
import { AgendaService } from './agenda.service'
import { AgendaGoogleService } from './agenda-google.service'
import { AgendaConfigService } from './agenda-config.service'
import { AgendaSalaService } from './agenda-sala.service'
import { AgendaDisparoService } from './agenda-disparo.service'
import { AgendaLembreteService } from './agenda-lembrete.service'
import { AgendaTarefaService } from './agenda-tarefa.service'

const MODULE = 'agenda'
const conflitoModoSchema = z.enum(['DESLIGADO', 'AVISAR', 'BLOQUEAR'])
const lembreteCanalSchema = z.enum(['POPUP', 'EMAIL'])
const lembreteItemSchema = z.object({
  canal: lembreteCanalSchema,
  minutosAntes: z.number().int().min(1).max(43200),  // até 30 dias
})

export function createAgendaRouter(
  service: AgendaService,
  googleService: AgendaGoogleService,
  configService: AgendaConfigService,
  salaService: AgendaSalaService,
  disparoService: AgendaDisparoService,
  lembreteService: AgendaLembreteService,
  tarefaService: AgendaTarefaService,
) {
  return router({
    // === TIPOS (Categorias) ===
    listTipos: readProcedure(MODULE)
      .query(() => service.listTipos()),

    createTipo: writeProcedure(MODULE)
      .input(z.object({
        nome: z.string().min(1),
        cor: z.string().optional(),
        corBorda: z.string().optional(),
        corTexto: z.string().optional(),
        bloqueiaAgenda: z.boolean().optional(),
      }))
      .mutation(({ input }) => service.createTipo(input)),

    updateTipo: writeProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        data: z.object({
          nome: z.string().min(1).optional(),
          cor: z.string().optional(),
          corBorda: z.string().optional(),
          corTexto: z.string().optional(),
          bloqueiaAgenda: z.boolean().optional(),
        }),
      }))
      .mutation(({ input }) => service.updateTipo(input.id, input.data)),

    deleteTipo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.deleteTipo(input.id)),

    importTiposLegado: writeProcedure(MODULE)
      .mutation(() => service.importTiposLegado()),

    importEventosLegado: writeProcedure(MODULE)
      .input(z.object({ apenasAtivos: z.boolean().default(true) }).optional())
      .mutation(({ ctx, input }) => service.importEventosLegado(ctx.userId, input?.apenasAtivos ?? true)),

    importProgress: readProcedure(MODULE)
      .query(() => service.getImportProgress()),

    // === EVENTOS ===
    listEventos: readProcedure(MODULE)
      .input(z.object({
        dataInicio: z.string(),
        dataFim: z.string(),
        tipoId: z.string().optional(),
        criadorId: z.string().optional(),
        empresaId: z.string().optional(),
      }))
      .query(({ input, ctx }) => service.listEventos(input, ctx.userId)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => service.getById(input.id)),

    create: writeProcedure(MODULE)
      .input(z.object({
        titulo: z.string().min(1),
        descricao: z.string().nullable().optional(),
        data: z.string(),
        dataFim: z.string().nullable().optional(),
        horaInicio: z.string().nullable().optional(),
        horaFim: z.string().nullable().optional(),
        diaInteiro: z.boolean().optional(),
        local: z.string().nullable().optional(),
        contato: z.string().nullable().optional(),
        link: z.string().nullable().optional(),
        presenca: z.enum(['PRESENCIAL', 'ONLINE', 'HIBRIDO']).optional(),
        particular: z.boolean().optional(),
        editavel: z.boolean().optional(),
        sala: z.string().nullable().optional(),
        garagem: z.boolean().optional(),
        vagas: z.number().nullable().optional(),
        equipamentos: z.string().nullable().optional(),
        isTarefa: z.boolean().optional(),
        tipoId: z.string(),
        empresaId: z.string().nullable().optional(),
        oportunidadeId: z.string().nullable().optional(),
        participanteIds: z.array(z.string()).optional(),
        participantesAvulsos: z.array(z.string()).optional(),
        recorrencia: z.enum(['NENHUMA', 'DIARIA', 'SEMANAL', 'MENSAL', 'ANUAL']).optional(),
        recorrenciaVezes: z.number().nullable().optional(),
        // Opt-in: só notifica participantes por e-mail quando marcado (default false).
        notificar: z.boolean().optional(),
      }))
      .mutation(({ input, ctx }) => service.create(input, ctx.userId)),

    update: writeProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        data: z.object({
          titulo: z.string().min(1).optional(),
          descricao: z.string().nullable().optional(),
          data: z.string().optional(),
          dataFim: z.string().nullable().optional(),
          horaInicio: z.string().nullable().optional(),
          horaFim: z.string().nullable().optional(),
          diaInteiro: z.boolean().optional(),
          local: z.string().nullable().optional(),
          contato: z.string().nullable().optional(),
          link: z.string().nullable().optional(),
          presenca: z.enum(['PRESENCIAL', 'ONLINE', 'HIBRIDO']).optional(),
          particular: z.boolean().optional(),
          editavel: z.boolean().optional(),
          sala: z.string().nullable().optional(),
          salaId: z.string().nullable().optional(),
          garagem: z.boolean().optional(),
          vagas: z.number().nullable().optional(),
          equipamentos: z.string().nullable().optional(),
          isTarefa: z.boolean().optional(),
          tipoId: z.string().optional(),
          empresaId: z.string().nullable().optional(),
          oportunidadeId: z.string().nullable().optional(),
          participanteIds: z.array(z.string()).optional(),
          participantesAvulsos: z.array(z.string()).optional(),
          // Opt-in: só notifica participantes por e-mail quando marcado (default false).
          notificar: z.boolean().optional(),
          // Opt-in: avisa TODOS os usuários do tenant (sino + e-mail) sobre a alteração.
          notificarTodosTenant: z.boolean().optional(),
        }),
      }))
      .mutation(({ input, ctx }) => service.update(input.id, input.data, ctx.userId)),

    delete: deleteProcedure(MODULE)
      // notificar (opt-in) avisa os participantes; notificarTodosTenant avisa a empresa toda.
      .input(z.object({ id: z.string(), notificar: z.boolean().optional(), notificarTodosTenant: z.boolean().optional() }))
      .mutation(({ input, ctx }) => service.delete(input.id, ctx.userId, input.notificar ?? false, input.notificarTodosTenant ?? false)),

    // === OPORTUNIDADES (CRM) — seletor leve pra vincular um evento a um card ===
    buscarOportunidades: readProcedure(MODULE)
      .input(z.object({ search: z.string().optional() }).optional())
      .query(({ input, ctx }) => service.buscarOportunidades(input?.search, ctx.isMaster ?? false, ctx.empresaId)),

    // === ANOTAÇÕES & ANEXOS DO EVENTO ===
    // Gravam no evento OU na oportunidade vinculada (merge) — ver agenda.service.
    // Qualquer usuário com LEITURA da agenda pode adicionar (mesmo não sendo dono
    // do evento). Editar/excluir é gateado por dono/master/sub-perm no service.
    listAnotacoes: readProcedure(MODULE)
      .input(z.object({ eventoId: z.string() }))
      .query(({ input }) => service.listAnotacoes(input.eventoId)),
    addAnotacao: readProcedure(MODULE)
      .input(z.object({ eventoId: z.string(), texto: z.string().min(1) }))
      .mutation(({ input, ctx }) => service.addAnotacao(input.eventoId, ctx.userId, input.texto)),
    editarAnotacao: readProcedure(MODULE)
      .input(z.object({ eventoId: z.string(), anotacaoId: z.string(), texto: z.string().min(1) }))
      .mutation(({ input, ctx }) => service.editarAnotacao(input.eventoId, input.anotacaoId, input.texto, ctx.userId)),
    deleteAnotacao: readProcedure(MODULE)
      .input(z.object({ eventoId: z.string(), anotacaoId: z.string() }))
      .mutation(({ input, ctx }) => service.deleteAnotacao(input.eventoId, input.anotacaoId, ctx.userId)),

    listAnexos: readProcedure(MODULE)
      .input(z.object({ eventoId: z.string() }))
      .query(({ input }) => service.listAnexos(input.eventoId)),
    addAnexo: readProcedure(MODULE)
      .input(z.object({
        eventoId: z.string(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => service.addAnexo(input.eventoId, {
        fileName: input.fileName, fileUrl: input.fileUrl, fileSize: input.fileSize, mimeType: input.mimeType,
      }, ctx.userId)),
    removeAnexo: readProcedure(MODULE)
      .input(z.object({ eventoId: z.string(), anexoId: z.string() }))
      .mutation(({ input, ctx }) => service.removeAnexo(input.eventoId, input.anexoId, ctx.userId)),

    // Alterar tipo do evento direto na prévia (gate próprio: master/sub-perm).
    alterarTipo: readProcedure(MODULE)
      .input(z.object({ eventoId: z.string(), tipoId: z.string() }))
      .mutation(({ input, ctx }) => service.alterarTipo(input.eventoId, input.tipoId, ctx.userId)),

    // Relatórios da agenda (gate próprio: master/sub-perm `ver_relatorios`).
    relatorio: readProcedure(MODULE)
      .input(z.object({
        dataInicio: z.string(),
        dataFim: z.string(),
        usuarioId: z.string().optional(),
        tipoId: z.string().optional(),
      }))
      .query(({ input, ctx }) => service.relatorio(input, ctx.userId, ctx.isMaster ?? false, ctx.empresaId)),

    // Drill-down: eventos por trás de uma linha do relatório (paginado).
    relatorioEventos: readProcedure(MODULE)
      .input(z.object({
        dataInicio: z.string(),
        dataFim: z.string(),
        tipoId: z.string().optional(),
        usuarioId: z.string().optional(),
        page: z.number().optional(),
        limit: z.number().optional(),
      }))
      .query(({ input, ctx }) => service.relatorioEventos(input, ctx.userId, ctx.isMaster ?? false, ctx.empresaId)),

    deleteLote: deleteProcedure(MODULE)
      .input(z.object({ lote: z.string() }))
      .mutation(({ input, ctx }) => service.deleteLote(input.lote, ctx.userId)),

    // === CONFLITOS ===
    verificarConflitos: readProcedure(MODULE)
      .input(z.object({
        data: z.string(),
        horaInicio: z.string(),
        horaFim: z.string(),
        participanteIds: z.array(z.string()).optional(),
        sala: z.string().optional(),
        salaId: z.string().optional(),
        eventoIdExcluir: z.string().optional(),
        tipoId: z.string().optional(),
      }))
      .query(({ input }) => service.verificarConflitos(input)),

    // === CONFIGURAÇÃO (singleton) — leitura aberta pra qualquer um com acesso ao
    // módulo (precisa pra o front saber se deve verificar conflitos antes de salvar).
    // Update exige sub-permissão `manage_config`.
    config: router({
      get: readProcedure(MODULE)
        .query(() => configService.get()),
      update: writeSubProcedure(MODULE, 'manage_config', 'Gerenciar configurações da agenda')
        .input(z.object({
          conflitoParticipante: conflitoModoSchema.optional(),
          conflitoSala: conflitoModoSchema.optional(),
        }))
        .mutation(({ input }) => configService.update(input)),
    }),

    // === SALAS — leitura aberta (necessária pro select no modal de evento).
    // Mutações exigem sub-permissão `manage_config`.
    sala: router({
      list: readProcedure(MODULE)
        .input(z.object({ incluirInativas: z.boolean().optional() }).optional())
        .query(({ input }) => salaService.list({ incluirInativas: input?.incluirInativas })),
      create: writeSubProcedure(MODULE, 'manage_config', 'Cadastrar salas da agenda')
        .input(z.object({
          nome: z.string().min(1),
          capacidade: z.number().nullable().optional(),
          equipamentos: z.string().nullable().optional(),
          ativo: z.boolean().optional(),
        }))
        .mutation(({ input }) => salaService.create(input)),
      update: writeSubProcedure(MODULE, 'manage_config', 'Editar salas da agenda')
        .input(z.object({
          id: z.string(),
          data: z.object({
            nome: z.string().min(1).optional(),
            capacidade: z.number().nullable().optional(),
            equipamentos: z.string().nullable().optional(),
            ativo: z.boolean().optional(),
          }),
        }))
        .mutation(({ input }) => salaService.update(input.id, input.data)),
      delete: deleteSubProcedure(MODULE, 'manage_config', 'Remover salas da agenda')
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => salaService.delete(input.id)),
    }),

    // === DISPONIBILIDADE ===
    verificarDisponibilidade: readProcedure(MODULE)
      .input(z.object({
        data: z.string(),
        usuarioIds: z.array(z.string()).min(1),
      }))
      .query(({ input }) => service.verificarDisponibilidade(input)),

    // Disponibilidade combinada num range — usada pelo /agenda/disponibilidade
    disponibilidadeRange: readProcedure(MODULE)
      .input(z.object({
        dataInicio: z.string(),
        dataFim: z.string(),
        usuarioIds: z.array(z.string()).min(1),
      }))
      .query(({ input }) => service.disponibilidadeRange(input)),

    // === LOGS ===
    listLogs: readProcedure(MODULE)
      .input(z.object({ eventoId: z.string() }))
      .query(({ input }) => service.listLogs(input.eventoId)),

    // === USUÁRIOS (para select de participantes) — filtra por empresa do user logado
    listUsuarios: readProcedure(MODULE)
      .query(({ ctx }) => service.listUsuarios(ctx.isMaster ?? false, ctx.empresaId)),

    // === DISPARO AUTOMÁTICO (agenda do dia por email) ===
    disparo: router({
      get: readProcedure(MODULE)
        .query(() => disparoService.get()),
      update: writeSubProcedure(MODULE, 'manage_config', 'Gerenciar disparo automático da agenda')
        .input(z.object({
          ativo: z.boolean().optional(),
          horario: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          diasSemana: z.array(z.number().int().min(0).max(6)).optional(),
          enviarParaTodos: z.boolean().optional(),
          destinatariosIds: z.array(z.string()).optional(),
        }))
        .mutation(({ input }) => disparoService.update(input)),
      enviarTeste: writeSubProcedure(MODULE, 'manage_config', 'Enviar teste do disparo automático')
        .input(z.object({
          destinatarioId: z.string(),
          data: z.string().optional(),  // YYYY-MM-DD; default = hoje
        }))
        .mutation(({ input, ctx }) => {
          const data = input.data ?? new Date().toISOString().slice(0, 10)
          return disparoService.enviarAgendaDiaParaTodos(data, [input.destinatarioId], 'teste', ctx.userId)
        }),
      listLogs: readSubProcedure(MODULE, 'manage_config', 'Ver histórico de disparos da agenda')
        .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
        .query(({ input }) => disparoService.listLogs(input?.limit ?? 30)),
      reenviar: writeSubProcedure(MODULE, 'manage_config', 'Reenviar disparo da agenda')
        .input(z.object({ logId: z.string() }))
        .mutation(({ input, ctx }) => disparoService.reenviar(input.logId, ctx.userId)),
    }),

    // === MODELO DE E-MAIL CONFIGURÁVEL (paralelo ao HTML atual) ===
    modeloEmail: router({
      get: readSubProcedure(MODULE, 'manage_config', 'Ver o modelo de e-mail da agenda')
        .query(() => disparoService.getEmailTemplate()),
      cardHtmlPadrao: readSubProcedure(MODULE, 'manage_config', 'Ver o HTML padrão do card de evento')
        .query(() => disparoService.cardHtmlPadrao()),
      save: writeSubProcedure(MODULE, 'manage_config', 'Editar o modelo de e-mail da agenda')
        .input(z.object({
          ativo: z.boolean().optional(),
          assunto: z.string().optional(),
          accent: z.string().optional(),
          larguraMax: z.number().int().min(440).max(1000).optional(),
          headerHtml: z.string().optional(),
          introHtml: z.string().optional(),
          footerHtml: z.string().optional(),
          eventoLinhaHtml: z.string().optional(),
          semEventosHtml: z.string().optional(),
          cardModo: z.enum(['builder', 'html']).optional(),
          cardElementos: z.string().optional(),
          mostrarOutros: z.boolean().optional(),
          nomeGrupoOutros: z.string().optional(),
          nomeGrupoParticulares: z.string().optional(),
          corParticulares: z.string().optional(),
        }))
        .mutation(({ input }) => disparoService.saveEmailTemplate(input)),
      saveGrupos: writeSubProcedure(MODULE, 'manage_config', 'Editar grupos do modelo de e-mail da agenda')
        .input(z.object({
          grupos: z.array(z.object({
            nome: z.string().min(1),
            cor: z.string(),
            icone: z.string().optional(),
            incluiParticulares: z.boolean(),
            tiposIds: z.array(z.string()),
          })),
        }))
        .mutation(({ input }) => disparoService.saveEmailGrupos(input.grupos)),
      preview: readSubProcedure(MODULE, 'manage_config', 'Pré-visualizar o modelo de e-mail da agenda')
        .input(z.object({
          data: z.string().optional(),
          // Override AO VIVO do estado não-salvo do editor (template + grupos):
          template: z.record(z.any()).optional(),
          grupos: z.array(z.record(z.any())).optional(),
        }).optional())
        .query(({ input, ctx }) => disparoService.previewEmailModelo(ctx.userId!, input?.data, { template: input?.template, grupos: input?.grupos })),
      enviarTeste: writeSubProcedure(MODULE, 'manage_config', 'Enviar teste do modelo de e-mail da agenda')
        .mutation(({ ctx }) => disparoService.enviarTesteModelo(ctx.userId!)),
    }),

    // === GOOGLE CALENDAR ===
    google: router({
      getAuthUrl: readProcedure(MODULE)
        .query(({ ctx }) => googleService.getAuthUrl(ctx.userId)),

      handleCallback: writeProcedure(MODULE)
        .input(z.object({ code: z.string() }))
        .mutation(({ input, ctx }) => googleService.handleCallback(input.code, ctx.userId)),

      getStatus: readProcedure(MODULE)
        .query(({ ctx }) => googleService.getConnectionStatus(ctx.userId)),

      disconnect: writeProcedure(MODULE)
        .mutation(({ ctx }) => googleService.disconnect(ctx.userId)),

      syncToGoogle: writeProcedure(MODULE)
        .input(z.object({ eventoId: z.string() }))
        .mutation(({ input, ctx }) => googleService.syncToGoogle(input.eventoId, ctx.userId)),

      syncFromGoogle: writeProcedure(MODULE)
        .input(z.object({ daysBack: z.number().default(7), daysForward: z.number().default(30) }).optional())
        .mutation(({ input, ctx }) => googleService.syncFromGoogle(ctx.userId, input?.daysBack, input?.daysForward)),
    }),

    // === TAREFAS (entidade separada de eventos — sem participantes, sem conflito) ===
    tarefa: router({
      list: readProcedure(MODULE)
        .input(z.object({
          usuarioId: z.string().optional(),       // filtra por criador; default = só do user logado
          apenasAbertas: z.boolean().optional(),
          apenasConcluidas: z.boolean().optional(),
          dataInicio: z.string().optional(),      // yyyy-MM-dd
          dataFim: z.string().optional(),
          todasDoTenant: z.boolean().optional(),  // se true e for master, traz de todos
        }).optional())
        .query(({ input, ctx }) => tarefaService.list({
          usuarioId: input?.todasDoTenant && ctx.isMaster ? undefined : (input?.usuarioId ?? ctx.userId),
          apenasAbertas: input?.apenasAbertas,
          apenasConcluidas: input?.apenasConcluidas,
          dataInicio: input?.dataInicio,
          dataFim: input?.dataFim,
          empresaId: ctx.empresaId,
        })),
      getById: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(({ input }) => tarefaService.getById(input.id)),
      create: writeProcedure(MODULE)
        .input(z.object({
          titulo: z.string().min(1),
          descricao: z.string().nullable().optional(),
          prazo: z.string(),                                          // yyyy-MM-dd
          horaPrazo: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
          prioridade: z.enum(['BAIXA', 'NORMAL', 'ALTA']).optional(),
          participantes: z.array(z.string()).optional(),              // ids de usuários (membros)
        }))
        .mutation(({ input, ctx }) => tarefaService.create({ ...input, empresaId: ctx.empresaId }, ctx.userId)),
      update: writeProcedure(MODULE)
        .input(z.object({
          id: z.string(),
          data: z.object({
            titulo: z.string().min(1).optional(),
            descricao: z.string().nullable().optional(),
            prazo: z.string().optional(),
            horaPrazo: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
            prioridade: z.enum(['BAIXA', 'NORMAL', 'ALTA']).optional(),
            participantes: z.array(z.string()).optional(),
          }),
        }))
        .mutation(({ input }) => tarefaService.update(input.id, input.data)),
      // "Concluir" = o usuário atual dá ciência da finalização. A tarefa só
      // fica concluída quando TODOS os membros derem ciência (recalc no service).
      toggleConcluida: writeProcedure(MODULE)
        .input(z.object({ id: z.string(), concluida: z.boolean() }))
        .mutation(({ input, ctx }) => tarefaService.darCiencia(input.id, ctx.userId, input.concluida)),
      darCiencia: writeProcedure(MODULE)
        .input(z.object({ id: z.string(), ciente: z.boolean() }))
        .mutation(({ input, ctx }) => tarefaService.darCiencia(input.id, ctx.userId, input.ciente)),
      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => tarefaService.delete(input.id)),
      lembrete: router({
        list: readProcedure(MODULE)
          .input(z.object({ tarefaId: z.string() }))
          .query(({ input }) => tarefaService.listLembretes(input.tarefaId)),
        save: writeProcedure(MODULE)
          .input(z.object({
            tarefaId: z.string(),
            lembretes: z.array(lembreteItemSchema).max(10),
          }))
          .mutation(({ input }) => tarefaService.saveLembretes(input.tarefaId, input.lembretes)),
      }),
    }),

    // === LEMBRETES ===
    // Lembrete pertence ao evento — quem pode editar o evento pode mexer
    // nos lembretes. Leitura abre pra todos com acesso ao módulo (precisam
    // ver no modal de detalhes/edição).
    lembrete: router({
      list: readProcedure(MODULE)
        .input(z.object({ eventoId: z.string() }))
        .query(({ input }) => lembreteService.list(input.eventoId)),
      save: writeProcedure(MODULE)
        .input(z.object({
          eventoId: z.string(),
          lembretes: z.array(lembreteItemSchema).max(10),
        }))
        .mutation(({ input }) => lembreteService.save(input.eventoId, input.lembretes)),
    }),
  })
}
