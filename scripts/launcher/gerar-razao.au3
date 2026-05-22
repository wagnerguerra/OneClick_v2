; ════════════════════════════════════════════════════════════════════════════
; gerar-razao.au3 — Geração em lote do Livro Razão no SCI Único
; ════════════════════════════════════════════════════════════════════════════
;
; ESTRATÉGIA: itera as linhas do seletor de empresa SEM buscar por CNPJ.
;
;   Pra cada N = 0, 1, 2, ...:
;     1. Abre seletor de empresa (botão Casa, TToolBar4)
;     2. Aguarda TfrConsultaEmpresaPadrao aparecer
;     3. {HOME} + {DOWN}*N (posiciona na N-ésima linha)
;     4. ENTER (seleciona empresa)
;     5. Lê texto do header do SCI → razão + CNPJ do cliente atual
;     6. Se texto = anterior, chegamos no fim → para
;     7. Gera Razão (Relatórios → Razão → preenche → exporta PDF)
;     8. Salva como D:\RAZOES\2025\RAZAO_<RAZAO>_<CNPJ>.pdf
;     9. N++
;
; HOTKEY DE ABORT: Shift+Alt+ESC ou tecla PAUSE.
;   (NÃO use só ESC — o script o usa internamente.)
; ════════════════════════════════════════════════════════════════════════════

#NoTrayIcon
Opt("WinTitleMatchMode", 2)
Opt("MustDeclareVars", 1)
Opt("SendKeyDelay", 30)
Opt("MouseClickDelay", 50)

; ─── Configuração ──────────────────────────────────────────────────────────
Global $g_OutDir       = "D:\RAZOES\2025"
Global $g_LogFile      = $g_OutDir & "\_log.txt"
Global $g_DataInicial  = "01012025"
Global $g_ContaInicial = "19"
Global $g_ContaFinal   = "101156"
Global $g_AbortRequested = False

; ─── Parsing de argumentos ─────────────────────────────────────────────────
; --limit=N → processa só as N primeiras linhas (pra teste)
; --start=N → começa a partir da linha N (0-based) — útil pra retomar
; --dry-run → percorre o grid lendo os clientes, mas NÃO gera Razão
Global $g_Limit = 0
Global $g_Start = 0
Global $g_DryRun = False
Global $g_ListControls = False
Global $g_DebugPreview = False
For $i = 1 To $CmdLine[0]
    Local $arg = $CmdLine[$i]
    If StringLeft($arg, 8) = "--limit=" Then
        $g_Limit = Number(StringTrimLeft($arg, 8))
    ElseIf StringLeft($arg, 8) = "--start=" Then
        $g_Start = Number(StringTrimLeft($arg, 8))
    ElseIf $arg = "--dry-run" Then
        $g_DryRun = True
    ElseIf $arg = "--list-controls" Then
        $g_ListControls = True
    ElseIf $arg = "--debug-preview" Then
        $g_DebugPreview = True
    EndIf
Next

HotKeySet("+!{ESC}", "AbortHandler")
HotKeySet("{PAUSE}", "AbortHandler")

DirCreate($g_OutDir)
LogMsg("")
LogMsg("════════════════════════════════════════════════════════")
LogMsg("=== Início " & TS() & " | start=" & $g_Start & " | limit=" & $g_Limit & " | dryRun=" & $g_DryRun & " ===")

; ─── Garante que SCI está aberto ───────────────────────────────────────────
Local $hSci = WinWait("[CLASS:TfrUnico]", "", 10)
If Not $hSci Then
    MsgBox(16, "Erro", "SCI Único não está aberto. Abra, faça login e tente de novo.")
    Exit(3)
EndIf
WinActivate("[CLASS:TfrUnico]")
WinSetState("[CLASS:TfrUnico]", "", @SW_MAXIMIZE)
Sleep(800)

