# Modelo Mental de COBOL para Programadores Modernos

Este documento fornece as chaves de tradução do modelo mental de desenvolvimento moderno (orientado a objetos, funções, microsserviços) para o modelo operacional do COBOL (sistemas críticos, processos batch, registros). Utilize este conhecimento SEMPRE que estiver explicando, analisando ou sugerindo refatorações em código COBOL.

## 1. O Problema que COBOL Resolve
COBOL não é velho; ele é feito para um domínio que não desapareceu: processar grandes volumes de dados (dinheiro, regras legais) de forma determinística, auditável e com responsabilidade operativa. Em sistemas críticos, previsibilidade e visibilidade valem mais que elegância e abstração.
- Não sugira trocar legibilidade estrutural por abstrações "mágicas" do runtime.
- Não critique a verbosidade do COBOL. A sintaxe extensa e explícita é uma decisão de design para que o código seja legível anos depois por pessoas que não o escreveram.

## 2. A Estrutura Rígida
Todo programa tem 4 divisões obrigatórias (`IDENTIFICATION`, `ENVIRONMENT`, `DATA`, `PROCEDURE`). Isso não é burocracia, é uma forma de forçar que o sistema se explique antes de ser executado.
- `IDENTIFICATION DIVISION`: Identidade e responsabilidade. Garante a memória organizacional do artefato.
- `ENVIRONMENT DIVISION`: O contrato com o mundo externo (arquivos, diretórios, formato). Tudo que no mundo moderno ficaria em um `.yml` ou variável de ambiente, fica explícito no COBOL.
- `DATA DIVISION`: Define todo o universo de dados antes de executar uma única instrução lógica.

## 3. Dados e Estado (`DATA DIVISION`)
Em COBOL, os dados dominam o algoritmo. Os dados não são descartáveis ou de escopo de função, eles persistem.
- **Não existem "variáveis locais" de escopo** como em Python ou Java. Tudo declarado na `WORKING-STORAGE` nasce uma vez, vive durante a execução inteira e mantém o valor até ser alterado.
- A inicialização não é automática. Se você não usa `INITIALIZE` ou `VALUE`, pode haver lixo na memória. `INITIALIZE` em dados empaquetados limpa o valor preservando a estrutura.
- **Tipos de Memória:** O tipo do dado não é apenas ajuda de compilador; é alocação e cálculo.
  - `PIC 9` com `V`: Decimal implícito com precisão exata. NUNCA sugira Ponto Flutuante (float/double) para dados financeiros.
  - `COMP-3` (Packed-Decimal): Representação compacta em BCD (Binary Coded Decimal) que preserva 100% da exatidão financeira.
- Pense em Registros, não em Objetos. Agrupar dados (níveis 01, 03, 05) não cria uma classe abstrata, cria um layout contíguo de memória para mover blocos operacionais reais. Um `MOVE` de um registro nível 01 clona todo o estado sem construtor nem validação.

## 4. O Fluxo de Execução (`PROCEDURE DIVISION`)
A `PROCEDURE DIVISION` é um "roteiro de execução". Lê-se de cima para baixo.
- **`PERFORM` não é uma função:** Ele não abstrai comportamento, não encapsula estado local, não recebe parâmetros nem retorna valor. Ele é uma ferramenta de controle de fluxo explícito (desvia e volta). Use-o para marcar os passos do processo.
- **Morte ao Código Espagueti:** O `PERFORM` *inline* deve ser preferido para laços lógicos que podem ser lidos localmente. `PERFORM` apontando para múltiplos parágrafos (ou `THRU`) pode fragmentar a leitura se mal projetado.
- `IF` não controla o programa. Ele toma decisões pontuais baseadas em estado que já foi definido. Condições `NOT` e `OR` combinadas no COBOL não seguem as mesmas leis algébricas implícitas de outras linguagens (ex: `NOT = 1 OR 2` na verdade vira `NOT = 1 AND NOT = 2`). Avalie com extrema cautela.

## 5. Arquivos e Processamento Secuencial
O arquivo não é um mero array ou objeto de I/O em memória. Ele é o coração do programa e quem dita o ritmo.
- `READ` é um "evento que muda o estado global", não uma simples consulta.
- O padrão base é ler um registro, processar, e tentar ler o próximo. Isso é feito de ponta a ponta sem pular ou buscar de forma aleatória, respeitando a linha do tempo do batch.
- Se o programa parecer travado num "loop infinito", é possível que faltem `DISPLAYs` de contadores de log. O contador exibe o progresso em batches maciços sem travar a execução por erros contínuos.

## 6. Subprogramas (`CALL`)
`CALL` é o único mecanismo real de encapsulação no COBOL.
- Um `CALL` não é um microsserviço nem uma função assíncrona. Ele transfere o controle totalmente para outro módulo passando a memória por referência (via `LINKAGE SECTION`), e depois o controle retorna. Pode ser estático (embutido na compilação) ou dinâmico (carregado em runtime).

## 7. Tratamento de Erros no Batch
A falha não é exceção lançada (Throw/Catch), é um estado avaliado.
- Nunca aborte um processo de milhões de registros por um erro transiente em apenas 1 registro (a não ser que os riscos do negócio exijam).
- Se houver erro, marque as flags correspondentes (`WS-ERROR-CRITICO = 'Y'`), atualize os contadores, mande para um arquivo de rejeição e siga adiante com os outros.
- Um abort (ABEND) deve ser usado com prudência, geralmente para quebra de integridade estrutural.

**Regra de Ouro:** Ao debugar COBOL com um programador que vem do Python/Java, evite jargões de POO. Explique como o programa avança lendo registros, mudando flags, e controlando o fluxo linearmente de cima para baixo.
