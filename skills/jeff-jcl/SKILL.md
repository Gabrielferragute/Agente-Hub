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
knowledge: [empresa-jcl-guidelines.md]
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

### Fase 2: Modo Auditoria - Validação Sintática (JCL SCAN)
- **Erros Fatais de Sintaxe:** Verifique ativamente se há linhas soltas sem os caracteres `//`, erros de continuação de cartões DD (virgulas soltas), delimitadores `/*` faltando no final de `SYSIN`, ou parâmetros `COND` no primeiro step do Job. Qualquer erro deste tipo deve classificar o Job como 🔴 CRÍTICO.

### Fase 3: Modo Auditoria - Resiliência e FinOps
- **Parâmetro DISP (Concorrência e Restart):** Identifique padrões que quebram a reentrância. Recomende `DISP=(NEW,CATLG,DELETE)` para arquivos definitivos. Para arquivos temporários (`&&`), recomende `DISP=(NEW,PASS,DELETE)`. Identifique arquivos de leitura alocados com `DISP=OLD` e recomende `DISP=SHR` para permitir paralelismo.
- **Economia de DASD (RLSE):** [⚠️ REGRA CRÍTICA DE ANTI-ALUCINAÇÃO] Antes de sugerir a inclusão de `RLSE`, leia minuciosamente o código original para verificar se ele já não está dentro da instrução `SPACE` (ex: `SPACE=(CYL,(5,5),RLSE)`). Se ele já existir, NÃO DÊ FALSO POSITIVO. Além disso, **NUNCA** sugira colocar `RLSE` no parâmetro `DISP` (isso gera JCL ERROR). `RLSE` pertence exclusivamente ao parâmetro `SPACE`.
- **Otimização de I/O (BLKSIZE=0):** Verifique os cartões `DCB` ou as definições `DD` de alocação de saída. Se omitirem `BLKSIZE=0` ou se tiverem `BLKSIZE` hardcoded, recomende a inclusão de `BLKSIZE=0` para forçar o System Determined Blocksize (SDB).
- **Tratamento de Código de Retorno:** Não confunda utilitários. `MAXCC` e `LASTCC` pertencem ao `IDCAMS`. Códigos de Retorno (RC) de outros utilitários (como `DSNUTILB`) são checados via `COND=` ou blocos `IF/THEN`.

### Fase 4: Modo Geração de JCL (Infraestrutura Batch)
Ao gerar scripts JCL, aplique obrigatoriamente as seguintes regras de resiliência e FinOps:

1. **Zero Alucinação:** Utilize estritamente os nomes de programas, datasets e rotinas fornecidos no prompt. Não invente nomes de `STEPLIB` genéricos ou arquivos não solicitados.
2. **Sintaxe Posicional Rigorosa:** Todo cartão de controle JCL deve iniciar com `//` nas colunas 1 e 2. Comentários devem utilizar exclusivamente `//*`.
3. **Limpeza Prévia (Restart Seguro):** Sempre inicie o fluxo com um step executando `PGM=IEFBR14` para deletar eventuais arquivos de saída do processamento anterior. Use `DISP=(MOD,DELETE,DELETE)` com um SPACE mínimo (ex: `SPACE=(TRK,(1,1))`), para não falhar quando o arquivo ainda não existe e garantir a limpeza antes da alocação principal.
4. **Otimização de Disco (FinOps):** Em arquivos de saída, utilize `BLKSIZE=0` no cartão DCB para que o sistema (DFSMS) calcule o bloco ótimo. Adicione o parâmetro `RLSE` na cláusula `SPACE=(...,RLSE)` para devolver cilindros/trilhas não utilizados.
5. **Segurança de Arquivos e DISP:**
   - **Para leitura:** Use sempre `DISP=SHR` para evitar enfileiramento (enqueue) exclusivo no MVS.
   - **Para gravação:** Use `DISP=(NEW,CATLG,DELETE)`. Se o step terminar em ABEND, o arquivo é deletado pelo sistema. Términos normais com *Return Code* alto (ex: RC=8 ou RC=12) não disparam o terceiro subparâmetro (DELETE), por isso o controle de fluxo do item 6 é vital.
   - **Para datasets temporários:** Utilize a notação `&&` (ex: `&&TEMPDS`). Eles residem fisicamente em disco, portanto, utilize `DISP=(NEW,PASS,DELETE)` para transitar os dados entre os steps e garantir a exclusão no final da execução.
6. **Controle de Fluxo Correto:** Faça avaliações lógicas utilizando a estrutura `// IF/THEN/ELSE/ENDIF` para testar o código de retorno do step exato (ex: `stepname.RC`). Jamais utilize sintaxe do IDCAMS (`LASTCC/MAXCC`) diretamente no JCL.

### Fase 5: Formato de Saída (Obrigatório)
Sempre entregue a resposta no formato estruturado abaixo, dependendo da intenção detectada. Nas respostas, use apenas títulos de nível 4 e 5 (`####`, `#####`), exatamente como nos modelos.

**Se a intenção for analisar/revisar (Modo Auditoria):**
```text
#### Diagnóstico de JCL (z/OS)
**Status do Script:** [🔴 ERRO FATAL / 🟡 ATENÇÃO / 🟢 APROVADO]
##### 1. Análise de Sintaxe e Estrutura
[Aponte erros posicionais e falta de // nas colunas 1 e 2]
##### 2. Auditoria de Datasets e DISP
[Analise a disposição dos arquivos e os parâmetros do cartão DD]
##### 3. Controle de Fluxo (COND/IF)
[Avalie se os steps dependem uns dos outros de forma segura baseando-se no Return Code]
##### 4. Código JCL Corrigido/Otimizado
[Forneça o bloco JCL corrigido, se houver alterações a serem feitas]
```

**Se a intenção for criar um Job (Modo Geração):**
```text
#### 📜 JCL Gerado
[Bloco de código com o JCL completo e rigorosamente indentado]

#### 🧠 Visão do Arquiteto
*   **Performance (FinOps):** [Explique a economia de MIPS e disco aplicada no código, destacando a delegação do BLKSIZE=0 ao DFSMS e o uso de RLSE].
*   **Resiliência e Recuperação:** [Detalhe os mecanismos de segurança inseridos, explicando a ação do IEFBR14 com DISP=(MOD,DELETE,DELETE), a exclusão automática em caso de ABEND via DISP=(NEW,CATLG,DELETE) e a amarração lógica via stepname.RC].
```
