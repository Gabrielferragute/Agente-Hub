---
topic: "Create Sequential Data Set"
sourceClass: "OFFICIAL_ZOWE"
source: "zowe-operations.md"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Criar Dataset Sequencial (PS)

## Quando usar
Para alocar um novo arquivo de texto corrido (Sequential Dataset) para receber relatórios, sysouts, ou registros sequenciais que não precisam de partições.

## Equivalente no ambiente legado
ISPF Option 3.2 (Data Set Utility) -> Allocate (A) -> Record format FB/VB/etc.

## Como fazer no Zowe
1. Vá para o painel **DATA SETS** no Zowe Explorer.
2. Clique com o botão direito no seu perfil Zowe conectado (ou em um dataset existente para criar "Allocate Like").
3. Selecione a opção **Create Data Set**.
4. Selecione **Sequential**.
5. O prompt solicitará o nome do novo Dataset, além das configurações físicas tradicionais (LRECL, BLKSIZE, RECFM, SPACE, etc).
6. Confirme a criação. O Dataset aparecerá na sua lista caso o filtro corresponda ao nome.

## Pré-requisitos
Acesso garantido no RACF ou equivalente para alocação no High Level Qualifier (HLQ) desejado.

## Cuidados / Limitações
O processo de alocação no Zowe encapsula o Job JCL de alocação por trás dos panos via API do z/OSMF. 

## Fonte
- OFFICIAL_ZOWE (zowe-operations.md)
