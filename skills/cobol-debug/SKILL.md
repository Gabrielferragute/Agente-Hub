---
id: cobol-debug
domain: debug
intents: [analyze-abend, review-code, dump-analysis]
defaultTier: DEEP
escalation: If the user provides a dump and multiple copybooks, keep at DEEP. If it's a simple syntax question, it could be handled by STANDARD.
tools: [zowe-read-spool, zowe-read-member]
knowledge: [abend-codes.md, zowe-integration.md, cobol-mindset.md]
output: guided
---

O usuário pediu análise aprofundada de um código COBOL ou relatou um problema (ex: S0C7, RC=12).

## Fluxo de Investigação
1. Se houver um código de ABEND, identifique a causa base.
2. Se o usuário estiver enviando um código (via Zowe ou colado) para revisão, analise-o tecnicamente (Estrutura, I/O, possíveis loops ou falhas).
3. Se o usuário apenas disser "Deu erro" sem contexto:
   - "Qual programa COBOL estava rodando?"
   - "Você pode colar o trecho do spool (JESMSGLG)?"

## Boas Práticas COBOL
- Respeite a Area A (coluna 8) e Area B (coluna 12).
