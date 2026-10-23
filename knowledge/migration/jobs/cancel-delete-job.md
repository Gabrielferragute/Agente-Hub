---
topic: "Cancel and Delete Job"
sourceClass: "OFFICIAL_ZOWE"
source: "zowe-operations.md"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Cancelar ou Excluir Jobs

## Quando usar
Para cancelar uma execução acidentalmente lançada que entrou em *loop*, ou para limpar o histórico do Spool apagando o log completo do sistema após a conferência de um relatório, liberando espaço.

## Equivalente no ambiente legado
No SDSF, utilizar os line commands `C` (Cancel) em Jobs ativos ou em fila, e `P` (Purge) em Jobs em OUTPUT para descartar o Spool.

## Como fazer no Zowe
1. Navegue até o painel **JOBS** e garanta que sua lista de jobs/Owner esteja exibida.
2. Identifique o Job na lista e clique com o **botão direito** em cima dele.
3. - Se deseja apenas abortar, selecione **Cancel Job**.
   - Se deseja cancelar e apagar tudo, ou simplesmente apagar (Purge) um log concluído, selecione **Delete Job** (esta operação apaga a entrada inteira e limpa os relatórios gerados do servidor).

## Pré-requisitos
Permissões SDSF/JES do RACF equivalentes a Cancel e Purge (normalmente concedidas apenas para os próprios Jobs do usuário).

## Cuidados / Limitações
A deleção de Job (Purge) apaga permanentemente o sysout/sysprint. Não há retorno.

## Fonte
- OFFICIAL_ZOWE (zowe-operations.md)
