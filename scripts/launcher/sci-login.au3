; ────────────────────────────────────────────────────────────────────────────
; SCI Único — Auto-login via AutoIt
; ────────────────────────────────────────────────────────────────────────────
; O SCI Único é um app Delphi (não Electron como pensávamos). Au3Info revelou:
;   - Janela:   [CLASS:TfrSenhaUsuario]  (frame "Senha/Usuário" do Delphi)
;   - Usuário:  TEdit2  (TEdit instance=2, position 50,226, size 260x24)
;   - Senha:    TEdit1  (TEdit instance=1, position 50,294, size 260x21)
;   - Entrar:   TPanel4 (TPanel instance=4, position 39,380, size 275x40)
;
; ControlSetText/ControlClick por nome é IMUNE a:
;   - Resize/maximize da janela
;   - DPI scaling
;   - Janela em background
;
; Uso (linha de comando):
;   sci-login.exe <usuario> <senha>
; ou via AutoIt3.exe:
;   AutoIt3.exe sci-login.au3 <usuario> <senha>
;
; Logs em %TEMP%\sci-login-au3.log (sobrescreve a cada execução)
; ────────────────────────────────────────────────────────────────────────────

#NoTrayIcon
Opt("WinTitleMatchMode", 2)  ; substring match no título
Opt("MustDeclareVars", 1)

; Parâmetros
If $CmdLine[0] < 2 Then
    LogMsg("Uso: sci-login.exe <usuario> <senha>")
    Exit(2)
EndIf

Local $usuario = $CmdLine[1]
Local $senha = $CmdLine[2]

LogMsg("=== início ===")
LogMsg("Usuario: " & $usuario & " (len=" & StringLen($usuario) & "), senha (len=" & StringLen($senha) & ")")

; Aguarda janela do Único — usa CLASS:TfrSenhaUsuario (estável)
LogMsg("Aguardando janela [CLASS:TfrSenhaUsuario] (timeout 30s)...")
Local $hWnd = WinWait("[CLASS:TfrSenhaUsuario]", "", 30)
If $hWnd = 0 Then
    LogMsg("ERRO: Janela do Único não apareceu em 30s")
    Exit(4)
EndIf

LogMsg("Janela encontrada: handle=" & $hWnd)

; Ativa pra garantir foco
WinActivate("[CLASS:TfrSenhaUsuario]")
WinWaitActive("[CLASS:TfrSenhaUsuario]", "", 5)
Sleep(300)

; Preenche Usuário (TEdit2 — confirmado pelo Au3Info como o de cima)
LogMsg("Preenchendo TEdit2 (Usuário)...")
Local $ret1 = ControlSetText("[CLASS:TfrSenhaUsuario]", "", "[CLASS:TEdit; INSTANCE:2]", $usuario)
LogMsg("ControlSetText Usuário retornou: " & $ret1)
Sleep(150)

; Preenche Senha (TEdit1)
LogMsg("Preenchendo TEdit1 (Senha)...")
Local $ret2 = ControlSetText("[CLASS:TfrSenhaUsuario]", "", "[CLASS:TEdit; INSTANCE:1]", $senha)
LogMsg("ControlSetText Senha retornou: " & $ret2)
Sleep(150)

; Verificação opcional: lê de volta pra confirmar
Local $verifUsuario = ControlGetText("[CLASS:TfrSenhaUsuario]", "", "[CLASS:TEdit; INSTANCE:2]")
LogMsg("Verificação Usuário lido: '" & $verifUsuario & "'")

If $verifUsuario <> $usuario Then
    LogMsg("AVISO: Usuário não conferiu, tentando inverter (talvez TEdit1=Usuário, TEdit2=Senha)...")
    ; Limpa e tenta inverter
    ControlSetText("[CLASS:TfrSenhaUsuario]", "", "[CLASS:TEdit; INSTANCE:2]", "")
    ControlSetText("[CLASS:TfrSenhaUsuario]", "", "[CLASS:TEdit; INSTANCE:1]", "")
    Sleep(150)
    ControlSetText("[CLASS:TfrSenhaUsuario]", "", "[CLASS:TEdit; INSTANCE:1]", $usuario)
    ControlSetText("[CLASS:TfrSenhaUsuario]", "", "[CLASS:TEdit; INSTANCE:2]", $senha)
    LogMsg("Inversão aplicada")
EndIf

Sleep(200)

; Clica no botão Entrar (TPanel4)
LogMsg("Clicando TPanel4 (Entrar)...")
Local $ret3 = ControlClick("[CLASS:TfrSenhaUsuario]", "", "[CLASS:TPanel; INSTANCE:4]")
LogMsg("ControlClick Entrar retornou: " & $ret3)

If $ret3 = 0 Then
    LogMsg("AVISO: ControlClick falhou, tentando ENTER como fallback")
    ControlSend("[CLASS:TfrSenhaUsuario]", "", "[CLASS:TEdit; INSTANCE:1]", "{ENTER}")
EndIf

LogMsg("Login enviado. Aguardando janela principal aparecer...")

; Após login: aguarda a janela TfrSenhaUsuario sumir e outra janela do SCI aparecer
Local $deadline = TimerInit()
While TimerDiff($deadline) < 10000
    If Not WinExists("[CLASS:TfrSenhaUsuario]") Then
        LogMsg("Janela de login sumiu (login OK)")
        ExitLoop
    EndIf
    Sleep(300)
WEnd

; Tenta trazer janela principal do SCI pra primeiro plano
Sleep(800)
Local $hMain = WinGetHandle("[REGEXPTITLE:(?i).*(único|unico|SCI).*]")
If $hMain Then
    LogMsg("Janela principal detectada: " & $hMain)
    WinActivate($hMain)
    WinSetState($hMain, "", @SW_RESTORE)
EndIf

LogMsg("=== fim (sucesso) ===")
Exit(0)

; ────────────────────────────────────────────────────────────────────────────
Func LogMsg($msg)
    Local $logPath = @TempDir & "\sci-login-au3.log"
    Local $hFile = FileOpen($logPath, 1)  ; append
    If $hFile = -1 Then Return
    FileWriteLine($hFile, @YEAR & "-" & @MON & "-" & @MDAY & " " & _
        @HOUR & ":" & @MIN & ":" & @SEC & "  " & $msg)
    FileClose($hFile)
EndFunc

Func ClearLog()
    Local $logPath = @TempDir & "\sci-login-au3.log"
    FileDelete($logPath)
EndFunc
