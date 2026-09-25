---
topic: "Edit Member"
sourceClass: "OFFICIAL_ZOWE"
source: "ispf-mapping.md"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Editar um Member

## Quando usar
Quando você for efetuar alterações reais no código, JCL ou documentação. 

## Equivalente no ambiente legado
ISPF Option 2 (Edit), utilizando os line commands do ISPF (`I`, `D`, `R`, `C`, etc).

## Como fazer no Zowe
1. Na aba **DATA SETS**, expanda o Dataset Particionado (PDS).
2. Clique duas vezes no Member. Ele será baixado do Host e aberto no editor padrão do VS Code.
3. Utilize todo o poder do VS Code para editar: Copiar e colar livre, Find & Replace generalizado (`Ctrl+F` / `Ctrl+H`), atalhos de teclado e micro-edições.
4. Pressione `Ctrl+S` (Salvar) ou `File > Save`.
5. O Zowe automaticamente e silenciosamente enviará (Upload) o Member atualizado para o mainframe.

## Pré-requisitos
Acesso de gravação (Update) concedido pelo RACF no dataset correspondente.

## Cuidados / Limitações
A interface do VS Code substitui completamente a necessidade de comandos de linha do ISPF. O comando de Save substitui a emissão do comando `SAVE` do ISPF.

## Fonte
- OFFICIAL_ZOWE (ispf-mapping.md)
