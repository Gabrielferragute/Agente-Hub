---
topic: "Delete Member"
sourceClass: "OFFICIAL_ZOWE"
source: "zowe-operations.md, IBM Z Xplore FILES1"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Deletar um Member

## Quando usar
Quando precisar excluir definitivamente um arquivo de dentro de uma biblioteca particionada.

## Equivalente no ambiente legado
ISPF Option 3.4 ou Option 3.1, colocando `D` (Delete) ao lado do Member e confirmando.

## Como fazer no Zowe
1. Localize e clique com o botão direito no Member dentro do **Zowe Explorer**.
2. Selecione **Delete Member**.
3. O Zowe exibirá um Pop-up (Alert) de confirmação do sistema para garantir que não foi um clique acidental.
4. Ao confirmar (`Yes`/Enter), o membro é apagado do Mainframe.

## Pré-requisitos
Permissão de gravação/Update no dataset de origem.

## Cuidados / Limitações
A deleção de members no z/OS em sistemas transacionais não possui lixeira nativa. Uma vez apagado e o espaço comprimido, a restauração dependerá de backup fita/disco, como na infraestrutura tradicional.

## Fonte
- OFFICIAL_ZOWE (zowe-operations.md)
- IBM_Z_XPLORE (Fundamentals FILES1)
