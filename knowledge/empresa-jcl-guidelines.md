# Diretrizes Arquiteturais de JCL da Empresa (Padrão Ouro)

> **Nota:** Os nomes de Model DSCB, unidades esotéricas e valores de alocação abaixo são **fictícios** e servem como exemplo de padrões típicos de grandes instalações z/OS. Adapte-os ao padrão real da sua instalação.

Este documento descreve as práticas e padrões de infraestrutura (JCL) do ambiente z/OS da empresa. A IA DEVE respeitar estas regras ao fazer análises de FinOps e Storage.

## 1. Padrões de Data Set Control Block (Model DSCB)
- A empresa utiliza "Model DSCBs" customizados na declaração de arquivos novos, como por exemplo a instrução `DCB=(MODEL.DSCB,...)`.
- **[⚠️ REGRA CRÍTICA]**: NUNCA remova ou altere o Model DSCB (ex: `MODEL.DSCB`) ao sugerir otimizações. Se for sugerir a inclusão de System Determined Blocksize (SDB) para economia de I/O, faça-o de forma não destrutiva, apenas adicionando `BLKSIZE=0` no final.
  - *Correto:* `DCB=(MODEL.DSCB,LRECL=80,RECFM=FB,BLKSIZE=0)`
  - *Incorreto:* Apagar o `MODEL.DSCB` e deixar apenas `DCB=(LRECL=80,RECFM=FB,BLKSIZE=0)`

## 2. Padrões de Storage e Disco
- A empresa usa um nome esotérico de unidade próprio (ex: `UNIT=XDISK`) em vez do padrão IBM `SYSDA`. Respeite o nome esotérico definido pela instalação.
- A empresa já tem a maturidade de utilizar o parâmetro `RLSE` dentro de `SPACE` (ex: `SPACE=(TRK,(100,50),RLSE)`). Elogie essa prática quando encontrada.

## 3. Padrões de Utilitários
- Para operações complexas de manipulação de dados (como busca de duplicados), a empresa utiliza fortemente o utilitário `ICETOOL` (ferramenta avançada do DFSORT) com as DDs `TOOLIN` e `TOOLMSG`. 
- Caso seja questionado sobre como resolver deduplicação ou cruzamento de bases, recomende sempre o uso do `ICETOOL` em vez de criar programas COBOL do zero.

## 4. Omissão do Parâmetro NEW
- A empresa tem o hábito de omitir o parâmetro `NEW` no DISP de criação de arquivos: `DISP=(,CATLG,DELETE)`. 
- Você pode e DEVE continuar recomendando a forma explícita `DISP=(NEW,CATLG,DELETE)` ou `DISP=(MOD,CATLG,DELETE)` focado em Restartabilidade, mas entenda que a omissão do `NEW` (onde o z/OS assume NEW como default) não é um erro fatal que causa ABEND imediato, é apenas um ponto de melhoria arquitetural.
