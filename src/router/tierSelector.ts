/**
 * tierSelector.ts
 * 
 * H-02 Model Router — Seleção inteligente de tier de modelo.
 * 
 * Responsabilidade ÚNICA: dado o contexto da requisição (intent, tipo de código,
 * tamanho do contexto, palavras-chave do prompt), determinar qual tier de modelo
 * deve ser usado: ECONOMY, STANDARD ou DEEP.
 * 
 * O intentRouter delega a decisão ao tierSelector e apenas obedece.
 * O selectModelByLevel continua responsável por encontrar um modelo concreto
 * dentro do tier selecionado.
 * 
 * Cadeia de dados:
 *   Prompt → IntentRouter → TierSelector.selectTier() → tier
 *   tier → selectModelByLevel() → modelo concreto
 */

// ════════════════════════════════════════════════════════════════
// TIPOS E CONTRATOS
// ════════════════════════════════════════════════════════════════

export type ModelTier = 'ECONOMY' | 'STANDARD' | 'DEEP';

export type TierSelectionReason =
    | 'INTENT_ECONOMY'       // Intent classificada como leve (onboarding, explicar, tso-to-zowe)
    | 'INTENT_DEEP'          // Intent classificada como pesada (discover-components, abend)
    | 'KEYWORD_ESCALATION'   // Palavras-chave no prompt escalaram o tier
    | 'CONTEXT_SIZE_DEEP'    // Tamanho do contexto excede o threshold para DEEP
    | 'CODE_TYPE_STANDARD'   // Tipo de código detectado requer STANDARD (JCL, COBOL, DB2)
    | 'CODE_TYPE_DEEP'       // Tipo de código detectado em contexto grande requer DEEP
    | 'SKILL_DEFAULT'        // Tier default da skill carregada
    | 'DEFAULT_ECONOMY';     // Nenhuma regra aplicou, fallback seguro

export interface TierSelectionInput {
    /** Intent resolvida (ex: 'analyze-code', 'discover-components', 'unknown') */
    intent: string;
    
    /** Nome da skill selecionada, se houver (ex: 'jeff-jcl', 'cobol-debug') */
    selectedSkill: string | null;
    
    /** Tipo de código detectado pelo codeClassifier */
    detectedCodeType: string;
    
    /** Confiança da classificação de código */
    codeTypeConfidence: string;
    
    /** Prompt do usuário (lowercase) */
    userPrompt: string;
    
    /** Total de caracteres do contexto do mainframe (pós-processamento) */
    contextChars: number;
    
    /** Se houve leitura do Zowe (recurso mainframe foi acessado) */
    zoweReadAttempted: boolean;

    /** Tier default da skill carregada, se houver */
    skillDefaultTier: string | null;
}

export interface TierSelectionResult {
    /** Tier selecionado */
    tier: ModelTier;
    
    /** Razão principal da seleção */
    reason: TierSelectionReason;
    
    /** Se houve escalação (tier subiu em relação ao default) */
    escalated: boolean;
    
    /** Tier original antes da escalação (se houve) */
    originalTier: ModelTier | null;
    
    /** Detalhes legíveis para telemetria/log */
    details: string;
}

// ════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ════════════════════════════════════════════════════════════════

/** Intents que são inerentemente leves (não precisam de raciocínio profundo) */
const ECONOMY_INTENTS = new Set<string>([
    'onboarding',
    'explicar',
    'tso-to-zowe',
    'como-fazia-no-tso',
    'git-copilot',
    'unknown'  // Prompts genéricos sem recurso mainframe
]);

/** Intents que exigem raciocínio profundo */
const DEEP_INTENTS = new Set<string>([
    'discover-components',
    'abend'
]);

/** Skills que devem usar pelo menos STANDARD */
const STANDARD_SKILLS = new Set<string>([
    'jeff-jcl',
    'jcl-analysis',
    'cobol-debug',
    'jeff-db2',
    'jeff-cics',
    'jeff-scan'
]);

/** Skills que devem usar DEEP */
const DEEP_SKILLS = new Set<string>([
    'component-discovery'
]);

/** Palavras-chave no prompt que escalam para DEEP */
const DEEP_KEYWORDS: string[] = [
    'dump',
    'abend',
    's0c4',
    's0c7',
    's0cb',
    's222',
    's322',
    's806',
    'mapa de impacto',
    'impacto completo',
    'análise profunda',
    'analise profunda',
    'todos os relacionados',
    'vários arquivos',
    'varios arquivos',
    'trace completo',
    'debug completo'
];

/** Palavras-chave no prompt que escalam para STANDARD (se estiver em ECONOMY) */
const STANDARD_KEYWORDS: string[] = [
    'analise',
    'análise',
    'explique o jcl',
    'explique o cobol',
    'explique o db2',
    'o que faz este',
    'o que este programa',
    'possíveis problemas',
    'possiveis problemas',
    'pontos de atenção',
    'pontos de atencao',
    'sql',
    'query',
    'select ',
    'cursor ',
    'tablespace'
];

/** Threshold de caracteres de contexto para escalar de STANDARD para DEEP */
const CONTEXT_SIZE_DEEP_THRESHOLD = 30000;

// ════════════════════════════════════════════════════════════════
// LÓGICA DE SELEÇÃO
// ════════════════════════════════════════════════════════════════

