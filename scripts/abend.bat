@echo off
REM ==============================================================================
REM abend.bat — Analisador Inteligente de ABENDs para CMD (Windows)
REM ==============================================================================

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0abend.ps1" %*
