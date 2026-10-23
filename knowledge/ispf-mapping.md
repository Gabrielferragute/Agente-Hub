## Mapeamento ISPF (De/Para Oficial)

1. **ISPF 3.4 (Data Set List)**
   - No VS Code: Abra o painel esquerdo do **Zowe Explorer**.
   - Vá na seção **Data Sets**.
   - Conecte no perfil.
   - Use o ícone de Lupa 🔎 para criar um filtro de busca.
   - Padrão: Digite `HLQ.*` ou a máscara desejada.

2. **Editar um Member (ISPF 2 / Edit)**
   - Encontre o dataset no Zowe Explorer.
   - Expanda o PDS e clique duas vezes no member para abrir no editor.
   - Salvar (`Ctrl+S`) envia a alteração para o Mainframe.

3. **Submeter um Job (SUB)**
   - Com o member aberto, botão direito -> **Zowe: Submit Job**.
   - Ou clique direito no Zowe Explorer no member correspondente.

4. **Visualizar Spool / SDSF**
   - No **Zowe Explorer**, vá até a aba **Jobs**.
   - Crie filtro com o Owner/Prefixo.
   - Expanda o JOB ID para ler JESMSGLG, SYSPRINT, etc.
