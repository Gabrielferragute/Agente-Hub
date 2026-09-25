---
topic: "Issue TSO Commands"
sourceClass: "OFFICIAL_ZOWE"
source: "zowe-operations.md"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Comandos TSO (Issue Command)

## Quando usar
Para submeter consultas rápidas, pings de ambiente, acionar utilitários isolados não interativos (como listar configurações ou macros de sistema em background).

## Equivalente no ambiente legado
ISPF Option 6 (Command / TSO Command Prompt), ou barra de atalho `=6` do ISPF.

## Como fazer no Zowe
Processos TSO não rodam de forma nativa visual se exigirem tela (3270). No entanto, comandos de linha única podem ser ativados de duas formas:
1. Usando atalhos de comando embutidos na Command Palette do VS Code (`Ctrl+Shift+P` -> pesquisando por *Issue TSO command* ou similar, dependendo do pacote ativo).
2. Usando linha de comando integrada via Zowe CLI (`zowe tso issue command...`).

*(Nota: Como o Zowe foca em API, comandos textuais puros que devolvem resposta simples funcionam; processos que requerem tela interativa falharão ou nunca retornarão).*

## Pré-requisitos
Zowe CLI instalado ou pacote específico configurado com perfis compatíveis com `tso/issue`.

## Cuidados / Limitações
Processos interativos de painel e *Dialog Manager* que requerem intervenção manual passo-a-passo (como alguns utilitários de DB2 Spufi clássicos via painel ou File-AID de tela) não são convertíveis através do *Issue TSO Command*. Essas limitações justificam o porquê de emuladores 3270 não desaparecerem 100%.

## Fonte
- OFFICIAL_ZOWE (zowe-operations.md)
