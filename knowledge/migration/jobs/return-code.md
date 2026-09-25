---
topic: "Job Return Code"
sourceClass: "OFFICIAL_ZOWE"
source: "zowe-operations.md, ispf-mapping.md"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Código de Retorno (CC)

## Quando usar
Para validar se a execução do JCL que você acabou de submeter obteve sucesso completo ou se gerou um Condition Code (MAXCC) ou Abend.

## Equivalente no ambiente legado
Coluna `Max-RC` no SDSF ST, exibindo `CC 0000`, `CC 0004`, ou códigos de ABEND (`S0C4`, `S806`, etc).

## Como fazer no Zowe
- A maneira mais rápida é observar a **Notificação de Sucesso** (Toast message) do VS Code que aparece no canto inferior direito logo após o Submit. Ela trará a mensagem direta "completion code (CC) of 0000" (se for sucesso absoluto).
- A maneira duradoura é olhar na aba **JOBS**: o código de retorno ou status fica impresso diretamente ao lado do nome da Job e do Job ID na árvore listada.

## Pré-requisitos
Job deve ter concluído execução (estar em OUTPUT ou similar).

## Cuidados / Limitações
Se o Job ainda estiver em `ACTIVE` ou na `QUEUE`, não exibirá CC até a finalização da rotina.

## Fonte
- OFFICIAL_ZOWE (zowe-operations.md)