; ─── Modo --debug-preview: abre 1 cliente, espera preview, lista controles
; com IsEnabled durante o load e depois do load. Pra identificar o botão
; Exportar que fica desabilitado enquanto renderiza.
If $g_DebugPreview Then
    LogMsg("=== DEBUG-PREVIEW ===")
    LogMsg("Selecionando linha 9 (cliente grande pra simular load)...")
    SelecionarLinhaSeletor(9)

    LogMsg("Abrindo Razão via Alt+T → Z")
    WinActivate("[CLASS:TfrUnico]")
    Sleep(300)
    Send("!t")
    Sleep(400)
    Send("z")
    Sleep(3000)

    LogMsg("Preenchendo campos")
    ControlSetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Date_Padrao_SCI2]", "01/01/2025")
    ControlSetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Date_Padrao_SCI1]", "31/12/2025")
    ControlSetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI7]", $g_ContaInicial)
    Sleep(300)
    ControlFocus("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI7]")
    ControlSend("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI7]", "{TAB}")
    Sleep(700)
    If WinExists("[CLASS:TSearchPopup]") Then Send("{ESC}")
    Sleep(300)
    ControlSetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI6]", $g_ContaFinal)
    Sleep(300)
    ControlFocus("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI6]")
    ControlSend("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI6]", "{TAB}")
    Sleep(700)
    If WinExists("[CLASS:TSearchPopup]") Then Send("{ESC}")
    Sleep(500)

    Local $razPos = ControlGetPos("[CLASS:TfrUnico]", "", "[CLASSNN:TfrRelRazao1]")
    Local $tfrPos = WinGetPos("[CLASS:TfrUnico]")
    LogMsg("Clicando Pré-visualizar")
    MouseClick("primary", $tfrPos[0] + $razPos[0] + 29, $tfrPos[1] + $razPos[1] + 123, 1, 5)

    ; Tira 3 snapshots: imediato, 5s, 20s
    For $snap = 1 To 3
        Local $tEsp = ($snap = 1 ? 2000 : ($snap = 2 ? 3000 : 15000))
        Sleep($tEsp)
        LogMsg("")
        LogMsg("=== SNAPSHOT " & $snap & " — após " & Int($tEsp/1000) & "s ===")
        EnumerarControlesComEstado($hSci)
    Next
    MsgBox(64, "Debug preview", "Veja o log:" & @CRLF & $g_LogFile)
    Exit(0)
EndIf

; ─── Modo --list-controls: enumera controles e sai ───────────────────────
If $g_ListControls Then
    LogMsg("=== PARTE 1: ENUMERANDO TfrUnico (tela inicial) ===")
    EnumerarControles($hSci)

    ; Abre a tela do Razão pra enumerar os controles dela também
    LogMsg("")
    LogMsg("=== PARTE 2: abrindo tela do Razão via Alt+T → Z ===")
    Sleep(1000)
    Send("!t")
    Sleep(400)
    Send("z")
    Sleep(3000)
    LogMsg("")
    LogMsg("=== PARTE 3: ENUMERANDO TfrUnico DEPOIS de abrir Razão ===")
    EnumerarControles($hSci)

    MsgBox(64, "Lista de controles gerada", "Veja o arquivo:" & @CRLF & $g_LogFile)
    Exit(0)
EndIf

; ─── Confirmação ───────────────────────────────────────────────────────────
Local $resp = MsgBox(35, "Geração de Razão em lote", _
    "Vou iterar TODAS as empresas Ativas do SCI." & @CRLF & @CRLF & _
    "Início:  linha " & $g_Start & @CRLF & _
    "Limite:  " & ($g_Limit > 0 ? $g_Limit & " linhas" : "todas") & @CRLF & _
    "Pasta:   " & $g_OutDir & @CRLF & _
    "Período: 01/01/2025 a 31/12/2025" & @CRLF & _
    "Contas:  " & $g_ContaInicial & " → " & $g_ContaFinal & @CRLF & _
    "Modo:    " & ($g_DryRun ? "DRY-RUN (só lista, não gera PDF)" : "GERAÇÃO REAL") & @CRLF & @CRLF & _
    "→ NÃO MEXA NO COMPUTADOR durante a execução." & @CRLF & _
    "→ Aborto: SHIFT+ALT+ESC ou tecla PAUSE." & @CRLF & @CRLF & _
    "Continuar?")
