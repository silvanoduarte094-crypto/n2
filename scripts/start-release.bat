@echo off
setlocal
cd /d "%~dp0"
title N2 - Nucleo de Inteligencia

if not exist "node.exe" (
  echo [erro] node.exe nao encontrado.
  echo Baixe o pacote completo em: https://github.com/SEU-USUARIO/n2/releases/latest
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo [erro] Build do app nao encontrado em dist\index.html.
  pause
  exit /b 1
)

if not exist "server\dist\server.cjs" (
  echo [erro] Bridge nao encontrado em server\dist\server.cjs.
  pause
  exit /b 1
)

echo.
echo   N2 - Nucleo de Inteligencia
echo   Abrindo http://127.0.0.1:7331 ...
echo   Feche esta janela para encerrar o N2.
echo.

"%~dp0node.exe" "%~dp0server\dist\server.cjs"

echo.
echo O N2 foi encerrado.
pause
