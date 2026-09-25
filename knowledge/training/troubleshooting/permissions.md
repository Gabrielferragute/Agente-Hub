---
topic: "Permissions and Access Troubleshooting"
sourceClass: "IBM_Z_XPLORE"
source: "Fundamentals FILES1 / USS1"
product: "Zowe Explorer"
scope: "TRAINING"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Troubleshooting: Permissões, Erros e SSH

## Quando usar
Quando encontrar problemas de edição, mensagens de erro do z/OSMF de leitura, ou falhas no login do SSH no terminal.

## Equivalente no ambiente legado
Erros do RACF (Insufficient Access Authority) ao tentar modificar arquivos que não são do usuário, ou falhas no TSO Logon.

## Como fazer no Zowe

**1. Erro ao salvar/editar Member (Read-Only):**
Se receber um erro impeditivo ao tentar salvar, verifique se o Dataset é público e se possui permissão de leitura (`ZXP.PUBLIC.*`). Neste caso, copie o membro e cole no seu próprio dataset pessoal (`Zxxxxx.INPUT`), e então edite a cópia.

**2. Erro Rest API (fopen failed):**
Se ocorrer o erro `z/OSMF REST API Error... fopen() failed details: - EDC5041I` no Zowe Explorer, isso significa que tentou abrir um nome (como seu próprio userid) que não é um dataset físico válido para abertura direta na árvore. Pode ser ignorado.

**3. SSH Permission Denied (Windows PowerShell):**
Se o comando `ssh` falhar com `Permission denied, please try again` e não for senha incorreta, troque o terminal de PowerShell para `Command Prompt` (CMD) no VS Code e tente rodar novamente.

## Pré-requisitos
Acesso básico à rede e credenciais ativas.

## Cuidados / Limitações
A visualização e cópia de Datasets públicos funciona, mas edição de arquivos restritos não. 

## Fonte
- IBM_Z_XPLORE (Fundamentals FILES1, Pág 4-5 / Fundamentals USS1, Pág 3)