If $resp <> 6 Then  ; 6 = Yes
    LogMsg("Cancelado pelo usuário antes de iniciar")
    Exit(0)
EndIf

LogMsg("Aguardando 3s antes de começar...")
Sleep(3000)

; ─── Loop principal ────────────────────────────────────────────────────────
Local $sucesso = 0, $erro = 0, $skip = 0
Local $ultimoCliente = ""
Local $processados = 0
Local $maxIter = 2000  ; safety: jamais passa de 2k linhas

Local $ultimoCodigo = ""

For $N = $g_Start To $maxIter
    If $g_AbortRequested Then ExitLoop
    If $g_Limit > 0 And $processados >= $g_Limit Then ExitLoop

    LogMsg(">>> Linha " & $N)

    ; ── 1. Seleciona a linha N do seletor de empresa ──────────────────────
    Local $sel = SelecionarLinhaSeletor($N)
    If $sel = "" Then
        LogMsg("    !! falha ao abrir/usar seletor — abortando")
        ExitLoop
    EndIf

    ; ── 2. Abre a tela do Razão via atalho Alt+T → Z ─────────────────────
    LogMsg("    abrindo Razão via atalho Alt+T → Z")
    WinActivate("[CLASS:TfrUnico]")
    Sleep(300)
    Send("!t")     ; Alt+T abre menu Relatórios
    Sleep(400)
    Send("z")      ; Z seleciona "Razão e livro caixa"
    Sleep(2500)    ; espera tela carregar (substituível por wait controle se quiser)

    ; ── 3. Aguarda tela do Razão aparecer ─────────────────────────────────
    Local $hRaz = ControlGetHandle("[CLASS:TfrUnico]", "", "[CLASSNN:TfrRelRazao1]")
    If Not $hRaz Then
        LogMsg("    !! TfrRelRazao1 não apareceu — abortando")
        ExitLoop
    EndIf

    ; ── 4. Lê código + nome do cliente atual (ROBUSTO!) ──────────────────
    Local $codigo = StringStripWS(ControlGetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI1]"), 3)
    Local $nome   = StringStripWS(ControlGetText("[CLASS:TfrUnico]", "", "[CLASSNN:TPanel_Padrao_SCI2]"), 3)
    LogMsg("    Cliente: código='" & $codigo & "'  nome='" & $nome & "'")

    ; ── 5. Detecta fim do grid (código repetido) ──────────────────────────
    If $codigo <> "" And $codigo = $ultimoCodigo Then
        LogMsg("    Código repetido — chegamos no fim do grid")
        FecharRazao()
        ExitLoop
    EndIf
    If $codigo <> "" Then $ultimoCodigo = $codigo

    ; ── 6. Define nome do arquivo PDF ─────────────────────────────────────
    Local $razao = $nome <> "" ? $nome : "EMPRESA_" & $codigo
    Local $nomeArq = SanitizarNomeArquivo("RAZAO_" & $razao & "_COD" & $codigo) & ".pdf"
    Local $caminhoPdf = $g_OutDir & "\" & $nomeArq

    Local $prefix = "[" & $N & "] " & StringLeft($razao, 40) & " (cod " & $codigo & ")"

    ; ── DRY-RUN: só loga, não gera ────────────────────────────────────────
    If $g_DryRun Then
        LogMsg($prefix & "  DRY-RUN ok")
        FecharRazao()
        $processados += 1
        ContinueLoop
    EndIf

    ; ── Skip se PDF já existe (retomada) ──────────────────────────────────
    If FileExists($caminhoPdf) Then
        LogMsg($prefix & "  SKIP (PDF já existe)")
        FecharRazao()
        $skip += 1
        $processados += 1
        ContinueLoop
    EndIf

    LogMsg($prefix & "  processando...")

    Local $ok = GerarRazao($caminhoPdf)
    If $ok Then
        LogMsg($prefix & "  ✓ OK")
        $sucesso += 1
    Else
        LogMsg($prefix & "  ✗ ERRO")
        $erro += 1
        RecuperarAposErro()
    EndIf

    $processados += 1
Next

