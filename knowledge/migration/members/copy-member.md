---
topic: "Copy Member"
sourceClass: "OFFICIAL_ZOWE"
source: "zowe-operations.md, IBM Z Xplore FILES1"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Copiar e Colar Member

## Quando usar
Para duplicar código-fonte de um ambiente para outro (ex: Produção para DEV), ou clonar um arquivo como backup.

## Equivalente no ambiente legado
ISPF Option 3.3 (Move/Copy Utility) ou Option 3.4 acionando a line command `C`.

## Como fazer no Zowe
1. Localize o membro de origem na árvore do **Zowe Explorer** e clique com o botão direito sobre ele.
2. Selecione **Copy Member**.
3. Navegue até o PDS de destino (onde o arquivo será colado).
4. Clique com o botão direito no nome do Dataset de destino e selecione **Paste Member**.
5. Um prompt vai sugerir o nome atual do arquivo. Confirme ou altere para um novo nome antes de finalizar a colagem.

## Pré-requisitos
Acesso de leitura no Dataset de origem, acesso de gravação no Dataset de destino.

## Cuidados / Limitações
O processo de cópia entre LPARs ou sistemas depende da mesma lógica, desde que o dataset de destino seja exposto visualmente através do Zowe Explorer.

## Fonte
- OFFICIAL_ZOWE (zowe-operations.md)
- IBM_Z_XPLORE (Fundamentals FILES1)