/**
 * Seleciona o tier de modelo ideal com base no contexto completo da requisição.
 * 
 * Ordem de avaliação:
 * 1. Intents explicitamente DEEP → DEEP (sem override)
 * 2. Keywords DEEP no prompt → escalação para DEEP
 * 3. Tamanho do contexto > threshold → escalação para DEEP
 * 4. Skills DEEP → DEEP
 * 5. Skills STANDARD ou código detectado (JCL/COBOL/DB2) → STANDARD
 * 6. Keywords STANDARD no prompt → escalação para STANDARD
 * 7. Intents ECONOMY → ECONOMY
 * 8. Skill default tier (se definido) → tier da skill
 * 9. Nenhuma regra → ECONOMY (fallback seguro)
 */
export function selectTier(input: TierSelectionInput): TierSelectionResult {
    const { intent, selectedSkill, detectedCodeType, userPrompt, contextChars, zoweReadAttempted, skillDefaultTier } = input;

    // ── 1. INTENTS DEEP (prioridade máxima) ──
    if (DEEP_INTENTS.has(intent)) {
        return {
            tier: 'DEEP',
            reason: 'INTENT_DEEP',
            escalated: false,
            originalTier: null,
            details: `Intent "${intent}" requer raciocínio profundo.`
        };
    }

    // ── 2. KEYWORDS DEEP no prompt ──
    const matchedDeepKeyword = DEEP_KEYWORDS.find(kw => userPrompt.includes(kw));
    if (matchedDeepKeyword) {
        return {
            tier: 'DEEP',
            reason: 'KEYWORD_ESCALATION',
            escalated: true,
            originalTier: determinateBaseTier(input),
            details: `Keyword "${matchedDeepKeyword}" detectada no prompt. Escalado para DEEP.`
        };
    }

    // ── 3. CONTEXT SIZE > threshold ──
    if (contextChars > CONTEXT_SIZE_DEEP_THRESHOLD) {
        return {
            tier: 'DEEP',
            reason: 'CONTEXT_SIZE_DEEP',
            escalated: true,
            originalTier: determinateBaseTier(input),
            details: `Contexto de ${contextChars} chars excede threshold de ${CONTEXT_SIZE_DEEP_THRESHOLD}. Escalado para DEEP.`
        };
    }

    // ── 4. SKILLS DEEP ──
    if (selectedSkill && DEEP_SKILLS.has(selectedSkill)) {
        return {
            tier: 'DEEP',
            reason: 'INTENT_DEEP',
            escalated: false,
            originalTier: null,
            details: `Skill "${selectedSkill}" requer DEEP.`
        };
    }

    // ── 5. SKILLS STANDARD ou código detectado ──
    if (selectedSkill && STANDARD_SKILLS.has(selectedSkill)) {
        return {
            tier: 'STANDARD',
            reason: 'CODE_TYPE_STANDARD',
            escalated: false,
            originalTier: null,
            details: `Skill "${selectedSkill}" opera em nível STANDARD.`
        };
    }

    if (zoweReadAttempted && (detectedCodeType === 'jcl' || detectedCodeType === 'cobol')) {
        return {
            tier: 'STANDARD',
            reason: 'CODE_TYPE_STANDARD',
            escalated: false,
            originalTier: null,
            details: `Código ${detectedCodeType.toUpperCase()} detectado com leitura Zowe. Requer STANDARD.`
        };
    }

    // ── 6. KEYWORDS STANDARD no prompt ──
    const matchedStdKeyword = STANDARD_KEYWORDS.find(kw => userPrompt.includes(kw));
    if (matchedStdKeyword && zoweReadAttempted) {
        return {
            tier: 'STANDARD',
            reason: 'KEYWORD_ESCALATION',
            escalated: true,
            originalTier: 'ECONOMY',
            details: `Keyword "${matchedStdKeyword}" com contexto Zowe. Escalado para STANDARD.`
        };
    }

    // ── 7. INTENTS ECONOMY ──
    if (ECONOMY_INTENTS.has(intent) || !zoweReadAttempted) {
        return {
            tier: 'ECONOMY',
            reason: 'INTENT_ECONOMY',
            escalated: false,
            originalTier: null,
            details: intent !== 'unknown'
                ? `Intent "${intent}" é leve. ECONOMY suficiente.`
                : 'Prompt genérico sem recurso mainframe. ECONOMY suficiente.'
        };
    }

    // ── 8. SKILL DEFAULT TIER ──
    if (skillDefaultTier && isValidTier(skillDefaultTier)) {
        return {
            tier: skillDefaultTier as ModelTier,
            reason: 'SKILL_DEFAULT',
            escalated: false,
            originalTier: null,
            details: `Usando tier default da skill: ${skillDefaultTier}.`
        };
    }

    // ── 9. FALLBACK ──
    return {
        tier: 'ECONOMY',
        reason: 'DEFAULT_ECONOMY',
        escalated: false,
        originalTier: null,
        details: 'Nenhuma regra de escalação aplicou. Fallback seguro para ECONOMY.'
    };
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

function isValidTier(tier: string): tier is ModelTier {
    return tier === 'ECONOMY' || tier === 'STANDARD' || tier === 'DEEP';
}

/**
 * Calcula o tier base (sem escalação) para informar o campo originalTier.
 */
function determinateBaseTier(input: TierSelectionInput): ModelTier {
    if (input.selectedSkill && STANDARD_SKILLS.has(input.selectedSkill)) return 'STANDARD';
    if (input.zoweReadAttempted && (input.detectedCodeType === 'jcl' || input.detectedCodeType === 'cobol')) return 'STANDARD';
    if (ECONOMY_INTENTS.has(input.intent)) return 'ECONOMY';
    return 'ECONOMY';
}

// ════════════════════════════════════════════════════════════════
// SINGLETON
// ════════════════════════════════════════════════════════════════

export const tierSelector = { selectTier };
