<#
.SYNOPSIS
    abend.ps1 - Analisador Inteligente de ABENDs e Erros de Spool via Zowe CLI

.DESCRIPTION
    1. Obtem o spool completo do Job ID informado via Zowe CLI
    2. Varre o spool procurando assinaturas de erro do JES e do z/OS:
       - JCL ERROR (ex: dataset nao encontrado, erro de sintaxe)
       - ABENDs de Sistema (S0C7, S0C4, S013, S806, SD37, S322, etc.)
       - ABENDs de Usuario (U4038, U0999, etc.)
       - Condition Codes altos (RC=0008, RC=0012, RC=0016)
    3. Isola o step que falhou, o programa e a instrucao causadora
    4. Exibe um diagnostico claro com causa raiz e acoes recomendadas

.EXAMPLE
    .\scripts\abend.ps1 JOB03166
    .\scripts\abend.ps1 -JobId JOB03166 -Profile zosmf
#>

[CmdletBinding()]
param (
    [Parameter(Position = 0, Mandatory = $false)]
    [string]$JobId,

    [string]$Profile,
    [switch]$FullSpool
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "    Mainframe Hub Assistant - Smart ABEND Analyzer (z/OS)   " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Valida Zowe CLI
$zoweCmd = Get-Command zowe -ErrorAction SilentlyContinue
if (-not $zoweCmd) {
    Write-Host "[ERRO] Zowe CLI nao encontrado no PATH." -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($JobId)) {
    $JobId = Read-Host "Digite o Job ID para analisar (ex: JOB03166)"
}

$JobId = $JobId.Trim().ToUpper()
if ([string]::IsNullOrWhiteSpace($JobId)) {
    Write-Host "[ERRO] O Job ID e obrigatorio." -ForegroundColor Red
    exit 1
}

Write-Host "`n>> Conectando ao z/OS e baixando spool do $JobId..." -ForegroundColor Yellow

$viewArgs = @("zos-jobs", "view", "all-spool-content", $JobId)
if (-not [string]::IsNullOrWhiteSpace($Profile)) {
    $viewArgs += @("--zosmf-profile", $Profile)
}

$spoolRaw = & zowe @viewArgs 2>&1 | Out-String

if ($LASTEXITCODE -ne 0 -or $spoolRaw -match "Rest API failure" -or $spoolRaw -match "Job not found") {
    Write-Host "[ERRO] Nao foi possivel obter o spool para o Job ID '$JobId'." -ForegroundColor Red
    Write-Host $spoolRaw
    exit 1
}

Write-Host "[OK] Spool obtido com sucesso ($($spoolRaw.Length) caracteres). Analisando assinaturas de erro..." -ForegroundColor Green

# Dicionario de Conhecimento de ABENDs mais comuns
$AbendDict = @{
    "0C7"  = @{ Name = "Data Exception (S0C7)"; Cause = "Tentativa de operacao aritmetica com campo nao numerico (ex: espacos ou nulos em campo COMP-3 / Decimal Empacotado)."; Fix = "Verifique o registro lido do arquivo. Certifique-se de que campos numericos foram inicializados com zeros (INITIALIZE) ou valide com 'IF CAMPO NUMERIC' antes de operar." }
    "0C4"  = @{ Name = "Protection Exception (S0C4)"; Cause = "Violacao de memoria protegida. Normalmente acesso a indice fora dos limites de uma OCCURS/tabela ou ponteiro nulo/invalido."; Fix = "Verifique os limites de indices e subscritos em tabelas OCCURS. Se usar ponteiros ou LINKAGE SECTION, confira se o endereco e valido." }
    "0C1"  = @{ Name = "Operation Exception (S0C1)"; Cause = "A CPU tentou executar uma instrucao de maquina invalida. Frequentemente chamada a modulo nao carregado ou corrupcao de area de codigo."; Fix = "Confira chamadas CALL dinamicas e verifique se o ponteiro da rotina ou modulo foi carregado corretamente." }
    "013"  = @{ Name = "Open Conflict (S013)"; Cause = "Conflito nos atributos do arquivo (DCB) entre a definicao no COBOL (FD) e o JCL/Dataset no disco, ou membro de PDS inexistente."; Fix = "Confira RECFM, LRECL e BLKSIZE entre o programa e o DD correspondente no JCL. Se for PDS, confirme se o membro existe." }
    "806"  = @{ Name = "Module Not Found (S806)"; Cause = "O programa ou modulo executavel especificado no EXEC PGM= nao foi localizado nas bibliotecas de carga."; Fix = "Verifique o nome do programa no JCL e se a biblioteca de load correta esta definida no STEPLIB ou JOBLIB." }
    "D37"  = @{ Name = "Out of Space (SD37)"; Cause = "O Data Set esgotou o espaco alocado no volume de disco e nao ha mais extents secundarios disponiveis."; Fix = "Aumente a alocacao primaria/secundaria de espaco no JCL (SPACE=(CYL,(x,y))) ou utilize compressao." }
    "B37"  = @{ Name = "End of Volume (SB37)"; Cause = "O volume em disco encheu e o Data Set nao tem volumes adicionais configurados."; Fix = "Especifique volumes adicionais no JCL (ex: UNIT=(SYSDA,5)) ou libere espaco no volume." }
    "E37"  = @{ Name = "PDS Directory Full (SE37)"; Cause = "O diretorio do Data Set particionado (PDS) encheu e nao comporta novos membros."; Fix = "Realoque o PDS com mais blocos de diretorio (terceiro parametro do SPACE, ex: SPACE=(CYL,(10,5,50))) ou execute compressao (IEBCOPY)." }
    "222"  = @{ Name = "Cancelled by Operator (S222)"; Cause = "O JOB foi cancelado manualmente por um comando do operador de console."; Fix = "Consulte a equipe de operacao para entender o motivo do cancelamento manual." }
    "322"  = @{ Name = "CPU Time Exceeded (S322)"; Cause = "O tempo de CPU alocado para o JOB ou step foi excedido (forte indicio de loop infinito)."; Fix = "Verifique lacos de repeticao (PERFORM UNTIL) sem condicao de parada valida ou aumente o parametro TIME= no JOB/EXEC." }
    "4038" = @{ Name = "Language Environment Severe Error (U4038)"; Cause = "Falha grave no runtime do COBOL/LE. Geralmente decorrente de condicao nao tratada ou parada forçada (GOBACK/STOP RUN anormal)."; Fix = "Examine o spool procurando o CEEDUMP para identificar a mensagem do runtime (ex: CEE3204S, IGZ00...)." }
}

# 1. Analise de JCL ERROR e Falhas de Execucao
$isJclError = $spoolRaw -match "JCL ERROR" -or $spoolRaw -match "IEF452I" -or $spoolRaw -match "IEF453I"
$isAbend = $false
$detectedAbendCode = ""
$failedStep = ""
$failedStmt = ""
$errorMessages = @()
$missingDataset = ""
$failedDd = ""

# Extrai linhas de erro de JCL / Alocacao / Conversor
$lines = $spoolRaw -split "`r?`n"
for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]

    # Mensagens numeradas do z/OS (IEF, IEFC, IEFA, etc.)
    if ($line -match "(IEF\d{3}[IWE]|IEFC\d{3}[IWE]|IEFA\d{3}[IWE]|ICH\d{3}[IWE]|IKJ\d{3}[IWE])\s+(.*)") {
        $msgId = $matches[1]
        $msgText = $matches[2]
        
        # Ignora mensagens normais de sucesso/alocacao limpa
        if ($msgId -notmatch "IEF236I|IEF237I|IEF285I|IGD103I|IGD104I|IEF373I|IEF032I|IEF375I|IEF033I|ICH70001I|IRR010I|IEFC653I") {
            $errorMessages += "$msgId $msgText"
        }
    }

    # Declaracao do Statement onde ocorreu o erro
    if ($line -match "^\s*(\d+)\s+(IEF\d{3}[IWE]|IEFC\d{3}[IWE])\s+(.*)") {
        $failedStmt = $matches[1]
        $errorMessages += "STMT $($matches[1]): $($matches[2]) $($matches[3])"
    }

    # Deteccao de Step com erro
    if ($line -match "IEF453I\s+(\S+)\s+-\s+JOB FAILED") {
        $jobName = $matches[1]
    }
    if ($line -match "IEFA107I\s+\S+\s+(\S+)\s+(\S+)\s+-\s+DATA SET\s+(\S+)\s+NOT FOUND") {
        $failedStep = $matches[1]
        $failedDd = $matches[2]
        $missingDataset = $matches[3]
    }
    if ($line -match "IEF142I\s+\S+\s+(\S+)\s+-\s+STEP WAS EXECUTED\s+-\s+COND CODE\s+(\d+)") {
        $step = $matches[1]
        $rc = $matches[2]
        if ([int]$rc -gt 4) {
            $failedStep = $step
        }
    }
    # Deteccao de ABEND
    if ($line -match "ABEND=S([0-9A-F]{3})" -or $line -match "SYSTEM COMPLETION CODE=([0-9A-F]{3})" -or $line -match "COMPLETION CODE\s+-\s+SYSTEM=([0-9A-F]{3})") {
        $isAbend = $true
        $detectedAbendCode = $matches[1]
    }
    if ($line -match "USER COMPLETION CODE=([0-9]{4})" -or $line -match "COMPLETION CODE\s+-\s+USER=([0-9]{4})") {
        $isAbend = $true
        $detectedAbendCode = $matches[1]
    }
}

