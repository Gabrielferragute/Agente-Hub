---
topic: "Create Member"
sourceClass: "OFFICIAL_ZOWE"
source: "zowe-operations.md, IBM Z Xplore FILES1"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Criar um Novo Member

## Quando usar
Para criar um novo script, código COBOL, JCL ou outro texto em branco dentro de uma biblioteca particionada existente.

## Equivalente no ambiente legado
No ISPF 2 (Edit), digitar um novo nome na frente do nome do dataset. Ou utilizar a linha de comando `S <new_member_name>`.

## Como fazer no Zowe
1. Localize o Dataset Particionado (PDS) onde deseja adicionar o Member.
2. Clique com o botão direito diretamente no nome do Dataset.
3. Selecione a opção **Create New Member**.
4. Digite o nome do novo membro no prompt exibido e pressione Enter.
5. O membro será criado vazio e aberto automaticamente no VS Code para edição.

## Pré-requisitos
O dataset de destino precisa ser um PDS ou PDSE e você precisa de acesso de gravação.

## Cuidados / Limitações
O nome de um Member no Mainframe está sujeito a restrições estritas (arquitetura legada):
- Limite de 1 a 8 caracteres.
- Permitido apenas letras (A-Z), números (0-9) e caracteres nacionais (@, #, $).
- Não utilizar espaços ou outros sinais de pontuação.

## Fonte
- OFFICIAL_ZOWE (zowe-operations.md)
- IBM_Z_XPLORE (Fundamentals FILES1)
