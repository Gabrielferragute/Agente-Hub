import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isValidDatasetName,
    isValidMemberName,
    patternToRegExp,
    denyQualifier,
    assertDatasetReadable,
    resolvePolicy,
    DatasetAccessDeniedError,
    GuardConfig
} from '../zowe/datasetGuard';

import {
    loadBaseGuardConfig,
    applyWorkspaceDenyOnly,
    isProductionProfile,
    DENY_ALL,
    DEFAULT_NON_PROD
} from '../zowe/policyLoader';

test('1. isValidDatasetName valida qualificadores e tamanhos de dataset z/OS', () => {
    assert.equal(isValidDatasetName('USER.COBOL.PGM'), true);
    assert.equal(isValidDatasetName('BANCO#1.TEST@2.CBL'), true);
    assert.equal(isValidDatasetName(''), false);
    assert.equal(isValidDatasetName('A'.repeat(45)), false);
    assert.equal(isValidDatasetName('1USER.COBOL'), false); // qualificador não pode começar com dígito
    assert.equal(isValidDatasetName('USER..COBOL'), false); // qualificador vazio
    assert.equal(isValidDatasetName('USER.LONGERTHANEIGHT.COBOL'), false); // max 8 chars por qualificador
});

test('2. isValidMemberName valida nomes de membros PDS', () => {
    assert.equal(isValidMemberName('PGM01'), true);
    assert.equal(isValidMemberName('TEST#1'), true);
    assert.equal(isValidMemberName('@MENU'), true);
    assert.equal(isValidMemberName(''), false);
    assert.equal(isValidMemberName('1PGM'), false);
    assert.equal(isValidMemberName('LONGMEMBER'), false); // max 8 chars
});

test('3. denyQualifier gera as 4 variações e cobre prefixo, sufixo e meio', () => {
    const prodDenies = denyQualifier('PROD*');
    assert.deepEqual(prodDenies, ['PROD*', 'PROD*.**', '**.PROD*', '**.PROD*.**']);

    // Testa matching via RegExp
    const matchesAny = (ds: string, patterns: string[]) =>
        patterns.some(p => patternToRegExp(p).test(ds));

    // Primeiro qualificador
    assert.equal(matchesAny('PROD.BANCO.COBOL', prodDenies), true);
    assert.equal(matchesAny('PRODUCAO.BANCO.COBOL', prodDenies), true);
    // Qualificador do meio
    assert.equal(matchesAny('BANCO.PROD.COBOL', prodDenies), true);
    // Último qualificador
    assert.equal(matchesAny('BANCO.DEV.PROD', prodDenies), true);
    // Qualificador único
    assert.equal(matchesAny('PROD', prodDenies), true);
    // Não deve casar com outro nome
    assert.equal(matchesAny('BANCO.DEV.COBOL', prodDenies), false);

    // Dados/Data
    const dadosDenies = [...denyQualifier('DADOS*'), ...denyQualifier('DATA*')];
    assert.equal(matchesAny('DADOS.CLIENTES.COBOL', dadosDenies), true);
    assert.equal(matchesAny('BANCO.DADOS.SENSIVEL', dadosDenies), true);
    assert.equal(matchesAny('BANCO.DATA.HIST', dadosDenies), true);
    assert.equal(matchesAny('BANCO.CLIENTES.DATA', dadosDenies), true);
});

test('4. assertDatasetReadable rejeita nomes inválidos (INVALID_NAME)', () => {
    const policy = { allow: ['**.COBOL'], deny: [] };
    assert.throws(
        () => assertDatasetReadable('INVALID..NAME', 'MBR1', policy),
        (err: any) => err instanceof DatasetAccessDeniedError && err.reason === 'INVALID_NAME'
    );
    assert.throws(
        () => assertDatasetReadable('VALID.NAME', '1INVALID', policy),
        (err: any) => err instanceof DatasetAccessDeniedError && err.reason === 'INVALID_NAME'
    );
});

test('5. assertDatasetReadable exige allowlist não-vazia (NO_POLICY)', () => {
    assert.throws(
        () => assertDatasetReadable('USER.DEV.COBOL', 'PGM1', { allow: [], deny: [] }),
        (err: any) => err instanceof DatasetAccessDeniedError && err.reason === 'NO_POLICY'
    );
});

test('6. assertDatasetReadable bloqueia por denylist mesmo se presente no allow (BLOCKED)', () => {
    const policy = {
        allow: ['**.COBOL'],
        deny: [...denyQualifier('DADOS*'), ...denyQualifier('PROD*')]
    };

    assert.throws(
        () => assertDatasetReadable('PROD.BANCO.COBOL', 'PGM1', policy),
        (err: any) => err instanceof DatasetAccessDeniedError && err.reason === 'BLOCKED'
    );
    assert.throws(
        () => assertDatasetReadable('DADOS.BANCO.COBOL', 'PGM1', policy),
        (err: any) => err instanceof DatasetAccessDeniedError && err.reason === 'BLOCKED'
    );
});

