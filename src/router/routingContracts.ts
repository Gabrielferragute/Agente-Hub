import { CodeClassification, CodeConfidence } from '../mainframe/codeClassificationTypes';

export type RoutingDecisionSource = 'CODE_CLASSIFIER' | 'EXPLICIT_INTENT' | 'SEMANTIC_ROUTER' | 'FALLBACK';

export interface DeterministicRoutingDecision {
    selectedSkill: string | null;
    shouldCallSemantic: boolean;
    source: RoutingDecisionSource;
}

export function decideDeterministicRouting(classification: CodeClassification): DeterministicRoutingDecision {
    if (classification.detectedType === 'jcl' && classification.confidence === 'HIGH') {
        return { selectedSkill: 'jeff-jcl', shouldCallSemantic: false, source: 'CODE_CLASSIFIER' };
    }
    if (classification.detectedType === 'cobol' && classification.confidence === 'HIGH') {
        return { selectedSkill: 'cobol-debug', shouldCallSemantic: false, source: 'CODE_CLASSIFIER' };
    }
    return { selectedSkill: null, shouldCallSemantic: true, source: 'SEMANTIC_ROUTER' };
}

export interface SemanticSkillValidation {
    requested: string;
    valid: boolean;
    selectedSkill: string | null;
}

export async function validateSemanticSkill(
    requestedSkill: string,
    confidence: CodeConfidence,
    skillExists: (skillId: string) => Promise<boolean>
): Promise<SemanticSkillValidation> {
    const requested = requestedSkill.trim().toLowerCase();
    if (confidence === 'LOW' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requested)) {
        return { requested: requested || 'none', valid: false, selectedSkill: null };
    }

    try {
        const valid = await skillExists(requested);
        return { requested, valid, selectedSkill: valid ? requested : null };
    } catch {
        return { requested, valid: false, selectedSkill: null };
    }
}