; ─── Resumo ────────────────────────────────────────────────────────────────
Local $tag = $g_AbortRequested ? " [ABORTADO]" : ""
LogMsg("=== Fim" & $tag & ": processados=" & $processados & " sucesso=" & $sucesso & " erro=" & $erro & " skip=" & $skip & " ===")
MsgBox(64, "Concluído" & $tag, _
    "Processados: " & $processados & @CRLF & _
    "Sucesso:     " & $sucesso & @CRLF & _
    "Erro:        " & $erro & @CRLF & _
    "Skip:        " & $skip & @CRLF & @CRLF & _
    "Log: " & $g_LogFile)
Exit(0)

; ════════════════════════════════════════════════════════════════════════════
; Abre o seletor de empresa, navega até a linha N (Home + Down*N), confirma
; com Enter e retorna o texto do cliente selecionado (lido do header do SCI).
; ════════════════════════════════════════════════════════════════════════════
Func SelecionarLinhaSeletor($N)
    ; Garante que estamos na TfrUnico
    WinActivate("[CLASS:TfrUnico]")
    Sleep(400)

    Local $aPos = WinGetPos("[CLASS:TfrUnico]")
    If Not IsArray($aPos) Then
        LogMsg("    !! WinGetPos TfrUnico falhou")
        Return ""
    EndIf

    ; Clica botão Casa
    LogMsg("    abrindo seletor (Casa)")
    Local $ret = ControlClick("[CLASS:TfrUnico]", "", "[CLASSNN:TToolBar4]", "left", 1, 10, 15)
    If Not $ret Then
        LogMsg("    !! ControlClick TToolBar4 retornou 0, tentando MouseClick")
        MouseClick("primary", $aPos[0] + 123, $aPos[1] + 68, 1, 5)
        Sleep(500)
    EndIf

    Local $hSel = WinWait("[CLASS:TfrConsultaEmpresaPadrao]", "", 8)
    If Not $hSel Then
        LogMsg("    !! Seletor não apareceu")
        Return ""
    EndIf
    WinActivate("[CLASS:TfrConsultaEmpresaPadrao]")
    Sleep(700)

    ; Foca no grid
    ControlFocus("[CLASS:TfrConsultaEmpresaPadrao]", "", "[CLASSNN:TDBGrid_Padrao_SCI1]")
    Sleep(400)

    ; Vai pro topo
    Send("{HOME}")
    Sleep(300)
    Send("^{HOME}")  ; Ctrl+Home, caso Home só vá pro início da linha
    Sleep(300)

    ; Avança N linhas
    For $j = 1 To $N
        Send("{DOWN}")
        Sleep(40)
    Next
    Sleep(500)

    ; Confirma seleção
    LogMsg("    ENTER (linha " & $N & ")")
    Send("{ENTER}")

    ; Aguarda seletor fechar
    Local $deadline = TimerInit()
    While TimerDiff($deadline) < 8000
        If Not WinExists("[CLASS:TfrConsultaEmpresaPadrao]") Then ExitLoop
        Sleep(150)
    WEnd
    If WinExists("[CLASS:TfrConsultaEmpresaPadrao]") Then
        LogMsg("    !! Seletor não fechou após Enter")
        Send("{ESC}")
        Sleep(500)
        Return ""
    EndIf
    Sleep(1000)

    ; A leitura do cliente NÃO acontece aqui — o texto na barra superior é
    ; desenhado direto no canvas do Delphi, sem controle filho acessível.
    ; A gente vai ler depois de abrir a tela do Razão (que tem o código e
    ; nome em controles reais: TEdit_Codigo_Search_SCI[1] e TPanel_Padrao_SCI[2]).
    Return "ok"
EndFunc

