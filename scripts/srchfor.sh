#!/usr/bin/env bash
# ==============================================================================
# srchfor.sh — Automação de Busca SuperC (ISRSUPC / SRCHFOR) via Zowe CLI
#
# Automatiza:
#   1. Coleta e validação do Data Set (PDS) e String de busca
#   2. Geração dinâmica do JCL com sanitização e escape de aspas
#   3. Submissão do JOB via Zowe CLI com espera de conclusão (--wait-for-output)
#   4. Captura do jobid e interpretação dos códigos de retorno do SuperC
#   5. Visualização automática de todo o spool do JOB (all-spool-content)
#
# Uso interativo:
#   ./scripts/srchfor.sh
#
# Uso com parâmetros:
#   ./scripts/srchfor.sh -d "MEU.PROJETO.COBOL.SRC" -s "EXEC SQL"
#   ./scripts/srchfor.sh -d "USER.COBOL.SRC" -s "CALL 'ROTINA'" -p meu-profile -j MEUJOB
# ==============================================================================

set -eo pipefail

DATASET=""
SEARCH_STR=""
PROFILE=""
JOBNAME="SRCHFOR"
ACCOUNT="ACCT"
JOBCLASS="A"
MSGCLASS="X"
OUTPUT_FILE=""
KEEP_JCL=false

# Cores para terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_banner() {
    echo -e "${CYAN}============================================================${NC}"
    echo -e "${CYAN}    Mainframe Hub Assistant — SuperC Search-For Automator   ${NC}"
    echo -e "${CYAN}============================================================${NC}"
}

usage() {
    print_banner
    echo "Uso: $0 [opções]"
    echo ""
    echo "Opções:"
    echo "  -d, --dataset <DSN>       Nome do Data Set / PDS (ex: MEU.PROJETO.COBOL.SRC)"
    echo "  -s, --string <TEXTO>      String a ser pesquisada nos membros"
    echo "  -p, --profile <NOME>      Nome do profile Zowe (opcional)"
    echo "  -j, --jobname <NOME>      JOBNAME do JCL (padrão: SRCHFOR)"
    echo "  -a, --account <CONTA>     Conta contábil (padrão: ACCT)"
    echo "  -c, --class <CLASSE>      CLASS do JOB (padrão: A)"
    echo "  -m, --msgclass <MSGCLASS> MSGCLASS do JOB (padrão: X)"
    echo "  -o, --output <ARQUIVO>    Salva o spool em um arquivo texto"
    echo "  -k, --keep-jcl            Mantém o arquivo srchfor.jcl gerado na pasta atual"
    echo "  -h, --help                Exibe esta ajuda"
    echo ""
    exit 0
}

# Processamento de argumentos de linha de comando
while [[ $# -gt 0 ]]; do
    case "$1" in
        -d|--dataset)
            DATASET="$2"
            shift 2
            ;;
        -s|--string)
            SEARCH_STR="$2"
            shift 2
            ;;
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        -j|--jobname)
            JOBNAME="$2"
            shift 2
            ;;
        -a|--account)
            ACCOUNT="$2"
            shift 2
            ;;
        -c|--class)
            JOBCLASS="$2"
            shift 2
            ;;
        -m|--msgclass)
            MSGCLASS="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        -k|--keep-jcl)
            KEEP_JCL=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Opção inválida: $1${NC}"
            usage
            ;;
    esac
done

# Verifica dependência do Zowe CLI
if ! command -v zowe &> /dev/null; then
    echo -e "${RED}[ERRO] O comando 'zowe' não foi encontrado no PATH.${NC}"
    echo "Instale o Zowe CLI e certifique-se de que ele está configurado."
    exit 1
fi

print_banner

# Modo interativo se os parâmetros não foram passados
if [[ -z "$DATASET" ]]; then
    read -r -p "Digite o caminho do Data Set: " DATASET
fi

if [[ -z "$SEARCH_STR" ]]; then
    read -r -p "Digite o valor de string a ser feita a busca pelos membros do Data Set: " SEARCH_STR
fi

# Limpeza e normalização do Data Set
DATASET="$(echo "$DATASET" | tr -d "'" | tr -d '"' | xargs | tr '[:lower:]' '[:upper:]')"
if [[ -z "$DATASET" ]]; then
    echo -e "${RED}[ERRO] O nome do Data Set é obrigatório.${NC}"
    exit 1
