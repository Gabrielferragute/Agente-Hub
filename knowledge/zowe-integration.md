## Integração Zowe Explorer

A extensão Mainframe Hub Assistant pode integrar-se com o Zowe Explorer para ler dados do Mainframe automaticamente.

### Capacidades (Read-Only)
- Ler conteúdo de members de datasets (COBOL, JCL, Copybooks)
- Listar jobs por owner e prefixo
- Ler output de spool (JESMSGLG, SYSPRINT)

### Pré-requisitos
- Zowe Explorer instalado e ativo no VS Code
- Perfil Zowe configurado e autenticado (Chave M + senha)

### Limitações
- Somente leitura. A extensão nunca submete, deleta ou altera dados.
- Se o Zowe Explorer não estiver instalado, o assistente pede ao usuário para colar os dados manualmente.
- Conteúdos muito longos (>8000 caracteres) são truncados antes de serem enviados ao LLM.
