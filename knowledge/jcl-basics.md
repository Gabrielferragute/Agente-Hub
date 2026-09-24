## Parâmetros Básicos JCL

1. **DISP**: Indica a disposição do dataset. 
   - `NEW`: O dataset está sendo criado neste step.
   - `CATLG`: Se o step terminar com sucesso, o dataset será catalogado no sistema.
   - `DELETE`: Se o step falhar, o dataset será deletado.
   - `SHR`: Permite acesso de leitura compartilhado (muito usado em PROCs).
2. **SPACE**: Define o tamanho alocado em cilindros ou blocos (ex: `SPACE=(TRK,(10,5))`).
3. **SYSOUT=***: Direciona a saída para o Spool de forma genérica.
