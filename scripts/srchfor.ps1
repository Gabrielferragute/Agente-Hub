<#
.SYNOPSIS
    srchfor.ps1 - Automacao de Busca SuperC (ISRSUPC / SRCHFOR) via Zowe CLI no PowerShell

.DESCRIPTION
    1. Solicita e valida o Data Set (PDS) e a String de busca
    2. Gera dinamicamente o JCL com validacao de colunas (<= 71) e escape de aspas
    3. Submete o JOB via Zowe CLI aguardando termino (--wait-for-output)
    4. Interpreta os codigos de retorno do SuperC (RC 0001 = Achou, RC 0000 = Nao achou)
    5. Exibe o spool completo na tela com 'zowe zos-jobs view all-spool-content'

.EXAMPLE
    .\scripts\srchfor.ps1
    .\scripts\srchfor.ps1 -Dataset "MEU.PROJETO.COBOL.SRC" -SearchString "EXEC SQL"
#>

[CmdletBinding()]
param (
    [Parameter(Position = 0)]
    [string]$Dataset,

    [Parameter(Position = 1)]
    [string]$SearchString,

    [string]$Profile,
    [string]$JobName = "SRCHFOR",
    [string]$Account = "ACCT",
    [string]$JobClass = "A",
    [string]$MsgClass = "X",
    [string]$OutputFile,
    [switch]$KeepJcl
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "    Mainframe Hub Assistant - SuperC Search-For Automator   " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Valida Zowe CLI
$zoweCmd = Get-Command zowe -ErrorAction SilentlyContinue
if (-not $zoweCmd) {
    Write-Host "[ERRO] Zowe CLI nao encontrado no PATH." -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($Dataset)) {
    $Dataset = Read-Host "Digite o caminho do Data Set"
}

if ([string]::IsNullOrWhiteSpace($SearchString)) {
    $SearchString = Read-Host "Digite o valor de string a ser feita a busca pelos membros do Data Set"
}

$Dataset = $Dataset.Trim().Trim("'").Trim('"').ToUpper()
if ([string]::IsNullOrWhiteSpace($Dataset)) {
    Write-Host "[ERRO] O nome do Data Set e obrigatorio." -ForegroundColor Red
    exit 1
}

if ($Dataset.Contains('(')) {
    Write-Host "[ERRO] Informe apenas o Data Set (PDS), sem membro. O SRCHFOR busca em todos os membros." -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($SearchString)) {
    Write-Host "[ERRO] A string de busca e obrigatoria." -ForegroundColor Red
    exit 1
}

# Escape de aspas simples
$escapedSearch = $SearchString.Trim().Replace("'", "''")
$sysinLine = "  SRCHFOR '$escapedSearch'"

if ($sysinLine.Length -gt 71) {
    Write-Host "[ERRO] Linha SYSIN muito longa ($($sysinLine.Length) caracteres). Maximo permitido e 71 colunas." -ForegroundColor Red
    exit 1
}

$JobName = $JobName.Trim().ToUpper()
$Account = $Account.Trim().ToUpper()
$JobClass = $JobClass.Trim().ToUpper()
$MsgClass = $MsgClass.Trim().ToUpper()

$jclFile = ".\srchfor.jcl"
$jclLines = @(
    "//$($JobName.PadRight(8)) JOB ($Account),'SRCHFOR',CLASS=$JobClass,MSGCLASS=$MsgClass,NOTIFY=&SYSUID",
    "//STEP1    EXEC PGM=ISRSUPC,PARM='SRCHCMP,ANYC'",
    "//SYSPRINT DD  SYSOUT=*",
    "//NEWDD    DD  DISP=SHR,DSN=$Dataset",
    "//OUTDD    DD  SYSOUT=*",
    "//SYSIN    DD  *",
    $sysinLine,
    "/*"
)
$jclContent = $jclLines -join "`r`n"

Set-Content -Path $jclFile -Value $jclContent -Encoding Ascii

Write-Host "`n=== JCL Gerado ===" -ForegroundColor Blue
Get-Content $jclFile
Write-Host "==================`n" -ForegroundColor Blue

$submitArgs = @("zos-jobs", "submit", "local-file", $jclFile, "--wait-for-output", "--response-format-json")
if (-not [string]::IsNullOrWhiteSpace($Profile)) {
    $submitArgs += @("--zosmf-profile", $Profile)
}

Write-Host ">> Submetendo JOB via Zowe CLI..." -ForegroundColor Yellow
$jsonRaw = & zowe @submitArgs 2>&1 | Out-String

try {
    $parsed = $jsonRaw | ConvertFrom-Json
    $data = if ($parsed.data) { $parsed.data } else { $parsed }
    $jobId = $data.jobid
    $jobNameResult = $data.jobname
    $retcode = $data.retcode
    $status = $data.status
} catch {
    Write-Host "[AVISO] Nao foi possivel fazer parse do JSON retornado pelo Zowe:" -ForegroundColor Yellow
    Write-Host $jsonRaw
}

Write-Host "`n[OK] JOB Finalizado!" -ForegroundColor Green
Write-Host "  Job ID  : $jobId" -ForegroundColor Cyan
Write-Host "  Job Name: $jobNameResult"
Write-Host "  Status  : $status"
Write-Host "  Retcode : $retcode" -ForegroundColor Yellow

Write-Host "`n=== Interpretacao do Retorno SuperC ===" -ForegroundColor Blue
if ($retcode -match "0001") {
    Write-Host "-> RC 1: String ENCONTRADA no(s) membro(s) do Data Set!" -ForegroundColor Green
} elseif ($retcode -match "0000") {
    Write-Host "-> RC 0: Busca concluida sem erros, porem a string NAO foi encontrada." -ForegroundColor Yellow
} elseif ($retcode -match "0004") {
    Write-Host "-> RC 4: Aviso (warning do SuperC). Ocorreu aviso nas opcoes de busca." -ForegroundColor Yellow
} elseif ($retcode -match "0028") {
    Write-Host "-> RC 28: Nenhum dado pesquisado (Data Set vazio, sem membros ou inacessivel)." -ForegroundColor Red
} elseif ($retcode -match "ABEND") {
    Write-Host "-> ABEND detectado: $retcode. Verifique o spool do JOB." -ForegroundColor Red
} else {
    Write-Host "-> Codigo retornado: $retcode." -ForegroundColor Yellow
}
Write-Host "=======================================`n" -ForegroundColor Blue

if (-not [string]::IsNullOrWhiteSpace($jobId)) {
    Write-Host ">> Visualizando as saidas do JOB ($jobId)..." -ForegroundColor Yellow
    $viewArgs = @("zos-jobs", "view", "all-spool-content", $jobId)
    if (-not [string]::IsNullOrWhiteSpace($Profile)) {
        $viewArgs += @("--zosmf-profile", $Profile)
    }

    Write-Host "`n======================== SPOOL OUTPUT ========================" -ForegroundColor Cyan
    $spoolContent = & zowe @viewArgs 2>&1 | Out-String
    Write-Host $spoolContent

    if (-not [string]::IsNullOrWhiteSpace($OutputFile)) {
        Set-Content -Path $OutputFile -Value $spoolContent -Encoding Ascii
        Write-Host "[OK] Spool gravado em: $OutputFile" -ForegroundColor Green
    }
    Write-Host "==============================================================`n" -ForegroundColor Cyan
}

if (-not $KeepJcl) {
    Remove-Item -Path $jclFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Processo concluido com sucesso." -ForegroundColor Green