# ---------------------------------------------------------------
# 2. LOCALIZACAO DO ERRO (step, programa, offset, linha do COBOL)
# ---------------------------------------------------------------
$leMsg = ""; $cuName = ""; $cuOffset = ""; $procStep = ""
$offsetTable = @()          # pares LINEID/HEXLOC/VERBO da opcao OFFSET
$sourceLines = @{}          # LINEID -> texto do fonte
$dataDefs = @{}             # nome do campo -> definicao
for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if ($line -match "IEF472I\s+\S+\s+(\S+)(?:\s+(\S+))?\s+-\s+COMPLETION CODE") {
        if ($matches[2]) { $failedStep = $matches[2]; $procStep = $matches[1] } else { $failedStep = $matches[1] }
    }
    if (-not $leMsg -and $line -match "(CEE\d{4}S|IGZ\d{4}[SW])\s+(.*)") { $leMsg = "$($matches[1]) $($matches[2].Trim())" }
    if (-not $cuOffset -and $line -match "compile unit\s+(\S+).*?compile unit offset\s+[+-]?([0-9A-Fa-f]+)") {
        $cuName = $matches[1]; $cuOffset = $matches[2]
    }
    if ($line -match "^\s\d{6}\s+[0-9A-F]{6}\s+\S") {
        foreach ($m in [regex]::Matches($line, "(\d{6})\s+([0-9A-F]{6})\s+(\S+)")) {
            $offsetTable += [pscustomobject]@{ Line = $m.Groups[1].Value; Loc = [Convert]::ToInt32($m.Groups[2].Value, 16); Verb = $m.Groups[3].Value }
        }
    } elseif ($line -match "^.{0,4}(\d{6}) {8,}(\S.*)$") {
        $id = $matches[1]
        $text = ($matches[2] -replace "\s{3,}[\dM\s]*$", "").Trim()
        if (-not $sourceLines.ContainsKey($id)) { $sourceLines[$id] = $text }
        if ($text -match "^(0[1-9]|[1-4]\d|77)\s+([A-Z0-9][A-Z0-9-]*)") {
            if (-not $dataDefs.ContainsKey($matches[2])) { $dataDefs[$matches[2]] = $text }
        }
    }
}

