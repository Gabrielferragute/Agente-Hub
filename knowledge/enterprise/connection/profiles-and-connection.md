---
topic: "Corporate Connection Profiles"
sourceClass: "ENTERPRISE_LOCAL"
source: "Manual Simplificado Conexão Zowe"
product: "Zowe Explorer"
scope: "CORPORATE"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Configuração de Profile e Conexão ao Mainframe

## Quando usar
Na primeira configuração do Zowe Explorer ou quando houver a necessidade de reconfigurar o acesso ao Mainframe em um ambiente corporativo.

## Equivalente no ambiente legado
Configuração de emuladores 3270 (como PCOMM ou Extra) com IPs e portas do Host.

## Como fazer no Zowe
1. Instale as Extensões do VS Code (Zowe Explorer e dependências).
2. Salve os arquivos corporativos pré-fornecidos `zowe.schema` e `zowe.config` no seu diretório `C:\Users\[usuario]\.zowe`. Eles contêm os perfis reais de conexão com os dados do ambiente (Host, Porta).
3. Na seção 'DATA SETS', realize a conexão (ex: `zosmf`).
4. Clique no ícone da lupa.
5. Insira sua matrícula/chave de acesso e sua senha de acesso ao Mainframe.

## Pré-requisitos
- VS Code instalado.
- Arquivos `zowe.config` e `zowe.schema` corporativos disponíveis.
- Acesso de rede aprovado via processo de requisição (RITM / ServiceNow / AIOps).

## Cuidados / Limitações
O perfil já vem montado no `zowe.config` com os dados do ambiente corporativo. A criação de profile do zero via interface gráfica não é detalhada nesta fonte.

## Fonte
- ENTERPRISE_LOCAL (Manual Simplificado Conexão Zowe & Hub de IA, Pág 6-8)
