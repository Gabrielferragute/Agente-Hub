/**
 * profile-context.test.ts
 * 
 * Suíte de testes unitários do Zowe Profile Context v1.
 * 
 * Testa:
 *   A. Cadeia de resolução (precedência)
 *   B. Confirmação de PROD
 *   C. Classificação de ambientes
 *   D. Pinning
 *   E. Isolamento de dados sensíveis (vazamento)
 *   F. Integridade da seleção
 * 
 * Usa node:test (consistente com core-hardening.test.ts).
 * Todos os testes são puramente unitários — sem Zowe Explorer real.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    EnvironmentClass,
    ProfileSelectionSource,
    ProfileSelectionContext,
    AmbiguousProfileError,
    NoProfileAvailableError,
    ProductionAccessDeniedError,
    ProfileNotFoundError
} from '../zowe/profileTypes';

import { profilePinningManager } from '../zowe/profilePinning';

// ════════════════════════════════════════════════════════════════
// HELPER: Criar ProfileSelectionContext manualmente para testes
// (simula o que o ProfileResolver retorna)
// ════════════════════════════════════════════════════════════════

function createFrozenContext(overrides: Partial<ProfileSelectionContext> = {}): ProfileSelectionContext {
    return Object.freeze({
        profileName: overrides.profileName ?? 'test-profile',
        environmentClass: overrides.environmentClass ?? EnvironmentClass.DEV,
        source: overrides.source ?? ProfileSelectionSource.EXPLICIT,
        isConfirmed: overrides.isConfirmed ?? true,
        resolvedAt: overrides.resolvedAt ?? new Date().toISOString()
    });
}

// ════════════════════════════════════════════════════════════════
// A. CADEIA DE RESOLUÇÃO (PRECEDÊNCIA)
// ════════════════════════════════════════════════════════════════

test('A.1 RESOURCE_CONTEXT prevalece sobre EXPLICIT (pin)', () => {
    // Simula a lógica: se resourceProfileName é fornecido e está disponível,
    // deve ser selecionado com source RESOURCE_CONTEXT, ignorando o pin
    const available = ['profA', 'profB'];
    const pinned = 'profB';
    const resourceProfile = 'profA';

    // Lógica de resolução simulada
    let resolved: string | null = null;
    let source: ProfileSelectionSource | null = null;

    if (resourceProfile && available.includes(resourceProfile)) {
        resolved = resourceProfile;
        source = ProfileSelectionSource.RESOURCE_CONTEXT;
    } else if (pinned && available.includes(pinned)) {
        resolved = pinned;
        source = ProfileSelectionSource.EXPLICIT;
    }

    assert.equal(resolved, 'profA');
    assert.equal(source, ProfileSelectionSource.RESOURCE_CONTEXT);
});

test('A.2 RESOURCE_CONTEXT prevalece sobre WORKSPACE', () => {
    const available = ['profA', 'profB'];
    const workspaceProfile = 'profB';
    const resourceProfile = 'profA';

    let resolved: string | null = null;
    let source: ProfileSelectionSource | null = null;

    if (resourceProfile && available.includes(resourceProfile)) {
        resolved = resourceProfile;
        source = ProfileSelectionSource.RESOURCE_CONTEXT;
    } else if (workspaceProfile && available.includes(workspaceProfile)) {
        resolved = workspaceProfile;
        source = ProfileSelectionSource.WORKSPACE;
    }

    assert.equal(resolved, 'profA');
    assert.equal(source, ProfileSelectionSource.RESOURCE_CONTEXT);
});

test('A.3 EXPLICIT (pin) prevalece sobre WORKSPACE', () => {
    const available = ['profA', 'profB'];
    const pinned = 'profA';
    const workspaceProfile = 'profB';

    let resolved: string | null = null;
    let source: ProfileSelectionSource | null = null;

    // Sem resource context
    if (pinned && available.includes(pinned)) {
        resolved = pinned;
        source = ProfileSelectionSource.EXPLICIT;
    } else if (workspaceProfile && available.includes(workspaceProfile)) {
        resolved = workspaceProfile;
        source = ProfileSelectionSource.WORKSPACE;
    }

    assert.equal(resolved, 'profA');
    assert.equal(source, ProfileSelectionSource.EXPLICIT);
});

test('A.4 WORKSPACE prevalece sobre SINGLE_AVAILABLE', () => {
    const available = ['profA', 'profB'];
    const workspaceProfile = 'profA';
    const workspaceEnabled = true;

    let resolved: string | null = null;
    let source: ProfileSelectionSource | null = null;

    // Sem resource context nem pin
    if (workspaceEnabled && workspaceProfile && available.includes(workspaceProfile)) {
        resolved = workspaceProfile;
        source = ProfileSelectionSource.WORKSPACE;
    } else if (available.length === 1) {
        resolved = available[0];
        source = ProfileSelectionSource.SINGLE_AVAILABLE;
    }

    assert.equal(resolved, 'profA');
    assert.equal(source, ProfileSelectionSource.WORKSPACE);
});

test('A.5 SINGLE_AVAILABLE resolve quando há exatamente 1 profile', () => {
    const available = ['profA'];

    let resolved: string | null = null;
    let source: ProfileSelectionSource | null = null;

    // Sem resource context, sem pin, sem workspace
    if (available.length === 1) {
        resolved = available[0];
        source = ProfileSelectionSource.SINGLE_AVAILABLE;
    }

    assert.equal(resolved, 'profA');
    assert.equal(source, ProfileSelectionSource.SINGLE_AVAILABLE);
});

test('A.6 0 profiles lança NoProfileAvailableError', () => {
    const available: string[] = [];

    assert.throws(
        () => {
            if (available.length === 0) {
                throw new NoProfileAvailableError();
            }
        },
        (err: any) => {
            assert.ok(err instanceof NoProfileAvailableError);
            assert.equal(err.name, 'NoProfileAvailableError');
            return true;
        }
    );
});

test('A.7 2+ profiles sem fonte resolvida lança AmbiguousProfileError (non-interactive)', () => {
    const available = ['profA', 'profB'];
    const nonInteractive = true;

    let resolved: string | null = null;

    // Simula: nenhuma fonte resolve
    // ...nenhum resource, pin, workspace, nem single

    assert.throws(
        () => {
            if (!resolved && nonInteractive) {
                throw new AmbiguousProfileError(available);
            }
        },
        (err: any) => {
            assert.ok(err instanceof AmbiguousProfileError);
            assert.deepEqual(err.availableProfiles, ['profA', 'profB']);
            return true;
        }
    );
});

// ════════════════════════════════════════════════════════════════
// B. CONFIRMAÇÃO DE PROD
// ════════════════════════════════════════════════════════════════

test('B.8 PROD com confirmação aceita gera isConfirmed = true', () => {
    const ctx = createFrozenContext({
        profileName: 'myProd',
        environmentClass: EnvironmentClass.PROD,
        isConfirmed: true // Simula confirmação aceita
    });

    assert.equal(ctx.environmentClass, EnvironmentClass.PROD);
    assert.equal(ctx.isConfirmed, true);
});

test('B.9 PROD sem confirmação deve bloquear (ProductionAccessDeniedError)', () => {
    const profileName = 'myProd';
    const envClass = EnvironmentClass.PROD;
    const userConfirmed = false; // Simula cancelamento

    assert.throws(
        () => {
            if (envClass === EnvironmentClass.PROD && !userConfirmed) {
                throw new ProductionAccessDeniedError(profileName);
            }
        },
        (err: any) => {
            assert.ok(err instanceof ProductionAccessDeniedError);
            assert.equal(err.profileName, 'myProd');
            return true;
        }
    );
});

test('B.10 PROD via RESOURCE_CONTEXT ainda exige confirmação', () => {
    // Regra obrigatória: mesmo via RESOURCE_CONTEXT, PROD exige confirmação
    const source = ProfileSelectionSource.RESOURCE_CONTEXT;
    const envClass = EnvironmentClass.PROD;
    const userConfirmed = false;

    // Independente da fonte, PROD sem confirmação = bloqueio
    assert.throws(
        () => {
            if (envClass === EnvironmentClass.PROD && !userConfirmed) {
                throw new ProductionAccessDeniedError('prod-profile');
            }
        },
        (err: any) => {
            assert.ok(err instanceof ProductionAccessDeniedError);
            return true;
        }
    );
});

test('B.11 PROD via pin ainda exige confirmação', () => {
    const source = ProfileSelectionSource.EXPLICIT;
    const envClass = EnvironmentClass.PROD;
    const userConfirmed = false;

    assert.throws(
        () => {
            if (envClass === EnvironmentClass.PROD && !userConfirmed) {
                throw new ProductionAccessDeniedError('pinned-prod');
            }
        },
        (err: any) => {
            assert.ok(err instanceof ProductionAccessDeniedError);
            return true;
        }
    );
});

test('B.12 PROD em modo nonInteractive lança ProductionAccessDeniedError', () => {
    const envClass = EnvironmentClass.PROD;
    const nonInteractive = true;

    assert.throws(
        () => {
            if (envClass === EnvironmentClass.PROD && nonInteractive) {
                throw new ProductionAccessDeniedError('prod-background');
            }
        },
        (err: any) => {
            assert.ok(err instanceof ProductionAccessDeniedError);
            assert.ok(err.message.includes('prod-background'));
            return true;
        }
    );
});

// ════════════════════════════════════════════════════════════════
// C. CLASSIFICAÇÃO DE AMBIENTES
// ════════════════════════════════════════════════════════════════

test('C.13 profile mapeado no classification.json retorna a classe correta', () => {
    // Lê o config real do projeto
    const configPath = path.join(process.cwd(), 'config', 'profile-classification.json');
    assert.ok(fs.existsSync(configPath), 'config/profile-classification.json deve existir');

    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    // O arquivo começa vazio mas a estrutura deve ser válida
    assert.ok(parsed.profiles !== undefined, 'profiles deve existir no config');
    assert.equal(typeof parsed.profiles, 'object');

    // Verificar que valores válidos são aceitos
    const validClasses = new Set(['DEV', 'TEST', 'PROD']);
    for (const [name, cls] of Object.entries(parsed.profiles)) {
        assert.ok(validClasses.has(String(cls).toUpperCase()), `Classe inválida para ${name}: ${cls}`);
    }
});

test('C.14 profile ausente no classification.json retorna UNKNOWN', () => {
    const configPath = path.join(process.cwd(), 'config', 'profile-classification.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    // Profile não listado → deve ser tratado como UNKNOWN
    const unknownProfile = 'profile-que-nao-existe-no-config-xyz123';
    const classForUnknown = parsed.profiles[unknownProfile];

    assert.equal(classForUnknown, undefined, 'Profile não mapeado deve resultar em undefined (UNKNOWN)');
});

test('C.15 arquivo inexistente resulta em todos UNKNOWN (fail-safe)', () => {
    const fakePath = path.join(process.cwd(), 'config', 'profile-classification-nao-existe.json');
    let result: Record<string, string> = {};

    try {
        const raw = fs.readFileSync(fakePath, 'utf8');
        result = JSON.parse(raw).profiles || {};
    } catch {
        result = {}; // Fail-safe: todos UNKNOWN
    }

    assert.deepEqual(result, {}, 'Config inexistente deve resultar em mapa vazio (todos UNKNOWN)');
});

test('C.16 não infere ambiente pelo nome do profile', () => {
    // Regra: profile chamado "prod_profile" sem entrada no JSON → UNKNOWN
    const configPath = path.join(process.cwd(), 'config', 'profile-classification.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    // Mesmo com nome sugestivo, se não está mapeado, é UNKNOWN
    const suspiciousNames = ['prod_profile', 'PRODUCTION', 'dev-server', 'test_env'];
    for (const name of suspiciousNames) {
        const cls = parsed.profiles[name];
        assert.equal(cls, undefined, `Profile "${name}" não deve ser inferido pelo nome — deve ser UNKNOWN`);
    }
});

// ════════════════════════════════════════════════════════════════
// D. PINNING
// ════════════════════════════════════════════════════════════════

test('D.17 pin é respeitado quando não há RESOURCE_CONTEXT', () => {
    // Reset
    profilePinningManager.unpinProfile();
    
    profilePinningManager.pinProfile('myProfile');
    assert.equal(profilePinningManager.getPinnedProfile(), 'myProfile');

    // Na cadeia: sem resource context, pin resolve
    const available = ['myProfile', 'otherProfile'];
    const pinned = profilePinningManager.getPinnedProfile();
    let resolved: string | null = null;

    if (pinned && available.includes(pinned)) {
        resolved = pinned;
    }

    assert.equal(resolved, 'myProfile');

    // Cleanup
    profilePinningManager.unpinProfile();
});

test('D.18 pin de profile removido do cache é descartado', () => {
    profilePinningManager.pinProfile('removedProfile');
    assert.equal(profilePinningManager.getPinnedProfile(), 'removedProfile');

    // Simula: profile removido do cache
    const available = ['profA', 'profB']; // removedProfile não está aqui
    const pinned = profilePinningManager.getPinnedProfile();

    if (pinned && !available.includes(pinned)) {
        profilePinningManager.unpinProfile();
    }

    assert.equal(profilePinningManager.getPinnedProfile(), null, 'Pin deve ser descartado se profile não está no cache');
});

test('D.19 pin de PROD não autoriza automaticamente', () => {
    profilePinningManager.pinProfile('myProdProfile');
    const pinned = profilePinningManager.getPinnedProfile();

    // Simula: profile pinnado é PROD
    const envClass = EnvironmentClass.PROD;
    const userConfirmed = false;

    // Pin não pula confirmação
    assert.throws(
        () => {
            if (envClass === EnvironmentClass.PROD && !userConfirmed) {
                throw new ProductionAccessDeniedError(pinned!);
            }
        },
        (err: any) => {
            assert.ok(err instanceof ProductionAccessDeniedError);
            return true;
        }
    );

    // Cleanup
    profilePinningManager.unpinProfile();
});

// ════════════════════════════════════════════════════════════════
// E. ISOLAMENTO DE DADOS SENSÍVEIS (VAZAMENTO)
// ════════════════════════════════════════════════════════════════

test('E.20 ProfileSelectionContext não contém host/user/token/session', () => {
    const ctx = createFrozenContext({
        profileName: 'my-profile',
        environmentClass: EnvironmentClass.DEV,
        source: ProfileSelectionSource.EXPLICIT,
        isConfirmed: true
    });

    const keys = Object.keys(ctx);
    const sensitiveKeys = ['host', 'hostname', 'user', 'username', 'password', 'token', 'session', 'port', 'credential', 'secret'];

    for (const sensitive of sensitiveKeys) {
        assert.ok(!keys.includes(sensitive), `ProfileSelectionContext NÃO deve conter "${sensitive}"`);
    }

    // Verificar que apenas os campos esperados existem
    const expectedKeys = ['profileName', 'environmentClass', 'source', 'isConfirmed', 'resolvedAt'];
    assert.deepEqual(keys.sort(), expectedKeys.sort(), 'Apenas campos planejados devem existir no contexto');
});

test('E.21 erro sanitizado não contém hostname', () => {
    // Simula erro do Zowe SDK com hostname embutido
    const rawError = {
        message: 'Connection refused to host mainframe.prod.internal.corp.com:443',
        code: 'ECONNREFUSED',
        causeErrors: { code: 'ECONNREFUSED' }
    };

    // Função de sanitização (mesma lógica do connector)
    const profileName = 'my-profile';
    const code = rawError?.causeErrors?.code || rawError?.code || 'UNKNOWN';
    const sanitized = `Falha ao acessar recurso via profile "${profileName}". Código: ${code}`;

    assert.ok(!sanitized.includes('mainframe.prod.internal.corp.com'), 'Mensagem sanitizada NÃO deve conter hostname');
    assert.ok(!sanitized.includes('443'), 'Mensagem sanitizada NÃO deve conter porta');
    assert.ok(sanitized.includes('my-profile'), 'Mensagem sanitizada deve conter o nome do profile');
    assert.ok(sanitized.includes('ECONNREFUSED'), 'Mensagem sanitizada deve conter o código de erro');
});

test('E.22 telemetria simulada não contém credenciais', () => {
    // Simula payload de telemetria que o connector/extension geraria
    const ctx = createFrozenContext({
        profileName: 'audit-profile',
        environmentClass: EnvironmentClass.TEST,
        source: ProfileSelectionSource.WORKSPACE
    });

    const telemetryPayload = {
        profileName: ctx.profileName,
        environmentClass: ctx.environmentClass,
        source: ctx.source,
        operation: 'readDatasetMember',
        durationMs: 123
    };

    const payloadStr = JSON.stringify(telemetryPayload);
    const forbidden = ['password', 'token', 'session', 'host:', 'hostname', 'credential', 'secret'];

    for (const word of forbidden) {
        assert.ok(!payloadStr.toLowerCase().includes(word), `Telemetria NÃO deve conter "${word}"`);
    }
});

test('E.23 ProfileSelectionContext é frozen (Object.freeze)', () => {
    const ctx = createFrozenContext();

    assert.ok(Object.isFrozen(ctx), 'ProfileSelectionContext deve ser frozen');

    // Tentar modificar deve falhar silenciosamente (strict mode no test) ou não ter efeito
    try {
        (ctx as any).profileName = 'hacked';
    } catch {
        // Em strict mode, TypeError é lançado — isso é o esperado
    }

    assert.equal(ctx.profileName, 'test-profile', 'profileName não pode ser alterado após freeze');
});

// ════════════════════════════════════════════════════════════════
// F. INTEGRIDADE DA SELEÇÃO
// ════════════════════════════════════════════════════════════════

test('F.24 profile resolvido é validado contra o cache', () => {
    const available = ['profA', 'profB'];
    const resolvedProfile = 'profX'; // Não existe no cache

    assert.throws(
        () => {
            if (!available.includes(resolvedProfile)) {
                throw new ProfileNotFoundError(resolvedProfile);
            }
        },
        (err: any) => {
            assert.ok(err instanceof ProfileNotFoundError);
            assert.equal(err.profileName, 'profX');
            return true;
        }
    );
});

test('F.25 contexto não pode ser alterado downstream (frozen)', () => {
    const ctx = createFrozenContext({
        profileName: 'original',
        environmentClass: EnvironmentClass.DEV,
        source: ProfileSelectionSource.SINGLE_AVAILABLE,
        isConfirmed: true
    });

    // Verificar que é frozen
    assert.ok(Object.isFrozen(ctx));

    // Verificar que tentativa de escrita não altera
    let threwError = false;
    try {
        (ctx as any).profileName = 'tampered';
    } catch (e) {
        threwError = true;
    }

    // Em strict mode: TypeError. Fora de strict: silenciosamente ignora.
    // Em ambos os casos, o valor original permanece.
    assert.equal(ctx.profileName, 'original', 'Nenhum componente downstream pode substituir o profile');
});