; ════════════════════════════════════════════════════════════════════════════
; Lê o texto "código - RAZAO SOCIAL - CNPJ" do header do SCI.
; Estratégia: WinGetText pega TODOS os textos visíveis da janela; busco
; o que casa com o padrão (5 dígitos - texto - CNPJ).
; ════════════════════════════════════════════════════════════════════════════
Func LerClienteSelecionado()
    Local $txt = WinGetText("[CLASS:TfrUnico]")
    LogMsg("      WinGetText devolveu " & StringLen($txt) & " chars")

    ; Loga primeiras linhas pra debug (limita a 600 chars)
    Local $preview = StringLeft($txt, 600)
    $preview = StringReplace($preview, @CRLF, " | ")
    $preview = StringReplace($preview, @LF, " | ")
    $preview = StringReplace($preview, @CR, " | ")
    LogMsg("      preview: " & $preview)

    If $txt = "" Then Return ""

    ; Padrão completo: "00299 - K&K IDIOMAS LTDA - 50.960.727/0001-99"
    Local $m = StringRegExp($txt, "(\d{4,6})\s*-\s*([^\r\n|]+?)\s*-\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})", 1)
    If Not @error And IsArray($m) Then
        Return $m[0] & " - " & $m[1] & " - " & $m[2]
    EndIf
    LogMsg("      regex padrão não casou")

    ; Padrão alternativo 1: só CNPJ formatado em alguma linha
    Local $linhas = StringSplit($txt, @LF)
    For $i = 1 To $linhas[0]
        If StringRegExp($linhas[$i], "\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}") Then
            LogMsg("      fallback 1 (linha c/ CNPJ formatado): " & StringStripWS($linhas[$i], 3))
            Return StringStripWS($linhas[$i], 3)
        EndIf
    Next

    ; Padrão alternativo 2: qualquer CNPJ (sem formatação)
    Local $m2 = StringRegExp($txt, "(\d{14})", 1)
    If Not @error And IsArray($m2) Then
        LogMsg("      fallback 2 (CNPJ sem formatação): " & $m2[0])
        Return "CNPJ " & $m2[0]
    EndIf

    LogMsg("      todos fallbacks falharam")
    Return ""
EndFunc

; Parse do texto do cliente — retorna [razaoSocial, cnpjLimpo]
Func ParseClienteHeader($texto)
    Local $result[2] = ["", ""]
    Local $m = StringRegExp($texto, "(\d{4,6})\s*-\s*([^\r\n]+?)\s*-\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})", 1)
    If @error Or Not IsArray($m) Then Return $result
    $result[0] = StringStripWS($m[1], 3)
    $result[1] = StringRegExpReplace($m[2], "[^0-9]", "")
    Return $result
EndFunc

