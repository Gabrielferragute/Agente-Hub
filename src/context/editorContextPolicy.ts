export type EditorContextReason = 'EXPLICIT_CONTENT_REFERENCE' | 'NO_EXPLICIT_CONTENT_INTENT';

export interface EditorContextDecision {
    requested: boolean;
    reason: EditorContextReason;
}

function normalizePrompt(prompt: string): string {
    return prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function shouldUseEditorContext(prompt: string): EditorContextDecision {
    const normalized = normalizePrompt(prompt);
    const action = /\b(analis(?:e|ar)|expli(?:ca|car|que)|revis(?:e|ar)|compar(?:e|ar)|verifi(?:que|car)|corrig(?:ir|a)|erro|errado|problema|analy[sz]e|explain|review|compare|check|fix|wrong|error|problem)\b/.test(normalized);
    const explicitContent = /\b(este|esse|neste|nesse|deste|desse)\s+(codigo|arquivo|cobol|jcl|programa|conteudo)\b/.test(normalized)
        || /\b(arquivo|editor)\s+(aberto|ativo)\b/.test(normalized)
        || /\b(o\s+que\s+)?estou\s+vendo\b/.test(normalized)
        || /\b(na|minha)\s+tela\b/.test(normalized)
        || /\b(this|the\s+open)\s+(code|file|cobol|jcl|program|content)\b/.test(normalized)
        || /\b(active|open)\s+(file|editor)\b/.test(normalized)
        || /\bwhat\s+i(?:'| a)?m\s+(seeing|viewing)\b/.test(normalized);

    return action && explicitContent
        ? { requested: true, reason: 'EXPLICIT_CONTENT_REFERENCE' }
        : { requested: false, reason: 'NO_EXPLICIT_CONTENT_INTENT' };
}
