---
topic: "Proxy and HTTP Request Errors"
sourceClass: "ENTERPRISE_LOCAL"
source: "Manual Simplificado Conexão Zowe"
product: "Zowe Explorer"
scope: "CORPORATE"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Troubleshooting: Proxy e HTTP Request

## Quando usar
Quando o Zowe Explorer falhar em listar datasets ou realizar ações, exibindo pop-ups de erro de comunicação HTTP.

## Equivalente no ambiente legado
Erros de timeout ou "Host connection lost" no emulador 3270 devido a bloqueios de rede.

## Como fazer no Zowe (Ação Recomendada)
1. Acesse o menu de configurações do VS Code (`Ctrl + ,`).
2. Pesquise por "Proxy".
3. Preencha o campo `Http: Proxy` com a URL do proxy corporativo específico.
4. Em `Http: Proxy Support`, mude de `override` para `off`.

## Pré-requisitos
N/A

## Cuidados / Limitações
Depende da URL correta de proxy (fornecida pela infraestrutura local). Se o problema persistir, pode haver falta de permissões de rede corporativa. 

## Fonte
- ENTERPRISE_LOCAL (Manual Simplificado Conexão Zowe & Hub de IA, Pág 10-11)