fi

if [[ "$DATASET" =~ \( ]]; then
    echo -e "${RED}[ERRO] Informe apenas o Data Set (PDS), sem membro. O SRCHFOR busca em todos os membros.${NC}"
    exit 1
fi

# Validação da string de busca
if [[ -z "$SEARCH_STR" ]]; then
    echo -e "${RED}[ERRO] A string de busca é obrigatória.${NC}"
    exit 1
fi

# Escape de aspas simples para JCL/SYSIN (' vira '')
ESCAPED_SEARCH_STR="${SEARCH_STR//\'/\'\'}"

# Validação do tamanho da linha SYSIN (limite de 71 colunas)
# Formato: "  SRCHFOR '" + ESCAPED_SEARCH_STR + "'" = 11 + len + 1
SYSIN_LINE="  SRCHFOR '${ESCAPED_SEARCH_STR}'"
if [[ ${#SYSIN_LINE} -gt 71 ]]; then
    echo -e "${RED}[ERRO] String de busca muito longa (${#SYSIN_LINE} caracteres na linha). Limite máximo é 71 colunas.${NC}"
    exit 1
fi

# Normalização de JOBNAME e campos do Job Card
JOBNAME="$(echo "$JOBNAME" | xargs | tr '[:lower:]' '[:upper:]')"
ACCOUNT="$(echo "$ACCOUNT" | xargs | tr '[:lower:]' '[:upper:]')"
JOBCLASS="$(echo "$JOBCLASS" | xargs | tr '[:lower:]' '[:upper:]')"
MSGCLASS="$(echo "$MSGCLASS" | xargs | tr '[:lower:]' '[:upper:]')"

# Geração do JCL temporário
JCL_FILE="./srchfor.jcl"
cat <<EOF > "$JCL_FILE"
//${JOBNAME}   JOB (${ACCOUNT}),'SRCHFOR',CLASS=${JOBCLASS},MSGCLASS=${MSGCLASS},NOTIFY=&SYSUID
//STEP1    EXEC PGM=ISRSUPC,PARM='SRCHCMP,ANYC'
//SYSPRINT DD  SYSOUT=*
//NEWDD    DD  DISP=SHR,DSN=${DATASET}
//OUTDD    DD  SYSOUT=*
//SYSIN    DD  *
${SYSIN_LINE}
/*
EOF

echo ""
echo -e "${BLUE}=== JCL Gerado ===${NC}"
cat "$JCL_FILE"
echo -e "${BLUE}==================${NC}"
echo ""

# Montagem do comando Zowe submit
SUBMIT_CMD=(zowe zos-jobs submit local-file "$JCL_FILE" --wait-for-output --response-format-json)
if [[ -n "$PROFILE" ]]; then
    SUBMIT_CMD+=(--zosmf-profile "$PROFILE")
fi

echo -e "${YELLOW}>> Submetendo JOB via Zowe CLI...${NC}"
SUBMIT_OUTPUT=""
if ! SUBMIT_OUTPUT="$("${SUBMIT_CMD[@]}" 2>&1)"; then
    echo -e "${RED}[ERRO] Falha ao submeter o JOB:${NC}"
    echo "$SUBMIT_OUTPUT"
    [[ "$KEEP_JCL" != true ]] && rm -f "$JCL_FILE"
    exit 1
fi

# Extração de jobid, jobname, retcode e status da resposta JSON
# Se jq estiver disponível, usa jq; caso contrário usa grep/sed
JOB_ID=""
JOB_NAME=""
RET_CODE=""
JOB_STATUS=""

if command -v jq &> /dev/null; then
    JOB_ID="$(echo "$SUBMIT_OUTPUT" | jq -r '.data.jobid // .jobid // empty')"
    JOB_NAME="$(echo "$SUBMIT_OUTPUT" | jq -r '.data.jobname // .jobname // empty')"
    RET_CODE="$(echo "$SUBMIT_OUTPUT" | jq -r '.data.retcode // .retcode // empty')"
    JOB_STATUS="$(echo "$SUBMIT_OUTPUT" | jq -r '.data.status // .status // empty')"
fi

# Fallback se jq não encontrou ou não está instalado
if [[ -z "$JOB_ID" ]]; then
    JOB_ID="$(echo "$SUBMIT_OUTPUT" | grep -o '"jobid": *"[^"]*"' | head -n 1 | cut -d'"' -f4 || true)"
fi
if [[ -z "$JOB_NAME" ]]; then
    JOB_NAME="$(echo "$SUBMIT_OUTPUT" | grep -o '"jobname": *"[^"]*"' | head -n 1 | cut -d'"' -f4 || true)"
fi
if [[ -z "$RET_CODE" ]]; then
    RET_CODE="$(echo "$SUBMIT_OUTPUT" | grep -o '"retcode": *"[^"]*"' | head -n 1 | cut -d'"' -f4 || true)"
fi
if [[ -z "$JOB_STATUS" ]]; then
    JOB_STATUS="$(echo "$SUBMIT_OUTPUT" | grep -o '"status": *"[^"]*"' | head -n 1 | cut -d'"' -f4 || true)"
fi

echo ""
echo -e "${GREEN}✓ JOB Finalizado!${NC}"
echo -e "  Job ID  : ${CYAN}${JOB_ID:-N/A}${NC}"
echo -e "  Job Name: ${JOB_NAME:-N/A}"
echo -e "  Status  : ${JOB_STATUS:-OUTPUT}"
echo -e "  Retcode : ${YELLOW}${RET_CODE:-N/A}${NC}"

# Interpretação dos códigos de retorno do SuperC (ISRSUPC)
echo ""
echo -e "${BLUE}=== Interpretação do Retorno SuperC ===${NC}"
case "$RET_CODE" in
    *"CC 0001"*|*"0001"*)
        echo -e "${GREEN}➔ RC 1: String ENCONTRADA no(s) membro(s) do Data Set!${NC}"
        ;;
    *"CC 0000"*|*"0000"*)
        echo -e "${YELLOW}➔ RC 0: Busca concluída sem erros, porém a string NÃO foi encontrada.${NC}"
        ;;
    *"CC 0004"*|*"0004"*)
        echo -e "${YELLOW}➔ RC 4: Aviso (warning do SuperC). Ocorreu aviso nas opções de busca.${NC}"
        ;;
    *"CC 0028"*|*"0028"*)
        echo -e "${RED}➔ RC 28: Nenhum dado pesquisado (Data Set vazio, sem membros ou inacessível).${NC}"
        ;;
    *"ABEND"*)
        echo -e "${RED}➔ ABEND detectado: $RET_CODE. Verifique a listagem do JES no spool.${NC}"
        ;;
    *)
        echo -e "${YELLOW}➔ Código de retorno: ${RET_CODE:-Nenhum retcode detectado}.${NC}"
        ;;
esac
echo -e "${BLUE}=======================================${NC}"

# Obtenção do Spool completo
if [[ -n "$JOB_ID" ]]; then
    echo ""
    echo -e "${YELLOW}>> Visualizando as saídas do JOB (${JOB_ID})...${NC}"
    VIEW_CMD=(zowe zos-jobs view all-spool-content "$JOB_ID")
    if [[ -n "$PROFILE" ]]; then
        VIEW_CMD+=(--zosmf-profile "$PROFILE")
    fi

    echo ""
    echo -e "${CYAN}======================== SPOOL OUTPUT ========================${NC}"
    if [[ -n "$OUTPUT_FILE" ]]; then
        "${VIEW_CMD[@]}" | tee "$OUTPUT_FILE"
        echo -e "${CYAN}==============================================================${NC}"
        echo -e "${GREEN}✓ Saída salva em: ${OUTPUT_FILE}${NC}"
    else
        "${VIEW_CMD[@]}"
        echo -e "${CYAN}==============================================================${NC}"
    fi
else
    echo -e "${YELLOW}[AVISO] Não foi possível determinar o Job ID para obter o spool automaticamente.${NC}"
fi

# Limpeza do arquivo de JCL se não solicitado para manter
if [[ "$KEEP_JCL" != true ]]; then
    rm -f "$JCL_FILE"
fi

echo ""
echo -e "${GREEN}Processo concluído com sucesso.${NC}"