$faultLine = ""; $faultText = ""
if ($cuOffset -and $offsetTable.Count -gt 0) {
    $off = [Convert]::ToInt32($cuOffset, 16)
    $best = $offsetTable | Where-Object { $_.Loc -le $off } | Sort-Object Loc -Descending | Select-Object -First 1
    if ($best) { $faultLine = $best.Line; $faultText = $sourceLines[$best.Line] }
}

Write-Host "`n======================= RELATORIO DE DIAGNOSTICO =======================" -ForegroundColor Magenta
Write-Host "JOB ID    : $JobId" -ForegroundColor Cyan
if ($procStep) { $failedStep = "$failedStep.$procStep" }


if ($isJclError) {
    Write-Host "STATUS    : FALHA - JCL ERROR" -ForegroundColor Red
    if (-not [string]::IsNullOrWhiteSpace($failedStep)) {
        Write-Host "STEP      : $failedStep" -ForegroundColor Yellow
    }
    Write-Host "`nMENSAGENS DE ERRO DO JES:" -ForegroundColor Yellow
    foreach ($errMsg in $errorMessages) {
        Write-Host "  * $errMsg" -ForegroundColor Red
    }

    Write-Host "`nDIAGNOSTICO:" -ForegroundColor Cyan
    if (-not [string]::IsNullOrWhiteSpace($missingDataset)) {
        Write-Host "  Causa: O Data Set '$missingDataset' referenciado no DD '$failedDd' nao foi encontrado no catalogo do z/OS." -ForegroundColor White
        Write-Host "  Acao : Verifique a grafia do Data Set ou certifique-se de que ele foi criado/catalogado antes de submeter o job." -ForegroundColor Green
    } elseif ($spoolRaw -match "IEF642I") {
        Write-Host "  Causa: Parametro de nome de Data Set (DSNAME) excedeu o limite de caracteres do z/OS (max 8 por qualificador, max 44 no total)." -ForegroundColor White
        Write-Host "  Acao : Corrija o nome do Data Set no JCL para atender as regras de nomenclatura do MVS." -ForegroundColor Green
    } else {
        Write-Host "  Ocorreu um erro na interpretacao do JCL. Verifique os DDs alocados e a sintaxe das linhas do job no spool." -ForegroundColor White
    }
} elseif ($isAbend) {
    Write-Host "STATUS    : ABEND DETECTADO ($detectedAbendCode)" -ForegroundColor Red
    if (-not [string]::IsNullOrWhiteSpace($failedStep)) {
        Write-Host "STEP      : $failedStep" -ForegroundColor Yellow
    }

    $lookup = $AbendDict[$detectedAbendCode]
    if ($lookup) {
        Write-Host "`nIDENTIFICACAO : $($lookup.Name)" -ForegroundColor Yellow
        Write-Host "CAUSA RAIZ    : $($lookup.Cause)" -ForegroundColor White
        Write-Host "`nACAO RECOMENDADA:" -ForegroundColor Cyan
        Write-Host "$($lookup.Fix)" -ForegroundColor Green
    } else {
        Write-Host "CODIGO : ABEND $detectedAbendCode" -ForegroundColor Yellow
        Write-Host "Aviso  : Codigo de ABEND nao catalogado no dicionario rapido. Consulte a listagem do dump no spool." -ForegroundColor White
    }

    if ($leMsg -or $cuOffset) {
        Write-Host "`n--------------------- ONDE ESTA O ERRO ---------------------" -ForegroundColor Magenta
        if ($leMsg)     { Write-Host "MENSAGEM LE : $leMsg" -ForegroundColor White }
        if ($cuName)    { Write-Host "PROGRAMA    : $cuName" -ForegroundColor Yellow }
        if ($cuOffset)  { Write-Host "OFFSET      : +$cuOffset" -ForegroundColor Yellow }
        if ($faultLine) {
            Write-Host "LINHA COBOL : $faultLine" -ForegroundColor Yellow
            Write-Host "`n  >>> $faultText" -ForegroundColor Red
            $used = [regex]::Matches($faultText, "[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+|[A-Z][A-Z0-9]{2,}") | ForEach-Object { $_.Value } | Select-Object -Unique
            $shown = @($used | Where-Object { $dataDefs.ContainsKey($_) })
            if ($shown.Count -gt 0) {
                Write-Host "`nCAMPOS USADOS NESSA LINHA (confira o conteudo deles):" -ForegroundColor Cyan
                foreach ($f in $shown) {
                    Write-Host "  - $($dataDefs[$f])" -ForegroundColor White
                    if ($dataDefs[$f] -match "REDEFINES\s+([A-Z0-9-]+)" -and $dataDefs.ContainsKey($matches[1])) {
                        Write-Host "      redefine -> $($dataDefs[$matches[1]])" -ForegroundColor DarkYellow
                    }
                }
            }
        } elseif ($cuOffset) {
            Write-Host "`nDica: compile com PARM.COBOL='OFFSET' (ou LIST) no mesmo job para o analisador" -ForegroundColor Gray
            Write-Host "      converter o offset na linha exata do fonte COBOL." -ForegroundColor Gray
        }
    }
} else {
    # Verifica cond code geral
    if ($spoolRaw -match "COND CODE (\d+)") {
        $finalCond = $matches[1]
        if ([int]$finalCond -le 4) {
            Write-Host "STATUS    : CONCLUIDO COM SUCESSO (COND CODE $finalCond)" -ForegroundColor Green
            Write-Host "Resultado : O JOB executou normalmente sem ABENDs ou falhas de JCL." -ForegroundColor White
        } else {
            Write-Host "STATUS    : ALERTA - COND CODE ALTO ($finalCond)" -ForegroundColor Yellow
            Write-Host "Resultado : O JOB executou com codigo de retorno $finalCond. Verifique a saida do programa." -ForegroundColor White
        }
    } else {
        Write-Host "STATUS    : Sem indicios claros de ABEND ou JCL ERROR." -ForegroundColor Yellow
    }
}

Write-Host "========================================================================`n" -ForegroundColor Magenta

if ($FullSpool) {
    Write-Host "`n=== SPOOL COMPLETO ===" -ForegroundColor Blue
    Write-Host $spoolRaw
    Write-Host "======================`n" -ForegroundColor Blue
} else {
    Write-Host "(Dica: Use -FullSpool para imprimir a listagem completa do spool)`n" -ForegroundColor Gray
}
