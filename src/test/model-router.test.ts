/**
 * model-router.test.ts
 * 
 * Suíte de testes do H-02 Model Router (tierSelector).
 * 
 * Testa:
 *   A. Intents leves → ECONOMY
 *   B. Intents pesadas → DEEP
 *   C. Skills → tier correto
 *   D. Keywords de escalação
 *   E. Tamanho de contexto
 *   F. Combinações e edge cases
 *   G. Contrato de saída
 * 
 * Usa node:test (consistente com core-hardening e profile-context).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTier, TierSelectionInput, ModelTier } from '../router/tierSelector';

// ════════════════════════════════════════════════════════════════
// HELPER
// ════════════════════════════════════════════════════════════════

function makeInput(overrides: Partial<TierSelectionInput> = {}): TierSelectionInput {
    return {
        intent: overrides.intent ?? 'unknown',
        selectedSkill: overrides.selectedSkill ?? null,
        detectedCodeType: overrides.detectedCodeType ?? 'unknown',
        codeTypeConfidence: overrides.codeTypeConfidence ?? 'LOW',
        userPrompt: overrides.userPrompt ?? 'olá, como funciona?',
        contextChars: overrides.contextChars ?? 0,
        zoweReadAttempted: overrides.zoweReadAttempted ?? false,
        skillDefaultTier: overrides.skillDefaultTier ?? null
    };
}

// ════════════════════════════════════════════════════════════════
// A. INTENTS ECONOMY
// ════════════════════════════════════════════════════════════════

test('A.1 intent "onboarding" → ECONOMY', () => {
    const result = selectTier(makeInput({ intent: 'onboarding' }));
    assert.equal(result.tier, 'ECONOMY');
    assert.equal(result.reason, 'INTENT_ECONOMY');
    assert.equal(result.escalated, false);
});

test('A.2 intent "explicar" → ECONOMY', () => {
    const result = selectTier(makeInput({ intent: 'explicar' }));
    assert.equal(result.tier, 'ECONOMY');
    assert.equal(result.reason, 'INTENT_ECONOMY');
});

test('A.3 intent "tso-to-zowe" → ECONOMY', () => {
    const result = selectTier(makeInput({ intent: 'tso-to-zowe' }));
    assert.equal(result.tier, 'ECONOMY');
});

test('A.4 intent "como-fazia-no-tso" → ECONOMY', () => {
    const result = selectTier(makeInput({ intent: 'como-fazia-no-tso' }));
    assert.equal(result.tier, 'ECONOMY');
});

test('A.5 intent "unknown" sem Zowe read → ECONOMY', () => {
    const result = selectTier(makeInput({ intent: 'unknown', zoweReadAttempted: false }));
    assert.equal(result.tier, 'ECONOMY');
});

// ════════════════════════════════════════════════════════════════
// B. INTENTS DEEP
// ════════════════════════════════════════════════════════════════

test('B.6 intent "discover-components" → DEEP', () => {
    const result = selectTier(makeInput({ intent: 'discover-components' }));
    assert.equal(result.tier, 'DEEP');
    assert.equal(result.reason, 'INTENT_DEEP');
    assert.equal(result.escalated, false);
});

test('B.7 intent "abend" → DEEP', () => {
    const result = selectTier(makeInput({ intent: 'abend' }));
    assert.equal(result.tier, 'DEEP');
    assert.equal(result.reason, 'INTENT_DEEP');
});

// ════════════════════════════════════════════════════════════════
// C. SKILLS → TIER CORRETO
// ════════════════════════════════════════════════════════════════

test('C.8 skill "jeff-jcl" → STANDARD', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        selectedSkill: 'jeff-jcl',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'STANDARD');
    assert.equal(result.reason, 'CODE_TYPE_STANDARD');
});

test('C.9 skill "cobol-debug" → STANDARD', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        selectedSkill: 'cobol-debug',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'STANDARD');
});

test('C.10 skill "jeff-db2" → STANDARD', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        selectedSkill: 'jeff-db2',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'STANDARD');
});

test('C.11 skill "jeff-cics" → STANDARD', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        selectedSkill: 'jeff-cics',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'STANDARD');
});

test('C.12 skill "component-discovery" → DEEP', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        selectedSkill: 'component-discovery',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'DEEP');
});

test('C.13 skill "onboarding" (não listada em STANDARD) sem Zowe → ECONOMY', () => {
    const result = selectTier(makeInput({
        intent: 'onboarding',
        selectedSkill: 'onboarding',
        zoweReadAttempted: false
    }));
    assert.equal(result.tier, 'ECONOMY');
});

// ════════════════════════════════════════════════════════════════
// D. KEYWORDS DE ESCALAÇÃO
// ════════════════════════════════════════════════════════════════

test('D.14 keyword "dump" no prompt → escala para DEEP', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        userPrompt: 'analise este dump de memória',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'DEEP');
    assert.equal(result.reason, 'KEYWORD_ESCALATION');
    assert.equal(result.escalated, true);
});

test('D.15 keyword "abend" no prompt → escala para DEEP', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        userPrompt: 'recebi um abend no programa xyz',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'DEEP');
    assert.equal(result.escalated, true);
});

test('D.16 keyword "s0c7" no prompt → escala para DEEP', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        userPrompt: 'estou recebendo s0c7 neste jcl',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'DEEP');
});

test('D.17 keyword "análise profunda" no prompt → escala para DEEP', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        userPrompt: 'faça uma análise profunda deste programa',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'DEEP');
});

test('D.18 keyword "sql" com Zowe read → escala para STANDARD', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        userPrompt: 'explique a sql deste programa',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'STANDARD');
});

test('D.19 keyword "tablespace" com Zowe read → escala para STANDARD', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        userPrompt: 'como funciona o tablespace neste contexto',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'STANDARD');
});

// ════════════════════════════════════════════════════════════════
// E. TAMANHO DE CONTEXTO
// ════════════════════════════════════════════════════════════════

test('E.20 contexto > 30000 chars → escala para DEEP', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        contextChars: 35000,
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'DEEP');
    assert.equal(result.reason, 'CONTEXT_SIZE_DEEP');
    assert.equal(result.escalated, true);
});

test('E.21 contexto = 29999 chars (abaixo do threshold) → não escala para DEEP por tamanho', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        selectedSkill: 'jeff-jcl',
        contextChars: 29999,
        zoweReadAttempted: true
    }));
    // Deve ser STANDARD (pela skill), não DEEP
    assert.equal(result.tier, 'STANDARD');
    assert.notEqual(result.reason, 'CONTEXT_SIZE_DEEP');
});

test('E.22 contexto = 30001 chars → escala para DEEP', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        contextChars: 30001,
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'DEEP');
    assert.equal(result.reason, 'CONTEXT_SIZE_DEEP');
});

// ════════════════════════════════════════════════════════════════
// F. COMBINAÇÕES E EDGE CASES
// ════════════════════════════════════════════════════════════════

test('F.23 intent DEEP prevalece sobre skill STANDARD', () => {
    // Intent "abend" é DEEP, mesmo com skill "jeff-jcl" que é STANDARD
    const result = selectTier(makeInput({
        intent: 'abend',
        selectedSkill: 'jeff-jcl',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'DEEP');
    assert.equal(result.reason, 'INTENT_DEEP');
});

test('F.24 keyword DEEP prevalece sobre skill STANDARD', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        selectedSkill: 'jeff-jcl',
        userPrompt: 'analise este dump do jcl',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'DEEP');
    assert.equal(result.reason, 'KEYWORD_ESCALATION');
    assert.equal(result.escalated, true);
});

test('F.25 código JCL detectado com Zowe read (sem skill) → STANDARD', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        selectedSkill: null,
        detectedCodeType: 'jcl',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'STANDARD');
    assert.equal(result.reason, 'CODE_TYPE_STANDARD');
});

test('F.26 código COBOL detectado com Zowe read (sem skill) → STANDARD', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        selectedSkill: null,
        detectedCodeType: 'cobol',
        zoweReadAttempted: true
    }));
    assert.equal(result.tier, 'STANDARD');
});

test('F.27 sem intent, sem skill, sem Zowe, sem keyword → ECONOMY (fallback)', () => {
    const result = selectTier(makeInput({}));
    assert.equal(result.tier, 'ECONOMY');
});

test('F.28 keyword STANDARD sem Zowe read → NÃO escala (permanece ECONOMY)', () => {
    // Se não houve Zowe read, keywords de STANDARD não escalam
    const result = selectTier(makeInput({
        intent: 'unknown',
        userPrompt: 'explique o jcl',
        zoweReadAttempted: false
    }));
    assert.equal(result.tier, 'ECONOMY');
});

// ════════════════════════════════════════════════════════════════
// G. CONTRATO DE SAÍDA
// ════════════════════════════════════════════════════════════════

test('G.29 resultado contém todos os campos obrigatórios', () => {
    const result = selectTier(makeInput({ intent: 'onboarding' }));
    
    assert.ok('tier' in result);
    assert.ok('reason' in result);
    assert.ok('escalated' in result);
    assert.ok('originalTier' in result);
    assert.ok('details' in result);
    
    // Tipos
    assert.equal(typeof result.tier, 'string');
    assert.equal(typeof result.reason, 'string');
    assert.equal(typeof result.escalated, 'boolean');
    assert.equal(typeof result.details, 'string');
});

test('G.30 tier retornado é sempre ECONOMY, STANDARD ou DEEP', () => {
    const validTiers = new Set(['ECONOMY', 'STANDARD', 'DEEP']);
    
    const inputs: Partial<TierSelectionInput>[] = [
        { intent: 'onboarding' },
        { intent: 'abend' },
        { intent: 'discover-components' },
        { intent: 'analyze-code', selectedSkill: 'jeff-jcl', zoweReadAttempted: true },
        { intent: 'analyze-code', selectedSkill: 'jeff-db2', zoweReadAttempted: true },
        { intent: 'analyze-code', userPrompt: 'dump s0c4', zoweReadAttempted: true },
        { intent: 'unknown', contextChars: 50000, zoweReadAttempted: true },
        {}
    ];
    
    for (const input of inputs) {
        const result = selectTier(makeInput(input));
        assert.ok(validTiers.has(result.tier), `Tier inválido: ${result.tier}`);
    }
});

test('G.31 quando escalated=true, originalTier é preenchido', () => {
    const result = selectTier(makeInput({
        intent: 'analyze-code',
        userPrompt: 'analise este dump de memória',
        zoweReadAttempted: true
    }));
    
    assert.equal(result.escalated, true);
    assert.ok(result.originalTier !== null, 'originalTier deve ser preenchido quando escalated=true');
});

test('G.32 quando escalated=false, originalTier é null', () => {
    const result = selectTier(makeInput({ intent: 'onboarding' }));
    
    assert.equal(result.escalated, false);
    assert.equal(result.originalTier, null);
});
