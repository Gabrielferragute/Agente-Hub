#!/usr/bin/env bash
# ==============================================================================
# abend.sh — Analisador Inteligente de ABENDs e Erros de Spool (Bash/Linux/Git Bash)
# ==============================================================================

set -eo pipefail

JOBID="$1"
FULL_SPOOL=false

if [[ "$2" == "--full-spool" || "$2" == "-f" ]]; then
    FULL_SPOOL=true
fi

if [[ -z "$JOBID" ]]; then
    read -r -p "Digite o Job ID para analisar (ex: JOB04408): " JOBID
fi

if [[ -z "$JOBID" ]]; then
    echo "Erro: Job ID é obrigatório."
    exit 1
fi

echo "============================================================"
echo "    Mainframe Hub Assistant — Smart ABEND Analyzer (z/OS)   "
echo "============================================================"
echo ""
echo ">> Baixando spool do ${JOBID} via Zowe CLI..."

SPOOL_RAW="$(zowe zos-jobs view all-spool-content "${JOBID}" 2>&1 || true)"

if echo "$SPOOL_RAW" | grep -qE "Rest API failure|Job not found|Zero jobs were returned"; then
    echo "Erro: Não foi possível obter o spool para o Job ID '${JOBID}'."
    echo "$SPOOL_RAW"
    exit 1
fi

echo "[OK] Spool obtido. Analisando mensagens de erro..."
echo ""
echo "======================= RELATÓRIO DE DIAGNÓSTICO ======================="
echo "JOB ID    : ${JOBID}"

if echo "$SPOOL_RAW" | grep -qE "JCL ERROR|IEF452I|IEF453I"; then
    echo "STATUS    : FALHA — JCL ERROR"
    echo ""
    echo "MENSAGENS DE ERRO DO JES:"
    echo "$SPOOL_RAW" | grep -E "IEF[0-9]{3}[IWE]|IEFC[0-9]{3}[IWE]|IEFA[0-9]{3}[IWE]" | grep -vE "IEF236I|IEF237I|IEF285I|IGD103I|IGD104I|IEF373I|IEF032I|IEF375I|IEF033I" | while read -r line; do
        echo "  * $line"
    done
    echo ""
    echo "DIAGNÓSTICO:"
    if echo "$SPOOL_RAW" | grep -q "IEF642I"; then
        echo "  Causa: Parâmetro de nome de Data Set (DSNAME) excedeu o limite do z/OS (máx 8 chars por qualificador, máx 44 no total)."
        echo "  Ação : Corrija o nome do Data Set no JCL para atender às regras do MVS."
    elif echo "$SPOOL_RAW" | grep -q "IEFA107I"; then
        echo "  Causa: Um Data Set referenciado no JCL não foi encontrado no catálogo do z/OS."
        echo "  Ação : Verifique a grafia do Data Set ou certifique-se de que ele foi catalogado."
    else
        echo "  Ocorreu um erro na interpretação das instruções JCL. Verifique os DDs alocados no spool."
    fi
elif echo "$SPOOL_RAW" | grep -qE "ABEND=S[0-9A-F]{3}|SYSTEM COMPLETION CODE="; then
    ABEND_CODE="$(echo "$SPOOL_RAW" | grep -oE "SYSTEM COMPLETION CODE=[0-9A-F]{3}|ABEND=S[0-9A-F]{3}" | head -n 1 | grep -oE "[0-9A-F]{3}$")"
    echo "STATUS    : ABEND DETECTADO (S${ABEND_CODE})"
    echo ""
    echo "DIAGNÓSTICO RÁPIDO:"
    case "$ABEND_CODE" in
        "0C7")
            echo "  Identificação : S0C7 (Data Exception)"
            echo "  Causa Raiz    : Operação aritmética com dado não numérico (COMP-3 com espaços/nulos)."
            echo "  Ação          : Valide com 'IF CAMPO NUMERIC' ou inicialize variáveis com zeros."
            ;;
        "0C4")
            echo "  Identificação : S0C4 (Protection Exception)"
            echo "  Causa Raiz    : Violação de memória (índice fora de array OCCURS ou ponteiro inválido)."
            echo "  Ação          : Confira os limites dos índices do COBOL."
            ;;
        "013")
            echo "  Identificação : S013 (Open Conflict)"
            echo "  Causa Raiz    : Conflito de DCB (LRECL/RECFM) entre o COBOL e o JCL/disco, ou membro inexistente."
            echo "  Ação          : Verifique o FD do COBOL e os parâmetros do DD no JCL."
            ;;
        "806")
            echo "  Identificação : S806 (Module Not Found)"
            echo "  Causa Raiz    : Módulo especificado em EXEC PGM= não localizado no STEPLIB/LINKLIST."
            echo "  Ação          : Verifique o nome do programa e a biblioteca STEPLIB."
            ;;
        *)
            echo "  Código de ABEND: S${ABEND_CODE}. Consulte a listagem de dump no spool."
            ;;
    esac
elif echo "$SPOOL_RAW" | grep -qE "COND CODE [0-9]{4}"; then
    RC="$(echo "$SPOOL_RAW" | grep -oE "COND CODE [0-9]{4}" | tail -n 1 | awk '{print $3}')"
    if [[ "$RC" -le 4 ]]; then
        echo "STATUS    : CONCLUÍDO COM SUCESSO (COND CODE ${RC})"
        echo "Resultado : O JOB executou normalmente sem ABENDs."
    else
        echo "STATUS    : ALERTA — COND CODE ALTO (${RC})"
        echo "Resultado : O JOB executou, mas gerou código de retorno ${RC}. Verifique a saída do programa."
    fi
else
    echo "STATUS    : Sem indícios claros de erro ou ABEND."
fi

echo "========================================================================"

if [[ "$FULL_SPOOL" == true ]]; then
    echo ""
    echo "=== SPOOL COMPLETO ==="
    echo "$SPOOL_RAW"
    echo "======================"
fi
