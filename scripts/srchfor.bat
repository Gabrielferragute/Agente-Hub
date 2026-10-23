@echo off
REM ==============================================================================
REM srchfor.bat — Atalho para execução no CMD do Windows
REM Repassa os argumentos para o script PowerShell com bypass de execution policy
REM ==============================================================================

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0srchfor.ps1" %*
