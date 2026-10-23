export interface TelemetryEvent {
    command?: string;
    modelUsed: string; // Métrica real (retornada pela API)
    tier: string;      // Métrica real (calculada pelo Router)
    skillId: string;   // Métrica real
    promptLength: number; // Métrica real (caracteres injetados)
    durationMs: number; // Métrica real
    
    // Novas métricas (Hardening MVP v0.1)
    historyMessagesAvailable?: number;
    historyMessagesIncluded?: number;
    historyCharsIncluded?: number;
    historyTruncated?: boolean;
    
    editorContextMode?: 'ACTIVE_ONLY' | 'MULTI_VISIBLE' | 'NONE';
    visibleEditorsFound?: number;
    editorsIncluded?: number;
    
    routingDecisionSource?: 'CODE_CLASSIFIER' | 'EXPLICIT_INTENT' | 'SEMANTIC_ROUTER' | 'FALLBACK';
    semanticRouterCalled?: boolean;
    semanticRouterDurationMs?: number;
    semanticSkillRequested?: string;
    semanticSkillValid?: boolean;

    editorContextRequested?: boolean;
    editorContextIncluded?: boolean;
    editorContextReason?: string;

    contextBudgetTotalChars?: number;
    contextCharsIncluded?: number;
    knowledgeCharsIncluded?: number;
    mainframeContextCharsIncluded?: number;
    contextBudgetExceeded?: boolean;
    knowledgeTruncated?: boolean;
    mainframeContextTruncated?: boolean;
    historyTruncationReason?: string;
    knowledgeTruncationReason?: string;
    mainframeContextTruncationReason?: string;
    truncationReason?: string;
    contextBuildSuccess?: boolean;
    contextBuildFailureReason?: string;
}

export function logTelemetry(event: TelemetryEvent) {
    // MÉTRICAS ESTIMADAS (Não usadas para billing real sem acesso à API financeira)
    const estimatedTokens = Math.ceil(event.promptLength / 4);
    const estimatedEconomy = event.tier === 'ECONOMY' ? 'Alta (modelo reduzido)' : (event.tier === 'STANDARD' ? 'Média' : 'Baixa (modelo premium)');

    console.log(`\n========================================`);
    console.log(`[TELEMETRIA - MAINFRAME HUB ASSISTANT]`);
    console.log(`========================================`);
    console.log(`MÉTRICAS REAIS (Execução):`);
    console.log(`- Command/Intent : ${event.command || 'N/A'}`);
    console.log(`- Skill Acionada : ${event.skillId}`);
    console.log(`- Tier do Router : ${event.tier}`);
    console.log(`- Modelo da API  : ${event.modelUsed}`);
    console.log(`- Tamanho Prompt : ${event.promptLength} caracteres`);
    console.log(`- Duração (ms)   : ${event.durationMs}ms`);
    
    if (event.historyMessagesAvailable !== undefined) {
        console.log(`- Histórico      : Disp=${event.historyMessagesAvailable} | Inc=${event.historyMessagesIncluded} | Trunc=${event.historyTruncated ? 'YES' : 'NO'} | Chars=${event.historyCharsIncluded}`);
    }
    if (event.editorContextMode !== undefined) {
        console.log(`- Editor Context : Mode=${event.editorContextMode} | Found=${event.visibleEditorsFound} | Incl=${event.editorsIncluded}`);
    }
    if (event.editorContextRequested !== undefined) {
        console.log(`- Editor Policy  : Requested=${event.editorContextRequested ? 'YES' : 'NO'} | Included=${event.editorContextIncluded ? 'YES' : 'NO'} | Reason=${event.editorContextReason}`);
    }
    if (event.routingDecisionSource !== undefined) {
        console.log(`- Routing Source : ${event.routingDecisionSource} | SemRouterCalled=${event.semanticRouterCalled ? 'YES' : 'NO'}` + (event.semanticRouterDurationMs ? ` | SemRouterMs=${event.semanticRouterDurationMs}` : ''));
    }
    if (event.semanticSkillRequested !== undefined) {
        console.log(`- Semantic Skill : Requested=${event.semanticSkillRequested} | Valid=${event.semanticSkillValid ? 'YES' : 'NO'}`);
    }
    if (event.contextBudgetTotalChars !== undefined) {
        console.log(`- Context Budget : Max=${event.contextBudgetTotalChars} | Included=${event.contextCharsIncluded} | History=${event.historyCharsIncluded} | Knowledge=${event.knowledgeCharsIncluded} | Mainframe=${event.mainframeContextCharsIncluded} | Exceeded=${event.contextBudgetExceeded ? 'YES' : 'NO'}`);
        console.log(`- Truncated      : History=${event.historyTruncated ? 'YES' : 'NO'} | Knowledge=${event.knowledgeTruncated ? 'YES' : 'NO'} | Mainframe=${event.mainframeContextTruncated ? 'YES' : 'NO'}`);
        console.log(`- Truncation     : History=${event.historyTruncationReason} | Knowledge=${event.knowledgeTruncationReason} | Mainframe=${event.mainframeContextTruncationReason} | Aggregate=${event.truncationReason}`);
    }
    if (event.contextBuildSuccess !== undefined) {
        console.log(`- Context Build  : Success=${event.contextBuildSuccess ? 'YES' : 'NO'}` + (event.contextBuildFailureReason ? ` | FailureReason=${event.contextBuildFailureReason}` : ''));
    }
    
    console.log(`----------------------------------------`);
    console.log(`MÉTRICAS ESTIMADAS:`);
    console.log(`- Tokens Estim.  : ~${estimatedTokens}`);
    console.log(`- AI Credits Eff : ${estimatedEconomy}`);
    console.log(`========================================\n`);
}
