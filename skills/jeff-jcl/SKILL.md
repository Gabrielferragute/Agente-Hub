---
id: jeff-jcl
providerId: local
origin: imported
status: local-adapted
domain: jcl
intents: [jcl-review, jcl-generation, jcl-scaffolding, restart-validation, finops-jcl]
defaultTier: STANDARD
escalation: Escalate to DEEP if the user provides multiple interconnected JCLs or PROCs.
tools: [zowe-read-member]
knowledge: []
output: guided
---

Analisa, otimiza e constrói scripts JCL (Job Control Language) com foco na resiliência de produção, prevenção de incidentes de concorrência e redução de custos de armazenamento (FinOps).

Esta skill atua de duas formas:
- **Auditoria:** Identifica erros em JCLs existentes (falta de restartabilidade, retenção indevida de arquivos temporários, gargalos de I/O).
- **Geração (Scaffolding):** Cria JCLs completos do zero a partir de requisitos descritivos, já aplicando os padrões de alta performance e resiliência (RLSE, BLKSIZE=0, DISP seguros).

**Impacto Operacional (FinOps):** Reduz o consumo de storage DASD identificando ausência de RLSE e otimiza o consumo de CPU e canais de I/O através da recomendação de System Determined Blocksize (BLKSIZE=0). Evita acionamentos noturnos da equipe de suporte.

## Limitations
- **Catálogo do Sistema:** A skill não tem acesso ao catálogo real do z/OS para validar se um DSN já existe.
- **Job Cards:** Ao gerar código, um Job Card genérico será utilizado. O desenvolvedor deve ajustá-lo para os padrões da sua instalação.

## Instructions
Ao receber um trecho de JCL ou um requisito para criação, identifique o modo de operação e siga estritamente o fluxo abaixo:

### Fase 1: Identificação do Modo (Review vs. Builder)
- Se a entrada for um código JCL, inicie o modo **Auditoria** (Fases 2 e 3).
- Se a entrada for texto pedindo a criação de um Job, inicie o modo **Geração** (Fase 4).

### Fase 2: Modo Auditoria - Alocação e Resiliência (Restart)
- **Validação do Parâmetro DISP:** Identifique padrões que quebram a reentrância. Recomende `DISP=(NEW,CATLG,DELETE)`. Para arquivos temporários (`&&`), recomende `DISP=(NEW,PASS,DELETE)`.
- **Validação de Concorrência:** Identifique arquivos de leitura alocados com `DISP=OLD`. Recomende `DISP=SHR` para permitir paralelismo.

### Fase 3: Modo Auditoria - Otimização de FinOps
- **Economia de DASD:** Verifique se alocações NEW possuem o parâmetro `RLSE`. Se não, sugira a inclusão.
- **Otimização de I/O:** Verifique se há `BLKSIZE` hardcoded. Recomende `BLKSIZE=0`.

### Fase 4: Modo Geração (Scaffolding)
Analise os steps solicitados pelo usuário e construa o JCL completo aplicando nativamente todas as boas práticas:
- Passo prévio com `IEFBR14` para deletar arquivos que serão gerados (`DISP=(MOD,DELETE,DELETE)`), garantindo restartabilidade.
- `DISP=(NEW,CATLG,DELETE)` para arquivos permanentes de saída.
- `DISP=SHR` para todos os arquivos de leitura.
- `SPACE=(CYL,(X,Y),RLSE)` para economia de DASD.
- `BLKSIZE=0` nas alocações.
- Nome de datasets temporários começando com `&&`.

### Fase 5: Formato de Saída Obrigatório
**Se Modo Auditoria:**
```
## Avaliação de JCL e Riscos
**Severidade Máxima Encontrada:** [🔴 CRÍTICO / 🟡 ATENÇÃO / 🟢 INFORMATIVO]
### Diagnóstico Estrutural
[Resumo dos problemas]
### Pontos de Atenção e Correções
1. **[Componente]:** [Risco] → [Recomendação] (💰 FinOps ou 🛡️ Resiliência)
### JCL Otimizado
[Código corrigido]
```

**Se Modo Geração:**
```
## JCL Gerado com Sucesso
**Foco Arquitetural Aplicado:** 🛡️ Resiliência (Restart) e 💰 FinOps (Storage/I-O)
### Estrutura do Job
[Breve resumo dos steps gerados]
### Código JCL
[Código gerado]
```
