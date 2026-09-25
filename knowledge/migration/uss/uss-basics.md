---
topic: "USS Navigation and Files"
sourceClass: "OFFICIAL_ZOWE"
source: "zowe-operations.md, IBM Z Xplore USS1"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Unix System Services (USS) Basics

## Quando usar
Quando precisar interagir com as partições UNIX do Mainframe para navegar em diretórios HFS/zFS, criar, apagar e executar shell scripts ou verificar logs em ASCII/binários no ambiente aberto.

## Equivalente no ambiente legado
Logar no TSO e usar a Option 6 `OMVS` ou cliente Telnet puro, ou navegar via ISPF Option `3.17` (UDLIST).

## Como fazer no Zowe
O Zowe possui duas vias para o USS: a visual e o terminal.

**Terminal Direto (Mais Comum):**
1. Vá no menu `Terminal > New Terminal` no VS Code.
2. Certifique-se de usar `CMD` (no Windows) para evitar erros de restrição do PowerShell.
3. Conecte com `ssh <your-user-id>@<host>`.
4. Use os comandos padrões UNIX:
   - `pwd` (onde estou)
   - `cd /pasta` (navegar) ou `cd ~` (home)
   - `ls` ou `ls -l` (listar)
   - `mkdir pasta` (criar diretório)
   - `rm arquivo` (excluir)
   - `touch arquivo` (criar)
   - `./script.sh` (executar)

**Árvore Visual (Zowe Explorer):**
O Zowe Explorer tem uma aba dedicada **UNIX SYSTEM SERVICES (USS)**, onde pode-se criar filtros apontando para os caminhos desejados (ex: `/z/<your-user-id>`), visualizando e abrindo arquivos como fazemos em `DATA SETS`.

## Pré-requisitos
Acesso USS provisionado e Segmento OMVS configurado no RACF do usuário.

## Cuidados / Limitações
A sessão SSH conectada via terminal possui Timeout. Ficar ocioso por 3 a 5 minutos a congelará (stuck terminal). Se isso ocorrer, digite sequencialmente `~.` para forçar o fechamento do canal, e refaça a conexão.

## Fonte
- OFFICIAL_ZOWE (zowe-operations.md)
- IBM_Z_XPLORE (Fundamentals USS1)
