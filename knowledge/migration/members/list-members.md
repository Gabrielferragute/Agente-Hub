---
topic: "List Members"
sourceClass: "OFFICIAL_ZOWE"
source: "ispf-mapping.md"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Listar Members de um Data Set

## Quando usar
Quando você precisa ver o conteúdo (a lista de membros) dentro de um Data Set Particionado (PDS ou PDSE).

## Equivalente no ambiente legado
ISPF Option 3.4 (Data Set List) ou Option 3.1 (Library), onde o usuário pressiona Enter em um dataset particionado para ver o diretório de membros.

## Como fazer no Zowe
1. Encontre o Dataset desejado na aba **DATA SETS**.
2. Note o ícone em formato de seta (`>`) ou equivalente do tema ao lado do nome do PDS.
3. Clique na seta ou dê um clique no nome do Dataset.
4. O nó da árvore se expandirá exibindo todos os membros internamente, na própria visualização do painel.

## Pré-requisitos
Ter filtrado a visualização e estar com um PDS alocado.

## Cuidados / Limitações
Em PDS com altíssimo volume de membros (milhares), a expansão de árvore (tree node) pode sofrer um leve atraso caso a conexão de rede/z/OSMF seja lenta. 

## Fonte
- OFFICIAL_ZOWE (ispf-mapping.md)
