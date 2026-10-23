# CICS BMS (Basic Mapping Support) - Cheat Sheet de Sintaxe

Este documento contém a sintaxe estrita da IBM para manipulação de mapas BMS (Basic Mapping Support) no COBOL CICS. 
**[⚠️ REGRA CRÍTICA DE ANTI-ALUCINAÇÃO]:** Ao sugerir alterações de código envolvendo mapas CICS, NUNCA invente palavras (como `MAP-LENGHT`). Utilize estritamente a concatenação de sufixos de DSECT gerados pelo CICS.

## Regras de Sufixos DSECT BMS (Obrigatório)

Quando um mapa BMS é compilado, o CICS gera um *copybook* (DSECT) com sufixos atrelados ao nome original do campo no mapa (exemplo: campo `MAPDADO` gera `MAPDADOI`, `MAPDADOO`, etc.). Você DEVE usar APENAS estes sufixos:

- **Sufixo `I` (Input):** Usado para ler os dados recebidos da tela. 
  *Exemplo:* `IF MAPDADOI NOT = SPACES`
- **Sufixo `O` (Output):** Usado para enviar dados formatados para a tela. 
  *Exemplo:* `MOVE 'ERRO' TO MAPDADOO`
- **Sufixo `L` (Length):** Usado para verificar quantos caracteres o usuário digitou **OU** para posicionar o cursor dinamicamente (`MOVE -1 TO campol`). 
  *Exemplo de posicionamento de cursor:* `MOVE -1 TO MAPDADOL(I)` (NUNCA use `MAP-LENGHT` ou `MAP-LENGTH`).
- **Sufixo `A` (Attribute):** Usado para alterar dinamicamente a cor, brilho (intensified), ou proteção (unprotected/autoskip) do campo. 
  *Exemplo:* `MOVE DFHBMASK TO MAPDADOA` ou `MOVE DFHRED TO MAPDADOA`.
- **Sufixo `F` (Flag):** Indica se o usuário limpou o campo via tecla ERASE EOF (valor `X'80'`).

## Manipulação Dinâmica de Atributos e Cursor
- Para mover o cursor para um campo com erro:
  `MOVE -1 TO NOME-DO-CAMPOL` (Note o L no final).
- Para colocar o campo em vermelho e reter o cursor:
  `MOVE DFHBMASB TO NOME-DO-CAMPOA` (Se a variável for vetor: `NOME-DO-CAMPOA(I)`).

Atenção redobrada com vetores (`OCCURS`) em mapas. Se o campo base for `MAPDADO(I)`, o sufixo entra ANTES dos parênteses do índice: `MAPDADOI(I)`, `MAPDADOL(I)`.
