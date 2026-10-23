export interface ParsedResource {
    type: 'dataset-member' | 'dataset' | 'job';
    dataset?: string;
    member?: string;
    jobId?: string;
}

/**
 * Analisa o texto do usuário para extrair referências a recursos do Mainframe.
 * Por enquanto, suporta apenas a extração explícita de DATASET(MEMBER).
 * @param prompt O texto fornecido pelo usuário.
 */
export function parseResourceReference(prompt: string): ParsedResource | null {
    // Regex para identificar padrão DATASET(MEMBER)
    // Exemplo: Z75221.JCL(JCL2) ou SYS1.MACLIB(ABC)
    const dsMemberRegex = /([A-Z0-9#@$]{1,8}(?:\.[A-Z0-9#@$]{1,8})*)\(([A-Z0-9#@$]{1,8})\)/i;
    
    const match = prompt.match(dsMemberRegex);
    if (match) {
        return {
            type: 'dataset-member',
            dataset: match[1].toUpperCase(),
            member: match[2].toUpperCase()
        };
    }

    return null;
}
