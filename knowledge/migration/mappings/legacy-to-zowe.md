---
topic: "Legacy to Zowe Mapping"
sourceClass: "OFFICIAL_ZOWE"
source: "ispf-mapping.md"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# ISPF to Zowe Explorer Conceptual Matrix

## Quando usar
Sempre que um desenvolvedor buscar o equivalente de uma funcionalidade clássica de TSO, ISPF ou SDSF dentro do ecossistema do Zowe Explorer.

## Equivalente no ambiente legado
N/A (Este é o próprio arquivo de mapeamento).

## Como fazer no Zowe
Abaixo as equivalências sustentadas:

* **ISPF 3.4** → Data Sets Search (Veja `datasets/search-datasets.md`)
* **ISPF 3.2** → Create Data Set (Veja `datasets/create-pds-pdse.md` ou `create-sequential.md`)
* **ISPF EDIT** → VS Code Editor (Veja `members/edit-member.md`)
* **SUB/SUBMIT** → Submit JCL (Veja `jobs/submit-jcl.md`)
* **SDSF ST** → Jobs (Veja `jobs/search-job.md`)
* **SDSF spool** → Job Spool (Veja `jobs/spool.md`)
* **OMVS/USS** → Zowe Explorer USS / terminal quando aplicável (Veja `uss/uss-basics.md`)
* **ISPF Option 6** → TSO Command (Veja `tso/issue-tso-command.md`)

## Pré-requisitos
Zowe Explorer instalado e ambiente previamente configurado.

## Cuidados / Limitações
Não inventar equivalências não suportadas (ex: painéis interativos 3270 puros ou System Logs profundos do SDSF).

## Fonte
- OFFICIAL_ZOWE (ispf-mapping.md)
