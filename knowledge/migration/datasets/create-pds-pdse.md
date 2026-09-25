---
topic: "Create Partitioned Data Set"
sourceClass: "OFFICIAL_ZOWE"
source: "zowe-operations.md"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Criar Dataset Particionado (PDS / PDSE)

## Quando usar
Para alocar bibliotecas (Libraries) que guardarão código-fonte, JCLs, copybooks ou outros members que precisam ser agrupados logicamente.

## Equivalente no ambiente legado
ISPF Option 3.2 (Data Set Utility) -> Allocate (A) -> Especificando `Directory Blocks`.

## Como fazer no Zowe
1. Vá para o painel **DATA SETS** no Zowe Explorer.
2. Clique com o botão direito no seu perfil de conexão Zowe.
3. Escolha a opção **Create Data Set**.
4. Selecione **Partitioned (PDS)** ou **PDSE**.
5. Insira o nome do Data Set, respeitando o padrão de HLQ do seu ambiente.
6. A interface solicitará a configuração de Directory Blocks (no caso de PDS padrão), espaço (CYL/TRK) e o record format (ex: FB 80).
7. Confirme a criação. O dataset passará a exibir a seta de expansão (`>`), indicando que está alocado como biblioteca.

## Pré-requisitos
Permissões de gravação no High Level Qualifier onde o dataset está sendo alocado.

## Cuidados / Limitações
Lembre-se de prever corretamente os Directory Blocks ao criar PDS simples, pois um PDS com blocos de diretório cheios não permite a criação de novos members. Para PDSE, isso é gerenciado automaticamente pelo sistema.

## Fonte
- OFFICIAL_ZOWE (zowe-operations.md)