; ════════════════════════════════════════════════════════════════════════════
; Gera Razão pro cliente ATUALMENTE selecionado no SCI.
; Cliente já está carregado — só falta abrir o relatório e exportar.
; ════════════════════════════════════════════════════════════════════════════
Func GerarRazao($caminhoPdf)
    ; A tela do Razão JÁ está aberta com o cliente carregado.
    ; Vamos preencher campos via ControlSetText (robusto) e clicar
    ; Pré-visualizar via coord relativa à janela do Razão.

    LogMsg("      [g1] preenche Data Inicial='01/01/2025' e Final='31/12/2025'")
    ControlSetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Date_Padrao_SCI2]", "01/01/2025")
    Sleep(300)
    ControlSetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Date_Padrao_SCI1]", "31/12/2025")
    Sleep(300)

    LogMsg("      [g2] Conta Inicial='" & $g_ContaInicial & "' via ControlSetText")
    ; Limpa, seta e dispara TAB no controle pra confirmar (sem popup)
    ControlSetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI7]", "")
    Sleep(200)
    ControlSetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI7]", $g_ContaInicial)
    Sleep(300)
    Local $verifInicial = ControlGetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI7]")
    LogMsg("        ControlGetText conta inicial após set: '" & $verifInicial & "'")
    ControlFocus("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI7]")
    Sleep(200)
    ControlSend("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI7]", "{TAB}")
    Sleep(900)
    ; Se um popup TSearchPopup abriu, fecha com ESC pra evitar interferência
    If WinExists("[CLASS:TSearchPopup]") Then
        LogMsg("        TSearchPopup detectado — fechando com ESC")
        Send("{ESC}")
        Sleep(300)
    EndIf

    LogMsg("      [g3] Conta Final='" & $g_ContaFinal & "' via ControlSetText")
    ControlSetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI6]", "")
    Sleep(200)
    ControlSetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI6]", $g_ContaFinal)
    Sleep(300)
    Local $verifFinal = ControlGetText("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI6]")
    LogMsg("        ControlGetText conta final após set: '" & $verifFinal & "'")
    ControlFocus("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI6]")
    Sleep(200)
    ControlSend("[CLASS:TfrUnico]", "", "[CLASSNN:TEdit_Codigo_Search_SCI6]", "{TAB}")
    Sleep(900)
    If WinExists("[CLASS:TSearchPopup]") Then
        LogMsg("        TSearchPopup detectado — fechando com ESC")
        Send("{ESC}")
        Sleep(300)
    EndIf

    ; ── Pré-visualizar via atalho Alt+F8 ─────────────────────────────────
    LogMsg("      [g4] Pré-visualizar via Alt+F8")
    Send("!{F8}")

    ; ── Aguarda render TERMINAR (sinal: TfrRelRazao1 fica habilitada) ────
    ; Enquanto o relatório carrega, o Delphi desabilita TfrRelRazao1
    ; (En=0). Quando termina, re-habilita (En=1). Timeout 5min pra rels grandes.
    Sleep(800)  ; dá tempo pro Delphi processar o clique e marcar desabilitado
    LogMsg("        aguardando render terminar (TfrRelRazao1 ficar habilitada, max 300s)")
    If Not EsperarControleHabilitado("[CLASS:TfrUnico]", "[CLASSNN:TfrRelRazao1]", 300) Then
        LogMsg("      !! render do relatório não terminou em 5min")
        Return False
    EndIf
    Sleep(400)  ; pausa pequena pra UI estabilizar

    LogMsg("      [g5] Toolbar PDF: (644,135) → (657,165) — relativo ao Razão")
    Local $razPos2 = ControlGetPos("[CLASS:TfrUnico]", "", "[CLASSNN:TfrRelRazao1]")
    Local $tfrPos2 = WinGetPos("[CLASS:TfrUnico]")
    Local $baseX = $tfrPos2[0] + $razPos2[0]
    Local $baseY = $tfrPos2[1] + $razPos2[1]
    MouseClick("primary", $baseX + 644, $baseY + 101, 1, 5)
    Sleep(1200)
    MouseClick("primary", $baseX + 657, $baseY + 131, 1, 5)

    ; Aguarda diálogo de export aparecer (até 30s)
    LogMsg("        aguardando TfrxPDFExportDialog (max 30s)")
    Local $hPdfDlg = WinWait("[CLASS:TfrxPDFExportDialog]", "", 30)
    If Not $hPdfDlg Then
        LogMsg("      !! Diálogo TfrxPDFExportDialog não apareceu — debug janelas:")
        DebugListarJanelasVisiveis()
        Return False
    EndIf
    LogMsg("      [g8] OK do diálogo de export")
    WinActivate("[CLASS:TfrxPDFExportDialog]")
    Sleep(600)
    Local $aDlg = WinGetPos("[CLASS:TfrxPDFExportDialog]")
    MouseClick("primary", $aDlg[0] + 192, $aDlg[1] + 517, 1, 5)
    Sleep(1800)

    LogMsg("        aguardando diálogo Salvar como (max 30s)")
    Local $hSave = WinWait("[CLASS:#32770]", "", 30)
    If Not $hSave Then
        LogMsg("      !! Diálogo Salvar como não apareceu — debug janelas:")
        DebugListarJanelasVisiveis()
        Return False
    EndIf
    LogMsg("      [g9] Salvar em: " & $caminhoPdf)
    Sleep(500)
    ControlSetText("[CLASS:#32770]", "", "Edit1", $caminhoPdf)
    Sleep(400)
    Send("{ENTER}")

    Sleep(1000)
    If WinExists("[CLASS:#32770]", "Substituir") Or WinExists("[CLASS:#32770]", "já existe") Then
        ControlClick("[CLASS:#32770]", "", "Button1")
        Sleep(500)
    EndIf

    WinWaitClose("[CLASS:#32770]", "", 30)
    Sleep(1800)

    LogMsg("      [g10] Fecha pré-visualização (Ctrl+F4)")
    Send("^{F4}")
    Sleep(800)
    Send("^{F4}")
    Sleep(800)

    If Not FileExists($caminhoPdf) Then
        LogMsg("      !! PDF não foi criado")
        Return False
    EndIf
    Return True
