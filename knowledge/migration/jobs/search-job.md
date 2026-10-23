---
topic: "Search Job / SDSF Status"
sourceClass: "OFFICIAL_ZOWE"
source: "ispf-mapping.md"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Buscar e Acompanhar Jobs (Status)

## Quando usar
Sempre que precisar checar o status de um Job rodando na LPAR ou se quiser localizar uma execução passada baseada em quem a disparou.

## Equivalente no ambiente legado
Comando `ST` (Status) dentro do utilitário `SDSF`, filtrando por Owner ou Prefix.

## Como fazer no Zowe
1. Na barra de atividades lateral, encontre o painel do **Zowe Explorer** e desça até a aba **JOBS**.
2. Ao lado do seu perfil conectado, clique no ícone da **Lupa** (Create a New Filter).
3. O Zowe pedirá por parâmetros de busca. Você pode filtrar pelo "Owner" do Job (ex: `<your-user-id>`) ou prefixos.
4. A lista será preenchida com todas as execuções (Ativas, Em Fila, ou na Output Queue) compatíveis com seu filtro.

## Pré-requisitos
Job já submetido e perfil Zowe (com suporte a Jobs/JES) logado.

## Cuidados / Limitações
A visualização pode ter um delay leve dependendo da carga do z/OSMF em comparação com a tela preta "quase instantânea" do SDSF puro. Filtros em massa geram maior processamento.

## Fonte
- OFFICIAL_ZOWE (ispf-mapping.md)
