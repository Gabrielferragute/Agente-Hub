---
topic: "Open Data Set"
sourceClass: "OFFICIAL_ZOWE"
source: "ispf-mapping.md"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Abertura de Data Sets

## Quando usar
Para inspecionar o conteúdo de um Dataset Sequencial ou para listar o conteúdo de um Dataset Particionado.

## Equivalente no ambiente legado
ISPF Option 1 (Browse) ou Option 2 (Edit).

## Como fazer no Zowe
1. No Zowe Explorer, dentro da aba **DATA SETS**, certifique-se de que aplicou o filtro na Lupa para achar o Dataset.
2. **Datasets Sequenciais (PS):** Dê um clique simples no nome do dataset. Ele será baixado e abrirá no editor de texto principal do VS Code.
3. **Datasets Particionados (PDS):** Clique no ícone de expansão (`>`) ou no próprio nome do dataset para exibir os *Members* guardados lá dentro. 

## Pré-requisitos
O Dataset deve constar na lista após a busca na aba de DATA SETS.

## Cuidados / Limitações
A interface gráfica é unificada: abrir um Dataset não requer "entrar em modo Browse" ou "modo Edit" antes. A edição/browse é definida no momento em que você clica e altera (ou tenta alterar e percebe que é Read-Only).

## Fonte
- OFFICIAL_ZOWE (ispf-mapping.md)