test('7. assertDatasetReadable rejeita datasets fora do allow (NOT_ALLOWED)', () => {
    const policy = { allow: ['**.COBOL'], deny: [] };
    assert.throws(
        () => assertDatasetReadable('USER.DEV.JCL', undefined, policy),
        (err: any) => err instanceof DatasetAccessDeniedError && err.reason === 'NOT_ALLOWED'
    );
});

test('8. assertDatasetReadable retorna dataset e member normalizados em uppercase', () => {
    const policy = { allow: ['**.COBOL'], deny: [] };
    const res = assertDatasetReadable('user.dev.cobol', 'pgm01', policy);
    assert.equal(res.dataset, 'USER.DEV.COBOL');
    assert.equal(res.member, 'PGM01');
});

test('9. loadBaseGuardConfig usa mvpDefault se arquivo não existe', () => {
    const mvp: GuardConfig = { default: { allow: ['**.COBOL'], deny: [] } };
    const res = loadBaseGuardConfig(undefined, mvp);
    assert.deepEqual(res.config, mvp);
    assert.equal(res.problem, undefined);
});

test('10. loadBaseGuardConfig retorna DENY_ALL se JSON for quebrado', () => {
    const mvp: GuardConfig = { default: { allow: ['**.COBOL'], deny: [] } };
    const res = loadBaseGuardConfig('{ json quebrado: invalid, }', mvp);
    assert.deepEqual(res.config, DENY_ALL);
    assert.ok(res.problem?.includes('JSON inválido'));
});

test('11. loadBaseGuardConfig retorna DENY_ALL se schema for inválido', () => {
    const mvp: GuardConfig = { default: { allow: ['**.COBOL'], deny: [] } };
    const invalidSchema = JSON.stringify({ default: { allow: '**' } }); // string no lugar de array
    const res = loadBaseGuardConfig(invalidSchema, mvp);
    assert.deepEqual(res.config, DENY_ALL);
    assert.ok(res.problem?.includes('formato inválido'));
});

test('12. applyWorkspaceDenyOnly ignora allow do workspace e apenas acrescenta deny', () => {
    const base: GuardConfig = {
        default: { allow: ['**.COBOL'], deny: ['**.SECRET.**'] },
        profiles: {
            DEV_PROF: { allow: ['**.JCL'], deny: ['**.TEMP.**'] }
        }
    };
    const workspaceRaw = JSON.stringify({
        default: {
            allow: ['**'], // Tentativa maliciosa de afrouxar
            deny: ['**.EXTRA_DENY.**']
        },
        profiles: {
            DEV_PROF: {
                allow: ['**'], // Tentativa maliciosa de afrouxar
                deny: ['**.PROFILE_DENY.**']
            }
        }
    });

    const res = applyWorkspaceDenyOnly(base, workspaceRaw);
    assert.deepEqual(res.config.default?.allow, ['**.COBOL']); // Mantém allow base!
    assert.deepEqual(res.config.default?.deny, ['**.SECRET.**', '**.EXTRA_DENY.**']); // Acumula deny!
    assert.deepEqual(res.config.profiles?.DEV_PROF.deny, ['**.TEMP.**', '**.PROFILE_DENY.**']); // Acumula deny do profile!
});

test('13. applyWorkspaceDenyOnly mantém base se workspace JSON for inválido', () => {
    const base: GuardConfig = { default: { allow: ['**.COBOL'], deny: [] } };
    const res = applyWorkspaceDenyOnly(base, 'not-json');
    assert.deepEqual(res.config, base);
    assert.ok(res.problem?.includes('JSON inválido'));
});

test('14. isProductionProfile trata profile sem classificação como PROD (fail-closed)', () => {
    const classifications = { 'profile-dev': 'DEV', 'profile-hom': 'HOMOLOG' };
    assert.equal(isProductionProfile(classifications, 'profile-dev'), false);
    assert.equal(isProductionProfile(classifications, 'profile-hom'), false);
    assert.equal(isProductionProfile(classifications, 'profile-desconhecido'), true); // Ausente -> PROD
    assert.equal(isProductionProfile(null, 'qualquer'), true); // Nulo -> PROD
    assert.equal(isProductionProfile({}, 'qualquer'), true); // Vazio -> PROD
});

test('15. isProductionProfile trata valores não-string como PROD', () => {
    const classifications = { 'profile-bad': 123 as any };
    assert.equal(isProductionProfile(classifications, 'profile-bad'), true);
});

test('16. isProductionProfile respeita lista customizada de não-produção', () => {
    const classifications = { 'my-prof': 'LAB' };
    assert.equal(isProductionProfile(classifications, 'my-prof', ['DEV']), true);
    assert.equal(isProductionProfile(classifications, 'my-prof', ['DEV', 'LAB']), false);
});