EndFunc

Func RecuperarAposErro()
    Send("{ESC}")
    Sleep(300)
    Send("{ESC}")
    Sleep(300)
    For $i = 1 To 4
        Send("^{F4}")
        Sleep(400)
    Next
    WinActivate("[CLASS:TfrUnico]")
    Sleep(600)
EndFunc

; Fecha a tela do Razão sem gerar (usado em dry-run ou skip)
Func FecharRazao()
    Send("^{F4}")
    Sleep(600)
    Send("^{F4}")
    Sleep(400)
EndFunc

; Aguarda um controle ficar HABILITADO (IsEnabled=1) num timeout máximo.
; Usado pra esperar render do relatório terminar — o botão "Exportar"
; fica desabilitado durante o carregamento.
Func EsperarControleHabilitado($winSpec, $ctrlSpec, $timeoutSeg = 300, $intervalo = 500)
    Local $start = TimerInit()
    Local $maxMs = $timeoutSeg * 1000
    Local $tentativas = 0
    While TimerDiff($start) < $maxMs
        If $g_AbortRequested Then Return False
        Local $enabled = ControlCommand($winSpec, "", $ctrlSpec, "IsEnabled", "")
        $tentativas += 1
        If $enabled = 1 Then
            LogMsg("        controle habilitado após " & Int(TimerDiff($start) / 1000) & "s (" & $tentativas & " checks)")
            Return True
        EndIf
        Sleep($intervalo)
    WEnd
    LogMsg("        !! controle NÃO ficou habilitado em " & $timeoutSeg & "s")
    Return False
EndFunc

; Lista todas as janelas visíveis com título — pra debug
Func DebugListarJanelasVisiveis()
    Local $aWins = WinList()
    For $w = 1 To $aWins[0][0]
        Local $titulo = $aWins[$w][0]
        Local $h = $aWins[$w][1]
        If $titulo = "" Then ContinueLoop
        Local $st = WinGetState($h)
        If BitAND($st, 2) = 0 Then ContinueLoop  ; só visíveis
        Local $cls = ""
        Local $aProc = WinGetClassList($h)
        ; Pega só o título da janela top-level
        LogMsg("        janela visível: '" & $titulo & "' handle=" & $h)
    Next
EndFunc

; ════════════════════════════════════════════════════════════════════════════
; Utilitários
; ════════════════════════════════════════════════════════════════════════════
Func SanitizarNomeArquivo($s)
    $s = StringRegExpReplace($s, '[\\/:*?"<>|&]', "_")
    $s = StringRegExpReplace($s, "\s+", "_")
    If StringLen($s) > 110 Then $s = StringLeft($s, 110)
    Return $s
EndFunc

Func TS()
    Return @YEAR & "-" & @MON & "-" & @MDAY & " " & @HOUR & ":" & @MIN & ":" & @SEC
EndFunc

Func LogMsg($msg)
    Local $linha = TS() & "  " & $msg
    ConsoleWrite($linha & @CRLF)
    Local $h = FileOpen($g_LogFile, 1)
    If $h <> -1 Then
        FileWriteLine($h, $linha)
        FileClose($h)
    EndIf
EndFunc

Func AbortHandler()
    $g_AbortRequested = True
    LogMsg(">>> ABORT solicitado pelo usuário (Shift+Alt+ESC ou PAUSE)")
EndFunc

