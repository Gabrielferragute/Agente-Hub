---
topic: "Submit JCL"
sourceClass: "OFFICIAL_ZOWE"
source: "zowe-operations.md, ispf-mapping.md, IBM Z Xplore FILES1"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Submeter um Job (JCL)

## Quando usar
Para enviar rotinas batch (scripts JCL) para compilação, processamento de dados, execução de programas COBOL, etc., e enviá-los ao nó de execução (JES).

## Equivalente no ambiente legado
Comando `SUB` (ou `SUBMIT`) executado na linha de comando (Command line) da tela de edição (ISPF Edit) de um membro.

## Como fazer no Zowe
Existem duas formas principais de submissão na interface do Zowe Explorer:

1. **A partir da Árvore de Diretórios (DATA SETS):**
   - No painel da esquerda, encontre o membro que contém o JCL.
   - Clique com o botão direito diretamente nele.
   - Escolha **Submit Job**.

2. **A partir do Arquivo Aberto (Editor):**
   - Com o JCL aberto para edição no VS Code, clique com o botão direito em qualquer parte do texto.
   - Selecione a opção **Zowe: Submit Job**.

Ao fazer a submissão, uma pequena notificação do sistema (Toast Message) aparecerá no canto inferior direito informando que o Job submeteu e completou, e retornará o código de conclusão (ex: `CC 0000`).

## Pré-requisitos
O membro deve conter código JCL válido e o usuário deve ter autorização de JES para a classe do JOB.

## Cuidados / Limitações
A interface notificará imediatamente apenas o submit em si e o término básico. O tracking detalhado da execução precisa ser visto na aba específica de **JOBS**.

## Fonte
- OFFICIAL_ZOWE (zowe-operations.md, ispf-mapping.md)
- IBM_Z_XPLORE (Fundamentals FILES1)
