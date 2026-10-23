/**
 * Guarda de acesso a datasets (allowlist + denylist), para ficar NO connector,
 * como ponto único de passagem (fail-closed).
 *
 * Uso em zoweConnector.ts, no início de readDatasetMember e listDatasetMembers
 * (antes de getApi):
 *
 *   const { dataset, member } = assertDatasetReadable(
 *       datasetName, memberName, resolvePolicy(guardConfig, ctx.profileName));
 *
 * Por que no connector e não no intentRouter: qualquer chamador novo no futuro
 * (spool, USS, outro comando) passa pela mesma regra sem depender de lembrar.
 *
 * Observação: o acesso usa as credenciais do próprio usuário, então o RACF já
 * limita o que ele enxerga. Este guarda resolve outro risco: dado de cliente
 * (que o usuário pode ler) sair para o modelo.
 */

export type DenyReason = 'INVALID_NAME' | 'BLOCKED' | 'NOT_ALLOWED' | 'NO_POLICY';

export class DatasetAccessDeniedError extends Error {
    constructor(public readonly reason: DenyReason, message: string) {
        super(message);
        this.name = 'DatasetAccessDeniedError';
    }
}

export interface DatasetPolicy {
    /** Padrões liberados. Vazio = nada liberado (fail-closed). Ex.: "BANCO.*.COBOL" */
    allow: string[];
    /** Padrões bloqueados. Sempre vencem o allow. Ex.: "**.DADOS.**" */
    deny: string[];
}

export interface GuardConfig {
    default?: DatasetPolicy;
    profiles?: Record<string, Partial<DatasetPolicy>>;
}

const QUALIFIER = /^[A-Z@#$][A-Z0-9@#$-]{0,7}$/;
const MEMBER = /^[A-Z@#$][A-Z0-9@#$]{0,7}$/;

export function isValidDatasetName(name: string): boolean {
    if (name.length < 1 || name.length > 44) { return false; }
    return name.split('.').every(q => QUALIFIER.test(q));
}

export function isValidMemberName(name: string): boolean {
    return MEMBER.test(name);
}

/**
 * Converte filtro estilo z/OS em RegExp:
 *   %  = um caractere (não cruza ponto)
 *   *  = zero ou mais caracteres dentro de UM qualificador
 *   ** = qualquer coisa, inclusive vários qualificadores
 */
export function patternToRegExp(pattern: string): RegExp {
    const p = pattern.trim().toUpperCase();
    let re = '';
    for (let i = 0; i < p.length; i++) {
        const c = p[i];
        if (c === '*' && p[i + 1] === '*') { re += '.*'; i++; }
        else if (c === '*') { re += '[^.]*'; }
        else if (c === '%') { re += '[^.]'; }
        else { re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&'); }
    }
    return new RegExp(`^${re}$`);
}

/**
 * Gera os 4 formatos necessários para bloquear um qualificador em QUALQUER posição
 * do nome. Atenção: "**.PROD.**" sozinho NÃO pega "PROD.BANCO.COBOL" (PROD como
 * primeiro qualificador) nem "BANCO.PROD" (como último), porque exige ponto dos dois lados.
 * Aceita curinga dentro do qualificador: denyQualifier('PROD*') cobre PROD e PRODUCAO.
 */
export function denyQualifier(qualifier: string): string[] {
    const q = qualifier.trim().toUpperCase();
    return [q, `${q}.**`, `**.${q}`, `**.${q}.**`];
}

/** Política do profile = default + profile; o deny é a união (o global sempre vale). */
export function resolvePolicy(config: GuardConfig | undefined, profileName: string): DatasetPolicy {
    const base = config?.default;
    const specific = config?.profiles?.[profileName];
    return {
        allow: specific?.allow ?? base?.allow ?? [],
        deny: [...(base?.deny ?? []), ...(specific?.deny ?? [])]
    };
}

export function assertDatasetReadable(
    datasetName: string,
    memberName: string | undefined,
    policy: DatasetPolicy | undefined
): { dataset: string; member?: string } {
    const dataset = (datasetName ?? '').trim().toUpperCase();
    const member = memberName === undefined ? undefined : memberName.trim().toUpperCase();

    if (!isValidDatasetName(dataset)) {
        throw new DatasetAccessDeniedError('INVALID_NAME', 'Nome de dataset inválido.');
    }
    if (member !== undefined && !isValidMemberName(member)) {
        throw new DatasetAccessDeniedError('INVALID_NAME', 'Nome de membro inválido.');
    }
    if (!policy || policy.allow.length === 0) {
        throw new DatasetAccessDeniedError('NO_POLICY',
            'Nenhuma biblioteca de fonte liberada para este profile. Configure a allowlist.');
    }
    if (policy.deny.some(p => patternToRegExp(p).test(dataset))) {
        throw new DatasetAccessDeniedError('BLOCKED', `Dataset ${dataset} está bloqueado pela política.`);
    }
    if (!policy.allow.some(p => patternToRegExp(p).test(dataset))) {
        throw new DatasetAccessDeniedError('NOT_ALLOWED', `Dataset ${dataset} não está em biblioteca de fonte liberada.`);
    }
    return { dataset, member };
}