; ════════════════════════════════════════════════════════════════════════════
; DEBUG: enumera todos os controles da janela e loga ClassNN + texto + pos
; ════════════════════════════════════════════════════════════════════════════
Func EnumerarControles($hWnd)
    Local $sClasses = WinGetClassList($hWnd)
    Local $aClasses = StringSplit($sClasses, @LF)
    LogMsg("Total de classes únicas: " & ($aClasses[0] - 1))

    ; Conta ocorrências por classe pra fazer ClassNN
    Local $classesUnicas[100][2]  ; [class, count]
    Local $totalUnicas = 0

    For $i = 1 To $aClasses[0]
        Local $cls = StringStripWS($aClasses[$i], 3)
        If $cls = "" Then ContinueLoop
        ; Acha índice ou cria novo
        Local $achou = False
        For $j = 0 To $totalUnicas - 1
            If $classesUnicas[$j][0] = $cls Then
                $classesUnicas[$j][1] += 1
                Local $instance = $classesUnicas[$j][1]
                LogarControle($hWnd, $cls, $instance)
                $achou = True
                ExitLoop
            EndIf
        Next
        If Not $achou Then
            $classesUnicas[$totalUnicas][0] = $cls
            $classesUnicas[$totalUnicas][1] = 1
            $totalUnicas += 1
            LogarControle($hWnd, $cls, 1)
        EndIf
    Next
    LogMsg("=== fim da enumeração ===")
EndFunc

Func LogarControle($hWnd, $class, $instance)
    Local $ctrl = "[CLASSNN:" & $class & $instance & "]"
    Local $texto = ControlGetText($hWnd, "", $ctrl)
    Local $pos = ControlGetPos($hWnd, "", $ctrl)
    Local $posStr = ""
    If IsArray($pos) Then
        $posStr = " @ (" & $pos[0] & "," & $pos[1] & " " & $pos[2] & "x" & $pos[3] & ")"
    EndIf
    Local $textoTrunc = StringLeft($texto, 120)
    $textoTrunc = StringReplace($textoTrunc, @CRLF, " | ")
    $textoTrunc = StringReplace($textoTrunc, @LF, " | ")
    LogMsg("  " & $class & "[" & $instance & "]" & $posStr & "  texto=[" & $textoTrunc & "]")
EndFunc

; Versão com IsEnabled — usada pra debug do preview (ver qual controle
; muda de desabilitado → habilitado quando o render termina)
Func EnumerarControlesComEstado($hWnd)
    Local $sClasses = WinGetClassList($hWnd)
    Local $aClasses = StringSplit($sClasses, @LF)
    Local $classesUnicas[200][2]
    Local $totalUnicas = 0

    For $i = 1 To $aClasses[0]
        Local $cls = StringStripWS($aClasses[$i], 3)
        If $cls = "" Then ContinueLoop
        Local $achou = False
        For $j = 0 To $totalUnicas - 1
            If $classesUnicas[$j][0] = $cls Then
                $classesUnicas[$j][1] += 1
                LogarControleComEstado($hWnd, $cls, $classesUnicas[$j][1])
                $achou = True
                ExitLoop
            EndIf
        Next
        If Not $achou Then
            $classesUnicas[$totalUnicas][0] = $cls
            $classesUnicas[$totalUnicas][1] = 1
            $totalUnicas += 1
            LogarControleComEstado($hWnd, $cls, 1)
        EndIf
    Next
EndFunc

Func LogarControleComEstado($hWnd, $class, $instance)
    Local $ctrl = "[CLASSNN:" & $class & $instance & "]"
    Local $enabled = ControlCommand($hWnd, "", $ctrl, "IsEnabled", "")
    Local $visible = ControlCommand($hWnd, "", $ctrl, "IsVisible", "")
    Local $texto = ControlGetText($hWnd, "", $ctrl)
    Local $pos = ControlGetPos($hWnd, "", $ctrl)
    Local $posStr = ""
    If IsArray($pos) Then
        $posStr = " @ (" & $pos[0] & "," & $pos[1] & " " & $pos[2] & "x" & $pos[3] & ")"
    EndIf
    Local $textoTrunc = StringLeft($texto, 80)
    $textoTrunc = StringReplace($textoTrunc, @CRLF, " | ")
    LogMsg("  " & $class & "[" & $instance & "]" & $posStr & _
        "  En=" & $enabled & " Vis=" & $visible & "  [" & $textoTrunc & "]")
EndFunc
