import * as vscode from 'vscode';

export interface SemanticRouterResult {
    selectedSkill: string;
    confidence: string;
    reasoning: string;
}

/**
 * Roteador Semântico: usa um modelo rápido (ECONOMY) para classificar
 * a intenção do usuário e selecionar a skill mais adequada.
 * 
 * Substitui o sistema anterior de palavras-chave por compreensão contextual.
 */
export class SemanticRouter {

    private readonly classificationPrompt = `Você é um classificador de intenções para o Mainframe Hub Assistant.
Sua ÚNICA tarefa é analisar a pergunta do usuário e retornar o ID da skill mais adequada.

## Skills Disponíveis

1. **jeff-jcl** — Análise, auditoria e geração de JCL. Restartabilidade, DISP, RLSE, BLKSIZE, scaffolding de Jobs.
2. **jeff-db2** — Análise de SQL/DDL para DB2 z/OS. Predicados SARGable, Table Scan, índices, OPTIMIZE FOR.
3. **jeff-cics** — Análise de chamadas DL/I ao IMS DB via CICS ou Batch. SSA qualificado, Status Codes, GHU/GHN.
4. **jeff-scan** — Scan de performance COBOL. Busca linear vs binária, COMP-3, subscripting vs indexing, EXIT PERFORM.
5. **cobol-debug** — Debug e análise de erros COBOL (ABENDs como S0C7, S0C4, dumps, revisão de código).
6. **jcl-analysis** — Análise básica de JCL (use jeff-jcl se disponível, este é o fallback simples).
7. **tso-to-zowe** — Migração do TSO/ISPF para o VS Code/Zowe Explorer. Como criar membros, copiar, submit, USS, navegação.
8. **onboarding** — Guia para novos usuários no ecossistema Mainframe + VS Code + Zowe.
9. **component-discovery** — Mapeamento de componentes e análise de impacto entre programas (COPY, CALL, EXEC PGM).
10. **git-copilot** — Uso de Git e boas práticas de versionamento no contexto Mainframe.

## Regras de Classificação
- Se o usuário pede para ANALISAR/OTIMIZAR uma query SQL ou DDL → jeff-db2
- Se o usuário pede para ANALISAR/GERAR/REVISAR um JCL → jeff-jcl
- Se o código contém chamadas DL/I, EXEC DLI, CBLTDLI, IMS → jeff-cics
- Se o usuário pede scan de PERFORMANCE ou otimização de MIPS em COBOL → jeff-scan
- Se o usuário relata um ABEND, erro, dump ou quer debug de COBOL → cobol-debug
- Se o usuário pergunta COMO FAZER algo no Zowe/VS Code (criar, copiar, compilar, submit) → tso-to-zowe
- Se o usuário é iniciante ou pede ajuda para começar → onboarding
- Se o usuário pede para MAPEAR componentes ou análise de IMPACTO → component-discovery
- Se o usuário pergunta sobre Git → git-copilot
- Se não houver correspondência clara → onboarding

## Formato de Resposta (OBRIGATÓRIO)
Responda APENAS com uma linha no formato:
SKILL:nome-da-skill

Não adicione explicações, comentários ou qualquer outro texto.`;

    /**
     * Classifica a intenção do usuário usando um modelo rápido.
     */
    async classify(
        userPrompt: string,
        accessInfo: vscode.LanguageModelAccessInformation
    ): Promise<SemanticRouterResult> {

        try {
            // Tenta usar o modelo mais barato disponível
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            
            // Procura um modelo leve (gpt-4o-mini ou similar)
            let classifierModel = models.find(m => 
                m.id.includes('mini') || m.id.includes('haiku') || m.id.includes('flash')
            );

            // Fallback para qualquer modelo disponível
            if (!classifierModel) {
                classifierModel = models.find(m => accessInfo.canSendRequest(m) === true);
            }

            if (!classifierModel) {
                console.log('[SemanticRouter] Nenhum modelo disponível para classificação. Usando fallback por keywords.');
                return this.fallbackKeywordClassification(userPrompt);
            }

            const messages = [
                vscode.LanguageModelChatMessage.User(this.classificationPrompt),
                vscode.LanguageModelChatMessage.User(`Pergunta do usuário: "${userPrompt}"`)
            ];

            const response = await classifierModel.sendRequest(
                messages,
                {},
                new vscode.CancellationTokenSource().token
            );

            let fullResponse = '';
            for await (const chunk of response.text) {
                fullResponse += chunk;
            }

            // Parse da resposta: espera "SKILL:nome-da-skill"
            const match = fullResponse.trim().match(/SKILL:\s*([a-z0-9-]+)/i);
            if (match) {
                const skillId = match[1].toLowerCase();
                console.log(`[SemanticRouter] Classificação semântica: ${skillId}`);
                return {
                    selectedSkill: skillId,
                    confidence: 'HIGH',
                    reasoning: `Classificado via LLM (${classifierModel.id})`
                };
            }

            // Se o LLM retornou algo inesperado, tenta fallback
            console.log(`[SemanticRouter] Resposta inesperada do LLM: "${fullResponse.trim()}". Usando fallback.`);
            return this.fallbackKeywordClassification(userPrompt);

        } catch (error: any) {
            console.error(`[SemanticRouter] Erro na classificação semântica: ${error.message}. Usando fallback.`);
            return this.fallbackKeywordClassification(userPrompt);
        }
    }

    /**
     * Fallback baseado em keywords para quando o LLM não estiver disponível.
     */
    private fallbackKeywordClassification(userPrompt: string): SemanticRouterResult {
        const prompt = userPrompt.toLowerCase();

        const rules: Array<{ keywords: string[]; skill: string }> = [
            { keywords: ['mapeie', 'impacto', 'relacionados', 'componentes'], skill: 'component-discovery' },
            { keywords: ['sql', 'select', 'db2', 'query', 'where', 'index', 'sargable'], skill: 'jeff-db2' },
            { keywords: ['dli', 'ims', 'cics', 'exec dli', 'cbltdli', 'dibstat'], skill: 'jeff-cics' },
            { keywords: ['performance', 'mips', 'scan', 'otimizar', 'comp-3', 'search all'], skill: 'jeff-scan' },
            { keywords: ['s0c7', 's0c4', 'abend', 'dump', 'erro cobol', 'debug'], skill: 'cobol-debug' },
            { keywords: ['jcl', 'job', 'disp=', 'exec pgm', 'rlse', 'blksize'], skill: 'jeff-jcl' },
            { keywords: ['tso', 'ispf', '3.4', 'zowe', 'compilar', 'criar', 'copiar', 'submit', 'uss'], skill: 'tso-to-zowe' },
            { keywords: ['git', 'commit', 'branch', 'push'], skill: 'git-copilot' },
            { keywords: ['começando', 'iniciante', 'como começo', 'primeiro'], skill: 'onboarding' },
        ];

        for (const rule of rules) {
            for (const kw of rule.keywords) {
                if (prompt.includes(kw)) {
                    return {
                        selectedSkill: rule.skill,
                        confidence: 'MEDIUM',
                        reasoning: `Fallback por keyword: "${kw}"`
                    };
                }
            }
        }

        return {
            selectedSkill: 'onboarding',
            confidence: 'LOW',
            reasoning: 'Nenhuma correspondência encontrada. Default: onboarding.'
        };
    }
}

export const semanticRouter = new SemanticRouter();
