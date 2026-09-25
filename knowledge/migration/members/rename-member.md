---
topic: "Rename Member"
sourceClass: "OFFICIAL_ZOWE"
source: "zowe-operations.md, IBM Z Xplore FILES1"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Renomear um Member

## Quando usar
Sempre que precisar alterar a identificação de um arquivo PDS internamente no Host.

## Equivalente no ambiente legado
ISPF Option 3.4 (Data Set List), digitando `R` (Rename) na coluna de line command e digitando o novo nome no popup do ISPF.

## Como fazer no Zowe
1. Expanda o PDS na aba lateral e encontre o Member.
2. Clique com o botão direito no Member e escolha **Rename Member**.
3. O topo da tela (Command Palette) abrirá um campo de entrada (input box).
4. Insira o novo nome para o Member e confirme (`Enter`).

## Pré-requisitos
Acesso de Update/Alteração no dataset.

## Cuidados / Limitações
As mesmas regras de nome de Members (1 a 8 caracteres alfanuméricos) se aplicam ao novo nome, validado estritamente no backend.

## Fonte
- OFFICIAL_ZOWE (zowe-operations.md)
- IBM_Z_XPLORE (Fundamentals FILES1)
