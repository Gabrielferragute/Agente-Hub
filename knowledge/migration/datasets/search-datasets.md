---
topic: "Search Data Sets"
sourceClass: "OFFICIAL_ZOWE"
source: "ispf-mapping.md, zowe-operations.md"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Buscando Data Sets

## Quando usar
Para listar e localizar arquivos (Datasets) no mainframe, o primeiro passo na navegação de arquivos no Zowe Explorer.

## Equivalente no ambiente legado
ISPF Option 3.4 (Data Set List Utility), onde se usa a máscara de filtro (como `HLQ.*`).

## Como fazer no Zowe
1. Na barra lateral do VS Code, abra o painel **Zowe Explorer**.
2. Vá para a aba **DATA SETS**.
3. Ao lado do seu perfil Zowe conectado, clique no ícone da **Lupa** (Search).
4. Insira a máscara desejada para filtrar os datasets:
   - Padrão: Digite `HLQ.*` ou a máscara exata (ex: `<userid>.*`).
   - Você pode utilizar vírgulas para múltiplos filtros simultâneos.
5. Pressione Enter para atualizar a lista.
   - Ícone `>`: Dataset Particionado (PDS) que pode ser expandido.
   - Arquivo sem ícone `>`: Dataset Sequencial (PS).

## Pré-requisitos
Perfil do Zowe conectado e funcional.

## Cuidados / Limitações
Não tentar abrir diretórios/máscaras (como a raiz do seu userid) como se fossem datasets sequenciais.

## Fonte
- OFFICIAL_ZOWE (ispf-mapping.md, zowe-operations.md)
