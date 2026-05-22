@echo off
REM ════════════════════════════════════════════════════════════════════
REM Helper pra rodar o gerar-razao.au3 sem ter que digitar caminho longo.
REM
REM Uso:
REM   gerar-razao.bat                    -> rodada completa (todos clientes)
REM   gerar-razao.bat --dry-run          -> so mostra a lista, nao toca no SCI
REM   gerar-razao.bat --limit=1          -> processa so o primeiro cliente
REM   gerar-razao.bat --limit=5          -> processa os 5 primeiros
REM   gerar-razao.bat --dry-run --limit=10  -> preview dos 10 primeiros
REM ════════════════════════════════════════════════════════════════════

setlocal EnableDelayedExpansion

set "AUTOIT=C:\Program Files (x86)\AutoIt3\AutoIt3.exe"
set "SCRIPT=%~dp0gerar-razao.au3"

if not exist "!AUTOIT!" goto :no_autoit
if not exist "!SCRIPT!" goto :no_script

echo Rodando: "!AUTOIT!" "!SCRIPT!" %*
echo.
"!AUTOIT!" "!SCRIPT!" %*

echo.
echo Concluido. Log em D:\RAZOES\2025\_log.txt
pause
exit /b 0

:no_autoit
echo ERRO: AutoIt nao encontrado em !AUTOIT!
echo Instale em https://www.autoitscript.com/site/autoit/downloads/
pause
exit /b 1

:no_script
echo ERRO: gerar-razao.au3 nao encontrado em !SCRIPT!
pause
exit /b 1
