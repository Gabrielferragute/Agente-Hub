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
    if (event.routingDecisionSource !== undefined) {
        console.log(`- Routing Source : ${event.routingDecisionSource} | SemRouterCalled=${event.semanticRouterCalled ? 'YES' : 'NO'}` + (event.semanticRouterDurationMs ? ` | SemRouterMs=${event.semanticRouterDurationMs}` : ''));
    }
    
    console.log(`----------------------------------------`);
    console.log(`MÉTRICAS ESTIMADAS:`);
    console.log(`- Tokens Estim.  : ~${estimatedTokens}`);
    console.log(`- AI Credits Eff : ${estimatedEconomy}`);
    console.log(`========================================\n`);
}
