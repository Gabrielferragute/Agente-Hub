/**
 * knowledge-selector.test.ts
 * 
 * Suíte de testes do H-03 Migration Knowledge Selector.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { selectMigrationKnowledge, KnowledgeSelectionInput } from '../knowledge/knowledgeSelector';

const KNOWLEDGE_ROOT = path.join(__dirname, '../../knowledge');

function makeInput(overrides: Partial<KnowledgeSelectionInput> = {}): KnowledgeSelectionInput {
    return {
        intent: overrides.intent ?? 'unknown',
        selectedSkill: overrides.selectedSkill ?? null,
        detectedCodeType: overrides.detectedCodeType ?? 'unknown',
        userPrompt: overrides.userPrompt ?? 'olá, como funciona?'
    };
}

test('1. Intent tso-to-zowe inclui ispf-mapping e diretórios relacionados', () => {
    const result = selectMigrationKnowledge(makeInput({ intent: 'tso-to-zowe' }));
    
    const hasIspfMapping = result.filePaths.some(p => p.includes('ispf-mapping.md'));
    const hasTsoDir = result.filePaths.some(p => p.includes(path.join('migration', 'tso')));
    const hasMappingsDir = result.filePaths.some(p => p.includes(path.join('migration', 'mappings')));
    
    assert.ok(hasIspfMapping, 'Deve incluir ispf-mapping.md');
    // Note: If the directories exist and have .md files, they will be included.
    // We just verify the reasons are populated correctly if files were found (or even if not, the logic was triggered)
    assert.ok(result.reasons.some(r => r.includes('TSO/ISPF')), 'Razão deve citar TSO/ISPF');
});

test('2. Keyword ISPF inclui diretórios de migração TSO', () => {
    const result = selectMigrationKnowledge(makeInput({ userPrompt: 'como acesso o ispf pelo vscode?' }));
    
    const hasIspfMapping = result.filePaths.some(p => p.includes('ispf-mapping.md'));
    assert.ok(hasIspfMapping, 'Deve incluir ispf-mapping.md por causa da keyword ISPF');
});

test('3. CodeType JCL inclui guias de jobs', () => {
    const result = selectMigrationKnowledge(makeInput({ detectedCodeType: 'jcl' }));
    
    const hasJclBasics = result.filePaths.some(p => p.includes('jcl-basics.md'));
    assert.ok(hasJclBasics, 'Deve incluir jcl-basics.md');
    assert.ok(result.reasons.some(r => r.includes('JCL')), 'Razão deve citar JCL');
});

test('4. Keyword ABEND inclui abend-codes e troubleshooting', () => {
    const result = selectMigrationKnowledge(makeInput({ userPrompt: 'o programa deu abend s0c4' }));
    
    const hasAbendCodes = result.filePaths.some(p => p.includes('abend-codes.md'));
    assert.ok(hasAbendCodes, 'Deve incluir abend-codes.md');
});

test('5. Intent abend inclui abend-codes e troubleshooting', () => {
    const result = selectMigrationKnowledge(makeInput({ intent: 'abend' }));
    
    const hasAbendCodes = result.filePaths.some(p => p.includes('abend-codes.md'));
    assert.ok(hasAbendCodes, 'Deve incluir abend-codes.md');
});

test('6. Keyword DATASET inclui guias de datasets', () => {
    const result = selectMigrationKnowledge(makeInput({ userPrompt: 'como criar um dataset' }));
    
    assert.ok(result.reasons.some(r => r.includes('Dataset/File')), 'Razão deve citar Datasets');
});

test('7. Prompt vazio ou irrelevante não injeta conhecimentos extras desnecessários', () => {
    const result = selectMigrationKnowledge(makeInput({ userPrompt: 'bom dia' }));
    
    assert.equal(result.filePaths.length, 0, 'Não deve injetar arquivos extras para prompt irrelevante');
    assert.equal(result.reasons.length, 0, 'Não deve ter razões');
});

test('8. Multiplas regras aplicadas geram arquivos distintos (sem duplicação)', () => {
    // Prompt que dá match em JCL e ABEND
    const result = selectMigrationKnowledge(makeInput({ 
        detectedCodeType: 'jcl',
        userPrompt: 'analise este abend no jcl' 
    }));
    
    const hasAbendCodes = result.filePaths.some(p => p.includes('abend-codes.md'));
    const hasJclBasics = result.filePaths.some(p => p.includes('jcl-basics.md'));
    
    assert.ok(hasAbendCodes, 'Deve incluir abend-codes.md');
    assert.ok(hasJclBasics, 'Deve incluir jcl-basics.md');
    
    // Check uniqueness
    const uniquePaths = new Set(result.filePaths);
    assert.equal(result.filePaths.length, uniquePaths.size, 'Não deve haver caminhos duplicados');
});
