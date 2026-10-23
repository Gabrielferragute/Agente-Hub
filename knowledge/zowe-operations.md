# Operações Básicas no Zowe Explorer (VS Code) e USS

Este documento contém o guia prático para auxiliar usuários a realizarem operações do dia a dia no Mainframe utilizando a interface do VS Code (Zowe Explorer) e o terminal USS, servindo como uma ponte para quem estava acostumado com o TSO/ISPF.

## 1. Explorando Datasets e Membros (Alternativa ao ISPF 3.4)
No ISPF, usaríamos `=3.4` para listar arquivos. No VS Code com Zowe:
- Vá para a aba lateral do **Zowe Explorer** e abra a seção **DATA SETS**.
- Clique na lupa (Search) ao lado do seu perfil Zowe e digite o filtro desejado (ex: `ZXP.PUBLIC` ou o seu próprio userid como `Z99994`). Use vírgulas para múltiplos filtros.
- O ícone `>` indica que é um Dataset Particionado (PDS). Ao clicar nele, você verá os membros internos.
- Arquivos de texto corrido sem a setinha `>` são Datasets Sequenciais (PS).

## 2. Criando um Novo Membro
- Encontre o Dataset Particionado (PDS) desejado na lista.
- Clique com o botão direito no nome do Dataset e selecione **Create New Member**.
- Digite o nome do membro (limite de 1 a 8 caracteres: A-Z, 0-9, @, #, $).

## 3. Copiando e Colando Membros
- Clique com o botão direito sobre o membro de origem e selecione **Copy**.
- Navegue até o Dataset de destino, clique com o botão direito no nome do Dataset e selecione **Paste Member**.
- Confirme o nome do novo membro.

## 4. Renomeando e Deletando
- Para renomear: Clique com o botão direito no membro > **Rename Member** e digite o novo nome.
- Para deletar: Clique com o botão direito no membro > **Delete Member** e confirme a exclusão no prompt.

## 5. Submetendo um Job (JCL)
- Navegue até um membro contendo JCL.
- Clique com o botão direito no membro e selecione **Submit Job**.
- Você receberá um código de conclusão (ex: `CC 0000` para sucesso).

## 6. Acesso ao UNIX System Services (USS)
O USS permite operar o Mainframe usando comandos padrão do UNIX. No VS Code:
- Abra um novo Terminal (`Terminal > New Terminal`).
- Conecte-se via SSH: `ssh seu_usuario@endereco_ip`. (Atenção: No Windows, se o PowerShell der erro de permissão, tente usar o CMD).
- Comandos úteis:
  - `pwd`: Mostra em qual diretório você está.
  - `ls` ou `ls -l`: Lista arquivos e pastas.
  - `cd /caminho/`: Muda de diretório. (`cd ..` volta um nível, `cd ~` vai para o diretório home).
  - `mkdir nome_pasta`: Cria um novo diretório.
  - `touch nome_arquivo`: Cria um arquivo vazio ou atualiza o timestamp.
  - `> arquivo.txt`: Redireciona a saída de um comando sobrescrevendo o arquivo.
  - `>> arquivo.txt`: Redireciona a saída anexando (append) ao final do arquivo.
